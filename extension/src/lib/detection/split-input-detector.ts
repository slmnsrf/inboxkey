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
 * - asymmetric-leader: One paste-receiver leader (maxLength = group size,
 *   in [4, 8]) plus single-digit cells. Hand-rolled split-OTP widget
 *   pattern (e.g., IKEA Turkey: name=num1 maxLength=6 + 5 cells named
 *   num2..num6 maxLength=1).
 *
 * Performance: Fast rejection for non-split inputs (< 1ms overhead)
 */

import { isRelevantInputType } from './patterns'

export interface SplitInputGroup {
  inputs: HTMLInputElement[]
  representative: HTMLInputElement  // First input (left-most in DOM order)
  pattern: 'maxlength-1' | 'sequential-name' | 'adjacent-siblings' | 'asymmetric-leader'
}

/**
 * Returns true if the input shows >=2 of 5 visual-suppression cues.
 * Same threshold as PR #78's isShadowedByVisibleSplitGroup. Conservative
 * gate so 28px legitimate OTP cells (1 size cue) are NOT excluded.
 *
 * Fail-open: if computed style is unavailable (test env), the cue isn't
 * counted; never classify the input as suppressed without evidence.
 */
function isVisuallySuppressed(input: HTMLInputElement): boolean {
  let cues = 0
  try {
    const rect = input.getBoundingClientRect()
    if (rect.width < 30 || rect.height < 10) cues++
  } catch { /* fail-open */ }
  try {
    const style = window.getComputedStyle(input)
    const op = parseFloat(style.opacity || '1')
    if (Number.isFinite(op) && op < 0.05) cues++
    const cc = (style.caretColor || '').toLowerCase()
    if (cc === 'transparent' || cc === 'rgba(0, 0, 0, 0)') cues++
    const ls = parseFloat(style.letterSpacing || '0')
    if (Number.isFinite(ls) && ls >= 10) cues++
    const ti = Math.abs(parseFloat(style.textIndent || '0'))
    if (Number.isFinite(ti) && ti >= 10) cues++
  } catch { /* fail-open */ }
  return cues >= 2
}

/**
 * Returns true if the input is hard-hidden (display:none, visibility:hidden,
 * or .hidden attribute). Cheaper than isVisuallySuppressed; runs first as
 * a fast-path filter for non-reference siblings.
 */
