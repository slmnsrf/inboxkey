/**
 * Visual Target Resolver
 *
 * Some sites render an OTP input as a single hidden/transparent
 * `<input maxlength="6">` overlaid on six visual `<span>` boxes
 * (Hepsiburada, certain banks). The shimmer overlay anchored to the
 * input itself produces a tiny corner artifact instead of framing
 * the visible boxes.
 *
 * This resolver detects that pattern and returns the visual container
 * to use for overlay geometry. The real input remains the focus /
 * event target — only positioning, clipping, and border-radius use
 * the resolved container.
 *
 * Detection is a two-stage gate:
 *   1. CSS-cue gate — the input must look "visually suppressed"
 *      (tiny rect, near-zero opacity, transparent caret, exaggerated
 *      letter-spacing). Requires ≥ 2 cues to proceed.
 *   2. Structural confirmation — an ancestor must contain exactly
 *      `maxLength` similarly-sized horizontal box-like elements
 *      (no nested interactive children).
 *
 * Both stages must pass. False positives degrade only visually (the
 * shimmer renders around an unrelated container); they don't affect
 * autofill or focus behavior. False negatives fall back to the
 * existing single-input rendering.
 */

export type VisualTargetKind = 'self' | 'container'

export interface VisualTargetResolution {
  target: HTMLElement
  kind: VisualTargetKind
}

interface CssCueCounts {
  /** Total cues that fired. ≥ 2 means proceed to structural check. */
  total: number
  /** True when the input rect is small enough to be visually suppressed. */
  suppressedRect: boolean
}

const SAFE_OTP_MAX_LENGTH_MIN = 4
const SAFE_OTP_MAX_LENGTH_MAX = 8

const FAST_PASS_MIN_WIDTH = 100
const FAST_PASS_MIN_HEIGHT = 20

const SUPPRESSED_RECT_MAX_WIDTH = 30
const SUPPRESSED_RECT_MAX_HEIGHT = 10

const REQUIRED_CUES_FOR_RESOLUTION = 2

/** Tags we treat as box-like visual children (non-interactive). */
const BOX_LIKE_TAGS = new Set(['SPAN', 'DIV', 'I', 'B', 'EM', 'STRONG'])

/** Tags that disqualify a container (active interactive descendants). */
const INTERACTIVE_TAGS = new Set([
  'INPUT', 'BUTTON', 'A', 'TEXTAREA', 'SELECT', 'OPTION', 'LABEL',
])

const MAX_ANCESTORS_TO_WALK = 3

/**
 * Resolve the element the shimmer overlay should anchor to.
 *
 * Returns `{ target: input, kind: 'self' }` for normal inputs and
 * cases where the fake-split pattern can't be confirmed. Returns
 * `{ target: container, kind: 'container' }` when a fake-split
 * layout is identified with high confidence.
 */
export function resolveVisualTarget(
  input: HTMLInputElement
): VisualTargetResolution {
  // Fast-pass for normal-sized inputs. Avoids any further computation
  // on the common case.
  const rect = input.getBoundingClientRect()
  if (rect.width >= FAST_PASS_MIN_WIDTH && rect.height >= FAST_PASS_MIN_HEIGHT) {
    return { target: input, kind: 'self' }
  }

  // Eligibility precheck: the input must be in the document and
  // not entirely hidden. Truly display:none inputs cannot receive
  // focus and should not produce an overlay.
  if (!input.isConnected) return { target: input, kind: 'self' }
  if (!hasNonZeroLayoutBox(input)) return { target: input, kind: 'self' }

  // Sanity precheck: only consider OTP-sane maxlength. -1 (unset),
  // very short (< 4), or very long (> 8) inputs are not the
  // fake-split pattern we're targeting.
  const maxLen = input.maxLength
  if (maxLen < SAFE_OTP_MAX_LENGTH_MIN || maxLen > SAFE_OTP_MAX_LENGTH_MAX) {
    return { target: input, kind: 'self' }
  }

  // CSS-cue gate
  const cues = countCssCues(input, rect)
  if (cues.total < REQUIRED_CUES_FOR_RESOLUTION) {
    return { target: input, kind: 'self' }
  }

  // Structural confirmation: walk up to N ancestors looking for a
  // container whose descendants form exactly maxLen similarly-sized
  // horizontal boxes.
  const container = findVisualContainer(input, maxLen)
  if (!container) {
    return { target: input, kind: 'self' }
  }

  return { target: container, kind: 'container' }
}

/**
 * Layout-box check: an element with display:none reports an empty
 * client rect AND offsetParent === null. visibility:hidden still
 * has a layout box; we don't disqualify those (the input may be
 * intentionally invisible while accepting focus).
 */
function hasNonZeroLayoutBox(el: HTMLElement): boolean {
  if (el.offsetParent === null) {
    // Detached, display:none, or fixed-positioned root. The latter
    // is rare for inputs; treat conservatively as "not eligible."
    return false
  }
  return true
}

