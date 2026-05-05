/**
 * SMS Brand-Prefix-Code Shape Gate
 *
 * Locks in the structural behavior added in EXTRACTOR_VERSION 3:
 *
 *   - When a body contains zero CODE_KEYWORDS but the caller signaled an
 *     expected shape (length/charset from a watch-session field), the
 *     extractor admits the body only if it opens with an SMS-style
 *     "Brand: Code" shape ("Amazon: 123456", "Telegram:12345").
 *
 *   - Bodies without that shape are rejected even when expectedLength is
 *     set, so prose digit runs ("Your shipment of Item 123456",
 *     "Get 100000 points") cannot become false-positive autofills on a
 *     same-domain noise email arriving inside the watch-session window.
 *
 * The gate is structural, not lingual — it gates on punctuation/shape,
 * not on language-specific tokens. Tests deliberately cover several
 * brand prefixes (multilingual reality of brand:code SMS conventions)
 * rather than asserting a single Turkish or English lock-in.
 */
import { describe, it, expect } from 'vitest'
import { extractFromEmail } from '../extraction/extractor.js'

const expected = { length: 6, charset: 'digits' as const }

describe('SMS brand-prefix-code shape gate', () => {
  describe('admits keyword-free SMS with brand-prefix shape', () => {
    // Each fixture: keyword-free body where the OTP is signalled only by
    // the brand-prefix-colon-code shape. These fail extraction without
    // expectedLength + the gate; the test asserts both work together.
    //
    // The Turkish Amazon body is the named bug fixture (bug report
    // 2026-05-05 / Amazon Turkey CVF flow). It is not a Turkish-language
    // assertion — it is a structural assertion that brand-prefix shapes
    // work in any language.
    const cases = [
      {
        label: 'Amazon TR (named bug fixture, keyword-free Turkish)',
        body: 'Amazon:383931. Talep etmediniz mi? Buradan reddedin  B305',
        code: '383931',
      },
      {
        label: 'Amazon EN bare brand:code',
        body: 'Amazon: 555612',
        code: '555612',
      },
      {
        label: 'Discord no-space brand:code',
        body: 'Discord:987654',
        code: '987654',
      },
      {
        label: 'Microsoft brand: space code',
        body: 'Microsoft: 654321',
        code: '654321',
      },
      // Non-Latin scripts. The shape gate is structural; brand names in
      // any Unicode script must admit so the no-keyword fallback works
      // across the 21 supported detection languages, not only Latin.
      {
        label: 'Cyrillic brand (Яндекс) — Russian',
        body: 'Яндекс: 234567',
        code: '234567',
      },
      {
        label: 'CJK brand (微信) — Chinese (3-letter min via Unicode digit class)',
        // 微信 is 2 chars; pad to 3+ with a punctuation-tolerant brand
        // token. The shape regex requires 3+ letter chars (1 + 2 inner).
        body: '微信团队: 345678',
        code: '345678',
      },
      {
        label: 'Greek brand (Πελάτες) — minimum length',
        body: 'Πελάτες: 456789',
        code: '456789',
      },
      {
        label: 'Turkish dotted-İ brand (İstanbul)',
        body: 'İstanbul: 567890',
        code: '567890',
      },
    ]

    for (const { label, body, code } of cases) {
      it(`${label}`, () => {
        const result = extractFromEmail({ subject: '', text: body }, { expected })
        expect(result.otps.length).toBeGreaterThan(0)
        expect(result.otps[0].code).toBe(code)
        expect(result.otps[0].confidence).toBeGreaterThanOrEqual(0.6)
      })
    }
  })

  describe('rejects keyword-free same-domain noise', () => {
    // These are the regression vectors: same-domain emails arriving
    // inside a 60-second watch-session window. Each has a 6-digit run
    // but no OTP keyword and no brand-prefix shape. Pre-fix, plumbing
    // expectedLength alone scored these at ~0.73 (above the 0.6 gate)
    // and they would have triggered false-positive autofills.
    const cases: Array<[string, string]> = [
      ['shipment prose', 'Your shipment of Item 123456 has arrived'],
      ['order confirmation', 'Order 1234567 confirmed. Total $50.'],
      ['tracking number', 'Tracking number 987654 is on its way'],
      ['price/subtotal', 'Your subtotal is $123456.00. Pay now.'],
      ['promotional points', 'Get 100000 points by signing up today'],
      ['phone number long-form', 'Call us at 555 123 4567 for support'],
      ['receipt number', 'Receipt #100234 issued for your purchase'],
      ['address ZIP', 'Ship to 1234 Main St, ZIP 100234'],
      ['random standalone digits', 'See you at 142023 hours. Thanks!'],
    ]

    for (const [label, body] of cases) {
      it(`rejects: ${label}`, () => {
        const result = extractFromEmail({ subject: '', text: body }, { expected })
        // Either no candidates extracted, or all below the popup gate (0.6).
        const passing = result.otps.filter(o => o.confidence >= 0.6)
        expect(passing.length).toBe(0)
      })
    }
  })

  describe('keyword path still works (gate does not interfere)', () => {
    // When CODE_KEYWORDS match in any of the 21 supported languages,
    // the keyword path runs unchanged. The gate is only consulted on
    // the no-keyword fallback. Cover several brand+keyword shapes
    // (Turkish "doğrulama", German "Code", Spanish "código") to lock
    // in cross-lingual behavior without anchoring to a single locale.
    const cases = [
      {
        label: 'EN with keyword',
        body: 'Your verification code is 654321',
        code: '654321',
      },
      {
        label: 'TR with keyword',
        body: 'Doğrulama kodu: 123456',
        code: '123456',
      },
      {
        label: 'DE with keyword (no brand prefix)',
        body: 'Ihr Code lautet 555555',
        code: '555555',
      },
      {
        label: 'ES with keyword',
        body: 'Tu código es 444444',
        code: '444444',
      },
    ]

    for (const { label, body, code } of cases) {
      it(`${label}`, () => {
        // Without expected shape — keyword path alone should succeed.
        const result = extractFromEmail({ subject: '', text: body }, {})
        expect(result.otps.length).toBeGreaterThan(0)
        expect(result.otps[0].code).toBe(code)
      })
    }
  })

  describe('fails closed without expected shape', () => {
    // Belt-and-braces: even a perfect brand-prefix-shape body must not
    // extract when the caller didn't signal an expected shape. The gate
    // pairs with the existing "no keyword + no expected" guard at
    // otp-extractor.ts:96-98; it doesn't replace it.
    it('Amazon TR body without expected shape returns nothing', () => {
      const result = extractFromEmail(
        { subject: '', text: 'Amazon:383931. Talep etmediniz mi? Buradan reddedin  B305' },
        {}
      )
      expect(result.otps).toHaveLength(0)
    })
  })
})
