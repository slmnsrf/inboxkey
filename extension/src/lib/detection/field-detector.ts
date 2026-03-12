/**
 * Two-tier verification code field detection engine (Refactored)
 *
 * NEW ARCHITECTURE (Phase 3, Task 6):
 * - 4-Layer Defense-in-Depth (Cooldown → Password → Attribute/Autocomplete → Context)
 * - Tier 1 (Fast): <0.15ms per field - detectTier1() from tier1-fast.ts
 * - Tier 2 (Deep): <0.50ms per field - detectTier2() from tier2-deep.ts
 *
 * This module is now a thin orchestration layer that:
 * 1. Manages cooldown registry singleton
 * 2. Collects visible input fields
 * 3. Delegates to tier1-fast → tier2-deep
 * 4. Converts new result format to legacy DetectionResult for backward compatibility
 *
 * BACKWARD COMPATIBILITY:
 * - Public API unchanged (detectVerificationField, detectAllFields, FieldDetector)
 * - Return type unchanged (DetectionResult)
 * - All existing call sites continue to work
 */

import type { DetectionResult } from '../types'
import { createCooldownRegistry, type CooldownRegistry } from './cooldown-registry'
import { detectTier1, type Tier1Result } from './tier1-fast'
import { detectTier2, type Tier2Result } from './tier2-deep'

// ═══════════════════════════════════════════════════════════════
// Cooldown Registry Singleton
// ═══════════════════════════════════════════════════════════════

/**
 * Singleton cooldown registry instance for the page
 *
 * Initialized on first use and reused across all detection calls.
 * This ensures fields are not re-checked within cooldown period.
 */
let _cooldownRegistry: CooldownRegistry | null = null

/**
 * Get or create the cooldown registry singleton
 *
 * @returns Shared cooldown registry instance
 */
function getCooldownRegistry(): CooldownRegistry {
  if (!_cooldownRegistry) {
    _cooldownRegistry = createCooldownRegistry()

    // Periodic cleanup every 5 minutes to prevent memory growth
    setInterval(() => {
      _cooldownRegistry?.cleanup()
    }, 5 * 60 * 1000)
  }
  return _cooldownRegistry
}

/**
 * Reset the cooldown registry singleton (test-only)
 *
 * Forces creation of a new cooldown registry instance on next detection call.
 * This is necessary in test environments where multiple test cases run with
 * different DOM documents but the cooldown registry persists across tests.
 *
 * IMPORTANT: Only use this in test code, never in production.
 */
export function resetCooldownRegistry(): void {
  _cooldownRegistry = null
}

// ═══════════════════════════════════════════════════════════════
// Result Format Conversion (New → Legacy)
// ═══════════════════════════════════════════════════════════════

/**
 * Convert Tier1Result to legacy DetectionResult format
 *
 * Maps new result format (Tier1Result) to old format (DetectionResult)
 * for backward compatibility with existing call sites.
 *
 * @param input - The input field that was detected
 * @param result - Tier 1 detection result
 * @param executionTime - Time taken for detection (ms)
 * @returns Legacy DetectionResult format
 */
function tier1ToDetectionResult(
  input: HTMLInputElement,
  result: Tier1Result,
  executionTime: number
): DetectionResult {
  return {
    field: input,
    confidence: Math.round(result.confidence * 100), // 0.0-1.0 → 0-100
    tier: 1,
    signals: [result.reason],
    executionTime,
  }
}

/**
 * Convert Tier2Result to legacy DetectionResult format
 *
 * Maps new result format (Tier2Result) to old format (DetectionResult)
 * for backward compatibility with existing call sites.
 *
 * @param input - The input field that was detected
 * @param result - Tier 2 detection result
 * @param executionTime - Time taken for detection (ms)
 * @returns Legacy DetectionResult format
 */
function tier2ToDetectionResult(
  input: HTMLInputElement,
  result: Tier2Result,
  executionTime: number
): DetectionResult {
  return {
    field: input,
    confidence: Math.round(result.confidence * 100), // 0.0-1.0 → 0-100
    tier: 2,
    signals: [result.reason],
    executionTime,
  }
}

// ═══════════════════════════════════════════════════════════════
// Input Field Collection
// ═══════════════════════════════════════════════════════════════

/**
 * Get all potentially relevant input fields
 *
 * Filters out hidden, disabled, and zero-size fields.
 *
 * @param strictVisibility - Visibility checking mode
 *   - TRUE (production): Full visibility checks via getComputedStyle() + getBoundingClientRect()
 *   - FALSE (test mode): Basic checks only (disabled, type="hidden", inline styles)
 *                        Skips DOM APIs that may not work in test environments
 * @returns Array of visible input fields
 */
