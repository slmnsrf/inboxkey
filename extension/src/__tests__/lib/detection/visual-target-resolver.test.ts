/**
 * Unit tests for resolveVisualTarget()
 *
 * Uses happy-dom to simulate inputs in various layouts. Bounding-rect
 * stubbing is required because happy-dom doesn't run real CSS layout —
 * each input/container under test gets its rect set explicitly.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveVisualTarget } from '@/lib/detection/visual-target-resolver'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setBody(html: string): void {
  document.body.innerHTML = html
}

interface RectInit {
  left?: number
  top?: number
  width: number
  height: number
}

function stubRect(el: Element, rect: RectInit): void {
  const left = rect.left ?? 0
  const top = rect.top ?? 0
  ;(el as HTMLElement).getBoundingClientRect = () =>
    ({
      left,
      top,
      width: rect.width,
      height: rect.height,
      right: left + rect.width,
      bottom: top + rect.height,
      x: left,
      y: top,
      toJSON() { return this },
    } as DOMRect)
}

/**
 * Inject CSS for the input under test. happy-dom doesn't compute
 * styles from real CSS reliably for getComputedStyle, so we set
 * inline style values that getComputedStyle WILL pick up.
 */
function setStyle(el: HTMLElement, css: Partial<CSSStyleDeclaration>): void {
  for (const [k, v] of Object.entries(css)) {
    if (v === undefined) continue
    ;(el.style as unknown as Record<string, string>)[k] = String(v)
  }
}

