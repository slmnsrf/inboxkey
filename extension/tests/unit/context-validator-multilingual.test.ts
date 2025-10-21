/**
 * Multilingual Context Validator Regression Tests
 *
 * Critical for P1 (Turkish Keyword Fix):
 * - Validates Turkish "girin" (enter) does NOT match "giriş" (login)
 * - Validates Finnish "kirjoita" preventive fix
 * - Ensures no regressions across all 21 languages
 *
 * Root cause: Agglutinative languages have suffix variations that cause substring matching issues
 */

import { describe, it, expect } from 'vitest'
import { validateContext, NEGATIVE_KEYWORDS, ALLOW_PATTERNS } from '../../src/lib/detection/context-validator'

describe('Multilingual Context Validator - P1 Regression Tests', () => {
  describe('Turkish (tr) - Agglutinative Language Fix', () => {
    describe('PASS Cases - Valid OTP Context', () => {
      it('should PASS: "kod girin" (enter code)', () => {
        const result = validateContext({
          label: '',
          placeholder: '',
          nearbyText: 'E-posta adresinize gelen kodu girin',
          // Translation: "Enter the code sent to your email address"
        })

        expect(result.pass).toBe(true)
        expect(result.matchedNegatives).toHaveLength(0)
      })

      it('should PASS: "kodu giriniz" (please enter code - formal)', () => {
        const result = validateContext({
          label: '',
          placeholder: '',
          nearbyText: 'Doğrulama kodunu giriniz',
          // Translation: "Please enter verification code"
        })

        expect(result.pass).toBe(true)
        expect(result.matchedNegatives).toHaveLength(0)
      })

      it('should PASS: Steam page exact text', () => {
        const result = validateContext({
          label: '',
          placeholder: '',
          nearbyText: 'gmail.com e-posta adresinize gelen kodu girin',
          // Steam's actual text
        })

        expect(result.pass).toBe(true)
        expect(result.matchedNegatives).toHaveLength(0)
      })

      it('should PASS: "doğrulama girin" (enter verification)', () => {
        const result = validateContext({
          label: 'Doğrulama Kodu',
          placeholder: '',
          nearbyText: 'Doğrulama kodunu girin',
        })

        expect(result.pass).toBe(true)
        expect(result.matchedNegatives).toHaveLength(0)
      })
    })

    describe('FAIL Cases - Login/Password Context', () => {
      it('should FAIL: "Giriş Yap" (Login button)', () => {
        const result = validateContext({
          label: '',
          placeholder: '',
          nearbyText: 'Giriş Yap',
          // Translation: "Login" (button text)
        })

        expect(result.pass).toBe(false)
        expect(result.matchedNegatives).toContain('giriş yap')
        expect(result.language).toBe('tr')
      })

      it('should FAIL: "giriş yapın" (please login)', () => {
        const result = validateContext({
          label: '',
          placeholder: '',
          nearbyText: 'Hesabınıza giriş yapın',
          // Translation: "Login to your account"
        })

        expect(result.pass).toBe(false)
        expect(result.matchedNegatives).toContain('giriş yapın')
        expect(result.language).toBe('tr')
      })

      it('should FAIL: "oturum aç" (open session)', () => {
        const result = validateContext({
          label: '',
          placeholder: '',
          nearbyText: 'Oturum açmak için',
          // Translation: "To login"
        })

        expect(result.pass).toBe(false)
        expect(result.matchedNegatives).toContain('oturum aç')
        expect(result.language).toBe('tr')
      })

      it('should FAIL: "şifre" (password)', () => {
        const result = validateContext({
          label: 'Şifre',
          placeholder: '',
          nearbyText: '',
          // Translation: "Password"
        })

        expect(result.pass).toBe(false)
        expect(result.matchedNegatives).toContain('şifre')
        expect(result.language).toBe('tr')
      })

      it('should FAIL: Hepsiburada password field (regression)', () => {
        const result = validateContext({
          label: 'Şifre',
          placeholder: 'Şifrenizi giriniz',
          nearbyText: 'Hesabınızı doğrulayın',
        })

        expect(result.pass).toBe(false)
        expect(result.matchedNegatives).toContain('şifre')
      })
    })
  })

  describe('Finnish (fi) - Agglutinative Language (Preventive)', () => {
    describe('PASS Cases - Valid OTP Context', () => {
      it('should PASS: "syötä koodi" (enter code)', () => {
        const result = validateContext({
          label: '',
          placeholder: '',
          nearbyText: 'Syötä vahvistuskoodi',
          // Translation: "Enter verification code"
        })

        expect(result.pass).toBe(true)
        expect(result.matchedNegatives).toHaveLength(0)
      })

      it('should PASS: "kirjoita koodi" (write code)', () => {
        const result = validateContext({
          label: '',
          placeholder: '',
          nearbyText: 'Kirjoita koodi tähän',
          // Translation: "Write code here"
        })

        expect(result.pass).toBe(true)
        expect(result.matchedNegatives).toHaveLength(0)
      })
    })

    describe('FAIL Cases - Login Context', () => {
      it('should FAIL: "kirjaudu sisään" (login - multi-word pattern)', () => {
        const result = validateContext({
          label: '',
          placeholder: '',
          nearbyText: 'Kirjaudu sisään tilillesi',
          // Translation: "Login to your account"
        })

        expect(result.pass).toBe(false)
        expect(result.matchedNegatives).toContain('kirjaudu sisään')
        expect(result.language).toBe('fi')
      })

      it('should FAIL: "kirjautuminen" (login - noun form)', () => {
        const result = validateContext({
          label: 'Kirjautuminen',
          placeholder: '',
          nearbyText: '',
          // Translation: "Login" (noun)
        })

        expect(result.pass).toBe(false)
        expect(result.matchedNegatives).toContain('kirjautuminen')
        expect(result.language).toBe('fi')
      })
    })
  })

  describe('All 21 Languages - Smoke Tests (No Regressions)', () => {
    const languageTests = [
      { lang: 'English', loginText: 'Sign in', passText: 'Enter code', shouldFailLogin: true, shouldPassCode: true },
      { lang: 'Chinese', loginText: '登录', passText: '输入验证码', shouldFailLogin: true, shouldPassCode: true },
      { lang: 'Spanish', loginText: 'Iniciar sesión', passText: 'Código', shouldFailLogin: true, shouldPassCode: true },
      { lang: 'Portuguese', loginText: 'Fazer login', passText: 'Código', shouldFailLogin: true, shouldPassCode: true },
      { lang: 'Japanese', loginText: 'ログイン', passText: 'コード', shouldFailLogin: true, shouldPassCode: true },
      { lang: 'Russian', loginText: 'Войти', passText: 'Код', shouldFailLogin: true, shouldPassCode: true },
      { lang: 'German', loginText: 'Anmelden', passText: 'Code', shouldFailLogin: true, shouldPassCode: true },
      { lang: 'French', loginText: 'Se connecter', passText: 'Code', shouldFailLogin: true, shouldPassCode: true },
      { lang: 'Arabic', loginText: 'تسجيل الدخول', passText: 'رمز', shouldFailLogin: true, shouldPassCode: true },
      { lang: 'Korean', loginText: '로그인', passText: '코드', shouldFailLogin: true, shouldPassCode: true },
      { lang: 'Italian', loginText: 'Accedi', passText: 'Codice', shouldFailLogin: true, shouldPassCode: true },
      { lang: 'Dutch', loginText: 'Inloggen', passText: 'Code', shouldFailLogin: true, shouldPassCode: true },
      { lang: 'Polish', loginText: 'Zaloguj się', passText: 'Kod', shouldFailLogin: true, shouldPassCode: true },
      { lang: 'Hindi', loginText: 'लॉगिन', passText: 'कोड', shouldFailLogin: true, shouldPassCode: true },
      { lang: 'Swedish', loginText: 'Logga in', passText: 'Kod', shouldFailLogin: true, shouldPassCode: true },
      { lang: 'Danish', loginText: 'Log ind', passText: 'Kode', shouldFailLogin: true, shouldPassCode: true },
      { lang: 'Norwegian', loginText: 'Logg inn', passText: 'Kode', shouldFailLogin: true, shouldPassCode: true },
      { lang: 'Czech', loginText: 'Přihlásit se', passText: 'Kód', shouldFailLogin: true, shouldPassCode: true },
      { lang: 'Ukrainian', loginText: 'Увійти в систему', passText: 'Код', shouldFailLogin: true, shouldPassCode: true },
    ]

    languageTests.forEach(({ lang, loginText, passText, shouldFailLogin, shouldPassCode }) => {
      it(`${lang}: should ${shouldFailLogin ? 'FAIL' : 'PASS'} on "${loginText}" (login)`, () => {
        const result = validateContext({
          label: '',
          placeholder: '',
          nearbyText: loginText,
        })

        expect(result.pass).toBe(!shouldFailLogin)
      })

      it(`${lang}: should PASS on "${passText}" (code)`, () => {
        const result = validateContext({
          label: passText,
          placeholder: '',
          nearbyText: '',
        })

        // Most code keywords should pass (not in negative keywords)
        // Some might be too generic, but that's okay
        expect(result.pass).toBe(shouldPassCode)
      })
    })
  })

  describe('Allow-Pattern Priority Tests', () => {
    it('should PASS: "password reset code" (allow-pattern overrides)', () => {
      const result = validateContext({
        label: '',
        placeholder: '',
        nearbyText: 'Enter your password reset code',
      })

      expect(result.pass).toBe(true)  // Allow-pattern checked FIRST
      expect(result.matchedNegatives).toHaveLength(0)
    })

    it('should PASS: "one-time password" (OTP keyword)', () => {
      const result = validateContext({
        label: '',
        placeholder: '',
        nearbyText: 'Enter your one-time password',
      })

      expect(result.pass).toBe(true)
      expect(result.matchedNegatives).toHaveLength(0)
    })

    it('should FAIL: "enter password" (no code/token keyword)', () => {
      const result = validateContext({
        label: '',
        placeholder: '',
        nearbyText: 'Enter your password',
      })

      expect(result.pass).toBe(false)  // "password" without "code/reset/otp"
      expect(result.matchedNegatives).toContain('password')
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty text sources gracefully', () => {
      const result = validateContext({
        label: '',
        placeholder: '',
        nearbyText: '',
        ariaLabel: '',
      })

      expect(result.pass).toBe(true)  // No text = no context to validate
      expect(result.matchedNegatives).toHaveLength(0)
      expect(result.language).toBeNull()
    })

    it('should combine multiple text sources', () => {
      const result = validateContext({
        label: 'Code',
        placeholder: 'Enter verification',
        nearbyText: 'Giriş Yap',  // Turkish login (should FAIL)
        ariaLabel: 'Verification input',
      })

      expect(result.pass).toBe(false)  // Login keyword takes precedence
      expect(result.matchedNegatives).toContain('giriş yap')
    })

    it('should handle mixed languages (Turkish + English)', () => {
      const result = validateContext({
        label: 'Verification Code',
        placeholder: '',
        nearbyText: 'Kodu girin (Enter code)',
      })

      expect(result.pass).toBe(true)  // Turkish allow-pattern + English
      expect(result.matchedNegatives).toHaveLength(0)
    })
  })
})
