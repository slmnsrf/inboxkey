/**
 * Split-Input Group Detection
 * Identifies when multiple separate inputs form a single logical field
 *
 * Use case: Steam login has 5 separate <input maxlength="1"> fields.
 * Without grouping, each input triggers detection independently → 5 sessions start.
 * With grouping, we collapse to first input (representative) → 1 session starts.
 *
 * Supported patterns:
 * - maxlength-1: Multiple inputs with maxlength="1" (or 2-3) in same container
 * - sequential-name: Inputs with sequential names (code_1, code_2, ...)
 * - adjacent-siblings: Multiple inputs of same type adjacent in DOM
 *
 * Performance: Fast rejection for non-split inputs (< 1ms overhead)
 */

export interface SplitInputGroup {
  inputs: HTMLInputElement[]
  representative: HTMLInputElement  // First input (left-most in DOM order)
  pattern: 'maxlength-1' | 'sequential-name' | 'adjacent-siblings'
}

/**
 * Detect if field is part of a split-input group
 * Returns null if single field, or SplitInputGroup if part of a group
 *
 * Must support flexible group sizes: 4, 5, 6, 7, 8+ inputs
 *
 * @param field - Input field to check
 * @returns Split-input group info or null if single field
 */
export function detectSplitInputGroup(
  field: HTMLInputElement
): SplitInputGroup | null {
  // Fast rejection: Skip if maxLength is large or not set
  // Split-input fields typically have maxlength="1" (Steam) or maxlength="2" (some banks)
  const maxLen = field.maxLength
  if (maxLen > 3 || maxLen < 1) {
    return null
  }

  // Get similar sibling inputs within same container
  const siblings = getSimilarSiblings(field)

  // Need at least 4 inputs to be a group (support 4-8+ digit codes)
  // Single/pair/triple inputs are just short regular fields
  if (siblings.length < 4) {
    return null
  }

  // Validate that inputs form a coherent group
  if (!isCoherentGroup(siblings)) {
    return null
  }

  // Detect the pattern used
  const pattern = detectGroupPattern(siblings)

  // Sort inputs by DOM order (left-to-right, top-to-bottom)
  const sortedInputs = siblings.sort((a, b) => {
    const aIndex = getElementIndex(a)
    const bIndex = getElementIndex(b)
    return aIndex - bIndex
  })

  return {
    inputs: sortedInputs,
    representative: sortedInputs[0],  // First input is representative
    pattern,
  }
}

/**
 * Get all similar sibling inputs within same container
 * Scans parent and grandparent (up to 2 levels)
 *
 * @param field - Reference input field
 * @returns Array of similar inputs including the reference field
 */
function getSimilarSiblings(field: HTMLInputElement): HTMLInputElement[] {
  const candidates: HTMLInputElement[] = []

  // Check parent container
  const parent = field.parentElement
  if (parent) {
    const parentInputs = Array.from(parent.querySelectorAll('input'))
      .filter((input): input is HTMLInputElement =>
        input instanceof HTMLInputElement &&
        input.type === field.type &&
        input.maxLength === field.maxLength &&
        !input.disabled &&
        !input.readOnly
      )
    candidates.push(...parentInputs)
  }

  // If parent has few inputs, check grandparent
  if (candidates.length < 4) {
    const grandparent = parent?.parentElement
    if (grandparent) {
      const grandparentInputs = Array.from(grandparent.querySelectorAll('input'))
        .filter((input): input is HTMLInputElement =>
          input instanceof HTMLInputElement &&
          input.type === field.type &&
          input.maxLength === field.maxLength &&
          !input.disabled &&
          !input.readOnly
        )
      candidates.push(...grandparentInputs)
    }
  }

  // Deduplicate (same input might appear in parent + grandparent results)
  const unique = Array.from(new Set(candidates))

  return unique
}

/**
 * Validate that inputs form a coherent group
 * Checks: same type, not disabled, not readonly, similar positioning
 *
 * @param inputs - Array of input fields
 * @returns true if inputs form a coherent group
 */
function isCoherentGroup(inputs: HTMLInputElement[]): boolean {
  if (inputs.length < 4) {
    return false
  }

  // All inputs must have same maxLength
  const maxLengths = new Set(inputs.map(input => input.maxLength))
  if (maxLengths.size > 1) {
    return false
  }

  // All inputs must have same type
  const types = new Set(inputs.map(input => input.type))
  if (types.size > 1) {
    return false
  }

  // All inputs must be enabled and not readonly
  const hasDisabled = inputs.some(input => input.disabled || input.readOnly)
  if (hasDisabled) {
    return false
  }

  // Check if inputs are reasonably adjacent in DOM
  // They should all be within same parent or grandparent
  const parents = new Set(inputs.map(input => input.parentElement))
  if (parents.size > 2) {
    // Too scattered, probably not a group
    return false
  }

  return true
}

/**
 * Detect the pattern used for grouping
 *
 * @param inputs - Array of input fields
 * @returns Detected pattern type
 */
function detectGroupPattern(
  inputs: HTMLInputElement[]
): 'maxlength-1' | 'sequential-name' | 'adjacent-siblings' {
  // Check for maxlength-1 pattern (most common)
  const allMaxLength1 = inputs.every(input => input.maxLength === 1)
  if (allMaxLength1) {
    return 'maxlength-1'
  }

  // Check for sequential naming pattern
  // Examples: code_1, code_2, ... or digit-1, digit-2, ...
  const names = inputs.map(input => input.name || input.id || '')
  const hasSequentialNumbers = names.every((name, index) => {
    // Extract last number from name
    const match = name.match(/\d+$/)
    if (!match) return false
    const num = parseInt(match[0], 10)
    // Check if it matches expected sequence (0-based or 1-based)
    return num === index || num === index + 1
  })

  if (hasSequentialNumbers) {
    return 'sequential-name'
  }

  // Default: adjacent siblings
  return 'adjacent-siblings'
}

/**
 * Get element's index in parent
 * Used for sorting inputs by DOM order
 *
 * @param element - HTML element
 * @returns Index in parent's children array
 */
function getElementIndex(element: HTMLElement): number {
  if (!element.parentElement) {
    return 0
  }

  const children = Array.from(element.parentElement.children)
  return children.indexOf(element)
}
