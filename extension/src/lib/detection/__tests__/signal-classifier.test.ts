/**
 * Tests for Layer 2.5 Delivery Channel Signal Classifier
 *
 * Coverage:
 * - Email detection (5 languages × 5 character sets)
 * - SMS rejection (5 languages)
 * - Authenticator rejection (5 languages)
 * - Edge cases (ambiguous text, empty input, Unicode)
 * - Performance benchmark (<0.05ms budget)
 */

import { describe, it, expect } from 'vitest'
import { classifyDeliveryChannel } from '../signal-classifier'
import type { TextSources } from '../types'

describe('signal-classifier', () => {
  // Helper to create text sources
  const createSources = (text: string): TextSources => ({
    label: text,
    placeholder: '',
    nearbyText: '',
    ariaLabel: '',
  })

  // ═══════════════════════════════════════════════════════════════
  // Email Detection Tests (5 Languages)
  // ═══════════════════════════════════════════════════════════════

  describe('Email Channel Detection', () => {
    it('detects English email keywords', () => {
      const result = classifyDeliveryChannel(createSources('Check your email for the code'))
      expect(result.channel).toBe('email')
      expect(result.confidence).toBeGreaterThan(0.8)
      expect(result.matchedKeywords).toContain('email')
    })

    it('detects Turkish email keywords (e-posta)', () => {
      const result = classifyDeliveryChannel(createSources('E-posta adresinize gelen kodu girin'))
      expect(result.channel).toBe('email')
      expect(result.confidence).toBeGreaterThan(0.8)
      expect(result.matchedKeywords.some(k => k.includes('posta'))).toBe(true)
    })

    it('detects German email keywords (Postfach)', () => {
      const result = classifyDeliveryChannel(createSources('Code in Ihrem Postfach'))
      expect(result.channel).toBe('email')
      expect(result.confidence).toBeGreaterThan(0.8)
    })

    it('detects Russian email keywords (почта - Cyrillic)', () => {
      const result = classifyDeliveryChannel(createSources('Проверьте вашу электронную почту'))
      expect(result.channel).toBe('email')
      expect(result.confidence).toBeGreaterThan(0.8)
    })

    it('detects Chinese email keywords (邮件 - CJK)', () => {
      const result = classifyDeliveryChannel(createSources('请查看您的电子邮件'))
      expect(result.channel).toBe('email')
      expect(result.confidence).toBeGreaterThan(0.8)
    })

    it('detects inbox keyword', () => {
      const result = classifyDeliveryChannel(createSources('Check your inbox'))
      expect(result.channel).toBe('email')
    })

    it('detects mailbox keyword', () => {
      const result = classifyDeliveryChannel(createSources('Code sent to your mailbox'))
      expect(result.channel).toBe('email')
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // SMS Rejection Tests (5 Languages)
  // ═══════════════════════════════════════════════════════════════

  describe('SMS Channel Rejection', () => {
    it('rejects English SMS keywords', () => {
      const result = classifyDeliveryChannel(createSources('Enter the code sent via SMS'))
      expect(result.channel).toBe('sms')
      expect(result.confidence).toBe(1.0)
      expect(result.matchedKeywords).toContain('sms')
    })

    it('rejects Turkish SMS keywords (kısa mesaj)', () => {
      const result = classifyDeliveryChannel(createSources('Kısa mesaj ile gelen kodu girin'))
      expect(result.channel).toBe('sms')
      expect(result.confidence).toBe(1.0)
    })

    it('rejects German SMS keywords (Textnachricht)', () => {
      const result = classifyDeliveryChannel(createSources('Code per SMS'))
      expect(result.channel).toBe('sms')
      expect(result.confidence).toBe(1.0)
    })

    it('rejects Russian SMS keywords (СМС - Cyrillic)', () => {
      const result = classifyDeliveryChannel(createSources('Введите код из СМС'))
      expect(result.channel).toBe('sms')
      expect(result.confidence).toBe(1.0)
    })

    it('rejects Chinese SMS keywords (短信 - CJK)', () => {
      const result = classifyDeliveryChannel(createSources('输入短信验证码'))
      expect(result.channel).toBe('sms')
      expect(result.confidence).toBe(1.0)
    })

    it('rejects mobile/phone keywords', () => {
      const result = classifyDeliveryChannel(createSources('Code sent to your mobile phone'))
      expect(result.channel).toBe('sms')
    })

    it('rejects text message keyword', () => {
      const result = classifyDeliveryChannel(createSources('Enter code from text message'))
      expect(result.channel).toBe('sms')
    })

    it('detects Turkcell-style Turkish SMS modal copy with masked phone ending', () => {
      const result = classifyDeliveryChannel(
        createSources('SMS Doğrulama **** *****15 telefon numarasına gönderilen doğrulama kodunu giriniz.')
      )
      expect(result.channel).toBe('sms')
      expect(result.allChannels).toEqual(['sms'])
    })

    it.each([
      ['en', 'Enter the code sent to your phone number ending in 15'],
      ['es', 'Ingrese el código enviado al teléfono móvil que termina en 15'],
      ['pt', 'Digite o código enviado ao telefone celular terminado em 15'],
      ['de', 'Geben Sie den Code ein, der an Ihr Mobiltelefon gesendet wurde'],
      ['fr', 'Saisissez le code envoyé au téléphone mobile se terminant par 15'],
      ['it', 'Inserisci il codice inviato al telefono cellulare'],
      ['nl', 'Voer de code in die naar uw telefoon is verstuurd'],
      ['tr', '**** *****15 telefon numarasına gönderilen doğrulama kodunu giriniz'],
      ['pl', 'Wpisz kod wysłany na telefon'],
      ['cs', 'Zadejte kód odeslán na telefon'],
      ['sv', 'Ange koden skickats till din mobiltelefon'],
      ['fi', 'Syötä koodi lähetetty puhelimeen'],
      ['da', 'Indtast koden sendt til din mobiltelefon'],
      ['no', 'Skriv inn koden sendt til mobiltelefonen'],
      ['ru', 'Введите код отправлен на телефон'],
      ['uk', 'Введіть код надісланий на телефон'],
      ['ar', 'أدخل رمز أرسل إلى هاتفك'],
      ['hi', 'मोबाइल पर भेजा गया कोड दर्ज करें'],
      ['ja', '携帯電話に送信されたコードを入力'],
      ['ko', '휴대폰으로 전송된 코드를 입력하세요'],
      ['zh', '输入发送到手机的验证码'],
    ])('detects SMS/phone delivery phrasing in supported language %s', (_lang, text) => {
      const result = classifyDeliveryChannel(createSources(text))
      expect(result.channel).toBe('sms')
      expect(result.allChannels).toEqual(['sms'])
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // Authenticator Rejection Tests (5 Languages)
  // ═══════════════════════════════════════════════════════════════

  describe('Authenticator Channel Rejection', () => {
    it('rejects English authenticator app keywords', () => {
      const result = classifyDeliveryChannel(createSources('Open your authenticator app'))
      expect(result.channel).toBe('authenticator')
      expect(result.confidence).toBe(1.0)
      expect(result.matchedKeywords.some(k => k.includes('authenticator'))).toBe(true)
    })

    it('rejects Turkish authenticator keywords (uygulama)', () => {
      const result = classifyDeliveryChannel(createSources('Doğrulayıcı uygulamanızdan kodu girin'))
      expect(result.channel).toBe('authenticator')
      expect(result.confidence).toBe(1.0)
    })

    it('rejects German authenticator keywords (Authenticator-App)', () => {
      const result = classifyDeliveryChannel(createSources('Code aus Ihrer Authenticator-App'))
      expect(result.channel).toBe('authenticator')
      expect(result.confidence).toBe(1.0)
    })

    it('rejects Russian authenticator keywords (приложение - Cyrillic)', () => {
      const result = classifyDeliveryChannel(createSources('Введите код из приложения аутентификации'))
      expect(result.channel).toBe('authenticator')
      expect(result.confidence).toBe(1.0)
    })

    it('rejects Chinese authenticator keywords (应用 - CJK)', () => {
      const result = classifyDeliveryChannel(createSources('打开身份验证应用'))
      expect(result.channel).toBe('authenticator')
      expect(result.confidence).toBe(1.0)
    })

    it('rejects Google Authenticator brand name', () => {
      const result = classifyDeliveryChannel(createSources('Use Google Authenticator'))
      expect(result.channel).toBe('authenticator')
    })

    it('rejects Microsoft Authenticator brand name', () => {
      const result = classifyDeliveryChannel(createSources('Open Microsoft Authenticator'))
      expect(result.channel).toBe('authenticator')
    })

    it('rejects Authy brand name', () => {
      const result = classifyDeliveryChannel(createSources('Get code from Authy'))
      expect(result.channel).toBe('authenticator')
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // Edge Case Tests
  // ═══════════════════════════════════════════════════════════════

  describe('Edge Cases', () => {
    it('prioritizes email when both email and SMS are present', () => {
      const result = classifyDeliveryChannel(createSources('Check your email or SMS for the code'))
      expect(result.channel).toBe('email')
      expect(result.confidence).toBe(0.85) // Lower confidence due to ambiguity
      expect(result.matchedKeywords.length).toBeGreaterThan(1) // Both keywords matched
    })

    it('handles empty input gracefully', () => {
      const result = classifyDeliveryChannel({
        label: '',
        placeholder: '',
        nearbyText: '',
        ariaLabel: '',
      })
      expect(result.channel).toBe('unknown')
      expect(result.confidence).toBe(0)
      expect(result.matchedKeywords).toEqual([])
    })

    it('handles undefined ariaLabel gracefully', () => {
      const result = classifyDeliveryChannel({
        label: 'email code',
        placeholder: '',
        nearbyText: '',
        // ariaLabel is optional, test without it
      })
      expect(result.channel).toBe('email')
    })

    it('handles whitespace-only input', () => {
      const result = classifyDeliveryChannel({
        label: '   ',
        placeholder: '  \n  ',
        nearbyText: '\t\t',
        ariaLabel: '',
      })
      expect(result.channel).toBe('unknown')
      expect(result.confidence).toBe(0)
    })

    it('handles Unicode edge cases (emoji, special chars)', () => {
      const result = classifyDeliveryChannel(createSources('📧 Email code 🔐'))
      expect(result.channel).toBe('email')
    })

    it('handles very long input strings (performance test)', () => {
      const longText = 'email '.repeat(1000) // 6000 chars
      const result = classifyDeliveryChannel(createSources(longText))
      expect(result.channel).toBe('email')
    })

    it('returns unknown for irrelevant text', () => {
      const result = classifyDeliveryChannel(createSources('Lorem ipsum dolor sit amet'))
      expect(result.channel).toBe('unknown')
      expect(result.confidence).toBe(0)
    })

    it('handles mixed case input', () => {
      const result = classifyDeliveryChannel(createSources('CHECK YOUR EMAIL'))
      expect(result.channel).toBe('email')
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // Authenticator Priority Tests
  // ═══════════════════════════════════════════════════════════════

  describe('Channel Priority Logic (UPDATED for Option 7)', () => {
    it('hybrid: authenticator + email → detects as email', () => {
      const result = classifyDeliveryChannel(
        createSources('Check email or use authenticator app')
      )
      expect(result.channel).toBe('email')
      expect(result.confidence).toBe(0.85) // Lower confidence for hybrid
      expect(result.allChannels).toContain('email')
      expect(result.allChannels).toContain('authenticator')
    })

    it('authenticator only → rejects', () => {
      const result = classifyDeliveryChannel(
        createSources('Use authenticator app')
      )
      expect(result.channel).toBe('authenticator')
      expect(result.allChannels).toContain('authenticator')
      expect(result.allChannels).not.toContain('email')
    })

    it('hybrid: authenticator + SMS + email → detects as email', () => {
      const result = classifyDeliveryChannel(
        createSources('Email, SMS, or authenticator app')
      )
      expect(result.channel).toBe('email')
      expect(result.confidence).toBe(0.85)
      expect(result.allChannels).toContain('email')
      expect(result.allChannels).toContain('sms')
      expect(result.allChannels).toContain('authenticator')
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // Performance Benchmark
  // ═══════════════════════════════════════════════════════════════

  describe('Performance', () => {
    it('classifies email text in <0.05ms (budget check)', () => {
      const sources = createSources('Check your email for the verification code')

      const iterations = 100
      const start = performance.now()

      for (let i = 0; i < iterations; i++) {
        classifyDeliveryChannel(sources)
      }

      const end = performance.now()
      const avgTime = (end - start) / iterations

      // Budget: <0.05ms per call
      expect(avgTime).toBeLessThan(0.05)
    })

    it('classifies SMS text in <0.05ms', () => {
      const sources = createSources('Enter code from SMS')

      const iterations = 100
      const start = performance.now()

      for (let i = 0; i < iterations; i++) {
        classifyDeliveryChannel(sources)
      }

      const end = performance.now()
      const avgTime = (end - start) / iterations

      expect(avgTime).toBeLessThan(0.05)
    })

    it('classifies authenticator text in <0.05ms', () => {
      const sources = createSources('Open authenticator app')

      const iterations = 100
      const start = performance.now()

      for (let i = 0; i < iterations; i++) {
        classifyDeliveryChannel(sources)
      }

      const end = performance.now()
      const avgTime = (end - start) / iterations

      expect(avgTime).toBeLessThan(0.05)
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // Language Detection Tests
  // ═══════════════════════════════════════════════════════════════

  describe('Language Detection', () => {
    it('detects Latin character set (English)', () => {
      const result = classifyDeliveryChannel(createSources('email code'))
      expect(result.language).toBe('en')
    })

    it('detects Cyrillic character set (Russian)', () => {
      const result = classifyDeliveryChannel(createSources('электронная почта'))
      expect(result.language).toBe('ru')
    })

    it('detects Arabic character set', () => {
      const result = classifyDeliveryChannel(createSources('بريد إلكتروني'))
      expect(result.language).toBe('ar')
    })

    it('detects Devanagari character set (Hindi)', () => {
      const result = classifyDeliveryChannel(createSources('ईमेल कोड'))
      expect(result.language).toBe('hi')
    })

    it('detects CJK character set (Chinese)', () => {
      const result = classifyDeliveryChannel(createSources('电子邮件'))
      expect(result.language).toBe('zh')
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // Option 7: Hybrid Channel Detection Tests (NEW)
  // ═══════════════════════════════════════════════════════════════

  describe('Option 7: Hybrid Channel Detection', () => {
    it('hybrid: email + authenticator → email with allChannels', () => {
      const result = classifyDeliveryChannel(
        createSources('Enter code from email or authenticator app')
      )
      expect(result.channel).toBe('email')
      expect(result.confidence).toBe(0.85)
      expect(result.allChannels).toEqual(['email', 'authenticator'])
      expect(result.channelConfidences?.email).toBe(0.95)
      expect(result.channelConfidences?.authenticator).toBe(1.0)
    })

    it('hybrid: email + SMS → email with allChannels', () => {
      const result = classifyDeliveryChannel(
        createSources('Check your email or SMS for the code')
      )
      expect(result.channel).toBe('email')
      expect(result.confidence).toBe(0.85)
      expect(result.allChannels).toEqual(['email', 'sms'])
      expect(result.channelConfidences?.email).toBe(0.95)
      expect(result.channelConfidences?.sms).toBe(1.0)
    })

    it('authenticator only → reject with allChannels', () => {
      const result = classifyDeliveryChannel(
        createSources('Open your authenticator app')
      )
      expect(result.channel).toBe('authenticator')
      expect(result.confidence).toBe(1.0)
      expect(result.allChannels).toEqual(['authenticator'])
      expect(result.channelConfidences?.authenticator).toBe(1.0)
      expect(result.channelConfidences?.email).toBeUndefined()
    })

    it('SMS only → reject with allChannels', () => {
      const result = classifyDeliveryChannel(
        createSources('Enter code from SMS')
      )
      expect(result.channel).toBe('sms')
      expect(result.confidence).toBe(1.0)
      expect(result.allChannels).toEqual(['sms'])
      expect(result.channelConfidences?.sms).toBe(1.0)
      expect(result.channelConfidences?.email).toBeUndefined()
    })

    it('triple hybrid: email + SMS + authenticator → email', () => {
      const result = classifyDeliveryChannel(
        createSources('Code via email, SMS, or authenticator app')
      )
      expect(result.channel).toBe('email')
      expect(result.confidence).toBe(0.85)
      expect(result.allChannels).toEqual(['email', 'sms', 'authenticator'])
    })

    it('email only → detect with allChannels', () => {
      const result = classifyDeliveryChannel(
        createSources('Check your email')
      )
      expect(result.channel).toBe('email')
      expect(result.confidence).toBe(0.95)
      expect(result.allChannels).toEqual(['email'])
      expect(result.channelConfidences?.email).toBe(0.95)
    })

    it('unknown → no allChannels', () => {
      const result = classifyDeliveryChannel(
        createSources('Enter verification code')
      )
      expect(result.channel).toBe('unknown')
      expect(result.confidence).toBe(0)
      expect(result.allChannels).toBeUndefined()
      expect(result.channelConfidences).toBeUndefined()
    })

    // Multilingual hybrid tests
    it('hybrid Turkish: e-posta + uygulama → email', () => {
      const result = classifyDeliveryChannel(
        createSources('E-posta veya doğrulayıcı uygulamanızdan kod girin')
      )
      expect(result.channel).toBe('email')
      expect(result.confidence).toBe(0.85)
      expect(result.allChannels).toContain('email')
      expect(result.allChannels).toContain('authenticator')
    })

    it('hybrid German: E-Mail + Authenticator-App → email', () => {
      const result = classifyDeliveryChannel(
        createSources('Code aus E-Mail oder Authenticator-App')
      )
      expect(result.channel).toBe('email')
      expect(result.confidence).toBe(0.85)
      expect(result.allChannels).toContain('email')
      expect(result.allChannels).toContain('authenticator')
    })

    it('hybrid Russian: почта + приложение → email', () => {
      const result = classifyDeliveryChannel(
        createSources('Код из почты или приложения аутентификации')
      )
      expect(result.channel).toBe('email')
      expect(result.confidence).toBe(0.85)
      expect(result.allChannels).toContain('email')
      expect(result.allChannels).toContain('authenticator')
    })

    it('hybrid Chinese: 邮件 + 应用 → email', () => {
      const result = classifyDeliveryChannel(
        createSources('从电子邮件或验证器应用获取代码')
      )
      expect(result.channel).toBe('email')
      expect(result.confidence).toBe(0.85)
      expect(result.allChannels).toContain('email')
      expect(result.allChannels).toContain('authenticator')
    })

    it('hybrid English: email + SMS + auth → email', () => {
      const result = classifyDeliveryChannel(
        createSources('Code sent to email, mobile, or authenticator app')
      )
      expect(result.channel).toBe('email')
      expect(result.confidence).toBe(0.85)
      expect(result.allChannels).toEqual(['email', 'sms', 'authenticator'])
    })

    // Real-world scenarios
    it('GitHub 2FA: email + authenticator → email', () => {
      const result = classifyDeliveryChannel(
        createSources('Enter a code from your email or an authentication app')
      )
      expect(result.channel).toBe('email')
      expect(result.confidence).toBe(0.85)
      expect(result.allChannels).toContain('email')
      expect(result.allChannels).toContain('authenticator')
    })

    it('Steam Guard: email + authenticator → email', () => {
      // Updated 2026-05-04: bare `uygulama` is no longer a sufficient
      // authenticator anchor (FP-prone in Turkish — "uygulamayı indir"
      // means "download the app"). Real Steam-style Turkish copy includes
      // a strong anchor like `doğrulayıcı`. The hybrid intent is preserved.
      const result = classifyDeliveryChannel(
        createSources('Doğrulama kodunu e-posta veya doğrulayıcı uygulama')
      )
      expect(result.channel).toBe('email')
      expect(result.confidence).toBe(0.85)
      expect(result.allChannels).toContain('email')
      expect(result.allChannels).toContain('authenticator')
    })

    it('Banking: SMS only (Turkish) → reject', () => {
      const result = classifyDeliveryChannel(
        createSources('Telefonunuza gelen SMS kodunu girin')
      )
      expect(result.channel).toBe('sms')
      expect(result.confidence).toBe(1.0)
      expect(result.allChannels).toEqual(['sms'])
      expect(result.allChannels).not.toContain('email')
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // Twitter/X TOTP challenge — captured real-site copy
  // (regression: instrumental construction, accusative app form,
  // generic "code generator app" phrasing missed by prior patterns)
  // ═══════════════════════════════════════════════════════════════

  describe('Twitter/X TOTP challenge (captured copy)', () => {
    it('rejects English X TOTP prompt as authenticator (verb=generate, noun=code generator app)', () => {
      const text = 'Enter verification code. Generate a code using your code generator app and enter it below.'
      const result = classifyDeliveryChannel(createSources(text))
      expect(result.channel).toBe('authenticator')
      expect(result.matchedKeywords.length).toBeGreaterThan(0)
    })

    it('rejects Turkish X TOTP prompt as authenticator (instrumental construction, accusative)', () => {
      const text = 'Onaylama kodunu gir. Kod oluşturucu uygulamanı kullanarak bir kod oluştur ve aşağıya gir.'
      const result = classifyDeliveryChannel(createSources(text))
      expect(result.channel).toBe('authenticator')
      expect(result.matchedKeywords.length).toBeGreaterThan(0)
    })

    it('does not classify "QR code generator app" as authenticator', () => {
      // Phrase includes `app` so the regex actually attempts to match —
      // exercises the (?<!qr\s) lookbehind guard.
      const result = classifyDeliveryChannel(
        createSources('Try our free QR code generator app to make QR codes from any URL.')
      )
      expect(result.channel).not.toBe('authenticator')
    })

    it('does not classify "promo code generator app" as authenticator', () => {
      // Exercises the (?<!promo\s) lookbehind guard.
      const result = classifyDeliveryChannel(
        createSources('Generate discounts with our promo code generator app.')
      )
      expect(result.channel).not.toBe('authenticator')
    })

    it('does not classify "coupon-code generator app" as authenticator', () => {
      // Exercises the (?<!coupon-) lookbehind guard.
      const result = classifyDeliveryChannel(
        createSources('Create offers with our coupon-code generator app.')
      )
      expect(result.channel).not.toBe('authenticator')
    })

    it('does not classify "source-code generator app" as authenticator', () => {
      // Exercises the (?<!source-) lookbehind guard.
      const result = classifyDeliveryChannel(
        createSources('Try our source-code generator app for boilerplate.')
      )
      expect(result.channel).not.toBe('authenticator')
    })

    // Note: a regression test for the (?<!barcode\s) lookbehind would need
    // a phrase like "barcode code generator app" — but that wording trips
    // a long-standing FP in the French pattern at line 220
    // (`code.*(?:de|dans).*(?:application|app)/i`) because `de` lives
    // inside the `code` letters. Leaving the lookbehind defensive but
    // untested; fixing the French pattern is out of scope for this PR.

    it('does not classify "low-code generator app" as authenticator', () => {
      // Exercises the `(?<!low-)` lookbehind: the text contains the exact
      // `code generator app` substring the regex looks for, but preceded
      // by `low-` it must be rejected.
      const result = classifyDeliveryChannel(
        createSources('Try our low-code generator app for visual development.')
      )
      expect(result.channel).not.toBe('authenticator')
    })

    it('does not classify bare "code generator" without app as authenticator', () => {
      // `app` is required after `code generator`. Bare phrases like
      // "AI code generator" / "free code generator" are common dev-tool
      // marketing copy and must not trigger the auth gate.
      const result = classifyDeliveryChannel(
        createSources('Use our AI code generator to write boilerplate.')
      )
      expect(result.channel).not.toBe('authenticator')
    })

    it('does not classify Turkish QR code generator page as authenticator', () => {
      // Real Turkish QR generator sites use this phrasing — must not match
      // because the auth-anchor co-occurrence requires `uygulama` nearby.
      const result = classifyDeliveryChannel(
        createSources("Ücretsiz QR Kod Oluşturucu — herhangi bir URL'den QR kod oluşturun.")
      )
      expect(result.channel).not.toBe('authenticator')
    })

    it('does not classify Turkish App Store QR generator app title as authenticator', () => {
      // Codex round 3 P1: real App Store title "Me QR - QR Kod Oluşturucu
      // Uygulaması" was matching because `Kod Oluşturucu` + `Uygulaması`
      // co-occurred. The QR-prefix lookbehind on the `kod oluşturucu` arm
      // rejects this case.
      const result = classifyDeliveryChannel(
        createSources('Me QR - QR Kod Oluşturucu Uygulaması')
      )
      expect(result.channel).not.toBe('authenticator')
    })
  })
})
