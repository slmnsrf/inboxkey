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
  // Fast rejection: Skip if maxLength is explicitly set to large values
  // Allow unset maxLength (-1) for fields like Microsoft (codeEntry-0...5)
  // Split-input fields typically have maxlength="1" (Steam) or maxlength="2" (some banks)
  const maxLen = field.maxLength

  if (maxLen > 3 && maxLen !== -1) {
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

  // Sort inputs by GLOBAL DOM order (not parent-relative)
  // Uses compareDocumentPosition for stable, consistent sorting
  const sortedInputs = siblings.sort((a, b) => {
    const position = a.compareDocumentPosition(b)

    if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
      return -1  // a comes before b in document
    } else if (position & Node.DOCUMENT_POSITION_PRECEDING) {
      return 1   // a comes after b in document
    }

    return 0  // Same element (shouldn't happen)
  })

  return {
    inputs: sortedInputs,
    representative: sortedInputs[0],  // First input is representative
    pattern,
  }
}

/**
 * Get all similar sibling inputs within same container
 * Scans parent, grandparent, and great-grandparent (up to 3 levels)
 * Handles deep nesting like Microsoft's structure (input → span → div → div)
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

  // If still not enough, check great-grandparent (3 levels up)
  // Handles Microsoft structure: input → span → div → div[data-testid="codeEntry"]
  if (candidates.length < 4) {
    const greatGrandparent = parent?.parentElement?.parentElement
    if (greatGrandparent) {
      const greatGrandparentInputs = Array.from(greatGrandparent.querySelectorAll('input'))
        .filter((input): input is HTMLInputElement =>
          input instanceof HTMLInputElement &&
          input.type === field.type &&
          input.maxLength === field.maxLength &&
          !input.disabled &&
          !input.readOnly
        )
      candidates.push(...greatGrandparentInputs)
    }
  }

  // Deduplicate (same input might appear in multiple parent results)
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

  // Real split-input OTP widgets have a tiny maxLength per cell
  // (typically 1, sometimes 2-4 for chunked layouts). Generic form
  // fields without maxlength default to the browser's per-control
  // limit (524288 in Chrome/Chromium, or -1 unset in happy-dom),
  // which is how 5 unrelated address-form <input>s used to get
  // treated as a 5-digit OTP widget. Require maxLength in [1, 6].
  const sharedMaxLen = inputs[0].maxLength
  if (sharedMaxLen < 1 || sharedMaxLen > 6) {
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

  // Check if inputs share a common ancestor within a few DOM levels.
  // The old heuristic rejected groups with more than 2 distinct
  // immediate parents, which killed the common React OTP pattern of
  // wrapping each digit cell in its own <div class="digit-wrapper">
  // (6 inputs -> 6 parents -> rejected). Walking up 3 levels lets us
  // accept those while still rejecting inputs scattered across
  // unrelated form sections.
  if (!hasCommonAncestorWithin(inputs, 3)) {
    return false
  }

  return true
}

/**
 * Returns true if every input in the set shares an ancestor within
 * `levels` DOM hops (i.e. the set of ancestors up to depth N for the
 * first input has a non-empty intersection with the same set for
 * every other input).
 */
function hasCommonAncestorWithin(inputs: HTMLInputElement[], levels: number): boolean {
  if (inputs.length === 0) return false

  const ancestorsOf = (el: HTMLElement): Set<Element> => {
    const chain = new Set<Element>()
    let node: Element | null = el
    let depth = 0
    while (node && depth <= levels) {
      chain.add(node)
      node = node.parentElement
      depth += 1
    }
    return chain
  }

  const firstChain = ancestorsOf(inputs[0])
  for (let i = 1; i < inputs.length; i += 1) {
    const chain = ancestorsOf(inputs[i])
    let shares = false
    for (const ancestor of chain) {
      if (firstChain.has(ancestor)) {
        shares = true
        break
      }
    }
    if (!shares) return false
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

// Removed getElementIndex() - now using compareDocumentPosition() for stable global DOM ordering