/** Force offsetParent to a non-null value so eligibility precheck passes. */
function makeOffsetParentNonNull(el: HTMLElement): void {
  Object.defineProperty(el, 'offsetParent', {
    configurable: true,
    get: () => document.body,
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveVisualTarget', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('fast-pass for normal-sized inputs', () => {
    it('returns self for a normal input (≥100px wide, ≥20px tall)', () => {
      setBody(`<input id="otp" type="tel" maxlength="6">`)
      const input = document.getElementById('otp') as HTMLInputElement
      stubRect(input, { width: 200, height: 32 })
      makeOffsetParentNonNull(input)

      const result = resolveVisualTarget(input)
      expect(result.kind).toBe('self')
      expect(result.target).toBe(input)
    })

    it('does not run structural checks on the fast-pass path', () => {
      // If structural checks ran they'd find no boxes and return self
      // anyway. We can't easily distinguish via the API; instead
      // assert the same result holds even with weird siblings around.
      setBody(`
        <div>
          <span></span><span></span><span></span><span></span><span></span><span></span>
          <input id="otp" type="tel" maxlength="6">
        </div>
      `)
      const input = document.getElementById('otp') as HTMLInputElement
      stubRect(input, { width: 200, height: 32 })
      makeOffsetParentNonNull(input)

      const result = resolveVisualTarget(input)
      expect(result.kind).toBe('self')
    })
  })

  describe('eligibility prechecks', () => {
    it('returns self when maxLength is out of OTP-sane range (12)', () => {
      setBody(`<input id="x" type="text" maxlength="12">`)
      const input = document.getElementById('x') as HTMLInputElement
      stubRect(input, { width: 10, height: 5 }) // suppressed, but maxLen wrong
      makeOffsetParentNonNull(input)
      setStyle(input, { opacity: '0', caretColor: 'transparent' })

      const result = resolveVisualTarget(input)
      expect(result.kind).toBe('self')
    })

    it('returns self when maxLength is unset (-1)', () => {
      setBody(`<input id="x" type="text">`)
      const input = document.getElementById('x') as HTMLInputElement
      stubRect(input, { width: 10, height: 5 })
      makeOffsetParentNonNull(input)
      setStyle(input, { opacity: '0', caretColor: 'transparent' })

      const result = resolveVisualTarget(input)
      expect(result.kind).toBe('self')
    })

    it('returns self when input is detached from the DOM', () => {
      const input = document.createElement('input')
      input.maxLength = 6
      stubRect(input, { width: 10, height: 5 })
      // not appended; isConnected = false

      const result = resolveVisualTarget(input)
      expect(result.kind).toBe('self')
    })
  })

  describe('CSS-cue gate', () => {
    function setupSuppressedInputWithSiblingBoxes(opts: {
      cueOpacity?: boolean
      cueCaret?: boolean
      cueLetterSpacing?: boolean
      cueSuppressedRect?: boolean
      boxCount?: number
    }): HTMLInputElement {
      const boxCount = opts.boxCount ?? 6
      setBody(`
        <div id="container">
          <label>
            ${Array.from({ length: boxCount })
              .map(() => '<span class="box"></span>')
              .join('')}
          </label>
          <div>
            <input id="otp" type="tel" maxlength="6">
          </div>
        </div>
      `)
      const input = document.getElementById('otp') as HTMLInputElement
      stubRect(input, opts.cueSuppressedRect
        ? { width: 5, height: 5 }
        : { width: 80, height: 30 })
      makeOffsetParentNonNull(input)

      if (opts.cueOpacity) setStyle(input, { opacity: '0' })
      if (opts.cueCaret) setStyle(input, { caretColor: 'transparent' })
      if (opts.cueLetterSpacing) setStyle(input, { letterSpacing: '20px' })

      // Stub each visual box to be ~30x30, vertically aligned, evenly sized.
      const boxes = document.querySelectorAll<HTMLElement>('.box')
      boxes.forEach((b, i) => {
        stubRect(b, { left: i * 35, top: 0, width: 30, height: 30 })
      })

      return input
    }

    it('returns self when only ONE cue fires (suppressed rect alone is not enough)', () => {
      const input = setupSuppressedInputWithSiblingBoxes({
        cueSuppressedRect: true,
      })
      const result = resolveVisualTarget(input)
      // Below 100×20 fast-pass, but only one cue → no resolution.
      expect(result.kind).toBe('self')
    })

    it('proceeds to structural check with TWO cues (suppressed + caret)', () => {
      const input = setupSuppressedInputWithSiblingBoxes({
        cueSuppressedRect: true,
        cueCaret: true,
      })
      const result = resolveVisualTarget(input)
      expect(result.kind).toBe('container')
    })

    it('proceeds to structural check with TWO cues (opacity + letter-spacing)', () => {
      const input = setupSuppressedInputWithSiblingBoxes({
        cueOpacity: true,
        cueLetterSpacing: true,
        cueSuppressedRect: true, // also small to bypass fast-pass
      })
      const result = resolveVisualTarget(input)
      expect(result.kind).toBe('container')
    })
  })

  describe('structural confirmation', () => {
    it('Hepsiburada-style fixture resolves to the visual container', () => {
      setBody(`
        <div id="otp-wrap">
          <label id="boxes">
            <span class="box"></span>
            <span class="box"></span>
            <span class="box"></span>
            <span class="box"></span>
            <span class="box"></span>
            <span class="box"></span>
          </label>
          <div>
            <input id="otp" type="tel" autocomplete="one-time-code" maxlength="6">
          </div>
        </div>
      `)
      const input = document.getElementById('otp') as HTMLInputElement
      stubRect(input, { width: 5, height: 5 })
      makeOffsetParentNonNull(input)
      setStyle(input, { opacity: '0', caretColor: 'transparent' })

      const boxes = document.querySelectorAll<HTMLElement>('.box')
      boxes.forEach((b, i) => {
        stubRect(b, { left: i * 50, top: 0, width: 40, height: 40 })
      })
      stubRect(document.getElementById('otp-wrap')!, { width: 320, height: 50 })

      const result = resolveVisualTarget(input)
      expect(result.kind).toBe('container')
    })

    it('returns self when the candidate row contains buttons (interactive children)', () => {
      setBody(`
        <div>
          <div id="row">
            <button class="b"></button>
            <button class="b"></button>
            <button class="b"></button>
            <button class="b"></button>
            <button class="b"></button>
            <button class="b"></button>
          </div>
          <div>
            <input id="otp" type="tel" maxlength="6">
          </div>
        </div>
      `)
      const input = document.getElementById('otp') as HTMLInputElement
      stubRect(input, { width: 5, height: 5 })
      makeOffsetParentNonNull(input)
      setStyle(input, { opacity: '0', caretColor: 'transparent' })

      const buttons = document.querySelectorAll<HTMLElement>('.b')
      buttons.forEach((b, i) => {
        stubRect(b, { left: i * 50, top: 0, width: 40, height: 40 })
      })

      const result = resolveVisualTarget(input)
      expect(result.kind).toBe('self')
    })

    it('returns self when the row has the wrong number of boxes (5 instead of 6)', () => {
      setBody(`
        <div id="otp-wrap">
          <label>
            <span class="box"></span>
            <span class="box"></span>
            <span class="box"></span>
            <span class="box"></span>
            <span class="box"></span>
          </label>
          <input id="otp" type="tel" maxlength="6">
        </div>
      `)
      const input = document.getElementById('otp') as HTMLInputElement
      stubRect(input, { width: 5, height: 5 })
      makeOffsetParentNonNull(input)
      setStyle(input, { opacity: '0', caretColor: 'transparent' })

      const boxes = document.querySelectorAll<HTMLElement>('.box')
      boxes.forEach((b, i) => {
        stubRect(b, { left: i * 50, top: 0, width: 40, height: 40 })
      })

      const result = resolveVisualTarget(input)
      expect(result.kind).toBe('self')
    })

    it('returns self when boxes are not vertically aligned', () => {
      setBody(`
        <div id="otp-wrap">
          <label>
            <span class="box"></span>
            <span class="box"></span>
            <span class="box"></span>
            <span class="box"></span>
            <span class="box"></span>
            <span class="box"></span>
          </label>
          <input id="otp" type="tel" maxlength="6">
        </div>
      `)
      const input = document.getElementById('otp') as HTMLInputElement
      stubRect(input, { width: 5, height: 5 })
      makeOffsetParentNonNull(input)
      setStyle(input, { opacity: '0', caretColor: 'transparent' })

      const boxes = document.querySelectorAll<HTMLElement>('.box')
      boxes.forEach((b, i) => {
        stubRect(b, { left: i * 50, top: i * 25, width: 40, height: 40 })
      })

      const result = resolveVisualTarget(input)
      expect(result.kind).toBe('self')
    })
  })
})
