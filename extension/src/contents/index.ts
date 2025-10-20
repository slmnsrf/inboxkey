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

import { FieldDetector } from '@/lib/detection/field-detector'
import {
  startWatch,
  getActiveWatch,
  isFieldWatched,
  stopActiveWatch,
} from './watch-session'
import { autofillCode, isFieldFilledByInboxKey } from './autofill'
import type { DetectionResult } from '@/lib/types'

console.log('[InboxKey] Content script loaded on', window.location.href)

// Initialize field detector
const detector = new FieldDetector()

/**
 * Handle field detection and start watch session
 */
function handleDetectedField(
  field: HTMLInputElement,
  detectionResult: DetectionResult
): void {
  console.log('[InboxKey] ========================================')
  console.log('[InboxKey] Verification field detected')
  console.log('[InboxKey] Field:', field)
  console.log('[InboxKey] Confidence:', detectionResult.confidence)
  console.log('[InboxKey] Tier:', detectionResult.tier)
  console.log('[InboxKey] Signals:', detectionResult.signals)
  console.log('[InboxKey] Execution time:', `${detectionResult.executionTime.toFixed(2)}ms`)
  console.log('[InboxKey] ========================================')

  // Check if already watching this field
  if (isFieldWatched(field)) {
    console.log('[InboxKey] Field already being watched, skipping')
    return
  }

  // Start watch session
  startWatch(
    field,
    detectionResult,
    {
      onSessionStarted: (sessionId: string) => {
        console.log(`[InboxKey] Watch session started: ${sessionId}`)
      },
      onCodeFound: (result) => {
        console.log(`[InboxKey] Code received: ${result.code}`)
      },
      onAutofill: async (result, targetField) => {
        // Try to autofill the code
        const success = await autofillCode({
          code: result.code,
          field: targetField,
          showFeedback: true,
        })
        return success
      },
      onTimeout: () => {
        console.log("[InboxKey] Watch session timed out without code")
      },
      onCanceled: () => {
        console.log("[InboxKey] Watch session canceled")
      },
    }
  )
}

/**
 * Detect existing fields on page load
 */
function detectExistingFields(): void {
  console.log('[InboxKey] Detecting existing verification fields...')

  const results = detector.detectExisting({ strictVisibility: true })

  if (results.length === 0) {
    console.log('[InboxKey] No verification fields found')
    return
  }

  // Use the highest confidence result
  const best = results[0]
  handleDetectedField(best.field, best)
}

/**
 * Set up focus event listeners for manual detection
 * (as backup for fields that weren't detected automatically)
 */
function setupFocusListeners(): void {
  document.addEventListener(
    'focus',
    (event) => {
      const target = event.target as HTMLElement

      if (!(target instanceof HTMLInputElement)) {
        return
      }

      // Skip if already watching
      if (isFieldWatched(target)) {
        return
      }

      // Skip if active watch exists (don't start multiple sessions)
      if (getActiveWatch()) {
        return
      }

      // FIXED: Skip if field already filled by InboxKey (prevents re-trigger)
      if (isFieldFilledByInboxKey(target)) {
        console.log('[InboxKey] Field already filled, skipping re-trigger')
        return
      }

      // FIXED: Skip if field has any value (user filled or other source)
      if (target.value && target.value.trim().length > 0) {
        console.log('[InboxKey] Field has existing value, skipping')
        return
      }

      // Try to detect if this is a verification field
      // Use fast detection (Tier 1 only for focus events)
      // const inputs = [target]
      const tier1Results = detector.detectExisting({ strictVisibility: true })

      if (tier1Results.length > 0 && tier1Results[0].field === target) {
        console.log('[InboxKey] Verification field focused (manual detection)')
        handleDetectedField(target, tier1Results[0])
      }
    },
    true // Capture phase
  )
}

/**
 * Start observing for dynamically injected fields
 */
function startDynamicDetection(): void {
  console.log('[InboxKey] Starting dynamic field detection...')

  detector.startObserving((field: HTMLInputElement) => {
    console.log('[InboxKey] Dynamically injected field detected:', field)

    // Get detection result for this field
    const results = detector.detectExisting({ strictVisibility: true })
    const result = results.find((r) => r.field === field)

    if (result) {
      handleDetectedField(field, result)
    }
  })

  console.log('[InboxKey] Dynamic detection active')
}

/**
 * Initialize the content script
 */
function initialize(): void {
  console.log('[InboxKey] Initializing content script...')

  // Detect fields immediately
  detectExistingFields()

  // Start observing for dynamic fields
  startDynamicDetection()

  // Set up focus listeners as backup
  setupFocusListeners()

  // Monitor for field removal
  const observer = new MutationObserver(() => {
    const activeWatch = getActiveWatch()
    if (activeWatch && !document.contains(activeWatch.getField())) {
      console.log('[InboxKey] Active watch field removed from DOM')
      stopActiveWatch()
    }
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  })

  console.log('[InboxKey] Content script initialized')
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize)
} else {
  initialize()
}

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  console.log('[InboxKey] Cleaning up before page unload')
  detector.stopObserving()
  const activeWatch = getActiveWatch()
  if (activeWatch) {
    activeWatch.stop()
  }
})

// Export for testing
export { detector, handleDetectedField }
