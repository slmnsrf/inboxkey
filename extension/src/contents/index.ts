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
   * Track focus-gated group members and their handler for cleanup on veto.
   * Key: representative field. Value: { inputs, handler } for removeEventListener.
   */
  const focusGateRegistry = new Map<HTMLInputElement, {
    inputs: HTMLInputElement[]
    handler: () => void
  }>()

  /**
   * Register a focus gate on a detected field.
   * The field must receive focus before a watch session starts.
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
    }

    // Start watch session on representative field
    startWatch(
      representativeField,
      detectionResult,
      {
        onSessionStarted: (_sessionId: string) => {
          // Session started
        },
        onCodeFound: (_result) => {
          // Code found (any path: autofill, clipboard, fallback).
          // Clean up focus gate so the field can be re-detected on
          // SPA resend/retry flows. This fires before autofill attempt,
          // covering all completion paths including clipboard-only mode
          // and autofill failure fallback.
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
    const group = detectSplitInputGroup(best.field)
    const representative = group?.representative || best.field
    registerFocusGate(representative, best)
  }

  /**
   * Start observing for dynamically injected fields
   */
  function startDynamicDetection(): void {
    const pendingFields = new Map<HTMLInputElement, DetectionResult>()
    let debounceTimer: number | null = null

    // globalProcessedRepresentatives already initialized in initialize()

    // Clear Set on SPA navigation (assign to module-level variable for cleanup)
    let lastUrl = window.location.href
    urlCheckTimer = window.setInterval(() => {
      if (window.location.href !== lastUrl) {
        globalProcessedRepresentatives?.clear()
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
          console.error('[InboxKey] Failed to check automation level:', error)
        }

        // Process each batched field using the detection result passed from FieldDetector
        for (const [f, result] of entries) {
          // Detect if this field is part of a split-input group
          const group = detectSplitInputGroup(f)
          const representative = group?.representative || f

          // Skip if we've already processed this representative (GLOBAL check across all batches)
          if (globalProcessedRepresentatives?.has(representative)) {
            continue
          }

          // Skip if not in DOM
          if (!document.contains(representative)) {
            continue
          }

          // registerFocusGate handles globalProcessedRepresentatives internally
          registerFocusGate(representative, result)
        }
      }, 50)  // 50ms debounce window
    })
  }

  /**
   * Initialize the content script
   */
  function initialize(): void {
    // Initialize processed set BEFORE detection (focus gate needs it)
    globalProcessedRepresentatives = new Set<HTMLInputElement>()

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