function getInputFields(strictVisibility = true): HTMLInputElement[] {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>('input')
  ).filter(input => {
    // Must not be disabled
    if (input.disabled) {
      return false
    }

    // Must not be hidden type
    if (input.type === 'hidden') {
      return false
    }

    // Check for zero-size via inline styles (works in test env)
    const inlineStyle = input.getAttribute('style') || ''
    if (/width\s*:\s*0|height\s*:\s*0/.test(inlineStyle)) {
      return false
    }

    // Check for explicit hiding via inline styles (works in test env)
    // Must check before strictVisibility guard to catch display:none/visibility:hidden
    if (/display\s*:\s*none|visibility\s*:\s*hidden/.test(inlineStyle)) {
      return false
    }

    // Visibility checks (skip in test environment where DOM APIs may not work)
    if (strictVisibility) {
      // Check computed styles (browser-only)
      const style = window.getComputedStyle(input)
      if (style.display === 'none' || style.visibility === 'hidden') {
        return false
      }

      // Check dimensions (browser-only)
      const rect = input.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) {
        return false
      }
    }

    return true
  })
}

/**
 * Find input fields within shadow DOM recursively
 */
function findInputsInShadowDOM(root: Document | ShadowRoot): HTMLInputElement[] {
  const inputs: HTMLInputElement[] = []

  // Get regular input fields
  const regularInputs = root.querySelectorAll<HTMLInputElement>('input')
  inputs.push(...Array.from(regularInputs))

  // Traverse shadow roots recursively
  const allElements = root.querySelectorAll('*')
  for (const element of allElements) {
    // Check if element has shadow root (open shadow DOM)
    if (element.shadowRoot) {
      const shadowInputs = findInputsInShadowDOM(element.shadowRoot)
      inputs.push(...shadowInputs)
    }
  }

  return inputs
}

/**
 * Get all input fields including shadow DOM
 */
function getAllInputFields(strictVisibility = true): HTMLInputElement[] {
  const inputs = findInputsInShadowDOM(document)

  return inputs.filter(input => {
    // Must not be disabled
    if (input.disabled) {
      return false
    }

    // Must not be hidden type
    if (input.type === 'hidden') {
      return false
    }

    // Visibility checks - only when strictVisibility is enabled
    if (strictVisibility) {
      // Check computed styles
      const style = window.getComputedStyle(input)
      if (style.display === 'none' || style.visibility === 'hidden') {
        return false
      }

      // Check for zero-size via inline styles
      const inlineStyle = input.getAttribute('style') || ''
      if (/width\s*:\s*0|height\s*:\s*0/.test(inlineStyle)) {
        return false
      }

      // Check dimensions
      const rect = input.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) {
        return false
      }
    }

    return true
  })
}

// ═══════════════════════════════════════════════════════════════
// Main Detection API (Public - Backward Compatible)
// ═══════════════════════════════════════════════════════════════

/**
 * Main detection function - tries Tier 1 first, falls back to Tier 2
 *
 * NEW IMPLEMENTATION (Phase 3, Task 6):
 * - Uses 4-layer defense (cooldown → password → attribute/autocomplete → context)
 * - Delegates to tier1-fast.ts and tier2-deep.ts
 * - Converts new result format to legacy DetectionResult
 *
 * BACKWARD COMPATIBLE:
 * - Same signature as old implementation
 * - Same return type (DetectionResult | null)
 * - All existing call sites continue to work
 *
 * @param options - Detection options
 * @returns Detection result or null if no verification field found
 */
export function detectVerificationField(options?: {
  strictVisibility?: boolean
}): DetectionResult | null {
  const startTime = performance.now()
  const strictVisibility = options?.strictVisibility ?? true
  const cooldown = getCooldownRegistry()

  // Get all visible input fields
  const inputs = getInputFields(strictVisibility)

  if (inputs.length === 0) {
    return null
  }

  // Try Tier 1 first (fast) on each input
  for (const input of inputs) {
    const tier1Result = detectTier1(input, cooldown)

    if (tier1Result.detected) {
      const executionTime = performance.now() - startTime
      return tier1ToDetectionResult(input, tier1Result, executionTime)
    }

    // Skip Tier 2 if Tier 1 made a DEFINITIVE REJECTION (not just "no match")
    // - layer='attribute': rejected due to password type, excluded patterns, custom attributes
    // - layer='context': rejected due to negative keywords (21 languages)
    // - NO metadata: Tier1 found nothing → defer to Tier2 for deep scan
    if (tier1Result.metadata?.layer === 'attribute' ||
        tier1Result.metadata?.layer === 'context' ||
        tier1Result.metadata?.layer === 'signal-classifier-tier1') {
      continue
    }
  }

  // Fall back to Tier 2 (deep scan) on remaining inputs
  for (const input of inputs) {
    const tier2Result = detectTier2(input, cooldown)

    if (tier2Result.detected) {
      const executionTime = performance.now() - startTime
      return tier2ToDetectionResult(input, tier2Result, executionTime)
    }
  }

  return null
}

