/**
 * Tests for the input-type allowlist applied by field-detector.
 *
 * Even with deceptive attributes (name="otp", autocomplete="one-time-code")
 * a single radio or checkbox must never be classified as a verification
 * code field. The gate is structural — same outcome in every supported
 * language because it depends only on input.type.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  detectVerificationField,
  detectAllFields,
  FieldDetector,
  resetCooldownRegistry,
} from '../field-detector'

describe('field-detector input-type allowlist', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    resetCooldownRegistry()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    resetCooldownRegistry()
  })

  describe('single non-text controls with deceptive attributes', () => {
    it('does not detect a single radio with name="otp"', () => {
      document.body.innerHTML = `
        <form>
          <input type="radio" name="otp" value="x" />
        </form>
      `
      expect(
        detectVerificationField({ strictVisibility: false })
      ).toBeNull()
    })

    it('does not detect a single checkbox with autocomplete="one-time-code"', () => {
      document.body.innerHTML = `
        <form>
          <input type="checkbox" autocomplete="one-time-code" />
        </form>
      `
      expect(
        detectVerificationField({ strictVisibility: false })
      ).toBeNull()
    })

    it('does not detect a button-typed input with id="verification"', () => {
      document.body.innerHTML = `
        <form>
          <input type="button" id="verification" value="Verify" />
        </form>
      `
      expect(
        detectVerificationField({ strictVisibility: false })
      ).toBeNull()
    })

    it('FieldDetector.detectExisting skips radios with verification attributes', () => {
      document.body.innerHTML = `
        <form>
          <input type="radio" name="verification_code" value="a" />
          <input type="radio" name="verification_code" value="b" />
        </form>
      `
      const detector = new FieldDetector()
      const results = detector.detectExisting({ strictVisibility: false })
      expect(results).toEqual([])
    })

    it('FieldDetector.evaluateField rejects a checkbox passed in directly', () => {
      document.body.innerHTML = `
        <input type="checkbox" autocomplete="one-time-code" id="cb" />
      `
      const checkbox = document.getElementById('cb') as HTMLInputElement
      const detector = new FieldDetector()
      expect(detector.evaluateField(checkbox)).toBeNull()
    })
  })

  describe('vertical radio group on an unsubscribe form (multilingual)', () => {
    const cases: Array<{ lang: string; html: string }> = [
      {
        lang: 'Turkish',
        html: `
          <form>
            <p>user@example.com adresi ile olan e-bülten üyeliğiniz iptal edilecektir.</p>
            <label><input type="radio" name="reason" value="1" />Email içerikleri ilgi alanıma girmiyor</label>
            <label><input type="radio" name="reason" value="2" />Email gönderim periyodu çok sık</label>
            <label><input type="radio" name="reason" value="3" />Bu email listesine kendi isteğim ile kayıt olmadım</label>
            <label><input type="radio" name="reason" value="4" />Email mobil cihazda okunmuyor</label>
            <label><input type="radio" name="reason" value="5" />Diğer (lütfen belirtiniz)</label>
          </form>
        `,
      },
      {
        lang: 'English',
        html: `
          <form>
            <p>Your subscription for user@example.com will be cancelled.</p>
            <label><input type="radio" name="reason" value="1" />Content not relevant</label>
            <label><input type="radio" name="reason" value="2" />Too many emails</label>
            <label><input type="radio" name="reason" value="3" />I never signed up</label>
            <label><input type="radio" name="reason" value="4" />Hard to read on mobile</label>
            <label><input type="radio" name="reason" value="5" />Other</label>
          </form>
        `,
      },
      {
        lang: 'German',
        html: `
          <form>
            <p>Ihr Newsletter-Abonnement für user@example.com wird beendet.</p>
            <label><input type="radio" name="grund" value="1" />Inhalte nicht relevant</label>
            <label><input type="radio" name="grund" value="2" />Zu viele E-Mails</label>
            <label><input type="radio" name="grund" value="3" />Habe mich nie angemeldet</label>
            <label><input type="radio" name="grund" value="4" />Schwer lesbar auf dem Handy</label>
            <label><input type="radio" name="grund" value="5" />Sonstiges</label>
          </form>
        `,
      },
      {
        lang: 'French',
        html: `
          <form>
            <p>Votre abonnement à la newsletter pour user@example.com sera annulé.</p>
            <label><input type="radio" name="raison" value="1" />Contenu non pertinent</label>
            <label><input type="radio" name="raison" value="2" />Trop d'e-mails</label>
            <label><input type="radio" name="raison" value="3" />Je ne me suis jamais inscrit</label>
            <label><input type="radio" name="raison" value="4" />Difficile à lire sur mobile</label>
            <label><input type="radio" name="raison" value="5" />Autre</label>
          </form>
        `,
      },
      {
        lang: 'Spanish',
        html: `
          <form>
            <p>Su suscripción para user@example.com será cancelada.</p>
            <label><input type="radio" name="motivo" value="1" />Contenido no relevante</label>
            <label><input type="radio" name="motivo" value="2" />Demasiados correos</label>
            <label><input type="radio" name="motivo" value="3" />Nunca me suscribí</label>
            <label><input type="radio" name="motivo" value="4" />Difícil de leer en el móvil</label>
            <label><input type="radio" name="motivo" value="5" />Otro</label>
          </form>
        `,
      },
    ]

    for (const { lang, html } of cases) {
      it(`returns no detection for ${lang} unsubscribe radio group`, () => {
        document.body.innerHTML = html
        const results = detectAllFields({ strictVisibility: false })
        expect(results).toEqual([])
      })
    }
  })

  describe('legitimate text-entry detection still works', () => {
    it('detects autocomplete="one-time-code" on a text input', () => {
      document.body.innerHTML = `
        <form>
          <input type="text" autocomplete="one-time-code" />
        </form>
      `
      const result = detectVerificationField({ strictVisibility: false })
      expect(result).not.toBeNull()
      expect(result!.confidence).toBeGreaterThanOrEqual(95)
    })

    it('detects tel input with name="otp"', () => {
      document.body.innerHTML = `
        <form>
          <input type="tel" name="otp" />
        </form>
      `
      const result = detectVerificationField({ strictVisibility: false })
      expect(result).not.toBeNull()
    })
  })
})
