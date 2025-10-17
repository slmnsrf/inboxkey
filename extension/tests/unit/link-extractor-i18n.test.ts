/**
 * Magic Link Extractor Internationalization Tests
 *
 * Tests multi-language keyword detection for magic links across 7 supported languages.
 */

import { describe, it, expect } from 'vitest'
import { MagicLinkExtractor } from '@/lib/extraction/link-extractor'
import type { EmailMessage } from '@/lib/providers/provider-interface'

describe('MagicLinkExtractor - Internationalization', () => {
  const extractor = new MagicLinkExtractor()

  const createEmail = (bodyHtml: string): EmailMessage => ({
    id: 'test-i18n-001',
    from: { email: 'test@example.com', name: 'Test Sender' },
    subject: 'Test Email',
    date: new Date('2025-10-15T10:00:00Z'),
    bodyHtml,
  })

  describe('Spanish (es) keyword detection', () => {
    it('should detect Spanish login link - "Iniciar sesión"', () => {
      const html = '<a href="https://example.com/auth?token=abc123def456">Iniciar sesión</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('login')
      expect(result[0].confidence).toBeGreaterThan(70)
    })

    it('should detect Spanish login link - "Inicia sesión"', () => {
      const html = '<a href="https://example.com/auth?token=abc123def456">Inicia sesión</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('login')
      expect(result[0].confidence).toBeGreaterThan(70)
    })

    it('should detect Spanish verify link - "Verificar correo"', () => {
      const html = '<a href="https://example.com/auth?token=abc123def456">Verificar correo</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('verify')
      expect(result[0].confidence).toBeGreaterThan(70)
    })

    it('should detect Spanish reset link - "Restablecer contraseña"', () => {
      const html = '<a href="https://example.com/auth?token=abc123def456">Restablecer contraseña</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('reset')
      expect(result[0].confidence).toBeGreaterThan(70)
    })
  })

  describe('French (fr) keyword detection', () => {
    it('should detect French login link - "Se connecter"', () => {
      const html = '<a href="https://example.com/auth?token=abc123def456">Se connecter</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('login')
      expect(result[0].confidence).toBeGreaterThan(70)
    })

    it('should detect French verify link - "Vérifier email"', () => {
      const html = '<a href="https://example.com/auth?token=abc123def456">Vérifier email</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('verify')
      expect(result[0].confidence).toBeGreaterThan(70)
    })

    it('should detect French reset link - "Réinitialiser mot de passe"', () => {
      const html = '<a href="https://example.com/auth?token=abc123def456">Réinitialiser mot de passe</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('reset')
      expect(result[0].confidence).toBeGreaterThan(70)
    })
  })

  describe('German (de) keyword detection', () => {
    it('should detect German login link - "Anmelden"', () => {
      const html = '<a href="https://example.com/auth?token=abc123def456">Anmelden</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('login')
      expect(result[0].confidence).toBeGreaterThan(70)
    })

    it('should detect German verify link - "Email bestätigen"', () => {
      const html = '<a href="https://example.com/auth?token=abc123def456">Email bestätigen</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('verify')
      expect(result[0].confidence).toBeGreaterThan(70)
    })

    it('should detect German reset link - "Passwort zurücksetzen"', () => {
      const html = '<a href="https://example.com/auth?token=abc123def456">Passwort zurücksetzen</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('reset')
      expect(result[0].confidence).toBeGreaterThan(70)
    })
  })

  describe('Italian (it) keyword detection', () => {
    it('should detect Italian login link - "Accedi"', () => {
      const html = '<a href="https://example.com/auth?token=abc123def456">Accedi</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('login')
      expect(result[0].confidence).toBeGreaterThan(70)
    })

    it('should detect Italian verify link - "Verifica email"', () => {
      const html = '<a href="https://example.com/auth?token=abc123def456">Verifica email</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('verify')
      expect(result[0].confidence).toBeGreaterThan(70)
    })

    it('should detect Italian reset link - "Reimposta password"', () => {
      const html = '<a href="https://example.com/auth?token=abc123def456">Reimposta password</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('reset')
      expect(result[0].confidence).toBeGreaterThan(70)
    })
  })

  describe('Portuguese (pt) keyword detection', () => {
    it('should detect Portuguese login link - "Entrar"', () => {
      const html = '<a href="https://example.com/auth?token=abc123def456">Entrar</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('login')
      expect(result[0].confidence).toBeGreaterThan(70)
    })

    it('should detect Portuguese verify link - "Verificar email"', () => {
      const html = '<a href="https://example.com/auth?token=abc123def456">Verificar email</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('verify')
      expect(result[0].confidence).toBeGreaterThan(70)
    })

    it('should detect Portuguese reset link - "Redefinir senha"', () => {
      const html = '<a href="https://example.com/auth?token=abc123def456">Redefinir senha</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('reset')
      expect(result[0].confidence).toBeGreaterThan(70)
    })
  })

  describe('Japanese (ja) keyword detection', () => {
    it('should detect Japanese login link - "ログイン"', () => {
      const html = '<a href="https://example.com/auth?token=abc123def456">ログイン</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('login')
      expect(result[0].confidence).toBeGreaterThan(70)
    })

    it('should detect Japanese verify link - "メール確認"', () => {
      const html = '<a href="https://example.com/auth?token=abc123def456">メール確認</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('verify')
      expect(result[0].confidence).toBeGreaterThan(70)
    })

    it('should detect Japanese reset link - "パスワードリセット"', () => {
      const html = '<a href="https://example.com/auth?token=abc123def456">パスワードリセット</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('reset')
      expect(result[0].confidence).toBeGreaterThan(70)
    })
  })

  describe('Mixed language scenarios', () => {
    it('should detect link with mixed English and Spanish', () => {
      const html = '<a href="https://example.com/auth?token=abc123def456">Sign in - Iniciar sesión</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('login')
      expect(result[0].confidence).toBeGreaterThan(70)
    })

    it('should handle multiple links with different languages', () => {
      const html = `
        <p><a href="https://example.com/login?token=token1234567890">Iniciar sesión</a></p>
        <p><a href="https://example.com/verify?code=code1234567890">Vérifier email</a></p>
        <p><a href="https://example.com/reset?token=reset1234567890">Passwort zurücksetzen</a></p>
      `
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(3)

      // Check that we have at least one of each type
      const loginLink = result.find(r => r.buttonText?.includes('Iniciar'))
      const verifyLink = result.find(r => r.buttonText?.includes('Vérifier'))
      const resetLink = result.find(r => r.buttonText?.includes('Passwort'))

      expect(loginLink?.type).toBe('login')
      expect(verifyLink?.type).toBe('verify')
      expect(resetLink?.type).toBe('reset')
    })
  })

  describe('Case insensitivity', () => {
    it('should detect Spanish link regardless of case', () => {
      const html = '<a href="https://example.com/auth?token=abc123def456">INICIAR SESIÓN</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('login')
    })

    it('should detect German link regardless of case', () => {
      const html = '<a href="https://example.com/auth?token=abc123def456">ANMELDEN</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('login')
    })
  })

  describe('Confidence scoring across languages', () => {
    it('should give equal confidence to English and Spanish keywords', () => {
      const htmlEn = '<a href="https://example.com/auth?token=abc123def456">Sign In</a>'
      const htmlEs = '<a href="https://example.com/auth?token=abc123def456">Iniciar sesión</a>'

      const resultEn = extractor.extractFromEmail(createEmail(htmlEn))
      const resultEs = extractor.extractFromEmail(createEmail(htmlEs))

      expect(resultEn[0].confidence).toBe(resultEs[0].confidence)
    })

    it('should give equal confidence to French and German keywords', () => {
      const htmlFr = '<a href="https://example.com/auth?token=abc123def456">Se connecter</a>'
      const htmlDe = '<a href="https://example.com/auth?token=abc123def456">Anmelden</a>'

      const resultFr = extractor.extractFromEmail(createEmail(htmlFr))
      const resultDe = extractor.extractFromEmail(createEmail(htmlDe))

      expect(resultFr[0].confidence).toBe(resultDe[0].confidence)
    })

    it('should give equal confidence to Japanese and Portuguese keywords', () => {
      const htmlJa = '<a href="https://example.com/auth?token=abc123def456">ログイン</a>'
      const htmlPt = '<a href="https://example.com/auth?token=abc123def456">Entrar</a>'

      const resultJa = extractor.extractFromEmail(createEmail(htmlJa))
      const resultPt = extractor.extractFromEmail(createEmail(htmlPt))

      expect(resultJa[0].confidence).toBe(resultPt[0].confidence)
    })
  })

  describe('URL patterns with international keywords', () => {
    it('should detect login link even without keyword match in URL', () => {
      const html = '<a href="https://example.com/auth?token=abc123def456">Iniciar sesión</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('login')
    })

    it('should still recognize English URL patterns with non-English button text', () => {
      const html = '<a href="https://example.com/login?token=abc123def456">Einloggen</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('login')
    })
  })
})
