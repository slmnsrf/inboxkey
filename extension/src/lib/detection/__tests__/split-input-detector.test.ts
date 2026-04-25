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
})
