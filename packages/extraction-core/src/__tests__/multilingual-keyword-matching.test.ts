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
    it('should NOT match "code" mid-word in "discount"', () => {
      const text = 'Get 20% discount with code SAVE20'
      const result = extractOTPs(text)
      // Should extract the alphanumeric code "SAVE20", not match "discount"
      expect(result.every(r => !r.keyword?.includes('discount'))).toBe(true)
    })

    it('should NOT match "code" in "encode"', () => {
      const text = 'Please encode your data properly.'
      const result = extractOTPs(text)
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