function isHardHidden(input: HTMLInputElement): boolean {
  // Fail-open: a DOM property access on a detached or cross-origin node
  // can throw; never classify the input as hidden without evidence.
  try {
    if (input.hidden) return true
    const inlineStyle = input.getAttribute('style') || ''
    if (/display\s*:\s*none|visibility\s*:\s*hidden/i.test(inlineStyle)) return true
    const style = window.getComputedStyle(input)
    if (style.display === 'none' || style.visibility === 'hidden') return true
  } catch { /* fail-open */ }
  return false
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
  //
  // Cap lifted to TYPICAL_CODE_LENGTHS.max (8) so asymmetric-leader OTP
  // shapes (one paste-receiver leader with maxLength = group size, e.g.
  // IKEA Turkey's name=num1 maxLength=6 + 5 cells maxLength=1) reach the
  // deeper coherence check via the relaxed sibling predicate. Wide
  // single-input fields (street, address, search) are still filtered by
  // the coherence-and-shape gate downstream.
  const maxLen = field.maxLength

  if (maxLen > 8 && maxLen !== -1) {
    return null
  }

  // Self guard: a visually-suppressed reference field is never a valid OTP
  // group anchor. Critical for PR #78's isShadowReplacement guard, which
  // requires `detectSplitInputGroup(oldShadow) === null` before allowing
  // rate-limited replacement.
  if (isVisuallySuppressed(field)) {
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

  const fieldMax = field.maxLength
  const matchesField = (input: Element): input is HTMLInputElement => {
    if (!(input instanceof HTMLInputElement)) return false
    if (input.type !== field.type) return false
    if (input.disabled || input.readOnly) return false
    // Belt-and-braces: caller already gated on isRelevantInputType,
    // but the sibling collection itself must reject non-text inputs
    // so a future caller path can't pull in radios/checkboxes.
    if (!isRelevantInputType(input)) return false
    const sibMax = input.maxLength
    // Same maxLength preserves existing all-equal [1, n] and -1 paths.
    const matchesMaxLength =
      sibMax === fieldMax ||
      // Asymmetric leader+cells pairing (shape c): leader has maxLength
      // in [4, 8], cells have maxLength=1. Symmetric so
      // detectSplitInputGroup returns the same group regardless of which
      // input is the entry point (leader OR cell).
      (fieldMax >= 4 && fieldMax <= 8 && sibMax === 1) ||
      (fieldMax === 1 && sibMax >= 4 && sibMax <= 8)
    if (!matchesMaxLength) return false
    // Non-reference siblings must be visible. The reference field itself
    // is permitted (caller may legitimately query from a small visible cell).
    // Order: cheap structural checks first, then isHardHidden (inline-style
    // fast path), then isVisuallySuppressed (computed style + cues).
    if (input !== field) {
      if (isHardHidden(input)) return false
      if (isVisuallySuppressed(input)) return false
    }
    return true
  }

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

  // Performance guard: the relaxed predicate (which now accepts
  // leader+cells asymmetric pairs) could match wide forms with many
  // small inputs. If the candidate set is large, require strong OTP
  // container evidence to proceed. Real OTP groups top out at 8; 12
  // leaves headroom for shadow-DOM duplicates without admitting wide
  // forms.
  if (unique.length > 12 && !hasOtpContainerEvidence(unique)) {
    return []
  }

  return unique
}

/**
 * Validate that inputs form a coherent group
 *
 * Common pre-checks (same type, all enabled, common ancestor) are
 * applied uniformly; then dispatch on shape:
 *  - shape (a) all-equal maxLength in [1, 6]
 *  - shape (b) all-equal maxLength === -1 with per-cell wrapping
 *  - shape (c) one leader (maxLength = groupSize, in [4, 8]) + cells
 *    of maxLength === 1 (asymmetric-leader pattern, e.g. IKEA Turkey)
 *
 * @param inputs - Array of input fields
 * @returns true if inputs form a coherent group
 */
function isCoherentGroup(inputs: HTMLInputElement[]): boolean {
  if (inputs.length < 4) {
    return false
  }

  if (!validateCommonCoherence(inputs)) {
    return false
  }

  return matchesShapeA(inputs) || matchesShapeB(inputs) || matchesShapeC(inputs)
}

/**
 * Common coherence checks that every shape must satisfy:
 *  - All inputs share the same type
 *  - No inputs are disabled or readonly
 *  - Inputs share a common ancestor within 3 DOM levels
 *
 * Walking 3 ancestor levels accepts the common React OTP pattern of
 * wrapping each digit cell in its own <div class="digit-wrapper">
 * (6 inputs -> 6 parents -> would otherwise be rejected) while still
 * rejecting inputs scattered across unrelated form sections.
 */
function validateCommonCoherence(inputs: HTMLInputElement[]): boolean {
  const types = new Set(inputs.map(input => input.type))
  if (types.size > 1) return false

  const hasDisabled = inputs.some(input => input.disabled || input.readOnly)
  if (hasDisabled) return false

  if (!hasCommonAncestorWithin(inputs, 3)) return false

  return true
}

/**
 * Shape (a): all inputs share the same maxLength in [1, 6].
 * Typical for React OTP libraries and hand-rolled per-cell widgets.
 */
function matchesShapeA(inputs: HTMLInputElement[]): boolean {
  const maxLengths = new Set(inputs.map(input => input.maxLength))
  if (maxLengths.size !== 1) return false
  const sharedMaxLen = inputs[0].maxLength
  return sharedMaxLen >= 1 && sharedMaxLen <= 6
}

/**
 * Shape (b): all inputs share maxLength === -1 with per-cell wrapping.
 * Microsoft login's codeEntry-0..5 pattern (input -> span -> div),
 * where each cell has its own wrapper. Generic flat form fields
 * (street/city/state/zipcode/country all as direct <form> children)
 * must not pass because they also show maxLength === -1 in happy-dom
 * but clearly aren't an OTP.
 */
function matchesShapeB(inputs: HTMLInputElement[]): boolean {
  const maxLengths = new Set(inputs.map(input => input.maxLength))
  if (maxLengths.size !== 1) return false
  const sharedMaxLen = inputs[0].maxLength
  if (sharedMaxLen !== -1) return false

  // Require per-cell wrapping: every input must have a distinct
  // immediate parent.
  const immediateParents = new Set(inputs.map(i => i.parentElement))
  if (immediateParents.size < inputs.length) return false

  // And require OTP-ish structure: sequential identifiers or strong
  // container evidence.
  if (!hasSequentialIdentifiers(inputs) && !hasOtpContainerEvidence(inputs)) {
    return false
  }

  return true
}

/**
 * Shape (c): asymmetric-leader OTP. One leader with maxLength equal to
 * the group size (in [4, 8]) plus single-digit cells. Common in
 * hand-rolled split-OTP widgets where the leader doubles as a
 * paste-receiver — e.g. IKEA Turkey: name=num1 maxLength=6 + 5 cells
 * named num2..num6 maxLength=1.
 *
 * Guards against false positives:
 *  - Leader must be DOM-first (paste-receiver convention)
 *  - leader.maxLength must equal inputs.length (otherwise it's just a
 *    long single field with unrelated 1-char neighbors)
 *  - Requires sequential identifiers OR OTP container evidence
 *  - Requires that the common ancestor doesn't contain extra
 *    relevant inputs (firstname etc.) beyond the candidate group
 */
function matchesShapeC(inputs: HTMLInputElement[]): boolean {
  const sortedByDom = sortByDomOrder(inputs)
  const leaders = sortedByDom.filter(i => i.maxLength >= 4 && i.maxLength <= 8)
  const cells = sortedByDom.filter(i => i.maxLength === 1)

  if (leaders.length !== 1) return false
  if (cells.length !== inputs.length - 1) return false
  if (leaders[0] !== sortedByDom[0]) return false
  if (leaders[0].maxLength !== inputs.length) return false

  // Require structural OTP evidence — sequential names/ids or
  // container hints. Asymmetric leaders are common in legitimate
  // OTPs but also could appear in unrelated forms; the structural
  // evidence is what disambiguates.
  if (!hasSequentialIdentifiers(sortedByDom) && !hasOtpContainerEvidence(sortedByDom)) {
    return false
  }

  // Extraneous-input guard: if the common ancestor contains visible
  // relevant inputs beyond the candidate group (e.g. a firstname text
  // input sitting in the same wrapper), this is not a pure OTP widget.
  // Hidden inputs (display:none, visibility:hidden, type=hidden honeypots,
  // backup fields) are not counted — they're not user-fillable and don't
  // indicate the wrapper is a mixed form.
  const ancestor = findCommonAncestor(sortedByDom, 3)
  if (ancestor) {
    const ancestorRelevantInputs = Array.from(
      ancestor.querySelectorAll('input')
    ).filter((i): i is HTMLInputElement => {
      if (!(i instanceof HTMLInputElement)) return false
      if (!isRelevantInputType(i)) return false
      if (i.disabled || i.readOnly || i.hidden) return false
      const inlineStyle = i.getAttribute('style') || ''
      if (/display\s*:\s*none|visibility\s*:\s*hidden/i.test(inlineStyle)) return false
      // Computed style check is happy-dom-safe: getComputedStyle returns
      // a CSSStyleDeclaration with empty strings if no rules applied.
      // A real CSS `display:none` from a stylesheet still resolves here.
      try {
        const style = window.getComputedStyle(i)
        if (style.display === 'none' || style.visibility === 'hidden') return false
      } catch {
        // happy-dom in some configurations may throw; fall back to inline-only.
      }
      return true
    })
    if (ancestorRelevantInputs.length > inputs.length) {
      return false
    }
  }

  return true
}

export function hasSequentialIdentifiers(inputs: HTMLInputElement[]): boolean {
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

export function findCommonAncestor(inputs: HTMLInputElement[], levels: number): HTMLElement | null {
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
 * Asymmetric-leader is checked FIRST so a 1-leader+5-cells group is
 * never mislabeled as sequential-name (the cells are maxLength=1 but
 * the group as a whole is shape c, not shape a).
 *
 * @param inputs - Array of input fields
 * @returns Detected pattern type
 */
function detectGroupPattern(
  inputs: HTMLInputElement[]
): 'maxlength-1' | 'sequential-name' | 'adjacent-siblings' | 'asymmetric-leader' {
  const sortedByDom = sortByDomOrder(inputs)
  const leaderCount = sortedByDom.filter(i => i.maxLength >= 4 && i.maxLength <= 8).length
  if (
    leaderCount === 1 &&
    sortedByDom[0].maxLength >= 4 &&
    sortedByDom[0].maxLength <= 8 &&
    sortedByDom[0].maxLength === inputs.length
  ) {
    return 'asymmetric-leader'
  }

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