/**
 * Detect all potential verification fields and return ranked list
 *
 * NEW IMPLEMENTATION (Phase 3, Task 6):
 * - Uses new tier1-fast and tier2-deep modules
 * - Converts results to legacy DetectionResult format
 *
 * BACKWARD COMPATIBLE:
 * - Same signature as old implementation
 * - Same return type (DetectionResult[])
 *
 * Useful for debugging and testing.
 *
 * @param options - Detection options
 * @returns Array of detection results sorted by confidence (highest first)
 */
export function detectAllFields(options?: {
  strictVisibility?: boolean
}): DetectionResult[] {
  const results: DetectionResult[] = []
  const strictVisibility = options?.strictVisibility ?? true
  const cooldown = getCooldownRegistry()

  // Get all visible input fields
  const inputs = getInputFields(strictVisibility)

  // Try Tier 1 on all inputs
  for (const input of inputs) {
    const startTime = performance.now()
    const tier1Result = detectTier1(input, cooldown)

    if (tier1Result.detected) {
      const executionTime = performance.now() - startTime
      results.push(tier1ToDetectionResult(input, tier1Result, executionTime))
    }
  }

  // Try Tier 2 on remaining inputs (not yet detected)
  const detectedFields = new Set(results.map(r => r.field))
  const tier2Inputs = inputs.filter(input => !detectedFields.has(input))

  for (const input of tier2Inputs) {
    const startTime = performance.now()
    const tier2Result = detectTier2(input, cooldown)

    if (tier2Result.detected) {
      const executionTime = performance.now() - startTime
      results.push(tier2ToDetectionResult(input, tier2Result, executionTime))
    }
  }

  // Sort by confidence descending
  results.sort((a, b) => b.confidence - a.confidence)

  return results
}

// ═══════════════════════════════════════════════════════════════
// Production-Ready Field Detector Class (Public - Backward Compatible)
// ═══════════════════════════════════════════════════════════════

/**
 * Production-ready field detector with dynamic detection
 *
 * NEW IMPLEMENTATION (Phase 3, Task 6):
 * - Uses new tier1-fast and tier2-deep modules
 * - Maintains same public API for backward compatibility
 *
 * Features:
 * - Detect existing fields on page load
 * - Observe DOM mutations for dynamically injected fields
 * - Debounced mutation processing for performance
 * - Shadow DOM support
 */
export class FieldDetector {
  private observer: MutationObserver | null = null
  private detectedFields: WeakSet<HTMLInputElement> = new WeakSet()
  private debounceTimer: number | null = null
  private pendingMutations: Set<HTMLInputElement> = new Set()
  private callback: ((field: HTMLInputElement) => void) | null = null
  private cooldown: CooldownRegistry

  constructor() {
    // Create a new cooldown registry instance for this detector
    // This ensures isolation between different detector instances (e.g., in tests)
    this.cooldown = createCooldownRegistry()
  }

  /**
   * Detect existing fields on page
   *
   * NOTE: This method intentionally does NOT use cooldown to allow
   * repeated detection of the same fields. This is needed for:
   * - Debugging and testing (detectExisting can be called multiple times)
   * - Manual re-scans by developer tools
   *
   * The cooldown registry is only used in the MutationObserver path
   * to prevent duplicate callbacks for dynamically added fields.
   *
   * @param options - Detection options
   * @returns Array of detection results
   */
  detectExisting(options?: { strictVisibility?: boolean }): DetectionResult[] {
    const strictVisibility = options?.strictVisibility ?? true
    const inputs = getAllInputFields(strictVisibility)

    if (inputs.length === 0) {
      return []
    }

    const results: DetectionResult[] = []

    // Create a temporary cooldown registry for this scan
    // This prevents detecting the same field multiple times within ONE scan,
    // but allows re-detection across multiple detectExisting() calls
    const scanCooldown = createCooldownRegistry()

    // Try Tier 1 first
    for (const input of inputs) {
      const startTime = performance.now()
      const tier1Result = detectTier1(input, scanCooldown)

      if (tier1Result.detected) {
        const executionTime = performance.now() - startTime
        const result = tier1ToDetectionResult(input, tier1Result, executionTime)
        results.push(result)
        this.detectedFields.add(input)
      }
    }

    // Run Tier 2 on inputs NOT matched by Tier 1
    // (matches detectAllFields behavior -- don't suppress Tier 2 just because Tier 1 found something)
    const tier1MatchedFields = new Set(results.map(r => r.field))
    for (const input of inputs) {
      if (tier1MatchedFields.has(input)) continue

      const startTime = performance.now()
      const tier2Result = detectTier2(input, scanCooldown)

      if (tier2Result.detected) {
        const executionTime = performance.now() - startTime
        const result = tier2ToDetectionResult(input, tier2Result, executionTime)
        results.push(result)
        this.detectedFields.add(input)
      }
    }

    // Sort by confidence descending (highest confidence first)
    results.sort((a, b) => b.confidence - a.confidence)

    return results
  }

