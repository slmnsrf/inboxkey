/**
 * Tests for the shadow-input vs visible-split-group filter applied by
 * field-detector's getInputFields / getAllInputFields / mutation path.
 *
 * Bug context (IKEA Turkey): a hidden shadow input
 *   <input id="otp-input" type="text" maxlength="6"
 *          style="opacity:0; width:1px; height:1px;
 *                 caret-color: transparent;">
 * coexists with a visible 6-cell split group named num1..num6
 * (asymmetric-leader pattern: num1 maxLength=6, num2..num6 maxLength=1).
 * The shadow trips the basic visibility check, wins Tier 1 attribute
 * detection (id contains "otp"), and starts the wrong watch session.
 *
 * Fix: drop the shadow from the candidate set when a coexisting
 * coherent visible split group exists in the same form (or root).
 *
 * happy-dom notes:
 *  - getBoundingClientRect() returns zeros by default. We stub it
 *    only where rect cues matter (D.3); other tests rely on
 *    opacity / caret-color / letter-spacing / text-indent cues.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  FieldDetector,
  getVisibleRelevantInputFields,
  isShadowedByVisibleSplitGroup,
  resetCooldownRegistry,
} from '../field-detector'
import type { DetectionResult } from '../../types'

// ─── helpers ──────────────────────────────────────────────────────

/** Stub getBoundingClientRect on an element to return a fixed shape. */
function stubRect(el: Element, width: number, height: number): void {
  const rect = {
    width,
    height,
    top: 0, left: 0, right: width, bottom: height,
    x: 0, y: 0,
    toJSON: () => ({}),
  }
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () => rect as DOMRect,
  })
}

/**
 * Build the IKEA-style shadow input. Uses opacity 0 + transparent
 * caret + textIndent -9999 to guarantee >=2 CSS cues. Rect is stubbed
 * to 1x1 (small) so isPotentiallyShadowed's early-out also fires;
 * happy-dom returns 0x0 by default, but stubbing makes the intent
 * explicit and matches the real-page rendering.
 */
function buildShadowInput(): HTMLInputElement {
  const el = document.createElement('input')
  el.type = 'text'
  el.id = 'otp-input'
  el.maxLength = 6
  el.setAttribute(
    'style',
    'opacity: 0; caret-color: transparent; text-indent: -9999px; letter-spacing: 99px;'
  )
  stubRect(el, 1, 1)
  return el
}

/**
 * Build the IKEA visible num1..num6 group (asymmetric-leader). num1
 * has maxLength=6 (paste receiver), num2..num6 have maxLength=1.
 * Cells share a wrapper `<div class="otp-cells">` so they live within
 * 3 ancestor levels of each other (split-input-detector requirement).
 *
 * Each cell rect is stubbed to a normal size so the production
 * strict-visibility filter (`rect.width===0 || rect.height===0`)
 * does not drop them in happy-dom (which reports zeros by default).
 */
function buildVisibleSplitGroup(parent: HTMLElement): HTMLInputElement[] {
  const wrapper = document.createElement('div')
  wrapper.className = 'otp-cells'
  parent.appendChild(wrapper)

  const inputs: HTMLInputElement[] = []
  for (let i = 1; i <= 6; i++) {
    const cell = document.createElement('input')
    cell.type = 'text'
    cell.name = `num${i}`
    cell.maxLength = i === 1 ? 6 : 1
    wrapper.appendChild(cell)
    stubRect(cell, 40, 40)
    inputs.push(cell)
  }
  return inputs
}

