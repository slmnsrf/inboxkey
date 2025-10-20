/**
 * Two-tier verification code field detection engine
 *
 * Tier 1 (Fast): <1ms - Simple attribute checks for 70% coverage
 * Tier 2 (Deep): <50ms - Comprehensive DOM scan for 90%+ coverage
 */

import type { DetectionResult } from '../types'
import {
  ATTRIBUTE_PATTERNS,
  AUTOCOMPLETE_VALUES,
  NUMERIC_INPUT_MODES,
  RELEVANT_INPUT_TYPES,
  TYPICAL_CODE_LENGTHS,
  HTML_PATTERN_DETECTION,
  EXCLUSION_PATTERNS,
  isExcluded,
  getLabelMatchStrength,
  getPlaceholderMatchStrength,
} from './patterns'

/**
 * Tier 1: Fast detection using HTML attributes
 * Target: <1ms execution time
 */
function detectTier1(inputs: HTMLInputElement[]): DetectionResult | null {
  const startTime = performance.now()
  const candidates: Array<{
    input: HTMLInputElement
    confidence: number
    signals: string[]
  }> = []

  for (const input of inputs) {
    const signals: string[] = []
    let confidence = 0

    const name = input.name?.toLowerCase() || ''
    const id = input.id?.toLowerCase() || ''
    const identifier = name || id
    const maxLength = input.maxLength

    // Skip excluded patterns
    if (identifier && isExcluded(identifier)) {
      continue
    }

    // Skip zip codes explicitly
    if (maxLength > 0 && maxLength <= 5 && /zip|postal/i.test(identifier)) {
      continue
    }

    // Check autocomplete attribute (HTML standard) - highest confidence
    const autocomplete = input.getAttribute('autocomplete')?.toLowerCase()
    if (autocomplete && AUTOCOMPLETE_VALUES.includes(autocomplete as any)) {
      signals.push(`autocomplete="${autocomplete}"`)
      confidence = 100
      candidates.push({ input, confidence, signals })
      continue
    }

    // Check name/id attributes (before inputmode to prefer semantic naming)
    if (identifier) {
      // Check for specific exclusions in the ID (like cvv-code should be excluded despite containing "code")
      const hasExclusionKeyword = Object.values(EXCLUSION_PATTERNS).some(pattern =>
        pattern.test(identifier)
      )

      if (!hasExclusionKeyword) {
        // Exact match
        if (ATTRIBUTE_PATTERNS.exact.test(identifier)) {
          signals.push(`name/id="${identifier}" (exact match)`)
          confidence = 95
          candidates.push({ input, confidence, signals })
          continue
        }

        // Contains match
        if (ATTRIBUTE_PATTERNS.contains.test(identifier)) {
          signals.push(`name/id="${identifier}" (contains match)`)
          confidence = 90
          candidates.push({ input, confidence, signals })
          continue
        }
      }
    }

    // Check inputmode + maxlength combination
    const inputmode = input.getAttribute('inputmode')?.toLowerCase()
    if (
      inputmode &&
      NUMERIC_INPUT_MODES.includes(inputmode as any) &&
      maxLength >= TYPICAL_CODE_LENGTHS.min &&
      maxLength <= TYPICAL_CODE_LENGTHS.max
    ) {
      signals.push(`inputmode="${inputmode}"`, `maxlength=${maxLength}`)
      confidence = 85
      candidates.push({ input, confidence, signals })
      continue
    }
  }

  // Return highest confidence candidate
  if (candidates.length > 0) {
    candidates.sort((a, b) => b.confidence - a.confidence)
    const best = candidates[0]
    return {
      field: best.input,
      confidence: best.confidence,
      tier: 1,
      signals: best.signals,
      executionTime: performance.now() - startTime,
    }
  }

  return null
}

/**
 * Get associated label text for an input field
 */
