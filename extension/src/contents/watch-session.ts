/**
 * Watch Session Manager
 * Coordinates long-lived sessions with the background service worker.
 *
 * The content script opens a dedicated runtime Port that keeps the service worker
 * alive during the active watch window. The background worker performs polling
 * and notifies this module whenever a matching code is found or the session times out.
 */

import type { DetectionResult } from "@/lib/types"
import { showNotification } from "./notification"
import { showSessionChip, type ChipHandle } from "./session-chip"

interface SessionCodeResult {
  code: string
  source: string
  timestamp: number
}

interface WatchSessionCallbacks {
  onCodeFound: (result: SessionCodeResult) => void
  onTimeout?: () => void
  onCanceled?: () => void
  onSessionStarted?: (sessionId: string) => void
  onAutofill?: (result: SessionCodeResult, field: HTMLInputElement) => Promise<boolean>
}

interface ExpectedShape {
  length?: number
  charset?: "digits" | "alnum"
}

const KEEPALIVE_INTERVAL_MS = 8000

/**
 * Active watch session managed in the content script.
 */
export class WatchSession {
  private port: chrome.runtime.Port | null = null
  private sessionId: string | null = null
  private keepAliveTimer: number | null = null
  private completed = false
  private chipHandle: ChipHandle | null = null

  constructor(
    private readonly field: HTMLInputElement,
    private readonly detectionResult: DetectionResult,
    private readonly callbacks: WatchSessionCallbacks
  ) {}

  /**
   * Start the watch session and open a keep-alive Port to the background worker.
   */
  start(): void {
    if (this.port) {
      console.warn("[WatchSession] Session already started")
      return
    }

    try {
      this.port = chrome.runtime.connect({ name: "watch-session" })
    } catch (error) {
      // Extension context invalidated (extension reloaded while content script still running)
      console.error("[WatchSession] Failed to connect to background:", error)
      console.error("[WatchSession] Extension context invalidated. Please refresh the page.")

      // Show user notification
      showNotification({
        title: "Extension Updated",
        message: "Please refresh the page to use InboxKey",
        type: "info",
        duration: 10000,
      })

      return
    }

    this.port.onMessage.addListener(this.handlePortMessage)
    this.port.onDisconnect.addListener(this.handlePortDisconnect)

    const expected = deriveExpectedShape(this.field)

    try {
      this.port.postMessage({
        type: "START_SESSION",
        url: window.location.href,
        expected,
      })
    } catch (error) {
      console.error("[WatchSession] Failed to send START_SESSION:", error)
      this.cleanup()
      return
    }

    this.keepAliveTimer = window.setInterval(() => {
      try {
        this.port?.postMessage({ type: "PING" })
      } catch (error) {
        console.warn("[WatchSession] Failed to send keepalive ping:", error)
      }
    }, KEEPALIVE_INTERVAL_MS)
  }

  /**
   * Stop the active watch session.
   */
  stop(): void {
    if (!this.port) {
      return
    }

    if (this.sessionId) {
      this.port.postMessage({ type: "STOP_SESSION" })
    }

    this.cleanup()
  }

  /**
   * @returns true if the session is active and waiting for results.
   */
  isActive(): boolean {
    return !this.completed
  }

  getField(): HTMLInputElement {
    return this.field
  }

  getDetectionResult(): DetectionResult {
    return this.detectionResult
  }

  private handlePortMessage = (message: unknown): void => {
    if (
      typeof message !== "object" ||
      message === null ||
      typeof (message as { type?: unknown }).type !== "string"
    ) {
      return
    }

    const { type } = message as { type: string }

    switch (type) {
      case "SESSION_STARTED": {
        const session = message as {
          session: { id: string }
        }
        this.sessionId = session.session.id

        // V2: Show chip in "listening" state and set badge
        this.chipHandle = showSessionChip(this.field)
        this.updateBadge('listening')

        this.callbacks.onSessionStarted?.(session.session.id)
        break
      }

      case "SESSION_UPDATE":
      case "PONG":
      case "SERVER_KEEPALIVE": {
        // noop telemetry/keepalive messages
        break
      }

      case "SESSION_CODE_FOUND": {
        if (this.completed) return

        const payload = message as {
          code: SessionCodeResult
        }

        this.completed = true

        // Try to autofill if callback provided
        if (this.callbacks.onAutofill) {
          // FIXED: Chain cleanup after autofill completes (prevents race condition)
          this.handleCodeFoundWithAutofill(payload.code)
            .then(() => {
              // Cleanup AFTER chip hide is triggered
              this.cleanup()
            })
            .catch((error) => {
              console.error("[WatchSession] Autofill error:", error)
              this.cleanup()
            })
        } else {
          // Legacy path: just call onCodeFound
          this.callbacks.onCodeFound(payload.code)
          this.cleanup()
        }

        break
      }

      case "SESSION_TIMED_OUT": {
        if (this.completed) return

        this.completed = true

        // V2: Update chip to timeout state and set badge to "no code"
        if (this.chipHandle) {
          this.chipHandle.update("timeout")
        }
        this.updateBadge('no-code')

        this.callbacks.onTimeout?.()
        this.cleanup()
        break
      }

      case "SESSION_CANCELED": {
        if (this.completed) return

        this.completed = true
        this.callbacks.onCanceled?.()
        this.cleanup()
        break
      }

      default:
        console.warn("[WatchSession] Unknown port message:", message)
        break
    }
  }

