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

    const pendingFields = new Set<HTMLInputElement>()
    let debounceTimer: number | null = null

    detector.startObserving(async (field: HTMLInputElement) => {
      console.log('[InboxKey] ⚡ Dynamic detection callback fired for field:', {
        element: field,
        maxLength: field.maxLength,
        type: field.type,
        role: field.getAttribute('role')
      })

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

        console.log(`[InboxKey] Processing ${fields.length} dynamically injected field(s)`)

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

        // Detect all batched fields at once (call detectExisting ONCE, not per field)
        const results = detector.detectExisting({ strictVisibility: true })

        // Deduplicate fields by split-input groups BEFORE processing
        const processedRepresentatives = new Set<HTMLInputElement>()

        // Process batched fields
        for (const f of fields) {
          // Detect if this field is part of a split-input group
          const group = detectSplitInputGroup(f)
          const representative = group?.representative || f

          // Skip if we've already processed this representative
          if (processedRepresentatives.has(representative)) {
            console.log('[InboxKey] Skipping field - representative already processed:', {
              field: f.id || f.name || f.getAttribute('aria-label'),
              representative: representative.id || representative.name || representative.getAttribute('aria-label')
            })
            continue
          }

          // Mark representative as processed
          processedRepresentatives.add(representative)

          console.log('[InboxKey] Dynamically injected field detected:', f)

          // Find detection result for the representative field
          const result = results.find((r) => r.field === representative)

          if (result) {
            handleDetectedField(representative, result)
          }
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
    detector.stopObserving()
    const activeWatch = getActiveWatch()
    if (activeWatch) {
      activeWatch.stop()
    }
  })
})() // End of async IIFE
