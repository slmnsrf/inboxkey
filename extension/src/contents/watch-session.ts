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
import { extractDomain, isDomainEnabled } from "@/lib/utils/domain"
import { StorageFactory } from '@/lib/storage/storage-factory'
import { findAndClickSubmitButton } from './autofill'
import { isBlacklisted, addBlacklistedUrl } from "@/lib/utils/blacklist"
import { detectSplitInputGroup } from "@/lib/detection/split-input-detector"
import { hasEmailContext } from '@/lib/detection/email-context-guard'
import { AUTOCOMPLETE_VALUES } from '@/lib/detection/patterns'

interface SessionCodeResult {
  code: string
  source: string
  timestamp: number
}

interface WatchSessionCallbacks {
  onCodeFound: (result: SessionCodeResult) => void
  onTimeout?: () => void
  onCanceled?: () => void
  onVetoed?: () => void  // Called when a pre-flight guardrail blocks session start
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
  async start(): Promise<void> {
    if (this.port) {
      console.warn("[WatchSession] Session already started")
      return
    }

    // Check if URL is blacklisted (before domain check)
    const currentUrl = window.location.href
    const blacklisted = await isBlacklisted(currentUrl)
    if (blacklisted) {
      console.log("[WatchSession] URL is blacklisted, skipping watch session")
      return
    }

    // Check if domain is enabled before starting session
    const domain = extractDomain(currentUrl)
    if (domain) {
      const enabled = await isDomainEnabled(domain)
      if (!enabled) {
        console.log("[WatchSession] Domain is disabled, skipping watch session")
        return
      }
    }

    // GUARDRAIL 1: No-mailbox check
    // Skip silently if no mailboxes are connected (failure-open on error)
    try {
      const guardStorage = await StorageFactory.create()
      const mailboxes = await guardStorage.getMailboxes()
      if (mailboxes.length === 0) {
        console.log("[WatchSession] No mailboxes connected, skipping watch session")
        this.callbacks.onVetoed?.()
        return
      }
    } catch (error) {
      console.warn("[WatchSession] Failed to check mailboxes, proceeding (failure-open):", error)
    }

    // GUARDRAIL 3: Email context check
    // Bypass for OTP autocomplete or split-input groups (unambiguous signals)
    const autocomplete = this.field.getAttribute('autocomplete')?.toLowerCase()
    const isOtpAutocomplete = autocomplete != null &&
      (AUTOCOMPLETE_VALUES as readonly string[]).includes(autocomplete)
    const isSplitInput = detectSplitInputGroup(this.field) !== null

    if (!isOtpAutocomplete && !isSplitInput) {
      if (!hasEmailContext(this.field)) {
        console.log("[WatchSession] No email context near field, skipping watch session")
        this.callbacks.onVetoed?.()
        return
      }
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

    // Load timeout setting
    const storage = await StorageFactory.create()
    const settings = await storage.getSettings()
    const timeoutSeconds = settings.sessionTimeoutSeconds ?? 20

    try {
      this.port.postMessage({
        type: "START_SESSION",
        url: window.location.href,
        expected,
        timeoutSeconds,
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

  private handlePortMessage = async (message: unknown): Promise<void> => {
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

        // Load settings for timeout
        const storage = await StorageFactory.create()
        const settings = await storage.getSettings()
        const timeoutSeconds = settings.sessionTimeoutSeconds ?? 20

        // V2: Show chip in "listening" state with timeout and close callback
        this.chipHandle = await showSessionChip(
          this.field,
          timeoutSeconds,
          {
            onClose: async () => {
              console.log('[WatchSession] User closed session chip, adding URL to blacklist')
              const currentUrl = window.location.href
              const result = await addBlacklistedUrl(currentUrl)
              if (result.success) {
                console.log('[WatchSession] URL successfully blacklisted:', currentUrl)
              } else {
                console.warn('[WatchSession] Failed to blacklist URL:', result.errorMessage)
              }
              this.stop()
            }
          }
        )
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
    console.log("[WatchSession] Code found, attempting autofill (redacted)")

    // Always call onCodeFound callback first
    this.callbacks.onCodeFound(codeResult)

    // Check automation level from settings
    let automationLevel: string = 'autofill'
    try {
      const result = await chrome.storage.local.get('settings')
      automationLevel = result.settings?.automationLevel || 'autofill'
    } catch (error) {
      console.error("[WatchSession] Failed to load automation level:", error)
    }

    console.log(`[WatchSession] Automation level: ${automationLevel}`)

    // Handle based on automation level
    if (automationLevel === 'clipboard') {
      // Clipboard-only mode: skip autofill, go straight to clipboard
      console.log("[WatchSession] Clipboard mode - skipping autofill")
      await this.handleAutofillFailure(codeResult)
      return
    }

    // Try to autofill (for 'autofill' and 'full-automation' modes)
    const autofilled = await this.tryAutofill(codeResult)

    if (autofilled && automationLevel === 'full-automation') {
      // Full automation: try to click submit button
      console.log("[WatchSession] Full automation - attempting auto-submit")
      await this.tryAutoSubmit()
    } else if (!autofilled) {
      // If autofill failed, use fallback
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

        // V3: Show green shimmer success state (auto-dismiss handles cleanup)
        if (this.chipHandle) {
          this.chipHandle.update('filled')
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
   * Try to auto-submit the form after autofill
   */
  private async tryAutoSubmit(): Promise<void> {
    try {
      // Load extended detection setting
      const result = await chrome.storage.local.get('settings')
      const extendedDetection = result.settings?.extendedButtonDetection || false

      if (extendedDetection) {
        console.log('[WatchSession] [BETA] Extended button detection enabled')
      }

      const clicked = await findAndClickSubmitButton(this.field, extendedDetection)

      if (clicked) {
        console.log("[WatchSession] Auto-submit successful")
      } else {
        console.log("[WatchSession] No submit button found for auto-submit")
      }
    } catch (error) {
      console.error("[WatchSession] Auto-submit failed:", error)
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
        title: 'Code copied to clipboard',
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
let lastSessionCreated = 0
const SESSION_CREATION_RATE_LIMIT_MS = 1000  // Max 1 session per second

/**
 * Start watching a field for verification codes. Existing sessions are canceled.
 * Defense-in-depth: Rate limiting prevents runaway session creation bugs.
 */
export function startWatch(
  field: HTMLInputElement,
  detectionResult: DetectionResult,
  callbacks: WatchSessionCallbacks
): WatchSession {
  // DEFENSE 1: Rate limiting (catches bugs that bypass other checks)
  const now = Date.now()
  if (now - lastSessionCreated < SESSION_CREATION_RATE_LIMIT_MS) {
    console.warn('[WatchSession] 🚫 Rate limit exceeded - rejecting session creation')
    console.warn(`[WatchSession] Last session created ${now - lastSessionCreated}ms ago (limit: ${SESSION_CREATION_RATE_LIMIT_MS}ms)`)

    // Return existing session or create dummy
    if (activeWatch) {
      console.warn('[WatchSession] Reusing existing session due to rate limit')
      return activeWatch
    }
    // No active session but rate limit triggered - possible bug, log and allow
    console.error('[WatchSession] No active session but rate limit triggered - allowing this session')
  }

  // DEFENSE 2: Same field check
  if (activeWatch && activeWatch.getField() === field) {
    console.warn('[WatchSession] Field already has active session, reusing existing session')
    return activeWatch
  }

  // DEFENSE 3: Stop existing session with diagnostic logging
  if (activeWatch) {
    console.log('[WatchSession] Stopping previous session for different field')
    console.log('[WatchSession]   Previous field:', activeWatch.getField().id || activeWatch.getField().name || '(no id)')
    console.log('[WatchSession]   New field:', field.id || field.name || '(no id)')
    activeWatch.stop()
  }

  const session = new WatchSession(field, detectionResult, callbacks)
  activeWatch = session
  lastSessionCreated = now
  void session.start()

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
export function deriveExpectedShape(field: HTMLInputElement): ExpectedShape {
  const expected: ExpectedShape = {}

  // Check if field belongs to a split-input group FIRST,
  // before interpreting maxLength (which may be per-box, not total)
  const group = detectSplitInputGroup(field)
  const groupSize = group && group.inputs.length > 1 ? group.inputs.length : 1

  if (field.maxLength && field.maxLength > 0) {
    if (field.maxLength === 1 && groupSize > 1) {
      // Per-box maxLength=1 in a split group: total code length = group size
      // e.g., maxLength=1, 6 inputs -> expected length = 6
      // Only maxLength=1 is supported because autofill writes one char per box
      expected.length = groupSize
    } else {
      // Single field or large maxLength: use directly
      expected.length = field.maxLength
    }
  } else if (groupSize > 1) {
    // Split group with unset maxLength (e.g., Microsoft codeEntry-0..5)
    expected.length = groupSize
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