function getLabelText(input: HTMLInputElement): string {
  const labels: string[] = []

  // Check for label element (by 'for' attribute)
  const id = input.id
  if (id) {
    const label = input.ownerDocument?.querySelector(`label[for="${id}"]`)
    if (label?.textContent) {
      labels.push(label.textContent.trim())
    }
  }

  // Check for parent label
  let parent = input.parentElement
  if (parent?.tagName === 'LABEL' && parent.textContent) {
    labels.push(parent.textContent.trim())
  }

  // Check for aria-label
  const ariaLabel = input.getAttribute('aria-label')
  if (ariaLabel) {
    labels.push(ariaLabel)
  }

  // Check for aria-labelledby
  const ariaLabelledby = input.getAttribute('aria-labelledby')
  if (ariaLabelledby) {
    const labelElement = input.ownerDocument?.getElementById(ariaLabelledby)
    if (labelElement?.textContent) {
      labels.push(labelElement.textContent.trim())
    }
  }

  return labels.join(' ')
}

/**
 * Get nearby text (within 2 parent levels)
 */
function getNearbyText(input: HTMLInputElement): string {
  const texts: string[] = []

  let element: HTMLElement | null = input
  let levels = 0

  while (element && levels < 3) {
    // Get all text from siblings
    if (element.parentElement) {
      const siblings: Element[] = Array.from(element.parentElement.children)
      for (const sibling: Element of siblings) {
        if (sibling !== element && sibling instanceof HTMLElement) {
          const text = sibling.textContent?.trim()
          if (text && text.length < 200) {
            // Avoid huge blocks
            texts.push(text)
          }
        }
      }
    }

    element = element.parentElement
    levels++
  }

  return texts.join(' ')
}

/**
 * Tier 2: Deep detection using DOM traversal and text analysis
 * Target: <50ms execution time
 */