describe('field-detector — shadow-input vs visible split-group filter', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    resetCooldownRegistry()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    resetCooldownRegistry()
  })

  // ── D.1 ──
  it('D.1 excludes shadow when visible split group coexists in same form', () => {
    const form = document.createElement('form')
    document.body.appendChild(form)

    // Shadow at form root (NOT inside the cells wrapper, so its
    // sibling probe cannot include the visible cells and break the
    // split-group detection on num1).
    const shadow = buildShadowInput()
    form.appendChild(shadow)

    const cells = buildVisibleSplitGroup(form)

    const fields = getVisibleRelevantInputFields(true)

    expect(fields).not.toContain(shadow)
    expect(fields).toHaveLength(cells.length)
    for (const c of cells) expect(fields).toContain(c)
  })

  // ── D.2 ──
  it('D.2 keeps shadow when no visible split group exists', () => {
    const form = document.createElement('form')
    document.body.appendChild(form)
    const shadow = buildShadowInput()
    form.appendChild(shadow)

    const fields = getVisibleRelevantInputFields(true)

    // Shadow is the only relevant input; single-OTP flow must still
    // see it.
    expect(fields).toContain(shadow)
    expect(fields).toHaveLength(1)
  })

  // ── D.3 ──
  it('D.3 keeps shadow with only ONE CSS cue (rect-only)', () => {
    const form = document.createElement('form')
    document.body.appendChild(form)

    // Build a shadow-like input but with NORMAL opacity, NORMAL
    // caret, no letter-spacing, no text-indent — only a tiny rect.
    // We stub the rect so the cue counter sees w=1, h=1 (one cue),
    // then the function should return false (no exclusion).
    const onlyRectShadow = document.createElement('input')
    onlyRectShadow.type = 'text'
    onlyRectShadow.id = 'otp-input'
    onlyRectShadow.maxLength = 6
    form.appendChild(onlyRectShadow)
    stubRect(onlyRectShadow, 1, 1)

    // Also add a visible split group so the second predicate could
    // fire — only the cue gate should keep the shadow in.
    buildVisibleSplitGroup(form)

    const allInputs = Array.from(form.querySelectorAll<HTMLInputElement>('input'))
    expect(isShadowedByVisibleSplitGroup(onlyRectShadow, allInputs)).toBe(false)
  })

  // ── D.4 ──
  it('D.4 keeps shadow when split group lives in a DIFFERENT form (scope guard)', () => {
    const formA = document.createElement('form')
    formA.id = 'A'
    document.body.appendChild(formA)
    const shadow = buildShadowInput()
    formA.appendChild(shadow)

    const formB = document.createElement('form')
    formB.id = 'B'
    document.body.appendChild(formB)
    buildVisibleSplitGroup(formB)

    // Use the lower-level helper directly — getVisibleRelevantInputFields
    // returns allInputs across the document, so the scope filter inside
    // isShadowedByVisibleSplitGroup is what's under test here.
    const allInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input'))
    expect(isShadowedByVisibleSplitGroup(shadow, allInputs)).toBe(false)

    const fields = getVisibleRelevantInputFields(true)
    expect(fields).toContain(shadow)
  })

  // ── D.5 ──
  it('D.5 keeps shadow when one split-group cell is hidden (full-visibility guard)', () => {
    const form = document.createElement('form')
    document.body.appendChild(form)
    const shadow = buildShadowInput()
    form.appendChild(shadow)

    const cells = buildVisibleSplitGroup(form)
    // Hide one cell with display:none. getInputFields' inline-style
    // regex drops it from `allInputs`, so the
    // "every group member is in allInputs" guard fires.
    cells[3].setAttribute('style', 'display: none')

    const fields = getVisibleRelevantInputFields(true)

    expect(fields).toContain(shadow)
  })

  // ── D.6 ──
  it('D.6 static filter: revealing a hidden split group filters the shadow', () => {
    // Sanity layer for D.6 — confirms the same filter chain that
    // processPendingMutations applies (`getAllInputFields(true) +
    // isShadowedByVisibleSplitGroup`) does the right thing on
    // before/after DOM states. The MutationObserver-driven assertion
    // is in the next test.
    const form = document.createElement('form')
    document.body.appendChild(form)

    const shadow = buildShadowInput()
    form.appendChild(shadow)

    const wrapper = document.createElement('div')
    wrapper.className = 'otp-cells'
    form.appendChild(wrapper)
    const cells: HTMLInputElement[] = []
    for (let i = 1; i <= 6; i++) {
      const cell = document.createElement('input')
      cell.type = 'text'
      cell.name = `num${i}`
      cell.maxLength = i === 1 ? 6 : 1
      // Apply display:none on each cell directly so the inline-style
      // regex in getInputFields drops it. Mirrors the production
      // hidden state more reliably in happy-dom (parent display:none
      // is not propagated to child computed style by happy-dom).
      cell.setAttribute('style', 'display: none')
      wrapper.appendChild(cell)
      stubRect(cell, 40, 40)
      cells.push(cell)
    }

    // While hidden, the inline-style regex trims the cells out, so
    // getVisibleRelevantInputFields returns just the shadow.
    let visible = getVisibleRelevantInputFields(true)
    expect(visible).toEqual([shadow])

    // Reveal: clear display:none on every cell.
    for (const c of cells) c.removeAttribute('style')

    visible = getVisibleRelevantInputFields(true)
    expect(visible).not.toContain(shadow)
    expect(visible).toEqual(cells)
  })

  // ── D.9 (LIVE IKEA shape — only zero-rect cue, no other CSS cues) ──
  // Reproduces the actual production rendering captured from
  // https://www.ikea.com.tr/uyelik/uye-giris-uye-ol via getComputedStyle:
  //   display:block, visibility:visible, opacity:1
  //   caret-color:rgb(36,36,36), letter-spacing:normal, text-indent:0px
  //   rect: 0×0 (because ancestor DIV.progress-modal.hide has display:none)
  //
  // The shadow has ONLY ONE cue (zero rect). Earlier shadow tests over-
  // stubbed the input with opacity:0 + caret:transparent (3 cues) and
  // gave a false sense of coverage. With the real one-cue shape, the
  // mutation path's inline visibility filter must reject the shadow
  // by zero rect, otherwise Tier 1 fires on it.
  it('D.9 LIVE IKEA shape: zero-rect shadow inside hidden modal does not trigger detection callback', async () => {
    // Build the actual production DOM hierarchy.
    const aspnetForm = document.createElement('form')
    aspnetForm.id = 'aspnetForm'
    document.body.appendChild(aspnetForm)

    // Hidden modal ancestor — equivalent to display:none in production.
    const modal = document.createElement('div')
    modal.className = 'progress-modal hide'
    modal.setAttribute('style', 'display: none')
    aspnetForm.appendChild(modal)

    const formGroup = document.createElement('div')
    formGroup.className = 'form-group after-error'
    modal.appendChild(formGroup)

    // Shadow input — REAL shape, no CSS suppression cues. Only zero rect.
    const shadow = document.createElement('input')
    shadow.id = 'otp-input'
    shadow.type = 'text'
    shadow.className = 'form-control required smstext'
    shadow.maxLength = 6
    shadow.setAttribute('placeholder', 'Kodu Giriniz')
    formGroup.appendChild(shadow)
    stubRect(shadow, 0, 0) // zero rect (descendant of display:none parent)

    // Visible split cells in their own form (mimics IKEA's layout).
    const visibleForm = document.createElement('div')
    visibleForm.className = 'form'
    document.body.appendChild(visibleForm)

    const cellsBox = document.createElement('div')
    cellsBox.className = 'form__item-sms-box'
    visibleForm.appendChild(cellsBox)

    const cells: HTMLInputElement[] = []
    for (let i = 1; i <= 6; i++) {
      const c = document.createElement('input')
      c.type = 'text'
      c.name = `num${i}`
      c.maxLength = i === 1 ? 6 : 1
      c.setAttribute('inputmode', 'numeric')
      c.setAttribute('aria-label', `otp code ${i}`)
      cellsBox.appendChild(c)
      stubRect(c, 40, 40)
      cells.push(c)
    }

    // Drive a mutation that adds the shadow into pendingMutations.
    // We do this by detaching and reattaching the shadow after observe-start,
    // because happy-dom only fires the observer for mutations occurring
    // AFTER startObserving.
    shadow.remove()

    const detector = new FieldDetector()
    const detected: HTMLInputElement[] = []
    detector.startObserving((field: HTMLInputElement, _r: DetectionResult) => {
      detected.push(field)
    })

    // Re-attach the shadow — triggers an observer mutation.
    formGroup.appendChild(shadow)

    // Wait past the 100ms processPendingMutations debounce.
    await new Promise(r => setTimeout(r, 200))
    detector.stopObserving()

    // Shadow must NOT have triggered a callback. With the current bug,
    // the inline visibility filter in processPendingMutations checks
    // computed display/visibility but not rect dimensions, so the
    // zero-rect shadow slips through and Tier 1 fires on the
    // id="otp-input" contains-match.
    expect(detected).not.toContain(shadow)
  })

  // ── D.6 (live MutationObserver path) ──
  it('D.6 mutation path: FieldDetector.startObserving callback skips the shadow', async () => {
    const form = document.createElement('form')
    document.body.appendChild(form)

    // Pre-existing visible split group (already in DOM at observe-start).
    const cells = buildVisibleSplitGroup(form)

    const detector = new FieldDetector()
    const detected: HTMLInputElement[] = []
    detector.startObserving((field: HTMLInputElement, _r: DetectionResult) => {
      detected.push(field)
    })

    // Inject the shadow AFTER observing starts. Without the filter,
    // the mutation path would Tier-1 match it via id="otp-input"
    // and call back. With the filter, the visible split group
    // already in the candidate set should mask the shadow.
    const shadow = buildShadowInput()
    form.appendChild(shadow)

    // Wait past the 100ms processPendingMutations debounce window.
    await new Promise(r => setTimeout(r, 200))

    detector.stopObserving()

    // Shadow must not have triggered a callback.
    expect(detected).not.toContain(shadow)

    // The leader (num1) is the representative for the group. If the
    // mutation observer also fires for the cells (e.g. from the
    // initial group wiring), at least the shadow is excluded; the
    // group's own grouping logic is exercised by split-input-detector
    // tests. We don't assert detected.includes(num1) here because
    // happy-dom's MutationObserver fires only for new mutations, and
    // we deliberately added the cells before startObserving.
    void cells
  })
})
