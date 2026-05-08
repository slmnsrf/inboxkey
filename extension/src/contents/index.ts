/**
 * Content Script - Production Version
 * Detects verification fields and manages autofill with production-ready detection engine
 *
 * Architecture:
 * - FieldDetector: Detects existing and dynamic fields (Tier 1 + Tier 2)
 * - WatchSession: Manages polling timers (t=0s, 5s, 10s)
 * - Autofill: Handles safe code filling with visual feedback
 * - CodeFetcher: Retrieves and matches codes from background
 */

export const config = {
  matches: ["https://*/*"],
  run_at: "document_end",
}

import { FieldDetector } from '@/lib/detection/field-detector'
import {
  startWatch,
  getActiveWatch,
  isFieldWatched,
  stopActiveWatch,
} from './watch-session'
import { autofillCode, clearAutofillTracking } from './autofill'
import type { DetectionResult } from '@/lib/types'
import { isExtensionEnabled } from '@/lib/utils/domain'
import { isHTMLDocument } from '@/lib/utils/is-html-document'
import { detectSplitInputGroup } from '@/lib/detection/split-input-detector'
import { hasEmailContext } from '@/lib/detection/email-context-guard'
import { hydrateSmsCache } from '@/lib/detection/sms-feature-cache'
import { getMatchingAutocompleteToken } from '@/lib/detection/detection-utils'
import { AUTOCOMPLETE_VALUES } from '@/lib/detection/patterns'
import { cancelPendingNotifications } from './notification'
import { initPasswordlessWatcher } from '@/lib/detection/passwordless-watcher'
import type { PasswordlessWatcher } from '@/lib/detection/passwordless-watcher'

/**
 * Global Set to track processed representative fields across all batches
 * NOTE: Set uses object identity comparison. If a field is removed from DOM
 * and recreated with identical attributes, it will be treated as a new field.
 * This is acceptable - it's rare and prevents blocking legitimate re-renders.
 */
let globalProcessedRepresentatives: Set<HTMLInputElement> | null = null

/**
 * URL change detection timer for SPA navigation
 * Cleared on page unload to prevent memory leaks
 */
let urlCheckTimer: ReturnType<typeof setInterval> | null = null

/**
 * Watcher instance returned by initPasswordlessWatcher().
 * Called on beforeunload to remove listeners.
 */
let passwordlessWatcher: PasswordlessWatcher | null = null

/**
 * Clear the global Set of processed representatives
 * Called after watch session completes (autofill, timeout, cancel)
 */
export function clearProcessedFields(): void {
  if (globalProcessedRepresentatives) {
    globalProcessedRepresentatives.clear()
  }
}

