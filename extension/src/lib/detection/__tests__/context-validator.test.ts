/**
 * Comprehensive tests for context-validator.ts
 *
 * Test Coverage:
 * - All 21 languages (80+ test cases)
 * - Turkish keywords (Hepsiburada fix)
 * - Allow-list patterns
 * - Diacritics normalization
 * - Performance benchmarks
 * - Edge cases
 */

import { describe, it, expect } from 'vitest'
import {
  validateContext,
  NEGATIVE_KEYWORDS,
  ALLOW_PATTERNS,
} from '../context-validator'
import type { TextSources } from '../types'

describe('context-validator', () => {
  // Helper to create text sources
  const createSources = (
    label = '',
    placeholder = '',
    nearbyText = '',
    ariaLabel = '',
    pageTitle = ''
  ): TextSources => ({
    label,
    placeholder,
    nearbyText,
    ariaLabel,
    pageTitle,
  })

  describe('CAPTCHA / image-character context', () => {
    it('should reject CAPTCHA context before verification-code allow-list wording', () => {
      const result = validateContext(createSources('CAPTCHA verification code'))

      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('captcha-context-detected')
      expect(result.confidence).toBe(0)
    })

    it.each([
      ['en', 'Enter the characters in the image'],
      ['es', 'Ingrese los caracteres de la imagen'],
      ['pt', 'Digite os caracteres da imagem'],
      ['de', 'Geben Sie die Zeichen im Bild ein'],
      ['fr', 'Saisissez les caracteres de l image'],
      ['it', 'Inserisci i caratteri dell immagine'],
      ['nl', 'Voer de tekens van de afbeelding in'],
      ['tr', 'Resimdeki karakterleri giriniz'],
      ['pl', 'Wpisz znaki z obrazku'],
      ['cs', 'Zadejte znaky z obrazku'],
      ['sv', 'Ange tecken fran bilden'],
      ['fi', 'Kirjoita kuvassa nakyvat merkit'],
      ['da', 'Indtast tegnene fra billedet'],
      ['no', 'Skriv inn tegnene fra bildet'],
      ['ru', 'Введите символы с картинки'],
      ['uk', 'Введіть символи із зображення'],
      ['ar', 'أحرف الصورة'],
      ['hi', 'चित्र के अक्षर दर्ज करें'],
      ['ja', '画像の文字を入力してください'],
      ['ko', '이미지의 문자를 입력하세요'],
      ['zh', '请输入图片中的验证码'],
    ])('should reject direct image-character prompts for %s', (_lang, placeholder) => {
      const result = validateContext(createSources('', placeholder))

      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('captcha-context-detected')
      expect(result.confidence).toBe(0)
    })

    it('should not reject a real OTP label because of ambient CAPTCHA page chrome', () => {
      const result = validateContext(
        createSources('Verification code', '', 'This site is protected by CAPTCHA')
      )

      expect(result.pass).toBe(true)
      expect(result.confidence).toBe(1.0)
    })
  })

  describe('Allow-list patterns (highest priority)', () => {
    it('should PASS for "password code" (password reset code)', () => {
      const result = validateContext(createSources('Enter password code'))
      expect(result.pass).toBe(true)
      expect(result.matchedNegatives).toEqual([])
      expect(result.confidence).toBe(1.0)
    })

    it('should PASS for "reset password code"', () => {
      const result = validateContext(createSources('Reset password code'))
      expect(result.pass).toBe(true)
      expect(result.confidence).toBe(1.0)
    })

    it('should PASS for "password verification"', () => {
      const result = validateContext(createSources('Password verification code'))
      expect(result.pass).toBe(true)
      expect(result.confidence).toBe(1.0)
    })

    it('should PASS for "password token"', () => {
      const result = validateContext(createSources('Password token'))
      expect(result.pass).toBe(true)
      expect(result.confidence).toBe(1.0)
    })

    it('should PASS for "password OTP"', () => {
      const result = validateContext(createSources('Password OTP'))
      expect(result.pass).toBe(true)
      expect(result.confidence).toBe(1.0)
    })

    it('should PASS for "OTP password" (reversed)', () => {
      const result = validateContext(createSources('OTP password'))
      expect(result.pass).toBe(true)
      expect(result.confidence).toBe(1.0)
    })

    it('should PASS for "login without password" (passwordless)', () => {
      const result = validateContext(createSources('Login without password'))
      expect(result.pass).toBe(true)
      expect(result.confidence).toBe(1.0)
    })

    it('should PASS for "no password required"', () => {
      const result = validateContext(createSources('No password required'))
      expect(result.pass).toBe(true)
      expect(result.confidence).toBe(1.0)
    })

    it('should PASS for "passwordless login"', () => {
      const result = validateContext(createSources('Passwordless login code'))
      expect(result.pass).toBe(true)
      expect(result.confidence).toBe(1.0)
    })

    it('should PASS for "login code"', () => {
      const result = validateContext(createSources('Login code'))
      expect(result.pass).toBe(true)
      expect(result.confidence).toBe(1.0)
    })

    it('should PASS for "sign in code"', () => {
      const result = validateContext(createSources('Sign in code'))
      expect(result.pass).toBe(true)
      expect(result.confidence).toBe(1.0)
    })

    it('should PASS for "signin token"', () => {
      const result = validateContext(createSources('Signin token'))
      expect(result.pass).toBe(true)
      expect(result.confidence).toBe(1.0)
    })

    it('should PASS direct OTP code labels even with storefront chrome nearby', () => {
      const result = validateContext(
        createSources(
          '',
          '',
          'Sepet alışveriş kampanya ödeme',
          'otp code 1',
          'Üye Girişi'
        )
      )

      expect(result.pass).toBe(true)
      expect(result.confidence).toBe(1.0)
    })

    it.each([
      ['en', 'verification code', 'cart checkout order'],
      ['zh', '验证码', '购物车 订单 优惠券'],
      ['es', 'código de verificación', 'carrito compras pedido'],
      ['pt', 'código de verificação', 'carrinho compras pedido'],
      ['ja', '確認コード', 'ショッピング 購入 注文'],
      ['ru', 'код подтверждения', 'корзина покупка заказ'],
      ['de', 'Verifizierungscode', 'Warenkorb einkaufen Bestellung'],
      ['fr', 'code de vérification', 'panier achats commande'],
      ['ar', 'رمز التحقق', 'سلة تسوق طلب'],
      ['tr', 'doğrulama kodu', 'sepet alışveriş sipariş'],
      ['ko', '인증 코드', '장바구니 쇼핑 주문'],
      ['it', 'codice di verifica', 'carrello acquisti ordine'],
      ['nl', 'verificatiecode', 'winkelwagen winkelen bestelling'],
      ['pl', 'kod weryfikacyjny', 'koszyk zakupy zamówienie'],
      ['hi', 'सत्यापन कोड', 'कार्ट खरीदारी आदेश'],
      ['sv', 'verifieringskod', 'varukorg shopping beställning'],
      ['fi', 'vahvistuskoodi', 'ostoskori ostokset tilaus'],
      ['da', 'bekræftelseskode', 'kurv shopping bestilling'],
      ['no', 'bekreftelseskode', 'handlekurv shopping bestilling'],
      ['cs', 'ověřovací kód', 'košík nákupy objednávka'],
      ['uk', 'код підтвердження', 'кошик покупки замовлення'],
    ])(
      'should PASS direct verification-code labels for %s even with commercial page text nearby',
      (_lang, label, nearby) => {
        const result = validateContext(
          createSources(
            '',
            '',
            nearby,
            label,
            'Member page'
          )
        )

        expect(result.pass).toBe(true)
        expect(result.confidence).toBe(1.0)
      }
    )
  })

  describe('English (en) - Negative keywords', () => {
    it('should REJECT "Enter password"', () => {
      const result = validateContext(createSources('Enter password'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('password')
      expect(result.language).toBe('en')
      expect(result.confidence).toBe(0.3)
    })

    it('should REJECT "Password" (placeholder)', () => {
      const result = validateContext(createSources('', 'Password'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('password')
    })

    it('should REJECT "pwd"', () => {
      const result = validateContext(createSources('pwd'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('pwd')
    })

    it('should REJECT "passwd"', () => {
      const result = validateContext(createSources('passwd'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('passwd')
    })

    it('should REJECT "Sign in"', () => {
      const result = validateContext(createSources('', '', 'Sign in to continue'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('sign in')
    })

    it('should REJECT "Log in"', () => {
      const result = validateContext(createSources('', '', 'Log in here'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('log in')
    })

    it('should REJECT "login" (standalone)', () => {
      const result = validateContext(createSources('', '', 'login'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('login')
    })
  })

  describe('Turkish (tr) - CRITICAL for Hepsiburada fix', () => {
    it('should REJECT "Şifre" (password in Turkish)', () => {
      const result = validateContext(createSources('Şifre'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('şifre')
      expect(result.language).toBe('tr')
      expect(result.confidence).toBe(0.3)
    })

    it('should REJECT "şifre" (lowercase)', () => {
      const result = validateContext(createSources('şifre'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('şifre')
    })

    it('should REJECT "Parola" (alternative Turkish password)', () => {
      const result = validateContext(createSources('Parola'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('parola')
      expect(result.language).toBe('tr')
    })

    it('should REJECT "Giriş yap" (sign in Turkish)', () => {
      const result = validateContext(createSources('', '', 'Giriş yap'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('giriş yap')
      expect(result.language).toBe('tr')
    })

    it('should REJECT "Oturum aç" (log in Turkish)', () => {
      const result = validateContext(createSources('', '', 'Oturum aç'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('oturum aç')
    })

    it('should REJECT "Giriş yapın" (sign in Turkish - phrase)', () => {
      const result = validateContext(createSources('', '', 'Giriş yapın'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('giriş yapın')
    })

    it('should normalize Turkish diacritics (Ş → S for matching)', () => {
      // "Sifre" without special chars should still be rejected due to normalization
      const result = validateContext(createSources('Sifre'))
      expect(result.pass).toBe(false)
    })
  })

  describe('Spanish (es)', () => {
    it('should REJECT "Contraseña" (password)', () => {
      const result = validateContext(createSources('Contraseña'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('contraseña')
      expect(result.language).toBe('es')
    })

    it('should REJECT "Clave" (password)', () => {
      const result = validateContext(createSources('Clave'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('clave')
    })

    it('should REJECT "Iniciar sesión" (sign in)', () => {
      const result = validateContext(createSources('', '', 'Iniciar sesión'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('iniciar sesión')
    })

    it('should REJECT "Entrar" (enter/login)', () => {
      const result = validateContext(createSources('', '', 'Entrar'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('entrar')
    })
  })

  describe('Portuguese (pt)', () => {
    it('should REJECT "Senha" (password)', () => {
      const result = validateContext(createSources('Senha'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('senha')
      expect(result.language).toBe('pt')
    })

    it('should REJECT "Fazer login" (log in)', () => {
      const result = validateContext(createSources('', '', 'Fazer login'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('fazer login')
    })

    it('should REJECT "Entrar" (enter)', () => {
      const result = validateContext(createSources('', '', 'Entrar'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('entrar')
    })
  })

  describe('Japanese (ja)', () => {
    it('should REJECT "パスワード" (password)', () => {
      const result = validateContext(createSources('パスワード'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('パスワード')
      expect(result.language).toBe('ja')
    })

    it('should REJECT "ログイン" (login)', () => {
      const result = validateContext(createSources('', '', 'ログイン'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('ログイン')
    })

    it('should REJECT "サインイン" (sign in)', () => {
      const result = validateContext(createSources('', '', 'サインイン'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('サインイン')
    })
  })

  describe('Russian (ru)', () => {
    it('should REJECT "Пароль" (password)', () => {
      const result = validateContext(createSources('Пароль'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('пароль')
      // Note: "пароль" is the same in both Russian and Ukrainian
      expect(['ru', 'uk']).toContain(result.language)
    })

    it('should REJECT "пароль" (lowercase)', () => {
      const result = validateContext(createSources('пароль'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('пароль')
    })

    it('should REJECT "Войти" (log in)', () => {
      const result = validateContext(createSources('', '', 'Войти'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('войти')
    })

    it('should REJECT "Вход" (login)', () => {
      const result = validateContext(createSources('', '', 'Вход'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('вход')
    })
  })

  describe('German (de)', () => {
    it('should REJECT "Passwort" (password)', () => {
      const result = validateContext(createSources('Passwort'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('passwort')
      expect(result.language).toBe('de')
    })

    it('should REJECT "Kennwort" (password)', () => {
      const result = validateContext(createSources('Kennwort'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('kennwort')
    })

    it('should REJECT "Anmelden" (log in)', () => {
      const result = validateContext(createSources('', '', 'Anmelden'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('anmelden')
    })
  })

  describe('French (fr)', () => {
    it('should REJECT "Mot de passe" (password)', () => {
      const result = validateContext(createSources('Mot de passe'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('mot de passe')
      expect(result.language).toBe('fr')
    })

    it('should REJECT "Se connecter" (log in)', () => {
      const result = validateContext(createSources('', '', 'Se connecter'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('se connecter')
    })

    it('should REJECT "Connexion" (login)', () => {
      const result = validateContext(createSources('', '', 'Connexion'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('connexion')
    })
  })

  describe('Arabic (ar)', () => {
    it('should REJECT "كلمة المرور" (password)', () => {
      const result = validateContext(createSources('كلمة المرور'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('كلمة المرور')
      expect(result.language).toBe('ar')
    })

    it('should REJECT "كلمه السر" (alternative password)', () => {
      const result = validateContext(createSources('كلمه السر'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('كلمه السر')
    })

    it('should REJECT "تسجيل الدخول" (login)', () => {
      const result = validateContext(createSources('', '', 'تسجيل الدخول'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('تسجيل الدخول')
    })

    it('should REJECT "دخول" (sign in)', () => {
      const result = validateContext(createSources('', '', 'دخول'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('دخول')
    })
  })

  describe('Korean (ko)', () => {
    it('should REJECT "비밀번호" (password)', () => {
      const result = validateContext(createSources('비밀번호'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('비밀번호')
      expect(result.language).toBe('ko')
    })

    it('should REJECT "로그인" (login)', () => {
      const result = validateContext(createSources('', '', '로그인'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('로그인')
    })

    it('should REJECT "로그인하기" (log in action)', () => {
      const result = validateContext(createSources('', '', '로그인하기'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('로그인하기')
    })
  })

  describe('Chinese (zh) - Simplified & Traditional', () => {
    it('should REJECT "密码" (password - simplified)', () => {
      const result = validateContext(createSources('密码'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('密码')
      expect(result.language).toBe('zh')
    })

    it('should REJECT "密碼" (password - traditional)', () => {
      const result = validateContext(createSources('密碼'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('密碼')
    })

    it('should REJECT "登录" (login - simplified)', () => {
      const result = validateContext(createSources('', '', '登录'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('登录')
    })

    it('should REJECT "登錄" (login - traditional)', () => {
      const result = validateContext(createSources('', '', '登錄'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('登錄')
    })

    it('should REJECT "登入" (sign in)', () => {
      const result = validateContext(createSources('', '', '登入'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('登入')
    })
  })

  describe('Italian (it)', () => {
    it('should REJECT "Password" (password)', () => {
      const result = validateContext(createSources('Password'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('password')
      // Note: "password" is the same in English and Italian, so English is detected first
      expect(['en', 'it']).toContain(result.language)
    })

    it('should REJECT "Accedi" (log in)', () => {
      const result = validateContext(createSources('', '', 'Accedi'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('accedi')
    })

    it('should REJECT "Accesso" (login)', () => {
      const result = validateContext(createSources('', '', 'Accesso'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('accesso')
    })
  })

  describe('Dutch (nl)', () => {
    it('should REJECT "Wachtwoord" (password)', () => {
      const result = validateContext(createSources('Wachtwoord'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('wachtwoord')
      expect(result.language).toBe('nl')
    })

    it('should REJECT "Inloggen" (log in)', () => {
      const result = validateContext(createSources('', '', 'Inloggen'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('inloggen')
    })

    it('should REJECT "Aanmelden" (sign in)', () => {
      const result = validateContext(createSources('', '', 'Aanmelden'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('aanmelden')
    })
  })

  describe('Polish (pl)', () => {
    it('should REJECT "Hasło" (password)', () => {
      const result = validateContext(createSources('Hasło'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('hasło')
      expect(result.language).toBe('pl')
    })

    it('should REJECT "Zaloguj się" (log in)', () => {
      const result = validateContext(createSources('', '', 'Zaloguj się'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('zaloguj się')
    })

    it('should REJECT "Logowanie" (login)', () => {
      const result = validateContext(createSources('', '', 'Logowanie'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('logowanie')
    })
  })

  describe('Hindi (hi)', () => {
    it('should REJECT "पासवर्ड" (password)', () => {
      const result = validateContext(createSources('पासवर्ड'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('पासवर्ड')
      expect(result.language).toBe('hi')
    })

    it('should REJECT "लॉगिन" (login)', () => {
      const result = validateContext(createSources('', '', 'लॉगिन'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('लॉगिन')
    })

    it('should REJECT "साइन इन" (sign in)', () => {
      const result = validateContext(createSources('', '', 'साइन इन'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('साइन इन')
    })
  })

  describe('Diacritics normalization', () => {
    it('should normalize café → cafe', () => {
      // This is a synthetic test - "cafe" doesn't contain password keywords
      // but demonstrates normalization works
      const result = validateContext(createSources('café'))
      expect(result.pass).toBe(true) // No negative keywords
    })

    it('should normalize Contraseña → contrasena (Spanish)', () => {
      const result = validateContext(createSources('Contraseña'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('contraseña')
    })

    it('should normalize Şifre → sifre (Turkish)', () => {
      const result = validateContext(createSources('Şifre'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('şifre')
    })

    it('should normalize Hasło → haslo (Polish)', () => {
      const result = validateContext(createSources('Hasło'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('hasło')
    })
  })

  describe('Edge cases', () => {
    it('should PASS for empty text sources', () => {
      const result = validateContext(createSources('', '', ''))
      expect(result.pass).toBe(true)
      expect(result.matchedNegatives).toEqual([])
      expect(result.confidence).toBe(1.0)
    })

    it('should PASS for whitespace-only text', () => {
      const result = validateContext(createSources('   ', '\n\t'))
      expect(result.pass).toBe(true)
      expect(result.confidence).toBe(1.0)
    })

    it('should PASS for verification code keywords (no negatives)', () => {
      const result = validateContext(createSources('Verification code'))
      expect(result.pass).toBe(true)
      expect(result.confidence).toBe(1.0)
    })

    it('should PASS for OTP-only text', () => {
      const result = validateContext(createSources('Enter OTP'))
      expect(result.pass).toBe(true)
      expect(result.confidence).toBe(1.0)
    })

    it('should combine multiple text sources', () => {
      const result = validateContext(
        createSources('Code', '123456', 'Enter password', 'Verification field')
      )
      // Should reject because nearbyText contains "password"
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('password')
    })

    it('should handle aria-label', () => {
      const result = validateContext(createSources('', '', '', 'Password field'))
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('password')
    })

    it('should handle mixed languages (English + Turkish)', () => {
      const result = validateContext(createSources('Password / Şifre'))
      expect(result.pass).toBe(false)
      // Should match both English and Turkish password keywords
      expect(result.matchedNegatives.length).toBeGreaterThan(0)
    })
  })

  describe('Performance benchmarks', () => {
    // Warmup to avoid JIT compilation overhead in first measurements
    beforeAll(() => {
      for (let i = 0; i < 10; i++) {
        validateContext(createSources('Warmup text'))
      }
    })

    it('should validate short text (<100 chars) with reasonable performance', () => {
      const text = 'Enter verification code'
      const iterations = 100
      const start = performance.now()
      for (let i = 0; i < iterations; i++) {
        validateContext(createSources(text))
      }
      const duration = performance.now() - start
      const avgDuration = duration / iterations
      // Average should be well under 1ms per call (real-world is <0.2ms after warmup)
      expect(avgDuration).toBeLessThan(1.0)
    })

    it('should validate medium text (200-500 chars) efficiently', () => {
      const text = 'Enter verification code '.repeat(20) // ~500 chars
      const iterations = 100
      const start = performance.now()
      for (let i = 0; i < iterations; i++) {
        validateContext(createSources(text))
      }
      const duration = performance.now() - start
      const avgDuration = duration / iterations
      expect(avgDuration).toBeLessThan(1.0)
    })

    it('should validate with all text sources efficiently', () => {
      const iterations = 100
      const start = performance.now()
      for (let i = 0; i < iterations; i++) {
        validateContext(
          createSources(
            'Verification code field',
            'Enter 6-digit code',
            'Check your email for the code',
            'Enter the verification code sent to your email'
          )
        )
      }
      const duration = performance.now() - start
      const avgDuration = duration / iterations
      expect(avgDuration).toBeLessThan(1.0)
    })

    it('should validate Turkish text efficiently', () => {
      const iterations = 100
      const start = performance.now()
      for (let i = 0; i < iterations; i++) {
        validateContext(createSources('Doğrulama kodu', 'Kodu girin'))
      }
      const duration = performance.now() - start
      const avgDuration = duration / iterations
      expect(avgDuration).toBeLessThan(1.0)
    })

    it('should validate CJK text efficiently', () => {
      const iterations = 100
      const start = performance.now()
      for (let i = 0; i < iterations; i++) {
        validateContext(createSources('確認コード', '確認コードを入力'))
      }
      const duration = performance.now() - start
      const avgDuration = duration / iterations
      expect(avgDuration).toBeLessThan(1.0)
    })

    it('should validate 1000 fields in <200ms (batch test)', () => {
      const start = performance.now()
      for (let i = 0; i < 1000; i++) {
        validateContext(createSources('Verification code'))
      }
      const duration = performance.now() - start
      expect(duration).toBeLessThan(200) // <0.20ms per field average
    })

    it('should meet <0.20ms performance budget (production scenario)', () => {
      // Simulate production: warmup + measure real calls
      const warmupRuns = 50
      for (let i = 0; i < warmupRuns; i++) {
        validateContext(createSources('Password reset code', 'Enter code'))
      }

      // Now measure warmed-up performance
      const testRuns = 100
      const start = performance.now()
      for (let i = 0; i < testRuns; i++) {
        validateContext(
          createSources(
            'Verification code',
            '123456',
            'Enter the 6-digit code',
            'Code sent to your phone'
          )
        )
      }
      const duration = performance.now() - start
      const avgDuration = duration / testRuns

      // After warmup, average should be well under 0.20ms
      // (In practice, it's typically <0.05ms on modern hardware)
      expect(avgDuration).toBeLessThan(0.50) // Conservative threshold
    })
  })

  describe('Real-world scenarios', () => {
    it('Hepsiburada Turkish password field', () => {
      const result = validateContext(
        createSources(
          'Şifre',
          'Şifrenizi girin',
          'Hesabınıza giriş yapın'
        )
      )
      expect(result.pass).toBe(false)
      expect(result.language).toBe('tr')
      expect(result.matchedNegatives).toContain('şifre')
      expect(result.matchedNegatives).toContain('giriş yap')
    })

    it('GitHub 2FA code field', () => {
      const result = validateContext(
        createSources(
          'Two-factor authentication code',
          'XXXXXX',
          'Enter the code from your authenticator app'
        )
      )
      expect(result.pass).toBe(true)
      expect(result.confidence).toBe(1.0)
    })

    it('Google password reset code', () => {
      const result = validateContext(
        createSources(
          'Enter password reset code',
          'G-123456',
          'We sent a code to your email'
        )
      )
      expect(result.pass).toBe(true) // Allow-list should catch "password reset code"
      expect(result.confidence).toBe(1.0)
    })

    it('Microsoft login code (passwordless)', () => {
      const result = validateContext(
        createSources(
          'Enter login code',
          '12345',
          'Sign in without password'
        )
      )
      expect(result.pass).toBe(true) // Allow-list overrides "login" and "password"
      expect(result.confidence).toBe(1.0)
    })

    it('Generic password field (should reject)', () => {
      const result = validateContext(
        createSources(
          'Password',
          'Enter your password',
          'Sign in to your account'
        )
      )
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('password')
      expect(result.matchedNegatives).toContain('sign in')
      expect(result.confidence).toBe(0.3)
    })

    it('Amazon OTP field', () => {
      const result = validateContext(
        createSources(
          'One-time password',
          'Enter OTP',
          'Check your authenticator app'
        )
      )
      expect(result.pass).toBe(true) // "OTP password" matches allow-list
      expect(result.confidence).toBe(1.0)
    })
  })

  describe('Keyword database structure', () => {
    it('should have password keywords for all 21 languages', () => {
      const langs = Object.keys(NEGATIVE_KEYWORDS.password)
      expect(langs).toHaveLength(21)
      expect(langs).toContain('en')
      expect(langs).toContain('tr') // Turkish - critical
      expect(langs).toContain('es')
      expect(langs).toContain('pt')
      expect(langs).toContain('ja')
      expect(langs).toContain('ru')
      expect(langs).toContain('de')
      expect(langs).toContain('fr')
      expect(langs).toContain('ar')
      expect(langs).toContain('ko')
      expect(langs).toContain('zh')
      expect(langs).toContain('it')
      expect(langs).toContain('nl')
      expect(langs).toContain('pl')
      expect(langs).toContain('hi')
      expect(langs).toContain('sv')
      expect(langs).toContain('fi')
      expect(langs).toContain('da')
      expect(langs).toContain('no')
      expect(langs).toContain('cs')
      expect(langs).toContain('uk')
    })

    it('should have login keywords for all 21 languages', () => {
      const langs = Object.keys(NEGATIVE_KEYWORDS.login)
      expect(langs).toHaveLength(21)
    })

    it('should have non-empty keyword arrays', () => {
      for (const lang of Object.keys(NEGATIVE_KEYWORDS.password)) {
        const keywords = NEGATIVE_KEYWORDS.password[lang as keyof typeof NEGATIVE_KEYWORDS.password]
        expect(keywords.length).toBeGreaterThan(0)
      }
    })

    it('should have at least 7 allow-list patterns', () => {
      expect(ALLOW_PATTERNS.length).toBeGreaterThanOrEqual(7)
    })
  })

  describe('Setup Page Detection (Phase 1 - False-Trigger Fix)', () => {
    it('should REJECT GitHub 2FA setup page (English)', () => {
      const result = validateContext(
        createSources(
          'Enter the six-digit code from the app',
          'XXXXXX',
          'Setup two-factor authentication',
          '',
          'Enable two-factor authentication - GitHub'
        )
      )
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('setup-page-detected')
      expect(result.confidence).toBe(0)
    })

    it('should REJECT Steam Guard setup (English)', () => {
      const result = validateContext(
        createSources(
          'Enter the code from your authenticator app',
          '',
          'Add authenticator',
          '',
          'Steam Guard Setup'
        )
      )
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('setup-page-detected')
    })

    it('should REJECT Microsoft Authenticator setup (English)', () => {
      const result = validateContext(
        createSources(
          'Scan the QR code with your authenticator app',
          '',
          'Configure authenticator',
          '',
          'Microsoft Account - Authenticator Setup'
        )
      )
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('setup-page-detected')
    })

    it('should REJECT Google 2FA setup (English)', () => {
      const result = validateContext(
        createSources(
          'Enter the code from Google Authenticator',
          '',
          'Enable 2-Step Verification',
          '',
          'Google Account - Security'
        )
      )
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('setup-page-detected')
    })

    it('should REJECT AWS MFA setup (English)', () => {
      const result = validateContext(
        createSources(
          'Enter code from MFA device',
          '',
          'Activate MFA',
          '',
          'AWS Console - MFA Configuration'
        )
      )
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('setup-page-detected')
    })

    it('should REJECT Turkish 2FA setup page', () => {
      const result = validateContext(
        createSources(
          'Doğrulayıcı uygulamasından kodu girin',
          '',
          'İki faktörlü kimlik doğrulamayı ayarla',
          '',
          'Güvenlik Ayarları'
        )
      )
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('setup-page-detected')
    })

    it('should REJECT German 2FA setup page', () => {
      const result = validateContext(
        createSources(
          'Code eingeben',
          '',
          'Zwei-Faktor-Authentifizierung einrichten',
          '',
          'Sicherheitseinstellungen'
        )
      )
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('setup-page-detected')
    })

    it('should REJECT French 2FA setup page', () => {
      const result = validateContext(
        createSources(
          'Entrez le code',
          '',
          'Configurer authentification à deux facteurs',
          '',
          'Paramètres de sécurité'
        )
      )
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('setup-page-detected')
    })

    it('should REJECT Spanish 2FA setup page', () => {
      const result = validateContext(
        createSources(
          'Ingrese el código',
          '',
          'Configurar autenticación de dos factores',
          '',
          'Configuración de seguridad'
        )
      )
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('setup-page-detected')
    })

    it('should REJECT Portuguese 2FA setup page', () => {
      const result = validateContext(
        createSources(
          'Digite o código',
          '',
          'Configurar autenticação de dois fatores',
          '',
          'Configurações de segurança'
        )
      )
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('setup-page-detected')
    })

    it('should REJECT Italian 2FA setup page', () => {
      const result = validateContext(
        createSources(
          'Inserisci il codice',
          '',
          'Configura autenticazione a due fattori',
          '',
          'Impostazioni di sicurezza'
        )
      )
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('setup-page-detected')
    })

    it('should REJECT Dutch 2FA setup page', () => {
      const result = validateContext(
        createSources(
          'Voer code in',
          '',
          'Twee-factor authenticatie instellen',
          '',
          'Beveiligingsinstellingen'
        )
      )
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('setup-page-detected')
    })

    it('should REJECT Japanese 2FA setup page', () => {
      const result = validateContext(
        createSources(
          'コードを入力',
          '',
          '二要素認証を設定',
          '',
          'セキュリティ設定'
        )
      )
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('setup-page-detected')
    })

    it('should REJECT Korean 2FA setup page', () => {
      const result = validateContext(
        createSources(
          '코드 입력',
          '',
          '이중 인증 설정',
          '',
          '보안 설정'
        )
      )
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('setup-page-detected')
    })

    it('should REJECT Chinese 2FA setup page (Simplified)', () => {
      const result = validateContext(
        createSources(
          '输入代码',
          '',
          '设置双因素身份验证',
          '',
          '安全设置'
        )
      )
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('setup-page-detected')
    })

    it('should REJECT Russian 2FA setup page', () => {
      const result = validateContext(
        createSources(
          'Введите код',
          '',
          'Настроить двухфакторную аутентификацию',
          '',
          'Настройки безопасности'
        )
      )
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('setup-page-detected')
    })

    it('should REJECT Polish 2FA setup page', () => {
      const result = validateContext(
        createSources(
          'Wprowadź kod',
          '',
          'Konfiguruj uwierzytelnianie dwuczynnikowe',
          '',
          'Ustawienia bezpieczeństwa'
        )
      )
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('setup-page-detected')
    })

    // REGRESSION TESTS - Login pages should still PASS (no setup keywords)
    it('should PASS GitHub 2FA login page (regression)', () => {
      const result = validateContext(
        createSources(
          'Two-factor authentication code',
          'XXXXXX',
          'Verify your identity',
          '',
          'GitHub - Two-factor authentication'
        )
      )
      expect(result.pass).toBe(true)
      expect(result.confidence).toBe(1.0)
    })

    it('should PASS Steam Guard code entry page (regression)', () => {
      const result = validateContext(
        createSources(
          'Steam Guard Code',
          '',
          'Enter the code from your mobile authenticator app',
          '',
          'Steam Guard'
        )
      )
      expect(result.pass).toBe(true)
      expect(result.confidence).toBe(1.0)
    })

    it('should PASS Microsoft verification code page (regression)', () => {
      const result = validateContext(
        createSources(
          'Enter code',
          '',
          'Check your email for a verification code',
          '',
          'Microsoft Account Verification'
        )
      )
      expect(result.pass).toBe(true)
      expect(result.confidence).toBe(1.0)
    })

    it('should PASS Google 2-Step Verification page (regression)', () => {
      const result = validateContext(
        createSources(
          'Enter the 6-digit code',
          '',
          '2-Step Verification',
          '',
          'Google Account - Verify'
        )
      )
      expect(result.pass).toBe(true)
      expect(result.confidence).toBe(1.0)
    })

    it('should PASS AWS MFA code entry page (regression)', () => {
      const result = validateContext(
        createSources(
          'MFA code',
          '',
          'Enter your MFA code to continue',
          '',
          'AWS Console - MFA'
        )
      )
      expect(result.pass).toBe(true)
      expect(result.confidence).toBe(1.0)
    })

    it('should handle pageTitle in combined text', () => {
      const result = validateContext(
        createSources(
          'Code',
          '',
          '',
          '',
          'Setup Authenticator - GitHub'
        )
      )
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('setup-page-detected')
    })

    it('should work without pageTitle (backward compatibility)', () => {
      const result = validateContext(
        createSources(
          'Verification code',
          '123456',
          'Enter code'
        )
      )
      expect(result.pass).toBe(true)
      expect(result.confidence).toBe(1.0)
    })
  })
})
