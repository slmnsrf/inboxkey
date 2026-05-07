/**
 * Tests for split-input-detector.ts
 *
 * Regression coverage for the bug where 5+ same-type non-text inputs
 * (radio, checkbox) wrapped in distinct parents satisfied the
 * Microsoft codeEntry maxLength === -1 / per-cell-wrapper shape and
 * were misclassified as a split OTP widget. The fix is structural
 * (input type allowlist) and applies regardless of the page's
 * language.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { detectSplitInputGroup } from '../split-input-detector'

describe('detectSplitInputGroup', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    document.body.removeChild(container)
  })

  describe('non-text input rejection (regression)', () => {
    it('rejects vertical radio group regardless of page language: Turkish unsubscribe', () => {
      // Original report: 5 radios in 5 distinct <label> parents on a
      // newsletter unsubscribe page. maxLength=-1 + per-cell parents
      // previously satisfied the Microsoft codeEntry shape.
      container.innerHTML = `
        <form>
          <label><input type="radio" name="reason" value="1" />Email içerikleri ilgi alanıma girmiyor</label>
          <label><input type="radio" name="reason" value="2" />Email gönderim periyodu çok sık</label>
          <label><input type="radio" name="reason" value="3" />Bu email listesine kendi isteğim ile kayıt olmadım</label>
          <label><input type="radio" name="reason" value="4" />Email mobil cihazda okunmuyor</label>
          <label><input type="radio" name="reason" value="5" />Diğer (lütfen belirtiniz)</label>
        </form>
      `
      const radios = container.querySelectorAll<HTMLInputElement>('input[type="radio"]')
      for (const radio of radios) {
        expect(detectSplitInputGroup(radio)).toBeNull()
      }
    })

    it('rejects vertical radio group: English newsletter unsubscribe', () => {
      container.innerHTML = `
        <form>
          <label><input type="radio" name="reason" value="1" />Content not relevant</label>
          <label><input type="radio" name="reason" value="2" />Too frequent</label>
          <label><input type="radio" name="reason" value="3" />I never signed up</label>
          <label><input type="radio" name="reason" value="4" />Hard to read on mobile</label>
          <label><input type="radio" name="reason" value="5" />Other</label>
        </form>
      `
      const radio = container.querySelector<HTMLInputElement>('input[type="radio"]')!
      expect(detectSplitInputGroup(radio)).toBeNull()
    })

    it('rejects vertical radio group: German Abmelden form', () => {
      container.innerHTML = `
        <form>
          <label><input type="radio" name="grund" value="1" />Inhalte nicht relevant</label>
          <label><input type="radio" name="grund" value="2" />Zu viele E-Mails</label>
          <label><input type="radio" name="grund" value="3" />Habe mich nie angemeldet</label>
          <label><input type="radio" name="grund" value="4" />Schwer lesbar auf dem Handy</label>
          <label><input type="radio" name="grund" value="5" />Sonstiges</label>
        </form>
      `
      const radio = container.querySelector<HTMLInputElement>('input[type="radio"]')!
      expect(detectSplitInputGroup(radio)).toBeNull()
    })

    it('rejects vertical radio group: Spanish darse de baja', () => {
      container.innerHTML = `
        <form>
          <label><input type="radio" name="motivo" value="1" />Contenido no relevante</label>
          <label><input type="radio" name="motivo" value="2" />Demasiados correos</label>
          <label><input type="radio" name="motivo" value="3" />Nunca me suscribí</label>
          <label><input type="radio" name="motivo" value="4" />Difícil de leer en el móvil</label>
          <label><input type="radio" name="motivo" value="5" />Otro</label>
        </form>
      `
      const radio = container.querySelector<HTMLInputElement>('input[type="radio"]')!
      expect(detectSplitInputGroup(radio)).toBeNull()
    })

    it('rejects checkbox group with per-cell wrapper divs', () => {
      // Same DOM shape as Microsoft codeEntry but type=checkbox.
      container.innerHTML = `
        <form>
          <div><input type="checkbox" name="opt1" /></div>
          <div><input type="checkbox" name="opt2" /></div>
          <div><input type="checkbox" name="opt3" /></div>
          <div><input type="checkbox" name="opt4" /></div>
          <div><input type="checkbox" name="opt5" /></div>
        </form>
      `
      const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!
      expect(detectSplitInputGroup(checkbox)).toBeNull()
    })

    it('rejects radio with deceptive name="otp"', () => {
      // Demonstrates the gate is structural (type), not name-based.
      container.innerHTML = `
        <form>
          <label><input type="radio" name="otp" value="a" /></label>
          <label><input type="radio" name="otp" value="b" /></label>
          <label><input type="radio" name="otp" value="c" /></label>
          <label><input type="radio" name="otp" value="d" /></label>
        </form>
      `
      const radio = container.querySelector<HTMLInputElement>('input[type="radio"]')!
      expect(detectSplitInputGroup(radio)).toBeNull()
    })
  })

  describe('legitimate split-input shapes still detected', () => {
    it('detects 6 maxlength=1 text inputs in a flat container (Steam shape)', () => {
      container.innerHTML = `
        <form>
          <input type="text" maxlength="1" />
          <input type="text" maxlength="1" />
          <input type="text" maxlength="1" />
          <input type="text" maxlength="1" />
          <input type="text" maxlength="1" />
          <input type="text" maxlength="1" />
        </form>
      `
      const first = container.querySelector<HTMLInputElement>('input')!
      const group = detectSplitInputGroup(first)
      expect(group).not.toBeNull()
      expect(group!.inputs.length).toBe(6)
      expect(group!.pattern).toBe('maxlength-1')
    })

    it('detects 6 wrapped maxlength=1 inputs (React per-cell wrapper shape)', () => {
      container.innerHTML = `
        <div class="otp-widget">
          <div class="cell"><input type="text" maxlength="1" /></div>
          <div class="cell"><input type="text" maxlength="1" /></div>
          <div class="cell"><input type="text" maxlength="1" /></div>
          <div class="cell"><input type="text" maxlength="1" /></div>
          <div class="cell"><input type="text" maxlength="1" /></div>
          <div class="cell"><input type="text" maxlength="1" /></div>
        </div>
      `
      const first = container.querySelector<HTMLInputElement>('input')!
      const group = detectSplitInputGroup(first)
      expect(group).not.toBeNull()
      expect(group!.inputs.length).toBe(6)
    })

    it('detects Microsoft codeEntry-0..5 maxLength=-1 with per-cell wrappers', () => {
      container.innerHTML = `
        <div data-testid="codeEntry">
          <span><div><input type="tel" id="codeEntry-0" /></div></span>
          <span><div><input type="tel" id="codeEntry-1" /></div></span>
          <span><div><input type="tel" id="codeEntry-2" /></div></span>
          <span><div><input type="tel" id="codeEntry-3" /></div></span>
          <span><div><input type="tel" id="codeEntry-4" /></div></span>
          <span><div><input type="tel" id="codeEntry-5" /></div></span>
        </div>
      `
      const first = container.querySelector<HTMLInputElement>('#codeEntry-0')!
      const group = detectSplitInputGroup(first)
      expect(group).not.toBeNull()
      expect(group!.inputs.length).toBe(6)
    })

    it('detects vertical text-input OTP layout (no geometry filter)', () => {
      // Some mobile OTP layouts stack cells vertically. The fix must
      // not regress these — the gate is on input type, not geometry.
      container.innerHTML = `
        <form style="display: flex; flex-direction: column;">
          <input type="text" maxlength="1" />
          <input type="text" maxlength="1" />
          <input type="text" maxlength="1" />
          <input type="text" maxlength="1" />
          <input type="text" maxlength="1" />
          <input type="text" maxlength="1" />
        </form>
      `
      const first = container.querySelector<HTMLInputElement>('input')!
      const group = detectSplitInputGroup(first)
      expect(group).not.toBeNull()
      expect(group!.inputs.length).toBe(6)
    })
  })

  describe('flat unrelated text fields stay rejected', () => {
    it('rejects 5 generic address-form text inputs sharing one parent', () => {
      // Regression guard from PR #49 (50b3377): street/city/state/zip/
      // country with maxLength === -1 and shared <form> parent must
      // not be classified as an OTP widget.
      container.innerHTML = `
        <form>
          <input type="text" name="street" />
          <input type="text" name="city" />
          <input type="text" name="state" />
          <input type="text" name="zipcode" />
          <input type="text" name="country" />
        </form>
      `
      const first = container.querySelector<HTMLInputElement>('input')!
      expect(detectSplitInputGroup(first)).toBeNull()
    })

    it('rejects wrapped maxLength=-1 text fields without sequential or OTP evidence', () => {
      container.innerHTML = `
        <form>
          <div><input type="text" name="street" /></div>
          <div><input type="text" name="city" /></div>
          <div><input type="text" name="state" /></div>
          <div><input type="text" name="postcode" /></div>
          <div><input type="text" name="country" /></div>
        </form>
      `
      const first = container.querySelector<HTMLInputElement>('input')!
      expect(detectSplitInputGroup(first)).toBeNull()
    })
  })

  describe('asymmetric-leader OTP shape (c)', () => {
    /**
     * IKEA Turkey hand-rolled split-OTP: a maxLength=6 leader doubles
     * as paste-receiver, followed by 5 maxLength=1 cells. The shape is
     * generic (not site-specific) — sequential names + OTP-evidence
     * class names anchor it.
     */
    function ikeaContainer(parent: HTMLElement) {
      parent.innerHTML = `
        <div class="form__item form__item--sms">
          <div class="form__item-sms-box">
            <input type="text" name="num1" class="form__input form__input--sms" maxlength="6" inputmode="numeric" aria-label="otp code 1" />
            <input type="text" name="num2" class="form__input form__input--sms" maxlength="1" inputmode="numeric" aria-label="otp code 2" />
            <input type="text" name="num3" class="form__input form__input--sms" maxlength="1" inputmode="numeric" aria-label="otp code 3" />
            <input type="text" name="num4" class="form__input form__input--sms" maxlength="1" inputmode="numeric" aria-label="otp code 4" />
            <input type="text" name="num5" class="form__input form__input--sms" maxlength="1" inputmode="numeric" aria-label="otp code 5" />
            <input type="text" name="num6" class="form__input form__input--sms" maxlength="1" inputmode="numeric" aria-label="otp code 6" />
          </div>
        </div>
      `
    }

    // T1
    it('detects IKEA shape (1 leader maxLen=6 + 5 cells maxLen=1)', () => {
      ikeaContainer(container)
      const leader = container.querySelector<HTMLInputElement>('input[name="num1"]')!
      const group = detectSplitInputGroup(leader)
      expect(group).not.toBeNull()
      expect(group!.inputs.length).toBe(6)
      expect(group!.representative).toBe(leader)
      expect(group!.pattern).toBe('asymmetric-leader')
    })

    // T2 — symmetric reachability
    it('returns the same group regardless of which input is the entry point', () => {
      ikeaContainer(container)
      const all = Array.from(container.querySelectorAll<HTMLInputElement>('input'))
      const leader = container.querySelector<HTMLInputElement>('input[name="num1"]')!
      for (const input of all) {
        const group = detectSplitInputGroup(input)
        expect(group).not.toBeNull()
        expect(group!.inputs.length).toBe(6)
        expect(group!.representative).toBe(leader)
        expect(group!.pattern).toBe('asymmetric-leader')
      }
    })

    // T5 — performance cap (no OTP evidence)
    it('rejects 13 inputs in same parent without OTP container evidence', () => {
      const parts: string[] = []
      // 1 leader maxLength=6 + 12 cells maxLength=1, sequential but no
      // OTP-evidence class/data-testid/aria-label anywhere. The
      // performance cap should reject because the predicate would
      // happily match a wide form.
      parts.push(`<input type="text" name="f1" maxlength="6" />`)
      for (let i = 2; i <= 13; i++) {
        parts.push(`<input type="text" name="f${i}" maxlength="1" />`)
      }
      container.innerHTML = `<form>${parts.join('\n')}</form>`
      const first = container.querySelector<HTMLInputElement>('input')!
      expect(detectSplitInputGroup(first)).toBeNull()
    })

    // T6 — performance cap bypass via OTP container evidence
    it('does NOT trip the performance cap when parent has OTP-evidence (>12 candidates)', () => {
      // Build a parent with OTP-evidence class plus 13 same-maxLength
      // shape-(a) inputs. Without the cap-bypass, the predicate would
      // collect 13 candidates and trigger the >12 cap → return [].
      // With the bypass, the candidates flow through and shape (a)
      // succeeds for the all-maxlength-1 set. Cap >12, count 13.
      const parts: string[] = []
      for (let i = 1; i <= 13; i++) {
        parts.push(`<input type="text" name="otp${i}" maxlength="1" aria-label="otp code ${i}" />`)
      }
      container.innerHTML = `<div class="otp-cells">${parts.join('\n')}</div>`
      const first = container.querySelector<HTMLInputElement>('input')!
      const group = detectSplitInputGroup(first)
      // 13 cells fail shape (a) range [1, 6]? No — 13 inputs all share
      // maxLength=1 so shape (a) accepts. Real OTPs cap at 8 but the
      // detector's shape (a) doesn't enforce that bound.
      expect(group).not.toBeNull()
      expect(group!.inputs.length).toBe(13)
    })

    // T7 — extraneous-input guard
    it('rejects shape (c) candidate when an unrelated input shares the ancestor', () => {
      container.innerHTML = `
        <div class="form__item-sms-box">
          <input type="text" name="firstname" />
          <input type="text" name="num1" maxlength="6" aria-label="otp code 1" />
          <input type="text" name="num2" maxlength="1" aria-label="otp code 2" />
          <input type="text" name="num3" maxlength="1" aria-label="otp code 3" />
          <input type="text" name="num4" maxlength="1" aria-label="otp code 4" />
          <input type="text" name="num5" maxlength="1" aria-label="otp code 5" />
          <input type="text" name="num6" maxlength="1" aria-label="otp code 6" />
        </div>
      `
      const leader = container.querySelector<HTMLInputElement>('input[name="num1"]')!
      expect(detectSplitInputGroup(leader)).toBeNull()
    })

    // T8 — two-leader rejection
    it('rejects shape (c) candidate with two leaders (maxLength=6 each)', () => {
      container.innerHTML = `
        <div class="form__item-sms-box">
          <input type="text" name="num1" maxlength="6" aria-label="otp code 1" />
          <input type="text" name="num2" maxlength="6" aria-label="otp code 2" />
          <input type="text" name="num3" maxlength="1" aria-label="otp code 3" />
          <input type="text" name="num4" maxlength="1" aria-label="otp code 4" />
          <input type="text" name="num5" maxlength="1" aria-label="otp code 5" />
          <input type="text" name="num6" maxlength="1" aria-label="otp code 6" />
        </div>
      `
      const leader = container.querySelector<HTMLInputElement>('input[name="num1"]')!
      expect(detectSplitInputGroup(leader)).toBeNull()
    })

    // T10 — Steam regression
    it('still detects shape (a): 5 cells maxlength=1, no leader (Steam)', () => {
      container.innerHTML = `
        <form>
          <input type="text" maxlength="1" />
          <input type="text" maxlength="1" />
          <input type="text" maxlength="1" />
          <input type="text" maxlength="1" />
          <input type="text" maxlength="1" />
        </form>
      `
      const first = container.querySelector<HTMLInputElement>('input')!
      const group = detectSplitInputGroup(first)
      expect(group).not.toBeNull()
      expect(group!.inputs.length).toBe(5)
      expect(group!.pattern).toBe('maxlength-1')
    })

    // T11 — Microsoft codeEntry regression
    it('still detects shape (b): 6 inputs maxLength=-1 with codeEntry-N ids', () => {
      container.innerHTML = `
        <div data-testid="codeEntry">
          <span><div><input type="tel" id="codeEntry-0" /></div></span>
          <span><div><input type="tel" id="codeEntry-1" /></div></span>
          <span><div><input type="tel" id="codeEntry-2" /></div></span>
          <span><div><input type="tel" id="codeEntry-3" /></div></span>
          <span><div><input type="tel" id="codeEntry-4" /></div></span>
          <span><div><input type="tel" id="codeEntry-5" /></div></span>
        </div>
      `
      const first = container.querySelector<HTMLInputElement>('#codeEntry-0')!
      const group = detectSplitInputGroup(first)
      expect(group).not.toBeNull()
      expect(group!.inputs.length).toBe(6)
    })

    // T12 — chunked all-equal-2 regression
    it('still detects shape (a) when all inputs share maxLength=2', () => {
      container.innerHTML = `
        <div class="otp">
          <input type="text" name="part1" maxlength="2" />
          <input type="text" name="part2" maxlength="2" />
          <input type="text" name="part3" maxlength="2" />
          <input type="text" name="part4" maxlength="2" />
        </div>
      `
      const first = container.querySelector<HTMLInputElement>('input')!
      const group = detectSplitInputGroup(first)
      expect(group).not.toBeNull()
      expect(group!.inputs.length).toBe(4)
    })
  })
})