function detectTier2(inputs: HTMLInputElement[]): DetectionResult | null {
  const startTime = performance.now()
  const candidates: Array<{
    input: HTMLInputElement
    score: number
    signals: string[]
  }> = []

  for (const input of inputs) {
    let score = 0
    const signals: string[] = []

    // Skip if excluded by keywords
    const name = input.name?.toLowerCase() || ''
    const id = input.id?.toLowerCase() || ''
    const identifier = name || id

    if (identifier && isExcluded(identifier)) {
      continue
    }

    // Skip zip codes (maxlength 5 or less)
    const maxLength = input.maxLength
    if (maxLength > 0 && maxLength <= 5 && /zip|postal/i.test(identifier)) {
      continue
    }

    // Check input type (must be relevant)
    const type = input.type?.toLowerCase() || 'text'
    if (!RELEVANT_INPUT_TYPES.includes(type as any)) {
      continue
    }
    signals.push(`type="${type}"`)
    score += 5

    // Check label text
    const labelText = getLabelText(input)
    if (labelText) {
      const labelScore = getLabelMatchStrength(labelText)
      if (labelScore > 0) {
        signals.push(`label="${labelText.substring(0, 50)}" (+${labelScore})`)
        score += labelScore
      } else if (isExcluded(labelText)) {
        // Excluded label, skip this field
        continue
      }
    }

    // Check placeholder
    const placeholder = input.placeholder || ''
    if (placeholder) {
      const placeholderScore = getPlaceholderMatchStrength(placeholder)
      if (placeholderScore > 0) {
        signals.push(`placeholder="${placeholder}" (+${placeholderScore})`)
        score += placeholderScore
      }
    }

    // Check pattern attribute
    const pattern = input.getAttribute('pattern')
    if (pattern) {
      const digitsMatch = HTML_PATTERN_DETECTION.digits.exec(pattern)
      const rangeMatch = HTML_PATTERN_DETECTION.range.exec(pattern)

      if (digitsMatch) {
        const length = parseInt(digitsMatch[1], 10)
        if (length >= TYPICAL_CODE_LENGTHS.min && length <= TYPICAL_CODE_LENGTHS.max) {
          signals.push(`pattern="\\d{${length}}" (+15)`)
          score += 15
        }
      } else if (rangeMatch) {
        const min = parseInt(rangeMatch[1], 10)
        const max = parseInt(rangeMatch[2], 10)
        if (
          min >= TYPICAL_CODE_LENGTHS.min &&
          max <= TYPICAL_CODE_LENGTHS.max
        ) {
          signals.push(`pattern="\\d{${min},${max}}" (+15)`)
          score += 15
        }
      }
    }

    // Check maxlength (already defined above)
    if (maxLength > 0) {
      if (
        maxLength >= TYPICAL_CODE_LENGTHS.min &&
        maxLength <= TYPICAL_CODE_LENGTHS.max
      ) {
        signals.push(`maxlength=${maxLength} (+10)`)
        score += 10
      }
    }

    // Check inputmode
    const inputmode = input.getAttribute('inputmode')?.toLowerCase()
    if (inputmode && NUMERIC_INPUT_MODES.includes(inputmode as any)) {
      signals.push(`inputmode="${inputmode}" (+10)`)
      score += 10
    }

    // Check nearby text
    const nearbyText = getNearbyText(input)
    if (nearbyText) {
      const nearbyScore = getLabelMatchStrength(nearbyText)
      if (nearbyScore > 0) {
        signals.push(`nearby text (+${Math.floor(nearbyScore / 2)})`)
        score += Math.floor(nearbyScore / 2) // Lower weight for nearby text
      }
    }

    // Check if input has numeric constraints
    if (input.getAttribute('type') === 'number' || input.getAttribute('inputmode')) {
      score += 5
      signals.push('numeric constraints (+5)')
    }

    // Check aria-describedby for additional context
    const ariaDescribedby = input.getAttribute('aria-describedby')
    if (ariaDescribedby) {
      const descElement = input.ownerDocument?.getElementById(ariaDescribedby)
      if (descElement?.textContent) {
        const descScore = getLabelMatchStrength(descElement.textContent)
        if (descScore > 0) {
          signals.push(`aria-describedby (+${Math.floor(descScore / 2)})`)
          score += Math.floor(descScore / 2)
        }
      }
    }

    // Check nearby button text
    const buttonText = getNearbyButtonText(input)
    if (buttonText) {
      const buttonKeywords = ['continue', 'verify', 'submit', 'confirm', 'next']
      const hasButtonKeyword = buttonKeywords.some(keyword =>
        buttonText.toLowerCase().includes(keyword)
      )
      if (hasButtonKeyword) {
        signals.push('nearby action button (+5)')
        score += 5
      }
    }

    // Check form action URL
    const formScore = getFormActionScore(input)
    if (formScore > 0) {
      signals.push(`form action URL (+${formScore})`)
      score += formScore
    }

    // Only consider if score meets threshold
    if (score >= 70) {
      candidates.push({ input, score, signals })
    }
  }

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score)

  // Return highest scoring candidate
  if (candidates.length > 0) {
    const best = candidates[0]
    return {
      field: best.input,
      confidence: Math.min(best.score, 100),
      tier: 2,
      signals: best.signals,
      executionTime: performance.now() - startTime,
    }
  }

  return null
}

/**
 * Get all potentially relevant input fields
 * @param strictVisibility - If true, filters out hidden/zero-size elements (for production)
 *                           If false, only checks basic visibility (for testing)
 */
function getInputFields(strictVisibility = true): HTMLInputElement[] {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>('input')
  ).filter(input => {
    // Must be visible
    const style = window.getComputedStyle(input)
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false
    }

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

    // Check dimensions (skip in test environment where getBoundingClientRect may not work)
    if (strictVisibility) {
      const rect = input.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) {
        return false
      }
    }

    return true
  })
}

/**
 * Main detection function - tries Tier 1 first, falls back to Tier 2
 * @param options - Detection options
 * @returns Detection result or null if no verification field found
 */
export function detectVerificationField(options?: {
  strictVisibility?: boolean
}): DetectionResult | null {
  // const startTime = performance.now()
  const strictVisibility = options?.strictVisibility ?? true

  // Get all visible input fields
  const inputs = getInputFields(strictVisibility)

  if (inputs.length === 0) {
    return null
  }

  // Try Tier 1 first (fast)
  const tier1Result = detectTier1(inputs)
  if (tier1Result) {
    return tier1Result
  }

  // Fall back to Tier 2 (deep scan)
  const tier2Result = detectTier2(inputs)
  if (tier2Result) {
    return tier2Result
  }

  return null
}

