/**
 * Magic Link Extractor Unit Tests
 *
 * Comprehensive tests for magic link extraction with 40+ scenarios.
 */

import { describe, it, expect } from 'vitest'
import { MagicLinkExtractor } from '@/lib/extraction/link-extractor'
import type { EmailMessage } from '@/lib/providers/provider-interface'

describe('MagicLinkExtractor', () => {
  const extractor = new MagicLinkExtractor()

  const createEmail = (bodyHtml: string): EmailMessage => ({
    id: 'test-001',
    from: { email: 'test@example.com', name: 'Test Sender' },
    subject: 'Test Email',
    date: new Date('2025-10-15T10:00:00Z'),
    bodyHtml,
  })

  describe('Basic link extraction', () => {
    it('should extract HTTPS link with token parameter', () => {
      const html = '<a href="https://example.com/login?token=abc123def456">Sign In</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(1)
      expect(result[0].url).toBe('https://example.com/login?token=abc123def456')
      expect(result[0].domain).toBe('example.com')
      expect(result[0].buttonText).toBe('Sign In')
    })

    it('should not extract HTTP links', () => {
      const html = '<a href="http://example.com/login?token=abc123def456">Sign In</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(0)
    })

    it('should require token to be at least 8 characters', () => {
      const html = '<a href="https://example.com/login?token=abc">Sign In</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(0)
    })

    it('should extract link without button text', () => {
      const html = '<a href="https://example.com/verify?code=12345678"></a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(1)
      expect(result[0].buttonText).toBeUndefined()
    })
  })

  describe('Token parameter detection', () => {
    it('should detect "token" parameter', () => {
      const html = '<a href="https://example.com/auth?token=abcdefgh12345678">Login</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(1)
    })

    it('should detect "code" parameter', () => {
      const html = '<a href="https://example.com/verify?code=xyz789abc456">Verify</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(1)
    })

    it('should detect "key" parameter', () => {
      const html = '<a href="https://example.com/access?key=secret123456">Access</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(1)
    })

    it('should detect "verify" parameter', () => {
      const html = '<a href="https://example.com/confirm?verify=token123456">Confirm</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(1)
    })

    it('should detect "confirm" parameter', () => {
      const html = '<a href="https://example.com/email?confirm=hash123456789">Confirm</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(1)
    })

    it('should detect "auth" parameter', () => {
      const html = '<a href="https://example.com/login?auth=bearer12345678">Login</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(1)
    })
  })

  describe('Token in URL path', () => {
    it('should detect token-like path (20+ chars)', () => {
      const html = '<a href="https://example.com/verify/abcdef123456789012345678">Verify</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(1)
    })

    it('should not detect short paths as tokens', () => {
      const html = '<a href="https://example.com/login/abc">Login</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(0)
    })

    it('should detect long alphanumeric path segments', () => {
      const html = '<a href="https://example.com/auth/aBcDeF1234567890xyZabc">Auth</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(1)
    })
  })

  describe('Link type detection', () => {
    it('should detect login links from button text', () => {
      const html = '<a href="https://example.com/auth?token=abc12345678">Sign In</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result[0].type).toBe('login')
    })

    it('should detect login links from URL', () => {
      const html = '<a href="https://example.com/login?token=abc12345678">Click here</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result[0].type).toBe('login')
    })

    it('should detect verify links from button text', () => {
      const html = '<a href="https://example.com/auth?token=abc12345678">Verify Email</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result[0].type).toBe('verify')
    })

    it('should detect verify links from URL', () => {
      const html = '<a href="https://example.com/verify?token=abc12345678">Click</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result[0].type).toBe('verify')
    })

    it('should detect reset links from button text', () => {
      const html = '<a href="https://example.com/auth?token=abc12345678">Reset Password</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result[0].type).toBe('reset')
    })

    it('should detect reset links from URL', () => {
      const html = '<a href="https://example.com/reset-password?token=abc12345678">Click</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result[0].type).toBe('reset')
    })

    it('should return unknown for ambiguous links', () => {
      const html = '<a href="https://example.com/action?token=abc12345678">Click here</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result[0].type).toBe('unknown')
    })
  })

  describe('Excluded domains', () => {
    it('should exclude unsubscribe links', () => {
      const html = '<a href="https://example.com/unsubscribe?token=abc12345678">Unsubscribe</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(0)
    })

    it('should exclude privacy links', () => {
      const html = '<a href="https://example.com/privacy?code=abc12345678">Privacy</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(0)
    })

    it('should exclude terms links', () => {
      const html = '<a href="https://example.com/terms?token=abc12345678">Terms</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(0)
    })

    it('should exclude help links', () => {
      const html = '<a href="https://help.example.com/auth?token=abc12345678">Help</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(0)
    })

    it('should exclude support links', () => {
      const html = '<a href="https://support.example.com/login?token=abc12345678">Support</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(0)
    })

    it('should exclude FAQ links', () => {
      const html = '<a href="https://example.com/faq?token=abc12345678">FAQ</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(0)
    })

    it('should exclude about links', () => {
      const html = '<a href="https://example.com/about?token=abc12345678">About</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(0)
    })

    it('should exclude contact links', () => {
      const html = '<a href="https://example.com/contact?token=abc12345678">Contact</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(0)
    })
  })

  describe('Confidence scoring', () => {
    it('should have base confidence of 50', () => {
      const html = '<a href="https://example.com/action?token=abc12345678"></a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result[0].confidence).toBe(80) // 50 base + 30 token
    })

    it('should add 30 points for token parameter', () => {
      const html = '<a href="https://example.com/action?token=abc12345678">Action</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result[0].confidence).toBeGreaterThanOrEqual(80) // 50 + 30
    })

    it('should add 10 points for button text', () => {
      const html = '<a href="https://example.com/action?token=abc12345678">Click Here</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result[0].confidence).toBeGreaterThanOrEqual(90) // 50 + 30 + 10
    })

    it('should add 20 points for keyword in button text', () => {
      const html = '<a href="https://example.com/action?token=abc12345678">Sign In</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result[0].confidence).toBe(100) // 50 + 30 + 10 + 20, capped at 100
    })

    it('should cap confidence at 100', () => {
      const html = '<a href="https://example.com/login?token=abc12345678">Log In Now</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result[0].confidence).toBe(100)
    })
  })

  describe('Multiple links', () => {
    it('should extract multiple magic links', () => {
      const html = `
        <a href="https://example.com/login?token=token1234567890">Login</a>
        <a href="https://example.com/verify?code=code1234567890">Verify</a>
      `
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(2)
    })

    it('should sort by confidence', () => {
      const html = `
        <div><a href="https://example.com/action?token=token1234567890">Click</a></div>
        <div><a href="https://example.com/login?token=token1234567890">Sign In</a></div>
      `
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result[0].confidence).toBeGreaterThanOrEqual(result[1].confidence)
      expect(result[0].buttonText).toBe('Sign In') // Should be first
    })

    it('should filter out excluded links from multiple links', () => {
      const html = `
        <div><a href="https://example.com/login?token=token1234567890">Login</a></div>
        <div><a href="https://example.com/unsubscribe?token=unsub12345678">Unsubscribe</a></div>
      `
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(1)
      expect(result[0].buttonText).toBe('Login')
    })
  })

  describe('Edge cases', () => {
    it('should return empty array for email without HTML', () => {
      const email: EmailMessage = {
        id: 'test-001',
        from: { email: 'test@example.com' },
        subject: 'Test',
        date: new Date(),
      }
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(0)
    })

    it('should handle malformed HTML', () => {
      const html = '<a href="https://example.com/login?token=abc12345678">Login'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(1) // DOMParser should handle it
    })

    it('should handle links without href attribute', () => {
      const html = '<a>Click here</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(0)
    })

    it('should handle empty href attribute', () => {
      const html = '<a href="">Click here</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(0)
    })

    it('should handle invalid URLs', () => {
      const html = '<a href="not-a-url">Click here</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(0)
    })

    it('should handle relative URLs', () => {
      const html = '<a href="/login?token=abc12345678">Login</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(0) // Relative URLs should be rejected
    })

    it('should handle mailto links', () => {
      const html = '<a href="mailto:test@example.com?token=abc12345678">Email</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(0)
    })

    it('should handle javascript: URLs', () => {
      const html = '<a href="javascript:alert(1)">Click</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(0)
    })

    it('should trim button text', () => {
      const html = '<a href="https://example.com/login?token=abc12345678">  Sign In  </a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result[0].buttonText).toBe('Sign In')
    })

    it('should handle nested HTML in button text', () => {
      const html = '<a href="https://example.com/login?token=abc12345678"><span>Sign</span> In</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result[0].buttonText).toContain('Sign')
      expect(result[0].buttonText).toContain('In')
    })
  })

  describe('Real-world patterns', () => {
    it('should extract Medium-style login links', () => {
      const html = '<a href="https://medium.com/auth/login?token=e0221df68dff99072a073cc01ac4deca">Sign in to Medium</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('login')
      expect(result[0].confidence).toBe(100)
    })

    it('should extract Notion-style magic links', () => {
      const html = '<a href="https://www.notion.so/login?token=abc123def456789012345678">Log in to Notion</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('login')
    })

    it('should extract Vercel-style login links', () => {
      const html = '<a href="https://vercel.com/confirm?token=vtoken_abc123def456789">Verify your email</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('verify')
    })

    it('should extract password reset links', () => {
      const html = '<a href="https://example.com/reset-password?token=reset123456789">Reset your password</a>'
      const email = createEmail(html)
      const result = extractor.extractFromEmail(email)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('reset')
    })
  })
})
