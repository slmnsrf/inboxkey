/**
 * Passwordless Page Keywords Test Suite
 *
 * Validates structural integrity of PASSWORDLESS_PAGE_KEYWORDS_BY_LANG:
 * - All 21 required languages are present
 * - Each language has at least 5 phrases
 * - No phrase shorter than 8 characters
 * - All phrases are lowercase (no uppercase letters)
 * - Spot-checks for representative known phrases per language
 */

import { describe, it, expect } from 'vitest'
import { PASSWORDLESS_PAGE_KEYWORDS_BY_LANG } from '../extraction/passwordless-page-keywords.js'

const REQUIRED_LANGUAGES = [
  'en', 'tr', 'de', 'es', 'fr', 'it', 'pt', 'nl', 'pl', 'ru',
  'ja', 'zh', 'ko', 'ar', 'he', 'sv', 'da', 'no', 'fi', 'cs', 'uk',
]

describe('PASSWORDLESS_PAGE_KEYWORDS_BY_LANG', () => {
  it('contains exactly 21 languages', () => {
    expect(Object.keys(PASSWORDLESS_PAGE_KEYWORDS_BY_LANG)).toHaveLength(21)
  })

  it('contains all required language codes', () => {
    const keys = Object.keys(PASSWORDLESS_PAGE_KEYWORDS_BY_LANG)
    for (const lang of REQUIRED_LANGUAGES) {
      expect(keys).toContain(lang)
    }
  })

  it('each language has at least 5 phrases', () => {
    for (const lang of REQUIRED_LANGUAGES) {
      const phrases = PASSWORDLESS_PAGE_KEYWORDS_BY_LANG[lang]
      expect(phrases.length, `${lang}: expected at least 5 phrases, got ${phrases.length}`).toBeGreaterThanOrEqual(5)
    }
  })

  it('no phrase is shorter than 8 characters', () => {
    for (const [lang, phrases] of Object.entries(PASSWORDLESS_PAGE_KEYWORDS_BY_LANG)) {
      for (const phrase of phrases) {
        expect(
          phrase.length,
          `${lang}: phrase "${phrase}" is shorter than 8 characters (length ${phrase.length})`
        ).toBeGreaterThanOrEqual(8)
      }
    }
  })

  it('all phrases are lowercase (no uppercase letters)', () => {
    for (const [lang, phrases] of Object.entries(PASSWORDLESS_PAGE_KEYWORDS_BY_LANG)) {
      for (const phrase of phrases) {
        expect(
          phrase,
          `${lang}: phrase "${phrase}" contains uppercase letters`
        ).toBe(phrase.toLowerCase())
      }
    }
  })

  describe('spot-checks: representative phrases per language', () => {
    it('en: contains expected waiting-screen phrases', () => {
      const en = PASSWORDLESS_PAGE_KEYWORDS_BY_LANG['en']
      expect(en).toContain('check your email')
      expect(en).toContain('check your inbox')
      expect(en).toContain('we sent you a sign-in link')
      expect(en).toContain('magic link sent')
      expect(en).toContain('sign-in link sent')
    })

    it('tr: contains expected Turkish waiting-screen phrases', () => {
      const tr = PASSWORDLESS_PAGE_KEYWORDS_BY_LANG['tr']
      expect(tr).toContain('e-postanızı kontrol edin')
      expect(tr).toContain('giriş bağlantısı gönderildi')
      expect(tr).toContain('şifresiz giriş')
    })

    it('de: contains expected German waiting-screen phrases', () => {
      const de = PASSWORDLESS_PAGE_KEYWORDS_BY_LANG['de']
      expect(de).toContain('prüfen sie ihre e-mail')
      expect(de).toContain('anmeldelink gesendet')
      expect(de).toContain('passwortlose anmeldung')
    })

    it('ja: contains expected Japanese waiting-screen phrases', () => {
      const ja = PASSWORDLESS_PAGE_KEYWORDS_BY_LANG['ja']
      expect(ja).toContain('メールを確認してください')
      expect(ja).toContain('パスワードなしでサインイン')
      expect(ja).toContain('マジックリンクを送信しました')
    })

    it('ar: contains expected Arabic waiting-screen phrases', () => {
      const ar = PASSWORDLESS_PAGE_KEYWORDS_BY_LANG['ar']
      expect(ar).toContain('تحقق من بريدك الإلكتروني')
      expect(ar).toContain('تسجيل الدخول بدون كلمة مرور')
      expect(ar).toContain('تم إرسال رابط تسجيل الدخول')
    })
  })
})