  /**
   * Start observing for dynamically injected fields
   *
   * @param callback - Called when a new verification field is detected
   */
  startObserving(callback: (field: HTMLInputElement) => void): void {
    if (this.observer) {
      console.warn('[FieldDetector] Already observing, stopping previous observer')
      this.stopObserving()
    }

    this.callback = callback

    this.observer = new MutationObserver((mutations) => {
      this.handleMutations(mutations)
    })

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false, // Don't watch attribute changes for performance
    })
  }

  /**
   * Stop observing for dynamic fields
   */
  stopObserving(): void {
    if (this.observer) {
      this.observer.disconnect()
      this.observer = null
    }

    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }

    this.pendingMutations.clear()
    this.callback = null
  }

  /**
   * Handle mutation events (debounced)
   */
  private handleMutations(mutations: MutationRecord[]): void {
    // Skip if page is navigating away
    if (document.readyState === 'complete' && !document.hasFocus()) {
      return
    }

    // Collect new input fields
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLInputElement) {
          if (!this.detectedFields.has(node)) {
            this.pendingMutations.add(node)
          }
        } else if (node instanceof HTMLElement) {
          // Check descendants
          const inputs = node.querySelectorAll<HTMLInputElement>('input')
          for (const input of inputs) {
            if (!this.detectedFields.has(input)) {
              this.pendingMutations.add(input)
            }
          }
        }
      }
    }

    // Debounce processing
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer)
    }

    this.debounceTimer = window.setTimeout(() => {
      this.processPendingMutations()
    }, 100) // 100ms debounce window
  }

  /**
   * Process accumulated mutations
   */
  private processPendingMutations(): void {
    if (this.pendingMutations.size === 0) {
      return
    }

    const inputs = Array.from(this.pendingMutations)
    this.pendingMutations.clear()

    // Filter visible inputs
    const visibleInputs = inputs.filter(input => {
      const style = window.getComputedStyle(input)
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        input.type !== 'hidden' &&
        !input.disabled
      )
    })

    if (visibleInputs.length === 0) {
      return
    }

    // Try to detect verification fields
    for (const input of visibleInputs) {
      // Try Tier 1 first
      const tier1Result = detectTier1(input, this.cooldown)

      if (tier1Result.detected) {
        this.detectedFields.add(input)
        this.callback?.(input)
        continue
      }

      // Try Tier 2 if Tier 1 didn't reject definitively
      const shouldTryTier2 = (
        tier1Result.metadata?.layer !== 'attribute' &&
        tier1Result.metadata?.layer !== 'context' &&
        tier1Result.metadata?.layer !== 'signal-classifier-tier1'
      )

      if (shouldTryTier2) {
        const tier2Result = detectTier2(input, this.cooldown)

        if (tier2Result.detected) {
          this.detectedFields.add(input)
          this.callback?.(input)
        }
      }
    }
  }

  /**
   * Evaluate a single field through the Tier 1 -> Tier 2 pipeline
   *
   * Unlike detectExisting() which scans all inputs, this evaluates
   * one specific field. Used by the dynamic detection path to avoid
   * rescanning the entire page on mutation.
   *
   * @param field - The specific input field to evaluate
   * @param options - Detection options
   * @returns Detection result or null if not a verification field
   */
  evaluateField(
    field: HTMLInputElement,
    options?: { strictVisibility?: boolean }
  ): DetectionResult | null {
    const startTime = performance.now()

    // Try Tier 1
    const tier1Result = detectTier1(field, this.cooldown)

    if (tier1Result.detected) {
      const executionTime = performance.now() - startTime
      this.detectedFields.add(field)
      return tier1ToDetectionResult(field, tier1Result, executionTime)
    }

    // Skip Tier 2 if Tier 1 made a definitive rejection
    if (
      tier1Result.metadata?.layer === 'attribute' ||
      tier1Result.metadata?.layer === 'context' ||
      tier1Result.metadata?.layer === 'signal-classifier-tier1' ||
      tier1Result.metadata?.layer === 'url-pattern'
    ) {
      return null
    }

    // Try Tier 2
    const tier2Result = detectTier2(field, this.cooldown)

    if (tier2Result.detected) {
      const executionTime = performance.now() - startTime
      this.detectedFields.add(field)
      return tier2ToDetectionResult(field, tier2Result, executionTime)
    }

    return null
  }

  /**
   * Check if observing is active
   */
  isObserving(): boolean {
    return this.observer !== null
  }
}