/**
 * Count "visually suppressed" cues on the input. Two or more
 * indicates the input is hidden behind a visual proxy and the
 * overlay should look elsewhere.
 *
 * Cues considered:
 *   - Rect smaller than the suppressed-rect threshold
 *   - Computed opacity near zero
 *   - caret-color transparent (common to suppress the caret in fake splits)
 *   - Unusual letter-spacing or text-indent (used to space characters
 *     across the visual boxes)
 */
function countCssCues(input: HTMLElement, rect: DOMRect): CssCueCounts {
  const style = getComputedStyle(input)
  let total = 0

  const suppressedRect =
    rect.width < SUPPRESSED_RECT_MAX_WIDTH ||
    rect.height < SUPPRESSED_RECT_MAX_HEIGHT
  if (suppressedRect) total++

  const opacity = parseFloat(style.opacity || '1')
  if (Number.isFinite(opacity) && opacity < 0.05) total++

  const caretColor = (style.caretColor || '').toLowerCase()
  if (caretColor === 'transparent' || caretColor === 'rgba(0, 0, 0, 0)') {
    total++
  }

  const letterSpacing = style.letterSpacing
  if (letterSpacing && letterSpacing !== 'normal') {
    const num = parseFloat(letterSpacing)
    // ~1ch ≈ 8-10px in typical font sizes; flag at >=10px.
    if (Number.isFinite(num) && num >= 10) total++
  }

  // Unusually large text-indent (Codex pass 3): some fake-split designs
  // shift the input's caret/text out of view via text-indent rather
  // than (or in addition to) letter-spacing. Threshold mirrors the
  // letter-spacing one: any indent >= 10px is well outside normal
  // typography for an OTP input.
  const textIndent = style.textIndent
  if (textIndent && textIndent !== '0px' && textIndent !== '0') {
    const num = Math.abs(parseFloat(textIndent))
    if (Number.isFinite(num) && num >= 10) total++
  }

  return { total, suppressedRect }
}

/**
 * Walk up to MAX_ANCESTORS_TO_WALK levels and look for a container
 * whose descendants form exactly `boxCount` similarly-sized box-like
 * elements arranged horizontally with no nested interactive controls.
 */
function findVisualContainer(
  input: HTMLInputElement,
  boxCount: number
): HTMLElement | null {
  let current: HTMLElement | null = input.parentElement
  let depth = 0
  while (current && depth < MAX_ANCESTORS_TO_WALK) {
    if (containerMatchesBoxPattern(current, boxCount)) {
      return current
    }
    current = current.parentElement
    depth++
  }
  return null
}

/**
 * Predicate: does this ancestor contain exactly `boxCount`
 * similarly-sized horizontal boxes and no other interactive
 * children (apart from the input itself)?
 *
 * "Box-like" children: SPAN/DIV/I/B/EM/STRONG with no interactive
 * descendant role, no `<input>`/`<button>`/`<a>` etc.
 *
 * Boxes must be ~equal width (within 20%) and vertically aligned
 * (top within ~5px of each other). This filters out icon rows,
 * star ratings, captchas, and similar layouts.
 */
function containerMatchesBoxPattern(
  container: HTMLElement,
  boxCount: number
): boolean {
  // Reject if the container itself is interactive (e.g. <a>).
  if (INTERACTIVE_TAGS.has(container.tagName)) return false

  const candidates = collectBoxLikeChildren(container)
  if (candidates.length !== boxCount) return false

  // Vertical alignment + width similarity check.
  const rects = candidates.map(el => el.getBoundingClientRect())
  if (rects.some(r => r.width === 0 || r.height === 0)) return false

  const tops = rects.map(r => Math.round(r.top))
  const minTop = Math.min(...tops)
  const maxTop = Math.max(...tops)
  if (maxTop - minTop > 5) return false

  const widths = rects.map(r => r.width)
  const minW = Math.min(...widths)
  const maxW = Math.max(...widths)
  // Width spread < 20% of max → similar enough.
  if (maxW > 0 && (maxW - minW) / maxW > 0.2) return false

  return true
}

/**
 * Walk descendants to gather "leaf" box-like elements — children
 * with text-styling tags but no interactive descendants and no
 * further box-like children of their own (so we count six leaves,
 * not the wrapping `<label>`).
 *
 * We also skip the input element itself if we encounter it.
 */
function collectBoxLikeChildren(container: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = []

  for (const el of Array.from(container.querySelectorAll<HTMLElement>('*'))) {
    if (!BOX_LIKE_TAGS.has(el.tagName)) continue
    // Reject leaf if it contains interactive descendants (e.g. icon button).
    const hasInteractiveDescendant = el.querySelector(
      [...INTERACTIVE_TAGS].map(t => t.toLowerCase()).join(',')
    )
    if (hasInteractiveDescendant) continue
    // Skip nested box-like elements; we only want leaves.
    const hasNestedBoxLike = Array.from(el.children).some(child =>
      BOX_LIKE_TAGS.has((child as HTMLElement).tagName)
    )
    if (hasNestedBoxLike) continue

    out.push(el)
  }

  return out
}
