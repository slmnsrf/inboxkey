/**
 * Tests for autofill.ts split-input branches.
 *
 * Focus: asymmetric-leader OTP groups (e.g. IKEA Turkey shape — one
 * paste-receiver leader with maxLength = group size, plus single-digit
 * cells). Two sub-flows are validated:
 *
 *  T3 — Leader-only fallback: cells are presentation-only (no `name`),
 *       only the leader is submitted. Filling cells would corrupt the
 *       form value. Expected: leader receives full code, cells are
 *       untouched.
 *
 *  T4 — Char-distribute: every input has a `name`, so the form
 *       submits each separately. Expected: chars distributed 1-1.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { autofillCode } from '../autofill'

// Domain check is mocked to always-enabled; testing autofill logic in
// isolation.
vi.mock('@/lib/utils/domain', () => ({
  extractDomain: vi.fn(() => 'example.com'),
  isDomainEnabled: vi.fn(async () => true),
}))

vi.mock('@/lib/storage/telemetry', () => ({
  logAutoSubmitFailure: vi.fn(async () => {}),
}))

describe('autofill split-input branches', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    document.body.removeChild(container)
  })

  function ikeaCells(opts: { withCellNames: boolean }) {
    // The IKEA Turkey hand-rolled split-OTP shape, parameterized:
    //  - withCellNames=true  -> all 6 inputs have a `name` attribute
    //                          (form posts each cell separately)
    //  - withCellNames=false -> only the leader has `name=num1`; the
    //                          5 cells have no `name` (presentation-
    //                          only). Filling cells would corrupt
    //                          submission; the leader receives the
    //                          full code instead.
    const cellName = (i: number) => (opts.withCellNames ? `name="num${i}"` : '')
    container.innerHTML = `
      <div class="form__item form__item--sms">
        <div class="form__item-sms-box">
          <input type="text" name="num1" class="form__input form__input--sms" maxlength="6" inputmode="numeric" aria-label="otp code 1" />
          <input type="text" ${cellName(2)} class="form__input form__input--sms" maxlength="1" inputmode="numeric" aria-label="otp code 2" />
          <input type="text" ${cellName(3)} class="form__input form__input--sms" maxlength="1" inputmode="numeric" aria-label="otp code 3" />
          <input type="text" ${cellName(4)} class="form__input form__input--sms" maxlength="1" inputmode="numeric" aria-label="otp code 4" />
          <input type="text" ${cellName(5)} class="form__input form__input--sms" maxlength="1" inputmode="numeric" aria-label="otp code 5" />
          <input type="text" ${cellName(6)} class="form__input form__input--sms" maxlength="1" inputmode="numeric" aria-label="otp code 6" />
        </div>
      </div>
    `
    // happy-dom doesn't compute layout for getBoundingClientRect or
    // getComputedStyle to detect visibility; we patch what autofill
    // checks. Inputs in happy-dom report a non-zero rect by default
    // when attached, but be explicit.
    const inputs = Array.from(container.querySelectorAll<HTMLInputElement>('input'))
    for (const input of inputs) {
      Object.defineProperty(input, 'getBoundingClientRect', {
        value: () => ({
          x: 0, y: 0, width: 20, height: 20,
          top: 0, left: 0, right: 20, bottom: 20,
          toJSON: () => ({}),
        }),
      })
    }
    return inputs
  }

  // T3 — leader-only fallback
  it('asymmetric-leader, leader-only-submitted: fills only the leader with full code', async () => {
    const [leader, ...cells] = ikeaCells({ withCellNames: false })

    const ok = await autofillCode({ code: '123456', field: leader })

    expect(ok).toBe(true)
    expect(leader.value).toBe('123456')
    expect(leader.getAttribute('data-inboxkey-filled')).toBe('true')
    for (const cell of cells) {
      expect(cell.value).toBe('')
      expect(cell.getAttribute('data-inboxkey-filled')).toBeNull()
    }
  })

  // T3b — leader-only fallback also triggers when entry is a cell
  it('asymmetric-leader, entry is a cell: still fills the leader (symmetric reachability)', async () => {
    const inputs = ikeaCells({ withCellNames: false })
    const cell = inputs[2]  // num3 (3rd input)

    const ok = await autofillCode({ code: '123456', field: cell })

    expect(ok).toBe(true)
    expect(inputs[0].value).toBe('123456')
    for (let i = 1; i < inputs.length; i++) {
      expect(inputs[i].value).toBe('')
    }
  })

  // T4 — IKEA char-distribute
  it('asymmetric-leader, all cells have name: distributes chars across all 6 inputs', async () => {
    const inputs = ikeaCells({ withCellNames: true })

    const ok = await autofillCode({ code: '123456', field: inputs[0] })

    expect(ok).toBe(true)
    expect(inputs[0].value).toBe('1')
    expect(inputs[1].value).toBe('2')
    expect(inputs[2].value).toBe('3')
    expect(inputs[3].value).toBe('4')
    expect(inputs[4].value).toBe('5')
    expect(inputs[5].value).toBe('6')
    for (const input of inputs) {
      expect(input.getAttribute('data-inboxkey-filled')).toBe('true')
    }
  })
})