/**
 * Detect all potential verification fields and return ranked list
 * Useful for debugging and testing
 */
export function detectAllFields(options?: {
  strictVisibility?: boolean
}): DetectionResult[] {
  const results: DetectionResult[] = []
  const strictVisibility = options?.strictVisibility ?? true

  // Get all visible input fields
  const inputs = getInputFields(strictVisibility)

  // Try Tier 1 on all inputs
  for (const input of inputs) {
    const tier1Result = detectTier1([input])
    if (tier1Result) {
      results.push(tier1Result)
    }
  }

  // Try Tier 2 on remaining inputs
  const tier2Inputs = inputs.filter(
    input => !results.find(r => r.field === input)
  )
  for (const input of tier2Inputs) {
    const tier2Result = detectTier2([input])
    if (tier2Result) {
      results.push(tier2Result)
    }
  }

  // Sort by confidence descending
  results.sort((a, b) => b.confidence - a.confidence)

  return results
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
    // Must be visible
    const style = window.getComputedStyle(input)
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false
    }

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

    // Check dimensions (skip in test environment where getBoundingClientRect may not work)
    if (strictVisibility) {
      const rect = input.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) {
        return false
      }
    }

    return true
  })
}

/**
 * Get nearby button text for improved detection
 */
function getNearbyButtonText(input: HTMLInputElement): string {
  const texts: string[] = []
  let element: HTMLElement | null = input
  let levels = 0

  while (element && levels < 3) {
    // Get all buttons from parent
    if (element.parentElement) {
      const buttons = element.parentElement.querySelectorAll('button, input[type="submit"], a.button')
      for (const button of buttons) {
        const text = button.textContent?.trim()
        if (text && text.length < 50) {
          texts.push(text)
        }
      }
    }

    element = element.parentElement
    levels++
  }

  return texts.join(' ')
}

/**
 * Check form action URL for verification patterns
 */
function getFormActionScore(input: HTMLInputElement): number {
  const form = input.closest('form')
  if (!form) return 0

  const action = form.action?.toLowerCase() || ''
  const verificationPatterns = [
    /\/verify/i,
    /\/2fa/i,
    /\/otp/i,
    /\/mfa/i,
    /\/authenticate/i,
  ]

  for (const pattern of verificationPatterns) {
    if (pattern.test(action)) {
      return 10
    }
  }

  return 0
}

/**
 * Production-ready field detector with dynamic detection
 */
export class FieldDetector {
  private observer: MutationObserver | null = null
  private detectedFields: WeakSet<HTMLInputElement> = new WeakSet()
  private debounceTimer: number | null = null
  private pendingMutations: Set<HTMLInputElement> = new Set()
  private callback: ((field: HTMLInputElement) => void) | null = null

  /**
   * Detect existing fields on page
   */
  detectExisting(options?: { strictVisibility?: boolean }): DetectionResult[] {
    const strictVisibility = options?.strictVisibility ?? true
    const inputs = getAllInputFields(strictVisibility)

    if (inputs.length === 0) {
      return []
    }

    // Try Tier 1 first
    const tier1Result = detectTier1(inputs)
    if (tier1Result) {
      this.detectedFields.add(tier1Result.field)
      return [tier1Result]
    }

    // Fall back to Tier 2
    const tier2Result = detectTier2(inputs)
    if (tier2Result) {
      this.detectedFields.add(tier2Result.field)
      return [tier2Result]
    }

    return []
  }

  /**
   * Start observing for dynamically injected fields
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

    // Limit batch size for performance
    const inputs = Array.from(this.pendingMutations).slice(0, 10)
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
    const tier1Result = detectTier1(visibleInputs)
    if (tier1Result) {
      this.detectedFields.add(tier1Result.field)
      this.callback?.(tier1Result.field)
      return
    }

    const tier2Result = detectTier2(visibleInputs)
    if (tier2Result) {
      this.detectedFields.add(tier2Result.field)
      this.callback?.(tier2Result.field)
    }
  }

  /**
   * Check if observing is active
   */
  isObserving(): boolean {
    return this.observer !== null
  }
}
