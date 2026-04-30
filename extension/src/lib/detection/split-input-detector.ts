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

import { isRelevantInputType } from './patterns'

export interface SplitInputGroup {
  inputs: HTMLInputElement[]
  representative: HTMLInputElement  // First input (left-most in DOM order)
  pattern: 'maxlength-1' | 'sequential-name' | 'adjacent-siblings'
}

const OTP_EVIDENCE_PATTERN = /\b(?:otp|one[-\s_]?time|verification|verify|security|auth(?:entication)?|mfa|2fa|twofa|code|pin|sms)\b|codeentry/i

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
  // Reject non-text-entry types up front. Radio/checkbox/etc. share
  // maxLength === -1 with Microsoft's codeEntry pattern, and 5 radios
  // wrapped in 5 distinct <label> parents would otherwise satisfy
  // the per-cell-wrapper shape (b) check below.
  if (!isRelevantInputType(field)) {
    return null
  }

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

  const matchesField = (input: Element): input is HTMLInputElement =>
    input instanceof HTMLInputElement &&
    input.type === field.type &&
    input.maxLength === field.maxLength &&
    !input.disabled &&
    !input.readOnly &&
    // Belt-and-braces: caller already gated on isRelevantInputType,
    // but the sibling collection itself must reject non-text inputs
    // so a future caller path can't pull in radios/checkboxes.
    isRelevantInputType(input)

  // Check parent container
  const parent = field.parentElement
  if (parent) {
    const parentInputs = Array.from(parent.querySelectorAll('input'))
      .filter(matchesField)
    candidates.push(...parentInputs)
  }

  // If parent has few inputs, check grandparent
  if (candidates.length < 4) {
    const grandparent = parent?.parentElement
    if (grandparent) {
      const grandparentInputs = Array.from(grandparent.querySelectorAll('input'))
        .filter(matchesField)
      candidates.push(...grandparentInputs)
    }
  }

  // If still not enough, check great-grandparent (3 levels up)
  // Handles Microsoft structure: input → span → div → div[data-testid="codeEntry"]
  if (candidates.length < 4) {
    const greatGrandparent = parent?.parentElement?.parentElement
    if (greatGrandparent) {
      const greatGrandparentInputs = Array.from(greatGrandparent.querySelectorAll('input'))
        .filter(matchesField)
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

  // Accept one of two shapes for a real split-input OTP widget:
  //
  // (a) sharedMaxLen in [1, 6]: explicit per-cell limit. Typical for
  //     React OTP libraries and hand-rolled 6-digit code widgets.
  //
  // (b) sharedMaxLen === -1 AND inputs live in *different* immediate
  //     parents: Microsoft login's codeEntry-0..5 pattern (input ->
  //     span -> div), where each cell has its own wrapper. Generic
  //     flat form fields (street/city/state/zipcode/country all as
  //     direct <form> children) must not pass because they also show
  //     maxLength === -1 in happy-dom but clearly aren't an OTP.
  //
  // Anything else (big positive maxLength like 10+, or -1 with all
  // inputs sharing one parent) is rejected.
  const sharedMaxLen = inputs[0].maxLength
  if (sharedMaxLen >= 1 && sharedMaxLen <= 6) {
    // shape (a): OK
  } else if (sharedMaxLen === -1) {
    // shape (b): require per-cell wrapping plus OTP-ish structure.
    const immediateParents = new Set(inputs.map(i => i.parentElement))
    if (immediateParents.size < inputs.length) {
      // Two or more inputs share an immediate parent - flat form, not
      // a wrapped OTP widget.
      return false
    }

    if (!hasSequentialIdentifiers(inputs) && !hasOtpContainerEvidence(inputs)) {
      return false
    }
  } else {
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

function hasSequentialIdentifiers(inputs: HTMLInputElement[]): boolean {
  const sorted = sortByDomOrder(inputs)
  const values = sorted.map(input => input.name || input.id || '')
  if (values.some(value => value.length === 0)) return false

  const parsed = values.map(value => {
    const match = value.match(/^(.*?)(\d+)$/)
    if (!match) return null
    return {
      prefix: match[1],
      index: parseInt(match[2], 10),
    }
  })

  if (parsed.some(value => value === null)) return false
  const first = parsed[0]!
  return parsed.every((value, index) => (
    value !== null &&
    value.prefix === first.prefix &&
    (value.index === first.index + index || value.index === index || value.index === index + 1)
  ))
}

function hasOtpContainerEvidence(inputs: HTMLInputElement[]): boolean {
  const commonAncestor = findCommonAncestor(inputs, 4)
  const candidates = [
    ...inputs,
    ...inputs.map(input => input.parentElement).filter((el): el is HTMLElement => el !== null),
    ...(commonAncestor ? [commonAncestor] : []),
  ]

  return candidates.some(element => {
    const text = [
      element.id,
      element.getAttribute('name') || '',
      element.getAttribute('class') || '',
      element.getAttribute('data-testid') || '',
      element.getAttribute('aria-label') || '',
      element.getAttribute('autocomplete') || '',
      element.textContent || '',
    ].join(' ')

    return OTP_EVIDENCE_PATTERN.test(text)
  })
}

function findCommonAncestor(inputs: HTMLInputElement[], levels: number): HTMLElement | null {
  if (inputs.length === 0) return null

  let node: HTMLElement | null = inputs[0]
  let depth = 0
  while (node && depth <= levels) {
    if (inputs.every(input => node!.contains(input))) {
      return node
    }
    node = node.parentElement
    depth += 1
  }

  return null
}

function sortByDomOrder(inputs: HTMLInputElement[]): HTMLInputElement[] {
  return [...inputs].sort((a, b) => {
    const position = a.compareDocumentPosition(b)
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1
    if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1
    return 0
  })
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
  if (hasSequentialIdentifiers(inputs)) {
    return 'sequential-name'
  }

  // Default: adjacent siblings
  return 'adjacent-siblings'
}

// Removed getElementIndex() - now using compareDocumentPosition() for stable global DOM ordering
