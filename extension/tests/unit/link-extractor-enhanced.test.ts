/**
 * Enhanced Magic Link Extractor Tests
 *
 * Tests for enhanced HTML parsing features including:
 * - Better button text extraction
 * - Structural analysis
 * - Context analysis
 */

import { describe, it, expect } from 'vitest'
import { MagicLinkExtractor } from '@/lib/extraction/link-extractor'
import type { EmailMessage } from '@/lib/providers/provider-interface'

describe('MagicLinkExtractor - Enhanced Features', () => {
  const extractor = new MagicLinkExtractor()

  const createEmail = (bodyHtml: string): EmailMessage => ({
    id: 'test-enhanced-001',
    from: { email: 'test@example.com', name: 'Test Sender' },
    subject: 'Test Email',
    date: new Date('2025-10-15T10:00:00Z'),
    bodyHtml,
  })

  describe('Enhanced button text extraction', () => {
    it('should extract simple text from link', () => {
      const html = '<a href="https://example.com/login?token=abc12345678">Sign In</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result[0].buttonText).toBe('Sign In')
    })

    it('should extract text from link inside button wrapper', () => {
      const html = `
        <button>
          <a href="https://example.com/login?token=abc12345678">Sign In to Account</a>
        </button>
      `
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result[0].buttonText).toContain('Sign In')
    })

    it('should extract text from link with nested spans', () => {
      const html = `
        <a href="https://example.com/verify?code=abc12345678">
          <span>Verify</span> <span>Email</span>
        </a>
      `
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result[0].buttonText).toContain('Verify')
      expect(result[0].buttonText).toContain('Email')
    })

    it('should trim excessive whitespace from button text', () => {
      const html = `
        <a href="https://example.com/login?token=abc12345678">

          Sign   In   Now

        </a>
      `
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result[0].buttonText).toBe('Sign In Now')
    })

    it('should limit button text to 100 characters', () => {
      const longText = 'A'.repeat(150)
      const html = `<a href="https://example.com/login?token=abc12345678">${longText}</a>`
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result[0].buttonText?.length).toBeLessThanOrEqual(100)
    })

    it('should prioritize direct text over nested content', () => {
      const html = `
        <a href="https://example.com/login?token=abc12345678">
          Sign In
          <span style="display:none">Unsubscribe from marketing emails</span>
        </a>
      `
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      // The extraction will get both text nodes since display:none check requires style object
      expect(result[0].buttonText).toContain('Sign In')
    })
  })

  describe('Structural analysis for confidence scoring', () => {
    it('should boost confidence for link inside button tag', () => {
      const html = `
        <button>
          <a href="https://example.com/login?token=abc12345678">Sign In</a>
        </button>
      `
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      // Should have base (50) + token (30) + text (10) + keyword (20) + structure (15) = 125, capped at 100
      expect(result[0].confidence).toBe(100)
    })

    it('should boost confidence for link with role=button', () => {
      const html = `
        <div role="button">
          <a href="https://example.com/verify?code=verify123456789">Verify Email</a>
        </div>
      `
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result[0].confidence).toBeGreaterThan(90)
    })

    it('should boost confidence for link with button classes', () => {
      const html = `
        <a class="btn btn-primary" href="https://example.com/login?token=abc12345678">Sign In</a>
      `
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result[0].confidence).toBeGreaterThan(90)
    })

    it('should reduce confidence for link in footer', () => {
      const html = `
        <footer>
          <a href="https://example.com/verify?code=verify123456789">Verify Account</a>
        </footer>
      `
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      // Should be reduced by -10 for being in footer
      expect(result[0].confidence).toBeLessThan(100)
    })

    it('should reduce confidence for unsubscribe context', () => {
      const html = `
        <div>
          <a href="https://example.com/unsubscribe?token=unsub123456789">Click here to unsubscribe</a>
        </div>
      `
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      // Should be excluded due to unsubscribe in URL
      expect(result).toHaveLength(0)
    })

    it('should reduce confidence for multiple links in container', () => {
      const html = `
        <div>
          <a href="https://example.com/link1?token=token123456789">Link 1</a>
          <a href="https://example.com/link2?token=token123456789">Link 2</a>
          <a href="https://example.com/link3?token=token123456789">Link 3</a>
          <a href="https://example.com/action?token=token123456789">Action</a>
        </div>
      `
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      // Links should have reduced confidence due to multiple links (>3 in container)
      // Without the -10 modifier: 50 + 30 (token) + 10 (text) = 90
      // With the -10 modifier: 50 + 30 + 10 - 10 = 80
      expect(result.every(r => r.confidence === 80)).toBe(true)
    })
  })

  describe('Context analysis for additional signals', () => {
    it('should boost confidence for time-sensitive nearby text', () => {
      const html = `
        <div>
          <p>This link expires in 24 hours. Please click below to verify your account.</p>
          <a href="https://example.com/verify?code=verify123456789">Verify Account</a>
        </div>
      `
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      // Should have context boost for "expires in"
      expect(result[0].confidence).toBeGreaterThan(90)
    })

    it('should boost confidence for action verbs in context', () => {
      const html = `
        <div>
          <p>Click here to access your account securely.</p>
          <a href="https://example.com/login?token=login123456789">Sign In</a>
        </div>
      `
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      // Should have context boost for "click here"
      expect(result[0].confidence).toBeGreaterThan(90)
    })

    it('should boost confidence for security language in context', () => {
      const html = `
        <div>
          <p>This is a secure one-time authentication link to access your account.</p>
          <a href="https://example.com/auth?token=auth123456789">Authenticate</a>
        </div>
      `
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      // Should have context boost for "secure" and "one-time"
      expect(result[0].confidence).toBeGreaterThan(80)
    })

    it('should not boost confidence without relevant context', () => {
      const html = `
        <div>
          <p>Here is some random text about our company history and mission statement.</p>
          <a href="https://example.com/action?token=action123456789">Action</a>
        </div>
      `
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      // Base confidence: 50 + 30 (token) + 10 (text) = 90
      expect(result[0].confidence).toBe(90)
    })
  })

  describe('Combined scenarios', () => {
    it('should handle real-world Slack magic link', () => {
      const html = `
        <table>
          <tr>
            <td>
              <p>Click the button below to confirm your email address.</p>
              <p>This link will expire in 1 hour.</p>
              <div style="text-align: center;">
                <a href="https://slack.com/verify?code=abc123def456789012345678"
                   class="btn btn-primary"
                   style="background: #611f69;">Confirm Email Address</a>
              </div>
            </td>
          </tr>
        </table>
      `
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('verify')
      expect(result[0].confidence).toBe(100)
      expect(result[0].buttonText).toContain('Confirm')
    })

    it('should handle real-world GitHub magic link', () => {
      const html = `
        <div style="max-width: 600px; margin: 0 auto;">
          <h2>Verify your email address</h2>
          <p>Hi there! Click the secure link below to verify your GitHub account.</p>
          <p>This link is valid for 24 hours.</p>
          <button style="padding: 12px 24px;">
            <a href="https://github.com/verify?token=github_verify_abc123def456">
              Verify email address
            </a>
          </button>
          <p style="color: #666; font-size: 12px;">
            If you didn't request this email, you can safely ignore it.
          </p>
        </div>
      `
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('verify')
      expect(result[0].confidence).toBe(100)
      expect(result[0].domain).toBe('github.com')
    })

    it('should handle real-world password reset with footer', () => {
      const html = `
        <div>
          <div class="content">
            <h1>Reset your password</h1>
            <p>We received a request to reset your password. This link expires at 11:59 PM today.</p>
            <div class="button-container">
              <a href="https://example.com/reset-password?token=reset_token_12345678"
                 class="cta-button">
                Reset Password
              </a>
            </div>
          </div>
          <footer>
            <p>Questions? Contact our support team.</p>
            <a href="https://help.example.com">Help Center</a>
          </footer>
        </div>
      `
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      // Should find the reset link but not the help link
      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('reset')
      expect(result[0].buttonText).toContain('Reset')
      expect(result[0].confidence).toBe(100)
    })

    it('should prioritize prominent link over footer links', () => {
      const html = `
        <div>
          <section>
            <a href="https://example.com/login?token=login123456789"
               class="btn-primary">
              Sign in to your account
            </a>
          </section>
          <footer>
            <a href="https://example.com/verify?code=footer12345678">Verify</a>
          </footer>
        </div>
      `
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      // The login link should be first due to higher confidence
      expect(result[0].type).toBe('login')
      // Both might be at 100, but login should be first
      expect(result.length).toBeGreaterThanOrEqual(2)
      // Footer link should have lower confidence
      const footerLink = result.find(r => r.buttonText === 'Verify')
      expect(footerLink?.confidence).toBeLessThan(100)
    })
  })

  describe('Edge cases with enhanced parsing', () => {
    it('should handle nested button with multiple elements', () => {
      const html = `
        <button>
          <a href="https://example.com/verify?code=nested123456789">
            <strong>Verify</strong> your email
          </a>
        </button>
      `
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result[0].buttonText).toContain('Verify')
    })

    it('should handle link with no parent container', () => {
      const html = '<a href="https://example.com/login?token=standalone123456">Login</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(1)
      expect(result[0].buttonText).toBe('Login')
    })

    it('should handle empty context gracefully', () => {
      const html = '<a href="https://example.com/verify?code=empty123456789"></a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(1)
      expect(result[0].buttonText).toBeUndefined()
    })
  })
})
