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
import { autofillCode } from './autofill'
import type { DetectionResult } from '@/lib/types'
import { isExtensionEnabled } from '@/lib/utils/domain'
import { detectSplitInputGroup } from '@/lib/detection/split-input-detector'

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
   * Handle field detection and start watch session
   */
  function handleDetectedField(
    field: HTMLInputElement,
    detectionResult: DetectionResult
  ): void {
    // Check if field is part of split-input group
    const group = detectSplitInputGroup(field)
    const representativeField = group?.representative || field

    // Check if already watching this field (or its group representative)
    if (isFieldWatched(representativeField)) {
      return
    }

    // Start watch session on representative field
    startWatch(
      representativeField,
      detectionResult,
      {
        onSessionStarted: (_sessionId: string) => {
          // Session started
        },
        onCodeFound: (result) => {
          // Code value intentionally not logged (privacy)
        },
        onAutofill: async (result, targetField) => {
          // Try to autofill the code
          const success = await autofillCode({
            code: result.code,
            field: targetField,
            showFeedback: true,
          })
          if (success) {
            clearProcessedFields()
          }
          return success
        },
        onTimeout: () => {
          clearProcessedFields()
        },
        onCanceled: () => {
          clearProcessedFields()
        },
      }
    )
  }

  /**
   * Detect existing fields on page load
   */
  async function detectExistingFields(): Promise<void> {
    // Check automation level setting
    try {
      const result = await chrome.storage.local.get('settings')
      const automationLevel = result.settings?.automationLevel || 'autofill'

      if (automationLevel === 'manual') {
        return
      }
    } catch (error) {
      console.error('[InboxKey] Failed to check automation level:', error)
      // Continue with default behavior on error
    }

    const results = detector.detectExisting({ strictVisibility: true })

    if (results.length === 0) {
      return
    }

    // Use the highest confidence result
    const best = results[0]
    handleDetectedField(best.field, best)
  }

  /**
   * Start observing for dynamically injected fields
   */
  function startDynamicDetection(): void {
    const pendingFields = new Set<HTMLInputElement>()
    let debounceTimer: number | null = null

    // Initialize global Set (module-level variable)
    globalProcessedRepresentatives = new Set<HTMLInputElement>()

    // Clear Set on SPA navigation (assign to module-level variable for cleanup)
    let lastUrl = window.location.href
    urlCheckTimer = window.setInterval(() => {
      if (window.location.href !== lastUrl) {
        globalProcessedRepresentatives?.clear()
        lastUrl = window.location.href
      }
    }, 500)

    detector.startObserving(async (field: HTMLInputElement) => {
      // Add to pending batch
      pendingFields.add(field)

      // Clear existing timer
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer)
      }

      // Wait 50ms to batch rapid injections (e.g., 5 inputs injected together)
      debounceTimer = window.setTimeout(async () => {
        const fields = Array.from(pendingFields)
        pendingFields.clear()

        // Check automation level
        try {
          const result = await chrome.storage.local.get('settings')
          const automationLevel = result.settings?.automationLevel || 'autofill'

          if (automationLevel === 'manual') {
            return
          }
        } catch (error) {
          console.error('[InboxKey] Failed to check automation level:', error)
        }

        // Evaluate each batched field directly (no full-page rescan)
        for (const f of fields) {
          // Detect if this field is part of a split-input group
          const group = detectSplitInputGroup(f)
          const representative = group?.representative || f

          // Skip if we've already processed this representative (GLOBAL check across all batches)
          if (globalProcessedRepresentatives?.has(representative)) {
            continue
          }

          // Mark representative as processed GLOBALLY (only if still in DOM)
          if (document.contains(representative)) {
            globalProcessedRepresentatives?.add(representative)
          } else {
            continue
          }

          // Evaluate the specific field through Tier 1 -> Tier 2
          const result = detector.evaluateField(representative, { strictVisibility: true })

          if (result) {
            handleDetectedField(representative, result)
          }
        }
      }, 50)  // 50ms debounce window
    })
  }

  /**
   * Initialize the content script
   */
  function initialize(): void {
    // Detect fields immediately
    detectExistingFields()

    // Start observing for dynamic fields
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

    detector.stopObserving()
    const activeWatch = getActiveWatch()
    if (activeWatch) {
      activeWatch.stop()
    }
  })
})() // End of async IIFE
