import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  isSetupPage,
  validateURL,
  SETUP_URL_PATTERNS,
  SETUP_URL_ALLOWLIST,
} from '../url-pattern-validator'

describe('url-pattern-validator', () => {
  // Store original location
  const originalLocation = window.location

  beforeEach(() => {
    // Mock window.location
    delete (window as any).location
    ;(window as any).location = { href: 'https://example.com' }
  })

  afterEach(() => {
    // Restore original location
    ;(window as any).location = originalLocation
  })

  describe('isSetupPage', () => {
    describe('Setup URL Detection', () => {
      it('detects GitHub 2FA setup page', () => {
        const result = isSetupPage(
          'https://github.com/settings/two_factor_authentication/setup/intro'
        )
        expect(result.isSetupPage).toBe(true)
        expect(result.matchedPattern).toBeDefined()
      })

      it('detects Steam Guard setup', () => {
        const result = isSetupPage(
          'https://store.steampowered.com/twofactor/setup'
        )
        expect(result.isSetupPage).toBe(true)
      })

      it('detects Microsoft 2FA setup', () => {
        const result = isSetupPage(
          'https://account.microsoft.com/security/two-factor/setup'
        )
        expect(result.isSetupPage).toBe(true)
      })

      it('detects generic /configure/ path', () => {
        const result = isSetupPage('https://example.com/account/configure/2fa')
        expect(result.isSetupPage).toBe(true)
      })

      it('detects /enable/ path', () => {
        const result = isSetupPage('https://example.com/security/enable')
        expect(result.isSetupPage).toBe(true)
      })

      it('detects /add/ path', () => {
        const result = isSetupPage('https://example.com/authenticator/add')
        expect(result.isSetupPage).toBe(true)
      })

      it('detects /enroll/ path', () => {
        const result = isSetupPage('https://example.com/mfa/enroll')
        expect(result.isSetupPage).toBe(true)
      })

      it('detects /register/ path', () => {
        const result = isSetupPage('https://example.com/2fa/register')
        expect(result.isSetupPage).toBe(true)
      })

      it('detects /settings.*2fa.*setup/ pattern', () => {
        const result = isSetupPage(
          'https://example.com/settings/account/2fa/setup'
        )
        expect(result.isSetupPage).toBe(true)
      })

      it('detects /settings.*authenticator/ pattern', () => {
        const result = isSetupPage(
          'https://example.com/settings/authenticator'
        )
        expect(result.isSetupPage).toBe(true)
      })
    })

    describe('Allowlist - Login/Verify Pages', () => {
      it('allows login pages with "setup" in domain', () => {
        const result = isSetupPage('https://setup-example.com/login')
        expect(result.isSetupPage).toBe(false)
      })

      it('allows /signin pages', () => {
        const result = isSetupPage('https://example.com/signin')
        expect(result.isSetupPage).toBe(false)
      })

      it('allows /auth/verify pages', () => {
        const result = isSetupPage('https://example.com/auth/verify')
        expect(result.isSetupPage).toBe(false)
      })

      it('allows /2fa/verify pages', () => {
        const result = isSetupPage('https://example.com/auth/2fa/verify')
        expect(result.isSetupPage).toBe(false)
      })

      it('allows /checkpoint pages', () => {
        const result = isSetupPage('https://facebook.com/checkpoint')
        expect(result.isSetupPage).toBe(false)
      })

      it('allows generic /verify pages', () => {
        const result = isSetupPage('https://example.com/verify')
        expect(result.isSetupPage).toBe(false)
      })
    })

    describe('Edge Cases', () => {
      it('handles URL without setup patterns', () => {
        const result = isSetupPage('https://example.com/dashboard')
        expect(result.isSetupPage).toBe(false)
      })

      it('handles root URL', () => {
        const result = isSetupPage('https://example.com/')
        expect(result.isSetupPage).toBe(false)
      })

      it('is case-insensitive for patterns', () => {
        const result = isSetupPage('https://example.com/SETUP/2fa')
        expect(result.isSetupPage).toBe(true)
      })

      it('prioritizes allowlist over setup patterns', () => {
        // URL contains both /setup/ and /login
        const result = isSetupPage('https://example.com/setup/login')
        expect(result.isSetupPage).toBe(false)
      })
    })
  })

  describe('validateURL', () => {
    it('returns true for non-setup pages', () => {
      ;(window as any).location.href = 'https://example.com/login'
      const result = validateURL()
      expect(result).toBe(true)
    })

    it('returns false for setup pages', () => {
      ;(window as any).location.href = 'https://example.com/setup/2fa'
      const result = validateURL()
      expect(result).toBe(false)
    })

    it('uses window.location.href by default', () => {
      ;(window as any).location.href =
        'https://github.com/settings/two_factor_authentication/setup/intro'
      const result = validateURL()
      expect(result).toBe(false)
    })
  })

  describe('Pattern Coverage', () => {
    it('exports SETUP_URL_PATTERNS with expected count', () => {
      expect(SETUP_URL_PATTERNS).toHaveLength(13)
    })

    it('exports SETUP_URL_ALLOWLIST with expected count', () => {
      expect(SETUP_URL_ALLOWLIST).toHaveLength(6)
    })

    it('all patterns are RegExp instances', () => {
      SETUP_URL_PATTERNS.forEach((pattern) => {
        expect(pattern).toBeInstanceOf(RegExp)
      })
      SETUP_URL_ALLOWLIST.forEach((pattern) => {
        expect(pattern).toBeInstanceOf(RegExp)
      })
    })
  })
})
