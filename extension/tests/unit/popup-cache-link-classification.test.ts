/**
 * Tests for classifyLinkType - the popup-cache helper that decides
 * whether a magic-link URL should be labeled login / verify / reset.
 *
 * The pre-PR predecessor used substring search (`url.includes('/password')`)
 * which mis-classified valid passwordless URLs:
 *
 *   /passwordless/login?token=...   => 'reset'  (matched substring '/password')
 *   /resetting-quotas?...            => 'reset'  (matched substring '/reset')
 *   /verify-account-deletion?...     => 'verify' (substring '/verify' on a destructive flow)
 *
 * Reset misclassification is load-bearing: HIDDEN_LINK_TYPES = ['reset']
 * means the popup hides the link entirely. After expanding magic-link
 * keywords to cover passwordless flows, dropping those wins because of
 * a substring collision was the actual outcome - this test pins the
 * behavior so the substring approach can't sneak back.
 */

import { describe, it, expect } from 'vitest'
import { classifyLinkType } from '@/background/popup-cache'

describe('classifyLinkType', () => {
  describe('login (default)', () => {
    const loginCases = [
      'https://app.example.com/login?token=abc',
      'https://app.example.com/auth/magic?token=abc',
      'https://app.example.com/auth/login?token=abc',
      'https://app.example.com/sign-in?token=abc',
      'https://app.example.com/continue?session=xyz',
    ]
    for (const url of loginCases) {
      it(`classifies ${new URL(url).pathname} as login`, () => {
        expect(classifyLinkType(url)).toBe('login')
      })
    }
  })

  describe('passwordless URLs are NOT misclassified as reset', () => {
    // The headline regression. Pre-fix, these all returned 'reset'
    // because of url.includes('/password').
    const passwordlessCases = [
      'https://app.example.com/passwordless/login?token=abc',
      'https://app.example.com/auth/passwordless?token=abc',
      'https://app.example.com/passwordless?token=abc',
      'https://api.example.com/v1/auth/passwordless/start?token=abc',
    ]
    for (const url of passwordlessCases) {
      it(`classifies ${new URL(url).pathname} as login (not reset)`, () => {
        expect(classifyLinkType(url)).toBe('login')
      })
    }
  })

  describe('verify', () => {
    const verifyCases = [
      'https://app.example.com/verify?token=abc',
      'https://app.example.com/verify/email?token=abc',
      'https://app.example.com/auth/verify?token=abc',
      'https://app.example.com/confirm?token=abc',
      'https://app.example.com/confirm/email?token=abc',
    ]
    for (const url of verifyCases) {
      it(`classifies ${new URL(url).pathname} as verify`, () => {
        expect(classifyLinkType(url)).toBe('verify')
      })
    }

    it('does NOT classify /verify-account-deletion as verify (segment boundary)', () => {
      // /verify followed by other path chars must not match.
      expect(
        classifyLinkType('https://app.example.com/verify-account-deletion?token=abc'),
      ).toBe('login')
    })
  })

  describe('reset', () => {
    const resetCases = [
      'https://app.example.com/reset?token=abc',
      'https://app.example.com/reset/password?token=abc',
      'https://app.example.com/forgot?token=abc',
      'https://app.example.com/forgot-password?token=abc',
      'https://app.example.com/recover?token=abc',
      'https://app.example.com/password-reset?token=abc',
      'https://app.example.com/account-recovery?token=abc',
    ]
    for (const url of resetCases) {
      it(`classifies ${new URL(url).pathname} as reset`, () => {
        expect(classifyLinkType(url)).toBe('reset')
      })
    }

    it('does NOT classify /resetting-quotas as reset (segment boundary)', () => {
      expect(
        classifyLinkType('https://app.example.com/resetting-quotas?id=abc'),
      ).toBe('login')
    })

    it('does NOT classify /password-strength-meter as reset', () => {
      expect(
        classifyLinkType('https://app.example.com/password-strength-meter'),
      ).toBe('login')
    })
  })

  describe('malformed input', () => {
    it('returns login for unparseable URL', () => {
      expect(classifyLinkType('not a url')).toBe('login')
      expect(classifyLinkType('')).toBe('login')
    })
  })
})
