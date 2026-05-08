/**
 * Multilingual Keyword Matching Test Suite
 *
 * Validates that OTP keyword extraction works correctly across all 21 required languages,
 * including support for agglutinative suffixes, grammatical particles, and case endings.
 *
 * Root cause fixed: Removed trailing word boundary to allow keywords with grammatical suffixes.
 *
 * Languages tested (21 total, 99.4% Chrome coverage):
 * - Agglutinative: Turkish, Finnish, Japanese, Korean
 * - Inflected: Russian, Polish, Hindi, Spanish, German, Swedish, Danish, Norwegian, Czech, Ukrainian
 * - Analytic: English, Chinese
 * - Semitic: Arabic
 * - Romance: French, Portuguese, Italian
 * - Germanic: Dutch
 */

import { describe, it, expect } from 'vitest'
import { extractOTPs } from '../extraction/otp-extractor.js'

describe('Multilingual OTP Keyword Matching', () => {
  describe('Agglutinative Languages - Suffix Matching', () => {
    it('Turkish: should match "kod" with accusative suffix "kodu"', () => {
      const text = 'Aşağıdaki kodu giriniz: 123456'
      // Translation: "Enter the code below: 123456"
      const result = extractOTPs(text)
      expect(result).toHaveLength(1)
      expect(result[0].code).toBe('123456')
    })

    it('Turkish: should match "doğrulama kodu" (verification code)', () => {
      const text = 'Hesabınızı doğrulayabilmek için, lütfen aşağıdaki kodu giriniz. 432961'
      // Real Turkish OTP email from Hepsiburada (JSONL test case)
      const result = extractOTPs(text)
      expect(result).toHaveLength(1)
      expect(result[0].code).toBe('432961')
    })

    it('Japanese: should match "コード" with topic particle "は"', () => {
      const text = '認証コードは 456789 です'
      // Translation: "The authentication code is 456789"
      const result = extractOTPs(text)
      expect(result).toHaveLength(1)
      expect(result[0].code).toBe('456789')
    })

    it('Japanese: should match "コード" with object particle "を"', () => {
      const text = 'ログインコードを入力: 321654'
      // Translation: "Enter login code: 321654"
      const result = extractOTPs(text)
      expect(result).toHaveLength(1)
      expect(result[0].code).toBe('321654')
    })

    it('Korean: should match "코드" with subject particle "가"', () => {
      const text = '인증 코드가 987654입니다'
      // Translation: "The authentication code is 987654"
      const result = extractOTPs(text)
      expect(result).toHaveLength(1)
      expect(result[0].code).toBe('987654')
    })

    it('Korean: should match "코드" with object particle "를"', () => {
      const text = '보안 코드를 입력하세요: 147258'
      // Translation: "Enter the security code: 147258"
      const result = extractOTPs(text)
      expect(result).toHaveLength(1)
      expect(result[0].code).toBe('147258')
    })
  })

  describe('Latin transliteration and accent-insensitive keyword matching', () => {
    it('Turkish SMS ASCII transliteration: should match "tek kullanimlik sifreniz"', () => {
      const text = 'Superonline.net uzerinden iletmis oldugunuz talebiniz icin tek kullanimlik sifreniz: 551652 Size ozel sifre bilgilerinizi guvenliginiz icin kimseyle paylasmayiniz.'
      const result = extractOTPs(text)
      expect(result).toHaveLength(1)
      expect(result[0].code).toBe('551652')
    })

    it('Turkish SMS ASCII transliteration: should match "tek seferlik sifreniz"', () => {
      const text = 'Turknet tek seferlik sifreniz: 795680 Bunu kimseyle paylasmayin. @www.turk.net #795680 B001'
      const result = extractOTPs(text)
      expect(result).toHaveLength(1)
      expect(result[0].code).toBe('795680')
    })

    it.each([
      ['Spanish', 'Tu codigo de verificacion es 333333', '333333'],
      ['Portuguese', 'Seu codigo de verificacao e 444444', '444444'],
      ['German one-to-one fold', 'Ihr Bestatigungscode lautet 555555', '555555'],
      ['German ae transliteration', 'Ihr Bestaetigungscode lautet 555556', '555556'],
      ['French', 'Votre code de securite est 666666', '666666'],
      ['Turkish', 'Dogrulama kodu: 222222', '222222'],
      ['Swedish', 'Din sakerhetskod ar 171717', '171717'],
      ['Finnish', 'Kertakayttokoodi on 181818', '181818'],
      ['Danish ae transliteration', 'Din bekraeftelseskode er 191919', '191919'],
      ['Czech', 'Overovaci kod je 212121', '212121'],
      ['Polish', 'Kod bezpieczenstwa to 141414', '141414'],
    ])('%s: should extract from unaccented Latin SMS/email copy', (_label, text, expected) => {
      const result = extractOTPs(text)
      expect(result).toHaveLength(1)
      expect(result[0].code).toBe(expected)
    })

    it.each([
      ['English', 'Your password is 123456', '123456'],
      ['Spanish', 'Su contraseña: 123456', '123456'],
      ['French', 'Votre mot de passe: 123456', '123456'],
      ['German', 'Ihr Passwort: 123456', '123456'],
      ['Italian', 'La tua password: 123456', '123456'],
      ['Portuguese', 'Sua senha: 123456', '123456'],
      ['Dutch', 'Uw wachtwoord: 123456', '123456'],
      ['Swedish', 'Ditt lösenord: 123456', '123456'],
      ['Finnish', 'Salasanasi: 123456', '123456'],
      ['Danish', 'Din adgangskode: 123456', '123456'],
      ['Norwegian', 'Ditt passord: 123456', '123456'],
      ['Polish', 'Twoje hasło: 123456', '123456'],
      ['Czech', 'Vaše heslo: 123456', '123456'],
      ['Turkish', 'Sifreniz: 123456', '123456'],
      ['Russian', 'Ваш пароль: 123456', '123456'],
      ['Ukrainian', 'Ваш пароль: 123456', '123456'],
      ['Hindi', 'आपका पासवर्ड: 123456', '123456'],
      ['Arabic', 'كلمة المرور: 123456', '123456'],
      ['Japanese', 'パスワード: 123456', '123456'],
      ['Korean', '비밀번호: 123456', '123456'],
      ['Chinese', '密码: 123456', '123456'],
    ])('%s: weak password token extracts only with expected shape', (_label, text, expected) => {
      const result = extractOTPs(text, { expectedLength: 6, expectedCharset: 'digits' })
      expect(result).toHaveLength(1)
      expect(result[0].code).toBe(expected)
    })

    it('does not extract weak password tokens without page-derived expected shape', () => {
      const result = extractOTPs('Sifreniz: 123456')
      expect(result).toHaveLength(0)
    })

    it('does not extract weak password tokens from password-management copy', () => {
      const result = extractOTPs('Password reset: 123456', {
        expectedLength: 6,
        expectedCharset: 'digits',
      })
      expect(result).toHaveLength(0)
    })

    it('does not extract weak password tokens from Wi-Fi password copy', () => {
      const result = extractOTPs('WiFi password: 123456', {
        expectedLength: 6,
        expectedCharset: 'digits',
      })
      expect(result).toHaveLength(0)
    })
  })

  describe('Inflected Languages - Case Endings', () => {
    it('Russian: should match "код" with genitive case', () => {
      const text = 'Использование кода 159357 подтверждения'
      // Translation: "Use of confirmation code 159357"
      const result = extractOTPs(text)
      expect(result).toHaveLength(1)
      expect(result[0].code).toBe('159357')
    })

    it('Polish: should match "kod" with genitive ending', () => {
      const text = 'Wpisz kod 753159 weryfikacyjny'
      // Translation: "Enter verification code 753159"
      const result = extractOTPs(text)
      expect(result).toHaveLength(1)
      expect(result[0].code).toBe('753159')
    })

    it('Hindi: should match "कोड" (code)', () => {
      const text = 'आपका सत्यापन कोड है: 369258'
      // Translation: "Your verification code is: 369258"
      const result = extractOTPs(text)
      expect(result).toHaveLength(1)
      expect(result[0].code).toBe('369258')
    })

    it('Hindi: should match "ओटीपी" (OTP)', () => {
      const text = 'आपका ओटीपी: 852963'
      // Translation: "Your OTP: 852963"
      const result = extractOTPs(text)
      expect(result).toHaveLength(1)
      expect(result[0].code).toBe('852963')
    })
  })

  describe('Semitic Languages - Prefix/Suffix Matching', () => {
    it('Arabic: should match "رمز" with definite article "الرمز"', () => {
      const text = 'أدخل الرمز: 654321'
      // Translation: "Enter the code: 654321"
      const result = extractOTPs(text)
      expect(result).toHaveLength(1)
      expect(result[0].code).toBe('654321')
    })

    it('Arabic: should match "رمز" standalone', () => {
      const text = 'رمزك هو: 987654'
      // Translation: "Your code is: 987654"
      const result = extractOTPs(text)
      expect(result).toHaveLength(1)
      expect(result[0].code).toBe('987654')
    })
  })

  describe('Analytic Languages - No Inflection', () => {
    it('English: should match standalone "code"', () => {
      const text = 'Your verification code is 654321'
      const result = extractOTPs(text)
      expect(result).toHaveLength(1)
      expect(result[0].code).toBe('654321')
    })

    it('Chinese: should match "验证码" (no inflection)', () => {
      const text = '验证码: 246813'
      // Translation: "Verification code: 246813"
      const result = extractOTPs(text)
      expect(result).toHaveLength(1)
      expect(result[0].code).toBe('246813')
    })
  })

  describe('Edge Cases - Prevent False Positives', () => {
    it('does not treat promotional discount codes as OTPs', () => {
      const text = 'Get 20% discount with code SAVE20'
      const result = extractOTPs(text)
      expect(result).toHaveLength(0)
    })

    it('should NOT match "code" in "encode"', () => {
      const text = 'Please encode your data properly.'
      const result = extractOTPs(text)
      expect(result).toHaveLength(0)
    })

    it.each([
      ['Codex', 'Welcome to Codex 123456 release notes.'],
      ['Codebase', 'Push to the Codebase 123456 mirror.'],
      ['Codec', 'Install Codec: 123456 for playback.'],
    ])('should NOT prefix-match English "code" inside "%s"', (_label, text) => {
      const result = extractOTPs(text)
      expect(result).toHaveLength(0)
    })

    it.each([
      ['French', 'Réinitialiser votre mot de passe : 123456'],
      ['Spanish', 'Restablece tu contraseña: 123456'],
      ['German', 'Passwort zurücksetzen: 123456'],
      ['Italian', 'Reimposta la tua password: 123456'],
      ['Portuguese', 'Redefinir sua senha: 123456'],
      ['Turkish', 'Şifrenizi sıfırlayın: 123456'],
      ['English', 'Reset your password: 123456'],
    ])('does not weak-extract OTPs inside %s password-reset/management copy', (_lang, text) => {
      // Weak-keyword path requires expectedShape; even with that signal, the
      // Unicode-aware password-context guard must reject these flows so the
      // code does not autofill.
      const result = extractOTPs(text, { expectedLength: 6, expectedCharset: 'digits' })
      expect(result).toHaveLength(0)
    })

    it('German compounds: should match "code" in "Sicherheitscode"', () => {
      const text = 'Ihr Sicherheitscode: 246813'
      // Translation: "Your security code: 246813"
      const result = extractOTPs(text)
      expect(result).toHaveLength(1)
      expect(result[0].code).toBe('246813')
      // This is DESIRED behavior (compound word contains keyword)
    })

    it('does not treat country/phone code metadata as OTP context', () => {
      const text = `
        Your annual domain contact details review.
        Current registrant:
        First name: Jane
        Last name: Doe
        Email: jane.doe@example.com
        Company name: Not Applicable
        Address: 100 Main St
        City: Springfield
        State: IL
        Country code: US
        Zip: 62701
        Phone country code: 1
        Phone number: 5551234567
        Nameservers: ns1.example-dns.com ns2.example-dns.com
      `

      const result = extractOTPs(text, {
        subject: 'Review your domain example.com contact information',
      })

      expect(result).toHaveLength(0)
    })

    it('does not rank ordinary prose words as all-letter OTP candidates', () => {
      const text = `
        Hi there,
        Enter the 6-digit code below to verify your identity and regain access
        to your account.

        343987

        Thanks for helping us keep your account secure.
      `

      const result = extractOTPs(text, {
        subject: "Here's your verification code 343987",
      })

      expect(result).toHaveLength(1)
      expect(result[0].code).toBe('343987')
      expect(result[0].context?.footerPenalty).toBe(false)
    })

    it('only allows all-letter codes when explicitly expected', () => {
      const text = 'Your verification code is ABCDEF'

      expect(extractOTPs(text)).toHaveLength(0)

      const result = extractOTPs(text, {
        expectedCharset: 'alnum',
      })

      expect(result).toHaveLength(1)
      expect(result[0].code).toBe('ABCDEF')
    })

    it('does not treat German coupon code labels as OTP context', () => {
      const text = 'Sichern Sie sich den Gutschein-Code LIFETIME50 für Ihre Bestellung.'
      const result = extractOTPs(text)
      expect(result).toHaveLength(0)
    })

    it('does not treat German Rabattcode training discounts as OTPs', () => {
      const text = 'Der Rabattcode für CISTEC ist bereit: CISTEC15. Der Code gilt für den Schulungskatalog.'
      const result = extractOTPs(text)
      expect(result).toHaveLength(0)
    })

    it('does not treat localized commercial codes as OTPs', () => {
      const cases = [
        'Indirim kodu BAHAR20 ile yüzde 20 indirim kazanın.',
        'Utilisez le code promo PRINTEMPS20 pour économiser 20%.',
        'Usa el código promocional AHORRA20 para obtener descuento.',
        'Usa il codice sconto ESTATE20 per risparmiare.',
        'Use o código promocional OFERTA20 para obter desconto.',
        'Gebruik kortingscode LENTE20 voor 20% korting.',
        'Kod rabatowy WIOSNA20 daje 20% rabatu.',
      ]

      for (const text of cases) {
        expect(extractOTPs(text)).toHaveLength(0)
      }
    })

    it('does not extract URL query token fragments as OTPs', () => {
      const text = `
        Confirm your vendor email address:
        https://vendors.example.com/confirm?code=c9ed466122856aa6103dd272191
      `

      const result = extractOTPs(text)
      expect(result).toHaveLength(0)
    })

    it('does not treat software/product code mentions as OTP context', () => {
      const text = 'On March 12, 2026, Claude Code on Windows added new terminal support.'
      const result = extractOTPs(text)
      expect(result).toHaveLength(0)
    })

    it('does not extract tutorial platform names near generic code content', () => {
      const text = 'W3Schools Academy can now help your classroom. Every tutorial, exercise, quiz, and code example is ready.'
      const result = extractOTPs(text)
      expect(result).toHaveLength(0)
    })

    it('does not extract dev-tool names from GitHub issue discussion', () => {
      const text = 'Checked the current docs via Context7 in GitHub issue #677. The refactor uses useCallback around code paths.'
      const result = extractOTPs(text)
      expect(result).toHaveLength(0)
    })

    it('does not extract CSS colors or units near inline code examples', () => {
      const text = `
        View this issue on CodePen.
        .inline-code { color: #8C8C8C; background-color: #FF6166; padding: 15px 30px; }
      `

      const result = extractOTPs(text)
      expect(result).toHaveLength(0)
    })

    it('does not extract date ordinals near promotional code copy', () => {
      const text = 'Limited time, only valid until the 28th of January. Use the code: JAN40 for 40% off.'
      const result = extractOTPs(text)
      expect(result).toHaveLength(0)
    })

    it('does not extract standalone years from non-auth contexts', () => {
      const cases = [
        'March 2026 product update: new code examples for your team.',
        'Your exam is scheduled to take place on 16/02/2026. The course code will be sent separately.',
        'Use code 2026_SUPABASE20 for 20% off registration.',
        'Finished: 2026-04-21 14:44 UTC. Claude Code Review results are available.',
      ]

      for (const text of cases) {
        expect(extractOTPs(text)).toHaveLength(0)
      }
    })

    it('still allows year-shaped values with strong OTP context', () => {
      const text = 'Your verification code is 2026'
      const result = extractOTPs(text)
      expect(result).toHaveLength(1)
      expect(result[0].code).toBe('2026')
    })
  })

  describe('All 21 Required Languages - Smoke Tests', () => {
    const testCases = [
      { lang: 'English', text: 'Your code is 111111', expected: '111111' },
      { lang: 'Turkish', text: 'Kodunuz: 222222', expected: '222222' },
      { lang: 'Spanish', text: 'Tu código es 333333', expected: '333333' },
      { lang: 'Portuguese', text: 'Seu código é 444444', expected: '444444' },
      { lang: 'German', text: 'Ihr Code ist 555555', expected: '555555' },
      { lang: 'French', text: 'Votre code est 666666', expected: '666666' },
      { lang: 'Russian', text: 'Ваш код 777777', expected: '777777' },
      { lang: 'Japanese', text: 'コードは 888888', expected: '888888' },
      { lang: 'Chinese', text: '验证码 999999', expected: '999999' },
      { lang: 'Korean', text: '코드 000000', expected: '000000' },
      { lang: 'Arabic', text: 'رمز 121212', expected: '121212' },
      { lang: 'Hindi', text: 'कोड 131313', expected: '131313' },
      { lang: 'Polish', text: 'Kod 141414', expected: '141414' },
      { lang: 'Dutch', text: 'Code 151515', expected: '151515' },
      { lang: 'Italian', text: 'Codice 161616', expected: '161616' },
      { lang: 'Swedish', text: 'Kod 171717', expected: '171717' },
      { lang: 'Finnish', text: 'Koodi 181818', expected: '181818' },
      { lang: 'Danish', text: 'Kode 191919', expected: '191919' },
      { lang: 'Norwegian', text: 'Kode 202020', expected: '202020' },
      { lang: 'Czech', text: 'Kód 212121', expected: '212121' },
      { lang: 'Ukrainian', text: 'Код 232323', expected: '232323' },
    ]

    testCases.forEach(({ lang, text, expected }) => {
      it(`${lang}: should extract OTP code`, () => {
        const result = extractOTPs(text)
        expect(result).toHaveLength(1)
        expect(result[0].code).toBe(expected)
      })
    })
  })
})
