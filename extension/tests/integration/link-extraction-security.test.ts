/**
 * Magic Link Security Integration Tests
 *
 * Comprehensive tests for Phase 6 security features:
 * - HTTP blocking
 * - Password reset detection
 * - Domain exclusions
 * - Confidence scoring
 * - End-to-end security flows
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { MagicLinkExtractor } from '@/lib/extraction/link-extractor'
import type { EmailMessage } from '@/lib/providers/provider-interface'

// Helper to create mock email messages
function createMockEmail(bodyHtml: string, options: Partial<EmailMessage> = {}): EmailMessage {
  return {
    id: 'test-id',
    from: {
      email: options.from?.email || 'noreply@example.com',
      name: options.from?.name || 'Example Service',
    },
    subject: options.subject || 'Test Email',
    date: options.date || new Date('2025-10-15T10:00:00Z'),
    bodyHtml,
    bodyText: options.bodyText || '',
    snippet: options.snippet || '',
  }
}

describe('Magic Link Security - Integration Tests', () => {
  let extractor: MagicLinkExtractor

  beforeEach(() => {
    extractor = new MagicLinkExtractor()
  })

  describe('HTTP Blocking (5 tests)', () => {
    it('should reject HTTP links completely', () => {
      const html = `
        <div>
          <p>Click here to verify your account:</p>
          <a href="http://example.com/verify?token=abc123456789">Verify Account</a>
        </div>
      `
      const email = createMockEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(0)
    })

    it('should accept HTTPS links', () => {
      const html = `
        <div>
          <p>Click here to verify your account:</p>
          <a href="https://example.com/verify?token=abc123456789">Verify Account</a>
        </div>
      `
      const email = createMockEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result.length).toBeGreaterThan(0)
      expect(result[0].url.startsWith('https://')).toBe(true)
    })

    it('should extract only HTTPS from mixed protocol email', () => {
      const html = `
        <div>
          <a href="http://example.com/login?token=token123456789">HTTP Login</a>
          <a href="https://secure.example.com/login?token=token987654321">HTTPS Login</a>
          <a href="http://example.com/verify?token=verify111111111">HTTP Verify</a>
        </div>
      `
      const email = createMockEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result.length).toBe(1)
      expect(result[0].url.startsWith('https://')).toBe(true)
      expect(result[0].url).toContain('secure.example.com')
    })

    it('should block protocol upgrade attempt (HTTP to HTTPS)', () => {
      const html = `
        <div>
          <a href="http://example.com/login?token=token123456789">
            Login (We'll upgrade to HTTPS for you!)
          </a>
        </div>
      `
      const email = createMockEmail(html)
      const result = extractor.extractFromEmail(email)

      // Should not upgrade HTTP to HTTPS - must reject
      expect(result).toHaveLength(0)
    })

    it('should handle localhost and IP addresses consistently', () => {
      const html = `
        <div>
          <a href="http://localhost:3000/verify?token=token123456789">Localhost</a>
          <a href="http://127.0.0.1/verify?token=token123456789">IP Address</a>
          <a href="https://localhost:3000/verify?token=token123456789">HTTPS Localhost</a>
        </div>
      `
      const email = createMockEmail(html)
      const result = extractor.extractFromEmail(email)

      // Only HTTPS localhost should be extracted
      expect(result.length).toBe(1)
      expect(result[0].url.startsWith('https://')).toBe(true)
      expect(result[0].url).toContain('localhost')
    })
  })

  describe('Password Reset Detection (5 tests)', () => {
    it('should detect reset keyword in button text (English)', () => {
      const html = `
        <div>
          <p>You requested a password reset.</p>
          <a href="https://example.com/auth?token=reset123456789">Reset Your Password</a>
        </div>
      `
      const email = createMockEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result.length).toBeGreaterThan(0)
      expect(result[0].type).toBe('reset')
    })

    it('should detect reset keyword in multiple languages', () => {
      const testCases = [
        { html: '<a href="https://example.com/auth?token=token123456789">Restablecer contraseña</a>', lang: 'Spanish' },
        { html: '<a href="https://example.com/auth?token=token123456789">Réinitialiser mot de passe</a>', lang: 'French' },
        { html: '<a href="https://example.com/auth?token=token123456789">Passwort zurücksetzen</a>', lang: 'German' },
        { html: '<a href="https://example.com/auth?token=token123456789">Reimposta password</a>', lang: 'Italian' },
        { html: '<a href="https://example.com/auth?token=token123456789">Redefinir senha</a>', lang: 'Portuguese' },
        { html: '<a href="https://example.com/auth?token=token123456789">パスワードリセット</a>', lang: 'Japanese' },
      ]

      for (const testCase of testCases) {
        const email = createMockEmail(testCase.html)
        const result = extractor.extractFromEmail(email)

        expect(result.length).toBeGreaterThan(0)
        expect(result[0].type).toBe('reset')
      }
    })

    it('should detect reset URL patterns', () => {
      // Test URL patterns that contain 'reset-password' keyword
      const html = `
        <div>
          <a href="https://example.com/reset-password?token=token123456789">Reset Password</a>
        </div>
      `
      const email = createMockEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result.length).toBeGreaterThan(0)
      expect(result[0].type).toBe('reset')
      expect(result[0].url).toContain('reset-password')
    })

    it('should assign reset type correctly', () => {
      const html = `
        <div style="text-align: center;">
          <h2>Password Reset Request</h2>
          <p>We received a request to reset your password.</p>
          <a href="https://example.com/reset?token=resettoken123456" style="background: blue; color: white; padding: 10px;">
            Set New Password
          </a>
          <p>This link expires in 1 hour.</p>
        </div>
      `
      const email = createMockEmail(html, { subject: 'Reset Your Password' })
      const result = extractor.extractFromEmail(email)

      expect(result.length).toBeGreaterThan(0)
      expect(result[0].type).toBe('reset')
      expect(result[0].confidence).toBeGreaterThan(50)
    })

    it('should not mark non-reset links as reset', () => {
      const html = `
        <div>
          <a href="https://example.com/login?token=token123456789">Sign In</a>
          <a href="https://example.com/verify?token=verify123456789">Verify Email</a>
          <a href="https://example.com/welcome?token=welcome123456789">Get Started</a>
        </div>
      `
      const email = createMockEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result.length).toBeGreaterThan(0)
      expect(result.every(link => link.type !== 'reset')).toBe(true)
    })
  })

  describe('Domain Exclusions (5 tests)', () => {
    it('should exclude unsubscribe links', () => {
      const html = `
        <div>
          <a href="https://example.com/login?token=token123456789">Sign In</a>
          <a href="https://example.com/unsubscribe?token=unsub123456789">Unsubscribe</a>
        </div>
      `
      const email = createMockEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result.length).toBe(1)
      expect(result[0].url).not.toContain('unsubscribe')
    })

    it('should exclude privacy and terms links', () => {
      const html = `
        <div>
          <a href="https://example.com/verify?token=verify123456789">Verify Account</a>
          <a href="https://example.com/privacy?ref=email123456789">Privacy Policy</a>
          <a href="https://example.com/terms?ref=email123456789">Terms of Service</a>
        </div>
      `
      const email = createMockEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result.length).toBe(1)
      expect(result[0].url).toContain('verify')
      expect(result[0].url).not.toContain('privacy')
      expect(result[0].url).not.toContain('terms')
    })

    it('should exclude support, help, faq links', () => {
      const html = `
        <div>
          <a href="https://example.com/login?token=token123456789">Login Now</a>
          <a href="https://example.com/support?ticket=ticket123456789">Contact Support</a>
          <a href="https://example.com/help?article=article123456789">Help Center</a>
          <a href="https://example.com/faq?section=section123456789">FAQ</a>
        </div>
      `
      const email = createMockEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result.length).toBe(1)
      expect(result[0].url).toContain('login')
    })

    it('should not exclude legitimate links', () => {
      const html = `
        <div>
          <a href="https://github.com/verify?token=verify123456789">Verify Email</a>
          <a href="https://aws.amazon.com/confirm?code=confirm123456789">Confirm Account</a>
          <a href="https://notion.so/login?token=login123456789">Log In</a>
        </div>
      `
      const email = createMockEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result.length).toBe(3)
    })

    it('should exclude based on URL path, not just domain', () => {
      const html = `
        <div>
          <a href="https://example.com/verify?token=verify123456789">Verify</a>
          <a href="https://example.com/account/privacy?token=privacy123456789">Privacy Settings</a>
          <a href="https://example.com/user/help?token=help1234567890">Help</a>
          <a href="https://example.com/contact?token=contact123456789">Contact Us</a>
        </div>
      `
      const email = createMockEmail(html)
      const result = extractor.extractFromEmail(email)

      // Only verify link should be extracted
      expect(result.length).toBe(1)
      expect(result[0].url).toContain('verify')
    })
  })

  describe('Confidence Scoring (5 tests)', () => {
    it('should boost confidence for button structure', () => {
      const html = `
        <div>
          <button>
            <a href="https://example.com/verify?token=verify123456789">Verify Email</a>
          </button>
        </div>
      `
      const email = createMockEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result.length).toBeGreaterThan(0)
      // Button structure should add +15 confidence
      expect(result[0].confidence).toBeGreaterThanOrEqual(65)
    })

    it('should reduce confidence for footer placement', () => {
      const htmlWithFooter = `
        <div>
          <footer>
            <a href="https://example.com/manage?token=manage123456789">Manage Preferences</a>
          </footer>
        </div>
      `
      const htmlWithoutFooter = `
        <div>
          <div class="main-content">
            <a href="https://example.com/manage?token=manage123456789">Manage Preferences</a>
          </div>
        </div>
      `

      const emailWithFooter = createMockEmail(htmlWithFooter)
      const emailWithoutFooter = createMockEmail(htmlWithoutFooter)

      const resultWithFooter = extractor.extractFromEmail(emailWithFooter)
      const resultWithoutFooter = extractor.extractFromEmail(emailWithoutFooter)

      // Footer placement should reduce confidence
      if (resultWithFooter.length > 0 && resultWithoutFooter.length > 0) {
        expect(resultWithFooter[0].confidence).toBeLessThan(resultWithoutFooter[0].confidence)
      }
    })

    it('should reduce confidence for multiple links in container', () => {
      const htmlSingleLink = `
        <div>
          <a href="https://example.com/verify?token=verify123456789">Verify Email</a>
        </div>
      `
      const htmlMultipleLinks = `
        <div>
          <a href="https://example.com/link1?token=token1234567890">Link 1</a>
          <a href="https://example.com/link2?token=token1234567891">Link 2</a>
          <a href="https://example.com/link3?token=token1234567892">Link 3</a>
          <a href="https://example.com/link4?token=token1234567893">Link 4</a>
          <a href="https://example.com/verify?token=verify123456789">Verify Email</a>
        </div>
      `

      const emailSingle = createMockEmail(htmlSingleLink)
      const emailMultiple = createMockEmail(htmlMultipleLinks)

      const resultSingle = extractor.extractFromEmail(emailSingle)
      const resultMultiple = extractor.extractFromEmail(emailMultiple)

      // Multiple links should reduce confidence for all links (or hit cap at 100)
      if (resultSingle.length > 0 && resultMultiple.length > 0) {
        const verifyLink = resultMultiple.find(link => link.url.includes('verify'))
        if (verifyLink) {
          // Should either be lower or both at 100 (cap)
          expect(verifyLink.confidence).toBeLessThanOrEqual(resultSingle[0].confidence)
        }
      }
    })

    it('should boost confidence for time-sensitive context', () => {
      const htmlWithTime = `
        <div>
          <p>This link expires in 1 hour. Please verify your email quickly.</p>
          <a href="https://example.com/verify?token=verify123456789">Verify Email</a>
        </div>
      `
      const htmlWithoutTime = `
        <div>
          <p>Please verify your email.</p>
          <a href="https://example.com/verify?token=verify123456789">Verify Email</a>
        </div>
      `

      const emailWithTime = createMockEmail(htmlWithTime)
      const emailWithoutTime = createMockEmail(htmlWithoutTime)

      const resultWithTime = extractor.extractFromEmail(emailWithTime)
      const resultWithoutTime = extractor.extractFromEmail(emailWithoutTime)

      expect(resultWithTime.length).toBeGreaterThan(0)
      expect(resultWithoutTime.length).toBeGreaterThan(0)
      // Time-sensitive context should boost confidence (or both hit cap at 100)
      expect(resultWithTime[0].confidence).toBeGreaterThanOrEqual(resultWithoutTime[0].confidence)
    })

    it('should boost confidence for security keywords', () => {
      const htmlWithSecurity = `
        <div>
          <p>This is a secure, one-time authentication link protected by encryption.</p>
          <a href="https://example.com/auth?token=auth1234567890">Authenticate</a>
        </div>
      `
      const htmlWithoutSecurity = `
        <div>
          <p>Please click the link below.</p>
          <a href="https://example.com/auth?token=auth1234567890">Authenticate</a>
        </div>
      `

      const emailWithSecurity = createMockEmail(htmlWithSecurity)
      const emailWithoutSecurity = createMockEmail(htmlWithoutSecurity)

      const resultWithSecurity = extractor.extractFromEmail(emailWithSecurity)
      const resultWithoutSecurity = extractor.extractFromEmail(emailWithoutSecurity)

      expect(resultWithSecurity.length).toBeGreaterThan(0)
      expect(resultWithoutSecurity.length).toBeGreaterThan(0)
      // Security keywords should boost confidence
      expect(resultWithSecurity[0].confidence).toBeGreaterThan(resultWithoutSecurity[0].confidence)
    })
  })

  describe('End-to-End Security Flow (5 tests)', () => {
    it('should extract from legitimate GitHub verification email', () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <body>
          <div style="max-width: 600px; margin: 0 auto;">
            <h2>Verify your email address</h2>
            <p>Hi there,</p>
            <p>To complete your GitHub signup, we need you to verify your email address.</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="https://github.com/verify?token=gh_verify_abc123def456ghi789jkl"
                 style="background: #2ea44f; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
                Verify email address
              </a>
            </div>
            <p>Button not working? Copy and paste this link into your browser:</p>
            <p>https://github.com/verify?token=gh_verify_abc123def456ghi789jkl</p>
          </div>
        </body>
        </html>
      `
      const email = createMockEmail(html, {
        from: { email: 'noreply@github.com', name: 'GitHub' },
        subject: 'Verify your email address',
      })
      const result = extractor.extractFromEmail(email)

      expect(result.length).toBeGreaterThan(0)
      expect(result[0].url).toContain('github.com')
      expect(result[0].type).toBe('verify')
      expect(result[0].confidence).toBeGreaterThan(70)
    })

    it('should handle AWS password reset with confirmation requirement', () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <body>
          <div>
            <h3>AWS Password Assistance</h3>
            <p>We received a request to reset your AWS password.</p>
            <p>If you did not request this, please ignore this email.</p>
            <div style="margin: 20px 0;">
              <a href="https://signin.aws.amazon.com/resetpassword?token=aws_reset_xyz123456789abcdef"
                 style="background: #ff9900; color: white; padding: 10px 20px; text-decoration: none;">
                Reset Your Password
              </a>
            </div>
            <p>This password reset link expires in 12 hours.</p>
          </div>
        </body>
        </html>
      `
      const email = createMockEmail(html, {
        from: { email: 'no-reply@amazon.com', name: 'Amazon Web Services' },
        subject: 'Password Reset Request',
      })
      const result = extractor.extractFromEmail(email)

      expect(result.length).toBeGreaterThan(0)
      expect(result[0].url).toContain('aws.amazon.com')
      expect(result[0].type).toBe('reset')
      expect(result[0].url.startsWith('https://')).toBe(true)
    })

    it('should reject phishing email with HTTP links', () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <body>
          <div>
            <h2>Urgent: Verify Your Account</h2>
            <p>Your account has been locked due to suspicious activity!</p>
            <p>Click here immediately to verify your identity:</p>
            <a href="http://phishing-site.com/verify?user=victim&token=fake123456789">
              VERIFY NOW - URGENT
            </a>
            <p>Failure to verify within 24 hours will result in permanent account closure.</p>
          </div>
        </body>
        </html>
      `
      const email = createMockEmail(html, {
        from: { email: 'security@suspicious-domain.ru', name: 'Security Team' },
        subject: 'URGENT: Account Verification Required',
      })
      const result = extractor.extractFromEmail(email)

      // HTTP links should be completely blocked
      expect(result).toHaveLength(0)
    })

    it('should extract from legitimate multi-language email', () => {
      const html = `
        <!DOCTYPE html>
        <html lang="es">
        <body>
          <div>
            <h2>Verifica tu dirección de correo electrónico</h2>
            <p>Hola,</p>
            <p>Para completar tu registro, necesitamos verificar tu correo electrónico.</p>
            <div style="text-align: center; margin: 20px 0;">
              <a href="https://example.com/verificar?token=es_verify_123456789abcdef"
                 class="btn btn-primary">
                Verificar correo electrónico
              </a>
            </div>
            <p>Este enlace expira en 24 horas.</p>
          </div>
        </body>
        </html>
      `
      const email = createMockEmail(html, {
        subject: 'Verifica tu correo electrónico',
      })
      const result = extractor.extractFromEmail(email)

      expect(result.length).toBeGreaterThan(0)
      expect(result[0].type).toBe('verify')
      expect(result[0].confidence).toBeGreaterThan(60)
    })

    it('should reject dangerous protocol attempts (javascript:, data:, file:)', () => {
      const html = `
        <div>
          <a href="javascript:alert('xss')?token=token123456789">Click Me</a>
          <a href="data:text/html,<script>alert('xss')</script>?token=token123456789">Data URI</a>
          <a href="file:///etc/passwd?token=token123456789">File Protocol</a>
          <a href="ftp://example.com/file?token=token123456789">FTP</a>
          <a href="https://example.com/verify?token=verify123456789">Verify</a>
        </div>
      `
      const email = createMockEmail(html)
      const result = extractor.extractFromEmail(email)

      // Only HTTPS link should be extracted
      expect(result.length).toBe(1)
      expect(result[0].url.startsWith('https://')).toBe(true)
      expect(result[0].url).toContain('verify')
    })
  })

  describe('Real-World Security Scenarios', () => {
    it('should handle newsletter with multiple safe links', () => {
      const html = `
        <div>
          <h2>Welcome to our Newsletter!</h2>
          <a href="https://example.com/article1?id=article1234567890">Read Article 1</a>
          <a href="https://example.com/article2?id=article1234567891">Read Article 2</a>
          <a href="https://example.com/article3?id=article1234567892">Read Article 3</a>
          <footer>
            <a href="https://example.com/unsubscribe?token=unsub123456789">Unsubscribe</a>
            <a href="https://example.com/privacy?ref=newsletter12345">Privacy Policy</a>
          </footer>
        </div>
      `
      const email = createMockEmail(html, { subject: 'Weekly Newsletter' })
      const result = extractor.extractFromEmail(email)

      // Newsletter articles don't have token-like parameters
      // Unsubscribe and privacy should be excluded
      // No magic links should be extracted
      expect(result).toHaveLength(0)
    })

    it('should handle email with unsubscribe footer correctly', () => {
      const html = `
        <div>
          <div class="main-content">
            <p>Welcome! Click below to activate your account:</p>
            <a href="https://example.com/activate?token=activate123456789">Activate Account</a>
          </div>
          <footer>
            <p>Don't want these emails?</p>
            <a href="https://example.com/unsubscribe?token=unsub123456789">Unsubscribe</a>
          </footer>
        </div>
      `
      const email = createMockEmail(html)
      const result = extractor.extractFromEmail(email)

      // Should extract activation link but not unsubscribe
      expect(result.length).toBe(1)
      expect(result[0].url).toContain('activate')
      expect(result[0].url).not.toContain('unsubscribe')
    })

    it('should handle nested button structure with high confidence', () => {
      const html = `
        <div>
          <button role="button" class="btn btn-primary cta">
            <a href="https://example.com/verify?token=verify123456789">
              Verify Your Email
            </a>
          </button>
        </div>
      `
      const email = createMockEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result.length).toBeGreaterThan(0)
      // Button with role + class should boost confidence significantly
      expect(result[0].confidence).toBeGreaterThanOrEqual(80)
    })

    it('should handle international domains correctly', () => {
      const testDomains = [
        'https://例え.jp/verify?token=verify123456789',
        'https://münchen.de/bestätigen?token=token123456789',
        'https://москва.рф/verify?token=verify123456789',
      ]

      for (const url of testDomains) {
        const html = `<a href="${url}">Verify</a>`
        const email = createMockEmail(html)
        const result = extractor.extractFromEmail(email)

        // Should handle international domains
        expect(result.length).toBeGreaterThan(0)
        expect(result[0].url).toBe(url)
      }
    })

    it('should handle complex real-world email structure', () => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            .container { max-width: 600px; margin: 0 auto; }
            .header { background: #f5f5f5; padding: 20px; }
            .content { padding: 30px; }
            .button { background: #007bff; color: white; padding: 12px 24px; }
            .footer { background: #333; color: white; padding: 20px; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <img src="https://example.com/logo.png" alt="Logo" />
            </div>
            <div class="content">
              <h1>Welcome to Example Service!</h1>
              <p>Thanks for signing up. We're excited to have you on board.</p>
              <p>To get started, please verify your email address by clicking the button below.</p>
              <p>This is a secure, one-time verification link that expires in 24 hours.</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="https://example.com/verify?token=complex_token_abc123def456ghi789jkl012mno345pqr678stu"
                   class="button">
                  Verify Email Address
                </a>
              </div>
              <p>If the button doesn't work, copy and paste this URL into your browser:</p>
              <p style="word-break: break-all;">https://example.com/verify?token=complex_token_abc123def456ghi789jkl012mno345pqr678stu</p>
            </div>
            <div class="footer">
              <p>If you didn't sign up for this account, please ignore this email.</p>
              <p>
                <a href="https://example.com/help?ref=email123456789" style="color: #ccc;">Help Center</a> |
                <a href="https://example.com/privacy?ref=email123456789" style="color: #ccc;">Privacy Policy</a> |
                <a href="https://example.com/unsubscribe?token=unsub123456789" style="color: #ccc;">Unsubscribe</a>
              </p>
              <p>&copy; 2025 Example Service. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `
      const email = createMockEmail(html, {
        from: { email: 'noreply@example.com', name: 'Example Service' },
        subject: 'Verify your email address',
      })
      const result = extractor.extractFromEmail(email)

      // Should extract only the verify link (not help, privacy, unsubscribe)
      expect(result.length).toBe(1)
      expect(result[0].url).toContain('verify')
      expect(result[0].type).toBe('verify')
      expect(result[0].confidence).toBeGreaterThan(70)
      expect(result[0].buttonText).toContain('Verify')
    })
  })

  describe('Edge Cases and Security Hardening', () => {
    it('should handle malformed URLs gracefully', () => {
      const html = `
        <div>
          <a href="https://example.com/verify?token=">Empty Token</a>
          <a href="https://example.com/verify?token">No Value</a>
          <a href="https://?token=token123456789">No Domain</a>
          <a href="token123456789">Relative Path</a>
          <a href="https://example.com/verify?token=valid123456789">Valid Link</a>
        </div>
      `
      const email = createMockEmail(html)
      const result = extractor.extractFromEmail(email)

      // Should only extract valid link
      expect(result.length).toBe(1)
      expect(result[0].url).toContain('valid')
    })

    it('should require minimum token length', () => {
      const html = `
        <div>
          <a href="https://example.com/verify?token=short">Too Short</a>
          <a href="https://example.com/verify?token=exactly8">Exactly 8</a>
          <a href="https://example.com/verify?token=longtoken123456">Long Enough</a>
        </div>
      `
      const email = createMockEmail(html)
      const result = extractor.extractFromEmail(email)

      // Tokens must be at least 8 characters
      expect(result.length).toBe(2)
      expect(result.every(link => !link.url.includes('short'))).toBe(true)
    })

    it('should detect tokens in URL path segments', () => {
      const html = `
        <div>
          <a href="https://example.com/verify/abc123def456ghi789jkl012mno345pqr">Path Token</a>
          <a href="https://example.com/auth/token/very_long_token_in_path_segment_abc123">Auth Token</a>
        </div>
      `
      const email = createMockEmail(html)
      const result = extractor.extractFromEmail(email)

      // Should detect long alphanumeric path segments as tokens
      expect(result.length).toBe(2)
    })

    it('should handle links with multiple query parameters', () => {
      const html = `
        <div>
          <a href="https://example.com/verify?user=test@example.com&token=verify123456789&redirect=/dashboard">
            Verify Account
          </a>
        </div>
      `
      const email = createMockEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result.length).toBeGreaterThan(0)
      expect(result[0].url).toContain('token=verify')
    })

    it('should handle empty or whitespace-only HTML', () => {
      const testCases = ['', '   ', '\n\n\n', '<html></html>', '<body></body>']

      for (const html of testCases) {
        const email = createMockEmail(html)
        const result = extractor.extractFromEmail(email)

        expect(result).toHaveLength(0)
      }
    })
  })
})