// Wrap initialization in async IIFE to check domain before any execution
;(async () => {
  // Bail out on non-HTML documents (SVG, XML, plain text). Content script
  // match patterns restrict to http(s), but those schemes can still serve
  // non-HTML top-level documents where `document.body` is null and the
  // MutationObserver.observe(document.body, ...) call below crashes.
  // This is a hard prerequisite for every other check in the IIFE.
  if (!isHTMLDocument()) {
    return
  }

  // CRITICAL: Check extension state FIRST before any logging or initialization
  // If extension is disabled (by domain preference, banking blocklist, or blacklist), exit silently
  const enabled = await isExtensionEnabled(window.location.href)
  if (!enabled) {
    // Silent exit - no logs, no initialization, no background activity
    // User must reload page after re-enabling extension
    return
  }

  // Domain is enabled - proceed with normal initialization
  // Initialize field detector
  const detector = new FieldDetector()

  /**
   * Track focus-gated group members and their handler for cleanup on veto.
   * Key: representative field. Value: { inputs, handler } for removeEventListener.
   */
  const focusGateRegistry = new Map<HTMLInputElement, {
    inputs: HTMLInputElement[]
    handler: () => void
  }>()

  /**
   * Determine if the focus gate should be bypassed for this field.
   * Bypasses when detection confidence is high AND email context is present,
   * or when the field has an OTP autocomplete attribute.
   * Fail-closed: returns false on any error (keeps the gate active).
   */
  function shouldBypassFocusGate(
    field: HTMLInputElement,
    detectionResult: DetectionResult
  ): boolean {
    try {
      // Always bypass for OTP autocomplete values
      if (getMatchingAutocompleteToken(field, AUTOCOMPLETE_VALUES) !== null) {
        return true
      }

      // SMS fields are inherently high-intent (user is on a page expecting an SMS code)
      if (detectionResult.detectedChannels?.includes('sms')) {
        return true
      }

      // Bypass when Tier 1 confidence is high AND email context is present
      if (detectionResult.confidence >= 90 && hasEmailContext(field)) {
        return true
      }

      return false
    } catch {
      // Fail-closed: if anything goes wrong, keep the gate active
      return false
    }
  }

  /**
   * Skip re-triggering on fields InboxKey just filled. Autofill dispatches
   * framework events and some sites mutate OTP input classes in response; those
   * mutations must not start a fresh listening session over the completed one.
   * If the page/user has cleared the value, remove the marker so resend/retry
   * flows can be detected normally.
   */
  function hasActiveInboxKeyFill(field: HTMLInputElement): boolean {
    const group = detectSplitInputGroup(field)
    const inputs = group?.inputs ?? [field]
    const tracked = inputs.filter(input => input.getAttribute('data-inboxkey-filled') === 'true')

    if (tracked.length === 0) {
      return false
    }

    if (tracked.some(input => input.value.trim().length > 0)) {
      return true
    }

    for (const input of tracked) {
      clearAutofillTracking(input)
    }
    return false
  }

  /**
   * Register a focus gate on a detected field.
   * The field must receive focus before a watch session starts.
   * Bypassed when shouldBypassFocusGate() returns true.
   */
  function registerFocusGate(
    representativeField: HTMLInputElement,
    detectionResult: DetectionResult
  ): void {
    // Prevent duplicate registration
    if (representativeField.hasAttribute('data-inboxkey-focus-gated')) return
    representativeField.setAttribute('data-inboxkey-focus-gated', 'true')

    // Mark as processed globally (prevents re-detection by MutationObserver)
    globalProcessedRepresentatives?.add(representativeField)

    // Determine all fields that could receive focus
    const group = detectSplitInputGroup(representativeField)
    const allInputs: HTMLInputElement[] = group ? [...group.inputs] : [representativeField]

    // Check if any field already has focus
    if (allInputs.some(f => document.activeElement === f)) {
      handleDetectedField(representativeField, detectionResult)
      return
    }

    // Create shared handler that triggers on first focus of any group member
    const handler = () => {
      // Check shared flag -- only trigger once across the group
      if (!representativeField.hasAttribute('data-inboxkey-focus-gated')) return
      handleDetectedField(representativeField, detectionResult)
    }

    // Store for cleanup
    focusGateRegistry.set(representativeField, { inputs: allInputs, handler })

    // Attach to all group members
    for (const input of allInputs) {
      input.addEventListener('focus', handler, { once: true })
    }
  }

  /**
   * Handle field detection and start watch session
   */
  function handleDetectedField(
    field: HTMLInputElement,
    detectionResult: DetectionResult
  ): void {
    // Check if field is part of split-input group
    const group = detectSplitInputGroup(field)
    const representativeField = group?.representative || field

    if (hasActiveInboxKeyFill(representativeField)) {
      return
    }

    // Check if already watching this field (or its group representative)
    if (isFieldWatched(representativeField)) {
      return
    }

    // Shared cleanup: clear processed fields + focus gate state.
    // Used by all session-end paths (autofill, timeout, cancel, veto)
    // so the field can be re-detected on SPA resend/retry flows.
    function cleanupFocusGate(): void {
      clearProcessedFields()
      const entry = focusGateRegistry.get(representativeField)
      if (entry) {
        for (const input of entry.inputs) {
          input.removeAttribute('data-inboxkey-focus-gated')
          input.removeEventListener('focus', entry.handler)
        }
        focusGateRegistry.delete(representativeField)
      }
      representativeField.removeAttribute('data-inboxkey-focus-gated')
      representativeField.removeAttribute('data-inboxkey-watching')
      // Drop the field from the detector's WeakSet too. Without this,
      // the mutation/focus/pageshow rescan paths would still treat the
      // input as "already detected" and skip it on resend / retry /
      // SPA route changes that don't replace the DOM node.
      const allInputs = group ? group.inputs : [field]
      for (const input of allInputs) {
        detector.forgetField(input)
        globalProcessedRepresentatives?.delete(input)
      }
    }

    // Start watch session on representative field
    startWatch(
      representativeField,
      detectionResult,
      {
        onSessionStarted: (_sessionId: string) => {
          representativeField.setAttribute('data-inboxkey-watching', 'true')
        },
        onCodeFound: (_result) => {
          // Code found; cleanup waits until WatchSession finishes autofill,
          // clipboard fallback, and auto-submit handling. Cleaning here would
          // release detector guards before autofill's input/change events settle.
        },
        onCodeHandled: () => {
          cleanupFocusGate()
        },
        onAutofill: async (result, targetField) => {
          // Try to autofill the code
          const success = await autofillCode({
            code: result.code,
            field: targetField,
          })
          return success
        },
        onTimeout: () => {
          cleanupFocusGate()
        },
        onCanceled: () => {
          cleanupFocusGate()
        },
        onVetoed: () => {
          cleanupFocusGate()
        },
      }
    )
  }

  /**
   * Detect existing fields on page load
   */
  async function detectExistingFields(): Promise<void> {
    // SMS cache is hydrated in initialize() before this function is called.

    // Check automation level setting
    try {
      const result = await chrome.storage.local.get('settings')
      const automationLevel = result.settings?.automationLevel || 'autofill'

      if (automationLevel === 'manual') {
        return
      }
    } catch (error) {
      console.log('[InboxKey] Failed to check automation level:', error)
      // Continue with default behavior on error
    }

    const results = detector.detectExisting({ strictVisibility: true })

    if (results.length === 0) {
      return
    }

    // Use the highest confidence result
    const best = results[0]
    const group = detectSplitInputGroup(best.field)
    const representative = group?.representative || best.field
    if (hasActiveInboxKeyFill(representative)) {
      return
    }

    if (shouldBypassFocusGate(representative, best)) {
      handleDetectedField(representative, best)
    } else {
      registerFocusGate(representative, best)
    }
  }

  /**
   * Start observing for dynamically injected fields
   */
  function startDynamicDetection(): void {
    const pendingFields = new Map<HTMLInputElement, DetectionResult>()
    let debounceTimer: number | null = null

    // globalProcessedRepresentatives already initialized in initialize()

    // Clear Set on SPA navigation AND notify the passwordless watcher
    // (which can't observe page-world history.pushState in Chrome MV3 ISOLATED).
    let lastUrl = window.location.href
    urlCheckTimer = window.setInterval(() => {
      if (window.location.href !== lastUrl) {
        globalProcessedRepresentatives?.clear()
        passwordlessWatcher?.onUrlChanged()
        lastUrl = window.location.href
      }
    }, 500)

    detector.startObserving(async (field: HTMLInputElement, detectionResult: DetectionResult) => {
      // Add to pending batch (store both field and its detection result)
      pendingFields.set(field, detectionResult)

      // Clear existing timer
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer)
      }

      // Wait 50ms to batch rapid injections (e.g., 5 inputs injected together)
      debounceTimer = window.setTimeout(async () => {
        const entries = Array.from(pendingFields.entries())
        pendingFields.clear()

        // Check automation level
        try {
          const result = await chrome.storage.local.get('settings')
          const automationLevel = result.settings?.automationLevel || 'autofill'

          if (automationLevel === 'manual') {
            return
          }
        } catch (error) {
          console.log('[InboxKey] Failed to check automation level:', error)
        }

        // Process each batched field using the detection result passed from FieldDetector
        for (const [f, result] of entries) {
          // Detect if this field is part of a split-input group
          const group = detectSplitInputGroup(f)
          const representative = group?.representative || f

          if (hasActiveInboxKeyFill(representative)) {
            globalProcessedRepresentatives?.add(representative)
            continue
          }

          // Skip if we've already processed this representative (GLOBAL check across all batches)
          if (globalProcessedRepresentatives?.has(representative)) {
            continue
          }

          // Skip if not in DOM
          if (!document.contains(representative)) {
            continue
          }

          // Bypass focus gate for high-confidence fields with email context
          if (shouldBypassFocusGate(representative, result)) {
            globalProcessedRepresentatives?.add(representative)
            handleDetectedField(representative, result)
          } else {
            registerFocusGate(representative, result)
          }
        }
      }, 50)  // 50ms debounce window
    })
  }

  /**
   * Initialize the content script
   */
  async function initialize(): Promise<void> {
    // Initialize processed set BEFORE detection (focus gate needs it)
    globalProcessedRepresentatives = new Set<HTMLInputElement>()

    // Hydrate SMS cache once before any detection (prevents race where
    // MutationObserver evaluates SMS fields before the cache is ready)
    await hydrateSmsCache()

    // Detect fields immediately (cache already hydrated above)
    await detectExistingFields()

    // Start observing for dynamic fields (cache guaranteed ready)
    startDynamicDetection()

    // Monitor for field removal
    const observer = new MutationObserver(() => {
      const activeWatch = getActiveWatch()
      if (activeWatch && !document.contains(activeWatch.getField())) {
        stopActiveWatch()
      }
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    })

    // Start passwordless page watcher (fires TRIGGER_INBOX_POLL when the
    // user lands on a "check your inbox" waiting screen with no input fields)
    passwordlessWatcher = initPasswordlessWatcher()
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize)
  } else {
    initialize()
  }

  // Clean up on page unload
  window.addEventListener('beforeunload', () => {
    // Clear URL check timer (prevent memory leak)
    if (urlCheckTimer !== null) {
      clearInterval(urlCheckTimer)
      urlCheckTimer = null
    }

    // Clean up passwordless watcher (removes listeners)
    if (passwordlessWatcher !== null) {
      passwordlessWatcher.cleanup()
      passwordlessWatcher = null
    }

    detector.stopObserving()
    cancelPendingNotifications()
    const activeWatch = getActiveWatch()
    if (activeWatch) {
      activeWatch.stop()
    }
  })
})() // End of async IIFE
