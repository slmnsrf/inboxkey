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
    const size = globalProcessedRepresentatives.size
    globalProcessedRepresentatives.clear()
    console.log(`[InboxKey] 🧹 Cleared ${size} processed representative(s)`)
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

    // Check if field is part of split-input group
    const group = detectSplitInputGroup(field)
    const representativeField = group?.representative || field

    if (group) {
      console.log(`[InboxKey] Split-input group detected: ${group.inputs.length} inputs`)
      console.log('[InboxKey] Pattern:', group.pattern)
      console.log('[InboxKey] Using first input as representative')
    }

    console.log('[InboxKey] Field:', representativeField)
    console.log('[InboxKey] Confidence:', detectionResult.confidence)
    console.log('[InboxKey] Tier:', detectionResult.tier)
    console.log('[InboxKey] Signals:', detectionResult.signals)
    console.log('[InboxKey] Execution time:', `${detectionResult.executionTime.toFixed(2)}ms`)
    console.log('[InboxKey] ========================================')

    // Check if already watching this field (or its group representative)
    if (isFieldWatched(representativeField)) {
      console.log('[InboxKey] Field (or group) already being watched, skipping')
      return
    }

    // Start watch session on representative field
    startWatch(
      representativeField,
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
          if (success) {
            clearProcessedFields()
          }
          return success
        },
        onTimeout: () => {
          console.log("[InboxKey] Watch session timed out without code")
          clearProcessedFields()
        },
        onCanceled: () => {
          console.log("[InboxKey] Watch session canceled")
          clearProcessedFields()
        },
      }
    )
  }

  /**
   * Detect existing fields on page load
   */
  async function detectExistingFields(): Promise<void> {
    console.log('[InboxKey] Detecting existing verification fields...')

    // Check automation level setting
    try {
      const result = await chrome.storage.local.get('settings')
      const automationLevel = result.settings?.automationLevel || 'autofill'

      if (automationLevel === 'manual') {
        console.log('[InboxKey] Manual mode enabled - skipping auto-detection')
        return
      }
    } catch (error) {
      console.error('[InboxKey] Failed to check automation level:', error)
      // Continue with default behavior on error
    }

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
   * Start observing for dynamically injected fields
   */
  function startDynamicDetection(): void {
    console.log('[InboxKey] Starting dynamic field detection...')

    const pendingFields = new Map<HTMLInputElement, DetectionResult>()
    let debounceTimer: number | null = null
    let callbackCount = 0  // Track how many times observer fires

    // Initialize global Set (module-level variable)
    globalProcessedRepresentatives = new Set<HTMLInputElement>()

    // Clear Set on SPA navigation (assign to module-level variable for cleanup)
    let lastUrl = window.location.href
    urlCheckTimer = window.setInterval(() => {
      if (window.location.href !== lastUrl) {
        console.log('[InboxKey] 🔄 URL changed, clearing processed representatives')
        globalProcessedRepresentatives?.clear()
        lastUrl = window.location.href
      }
    }, 500)

    detector.startObserving(async (field: HTMLInputElement, detectionResult: DetectionResult) => {
      callbackCount++
      console.log(`[InboxKey] ⚡ Dynamic detection callback #${callbackCount} fired for field:`, {
        id: field.id,
        name: field.name,
        maxLength: field.maxLength,
        type: field.type,
        role: field.getAttribute('role')
      })

      // Add to pending batch (latest result wins for same field)
      pendingFields.set(field, detectionResult)

      // Clear existing timer
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer)
      }

      // Wait 50ms to batch rapid injections (e.g., 5 inputs injected together)
      debounceTimer = window.setTimeout(async () => {
        const entries = Array.from(pendingFields.entries())
        pendingFields.clear()

        console.log(`[InboxKey] 📦 Processing batch of ${entries.length} field(s)`)
        console.log('[InboxKey] 📦 Field IDs in batch:', entries.map(([f]) => f.id || f.name || '?'))

        // Check automation level
        try {
          const result = await chrome.storage.local.get('settings')
          const automationLevel = result.settings?.automationLevel || 'autofill'

          if (automationLevel === 'manual') {
            console.log('[InboxKey] Manual mode enabled - skipping dynamic detection')
            return
          }
        } catch (error) {
          console.error('[InboxKey] Failed to check automation level:', error)
        }

        // Process each batched field using the result from the observer
        for (const [f, observerResult] of entries) {
          // Detect if this field is part of a split-input group
          const group = detectSplitInputGroup(f)
          const representative = group?.representative || f

          console.log('[InboxKey] 🎯 Field:', f.id || f.name, '→ Representative:', representative.id || representative.name)

          // Skip if we've already processed this representative (GLOBAL check across all batches)
          if (globalProcessedRepresentatives?.has(representative)) {
            console.log('[InboxKey] ⏭️  SKIPPING - representative already processed globally')
            continue
          }

          // Mark representative as processed GLOBALLY (only if still in DOM)
          if (document.contains(representative)) {
            globalProcessedRepresentatives?.add(representative)
            console.log('[InboxKey] ✅ Added representative to global Set (size:', globalProcessedRepresentatives?.size, ')')
          } else {
            console.log('[InboxKey] ⚠️  Representative no longer in DOM, skipping')
            continue
          }

          // Use the detection result from the observer directly
          // No re-evaluation needed - avoids cooldown coupling
          console.log('[InboxKey] ✓ Field detected, calling handleDetectedField()')
          handleDetectedField(representative, observerResult)
        }
      }, 50)  // 50ms debounce window
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

    // Clear URL check timer (prevent memory leak)
    if (urlCheckTimer !== null) {
      clearInterval(urlCheckTimer)
      urlCheckTimer = null
      console.log('[InboxKey] 🧹 Cleared URL check timer')
    }

    detector.stopObserving()
    const activeWatch = getActiveWatch()
    if (activeWatch) {
      activeWatch.stop()
    }
  })
})() // End of async IIFE