  private handlePortDisconnect = (): void => {
    console.log("[WatchSession] Port disconnected")
    this.cleanup()
  }

  /**
   * Handle code found with autofill attempt and fallback
   */
  private async handleCodeFoundWithAutofill(
    codeResult: SessionCodeResult
  ): Promise<void> {
    console.log("[WatchSession] Code found, attempting autofill:", codeResult.code)

    // Always call onCodeFound callback first
    this.callbacks.onCodeFound(codeResult)

    // Try to autofill
    const autofilled = await this.tryAutofill(codeResult)

    // If autofill failed, use fallback
    if (!autofilled) {
      await this.handleAutofillFailure(codeResult)
    }
  }

  /**
   * Try to autofill the code into the field
   * @returns true if successful, false if field is not fillable
   */
  private async tryAutofill(codeResult: SessionCodeResult): Promise<boolean> {
    if (!this.callbacks.onAutofill) {
      return false
    }

    try {
      const success = await this.callbacks.onAutofill(codeResult, this.field)
      if (success) {
        console.log("[WatchSession] Autofill successful")

        // V2: Hide chip immediately after successful autofill (user doesn't need it anymore)
        if (this.chipHandle) {
          this.chipHandle.hide()
        }
        this.updateBadge('success')
      } else {
        console.log("[WatchSession] Autofill failed or field not available")
      }
      return success
    } catch (error) {
      console.error("[WatchSession] Autofill error:", error)
      return false
    }
  }

  /**
   * Handle autofill failure by copying to clipboard and showing notification
   */
  private async handleAutofillFailure(
    codeResult: SessionCodeResult
  ): Promise<void> {
    console.log("[WatchSession] Handling autofill failure with fallback")

    try {
      // Try to copy to clipboard
      await navigator.clipboard.writeText(codeResult.code)

      // V2: Update chip to "copied" state
      if (this.chipHandle) {
        this.chipHandle.update("copied")
      }

      // Show success notification with clipboard copy
      showNotification({
        title: `Code ${codeResult.code} copied`,
        message: "Paste into the field to continue",
        type: "success",
        duration: 5000,
      })

      console.log("[WatchSession] Code copied to clipboard and user notified")
    } catch (clipboardError) {
      console.error("[WatchSession] Clipboard copy failed:", clipboardError)

      // Even if clipboard fails, show notification with code
      showNotification({
        title: `Code: ${codeResult.code}`,
        message: "Please copy this code manually",
        type: "info",
        duration: 7000, // Show longer since user needs to manually copy
      })
    }
  }

  /**
   * Update badge state via background script
   */
  private updateBadge(state: 'listening' | 'success' | 'no-code' | 'clear'): void {
    chrome.runtime.sendMessage({
      type: 'UPDATE_BADGE',
      state
    }).catch((error) => {
      console.warn('[WatchSession] Failed to update badge:', error)
    })
  }

  private cleanup(): void {
    if (this.keepAliveTimer !== null) {
      window.clearInterval(this.keepAliveTimer)
      this.keepAliveTimer = null
    }

    if (this.port) {
      try {
        this.port.onMessage.removeListener(this.handlePortMessage)
        this.port.disconnect()
      } catch {
        // Ignore disconnect errors (port may already be closed)
      }
    }

    // V2: Clean up chip and badge
    if (this.chipHandle) {
      // Don't hide immediately if showing success/error states (let auto-dismiss handle it)
      // Only explicitly hide for canceled/stopped sessions
      if (!this.completed) {
        this.chipHandle.hide()
        this.updateBadge('clear') // Clear badge for canceled sessions
      }
      this.chipHandle = null
    }
    // Note: For completed sessions (filled/timeout), badge is left visible briefly to provide feedback

    this.port = null
    this.sessionId = null

    if (activeWatch === this) {
      activeWatch = null
    }
  }
}

let activeWatch: WatchSession | null = null

/**
 * Start watching a field for verification codes. Existing sessions are canceled.
 */
export function startWatch(
  field: HTMLInputElement,
  detectionResult: DetectionResult,
  callbacks: WatchSessionCallbacks
): WatchSession {
  if (activeWatch) {
    activeWatch.stop()
  }

  const session = new WatchSession(field, detectionResult, callbacks)
  activeWatch = session
  session.start()

  return session
}

export function getActiveWatch(): WatchSession | null {
  return activeWatch
}

export function stopActiveWatch(): void {
  if (activeWatch) {
    activeWatch.stop()
    activeWatch = null
  }
}

export function isFieldWatched(field: HTMLInputElement): boolean {
  return activeWatch?.getField() === field
}

/**
 * Derive expected code shape information from an input element.
 */
function deriveExpectedShape(field: HTMLInputElement): ExpectedShape {
  const expected: ExpectedShape = {}

  if (field.maxLength && field.maxLength > 0) {
    expected.length = field.maxLength
  } else if (field.size && field.size > 0) {
    expected.length = field.size
  }

  const inputMode = field.inputMode?.toLowerCase()
  const type = field.type?.toLowerCase()
  const pattern = field.pattern

  if (
    inputMode === "numeric" ||
    inputMode === "tel" ||
    type === "number" ||
    type === "tel" ||
    /^\d+$/.test(pattern)
  ) {
    expected.charset = "digits"
  } else {
    expected.charset = "alnum"
  }

  return expected
}
