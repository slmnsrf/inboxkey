/**
 * Tests for destructive-action link rejection in extractMagicLinks.
 *
 * Pre-fix: A URL like /verify-account-deletion?token=abc with anchor
 * text "Verify account deletion" scored 0.82 (base 0.30 + keyword
 * 0.18 + url-hint "verify" 0.24 + anchor:intent 0.10), passed the
 * minScore threshold (0.5), and was surfaced as a magic link. The
 * popup-cache classifier labeled it 'login' (verify pattern requires
 * /verify followed by /?#$, not /verify-...) so it appeared as a
 * normal sign-in link. A user clicking "Open" expecting a magic link
 * would land on an account-deletion confirmation page.
 *
 * Two-pronged fix:
 *  1. DANGEROUS_LINK_KEYWORDS gains destructive phrases ("delete
 *     account", "account deletion", "close account", etc.) and the
 *     check now scans both href AND anchor text - destructive links
 *     often have innocent-looking URLs with the warning only in the
 *     visible text.
 *  2. New DESTRUCTIVE_ACTION_PATH_PATTERNS rejects pathnames whose
 *     segments match destructive verbs (segment-anchored so
 *     /deleteAccountButton class names don't false-trigger).
 */

import { describe, it, expect } from 'vitest'
import { extractMagicLinks } from '../extraction/extractor.js'

describe('destructive-action link rejection', () => {
  describe('anchor text triggers rejection even with innocent URL', () => {
    it('rejects "Verify account deletion" anchor text', () => {
      const html = `
        <p>Use your magic link to confirm:</p>
        <a href="https://app.example.com/verify-account-deletion?token=abc">Verify account deletion</a>
      `
      const result = extractMagicLinks({ html, subject: 'Magic link' })
      expect(result).toEqual([])
    })

    it('rejects "Delete your account" anchor text', () => {
      const html = `
        <p>Magic link to proceed:</p>
        <a href="https://app.example.com/auth/confirm?token=abc">Delete your account</a>
      `
      const result = extractMagicLinks({ html, subject: 'Magic link' })
      expect(result).toEqual([])
    })

    it('rejects "Close your account" anchor text', () => {
      const html = `
        <p>Click your magic link:</p>
        <a href="https://app.example.com/x?token=abc">Close your account</a>
      `
      const result = extractMagicLinks({ html, subject: 'Magic link' })
      expect(result).toEqual([])
    })

    it('rejects "Cancel subscription" anchor text', () => {
      const html = `
        <p>Magic link below:</p>
        <a href="https://app.example.com/x?token=abc">Cancel subscription</a>
      `
      const result = extractMagicLinks({ html, subject: 'Magic link' })
      expect(result).toEqual([])
    })
  })

  describe('URL path triggers rejection regardless of anchor text', () => {
    const destructivePaths = [
      'https://app.example.com/verify-account-deletion?token=abc',
      'https://app.example.com/verify_account_deletion?token=abc',
      'https://app.example.com/confirm-delete-account?token=abc',
      'https://app.example.com/confirm-close-account?token=abc',
      'https://app.example.com/delete-account?token=abc',
      'https://app.example.com/close-account?token=abc',
      'https://app.example.com/cancel-account?token=abc',
      'https://app.example.com/terminate-account?token=abc',
      'https://app.example.com/remove-account?token=abc',
      'https://app.example.com/deactivate-account?token=abc',
      'https://app.example.com/account/delete?token=abc',
      'https://app.example.com/account/deletion?token=abc',
      'https://app.example.com/account/closure?token=abc',
      'https://app.example.com/account-deletion?token=abc',
      'https://app.example.com/close-subscription?token=abc',
      'https://app.example.com/cancel-subscription?token=abc',
    ]

    for (const url of destructivePaths) {
      it(`rejects ${new URL(url).pathname}`, () => {
        const html = `
          <p>Use your magic link to sign in:</p>
          <a href="${url}">Magic link</a>
        `
        const result = extractMagicLinks({ html, subject: 'Magic link' })
        expect(result).toEqual([])
      })
    }
  })

  describe('legitimate verify URLs still pass', () => {
    // These contain "verify" but are not destructive.
    const legitVerify = [
      'https://app.example.com/verify?token=abc',
      'https://app.example.com/verify/email?token=abc',
      'https://app.example.com/auth/verify?token=abc',
      'https://app.example.com/confirm?token=abc',
      'https://app.example.com/confirm/email?token=abc',
    ]

    for (const url of legitVerify) {
      it(`accepts ${new URL(url).pathname}`, () => {
        const html = `
          <p>Verify your magic link:</p>
          <a href="${url}">Verify email</a>
        `
        const result = extractMagicLinks({ html, subject: 'Magic link' })
        expect(result).toHaveLength(1)
        expect(result[0].href).toBe(url)
      })
    }
  })

  describe('lookalikes are not false-rejected', () => {
    it('does NOT reject /accountant or /deletes-not-an-action', () => {
      // "delete" without trailing -account / segment boundary etc.
      // shouldn't trigger DESTRUCTIVE_ACTION_PATH_PATTERNS.
      const html = `
        <p>Use your magic link:</p>
        <a href="https://app.example.com/accountant/login?token=abc">Magic link</a>
      `
      const result = extractMagicLinks({ html, subject: 'Magic link' })
      expect(result).toHaveLength(1)
    })
  })

  describe('/confirm-account-delete (verb after account)', () => {
    // Codex round-3 finding: confirm-account-deletion (noun) was
    // covered, confirm-account-delete (verb) was not, so the URL
    // /confirm-account-delete?token=abc passed extraction.
    it('rejects /confirm-account-delete', () => {
      const html = `
        <p>Magic link:</p>
        <a href="https://app.example.com/confirm-account-delete?token=abc">Magic link</a>
      `
      const result = extractMagicLinks({ html, subject: 'Magic link' })
      expect(result).toEqual([])
    })

    it('rejects /verify-account-close', () => {
      const html = `
        <p>Magic link:</p>
        <a href="https://app.example.com/verify-account-close?token=abc">Magic link</a>
      `
      const result = extractMagicLinks({ html, subject: 'Magic link' })
      expect(result).toEqual([])
    })

    it('rejects /confirm-account-cancel', () => {
      const html = `
        <p>Magic link:</p>
        <a href="https://app.example.com/confirm-account-cancel?token=abc">Magic link</a>
      `
      const result = extractMagicLinks({ html, subject: 'Magic link' })
      expect(result).toEqual([])
    })
  })

  describe('whole-email body context veto', () => {
    // Codex round-3 finding: a generic /action?token= URL with a
    // generic "Continue" anchor passes per-link checks (no danger
    // markers in href or anchor text), but the surrounding email
    // body says "Reset your password" or "Confirm account deletion".
    // Per-link checks fundamentally can't catch this; the danger
    // lives in the body context. New HARD_DANGER_BODY_KEYWORDS
    // veto rejects the whole email at the gate.
    it('rejects email with "Reset your password" body and generic Continue link', () => {
      const html = `
        <p>Reset your password:</p>
        <a href="https://app.example.com/action?token=abc">Continue</a>
      `
      const result = extractMagicLinks({ html, subject: 'Account update' })
      expect(result).toEqual([])
    })

    it('rejects email with "Confirm account deletion" subject', () => {
      const html = `
        <p>To proceed, click the link below:</p>
        <a href="https://app.example.com/proceed?token=abc">Continue</a>
      `
      const result = extractMagicLinks({
        html,
        subject: 'Confirm account deletion',
      })
      expect(result).toEqual([])
    })

    it('rejects email with "Cancel subscription" body', () => {
      const html = `
        <p>To cancel subscription, click below:</p>
        <a href="https://app.example.com/proceed?token=abc">Continue</a>
      `
      const result = extractMagicLinks({ html, subject: 'Subscription update' })
      expect(result).toEqual([])
    })

    it('rejects email with "delete your account" in body', () => {
      const html = `
        <p>You requested to delete your account. Click below to proceed:</p>
        <a href="https://app.example.com/proceed?token=abc">Continue</a>
      `
      const result = extractMagicLinks({ html, subject: 'Account update' })
      expect(result).toEqual([])
    })

    it('does NOT reject a clean magic-link email mentioning "support"', () => {
      // "support" is in DANGEROUS_LINK_KEYWORDS but NOT in
      // HARD_DANGER_BODY_KEYWORDS - body mention shouldn't kill the
      // whole email. Per-link "support" check still applies if a URL
      // points at /support directly.
      const html = `
        <p>Use this link to sign in. If you didn't request this, contact support.</p>
        <a href="https://app.example.com/auth/magic?token=abc">Magic link</a>
      `
      const result = extractMagicLinks({ html, subject: 'Magic link' })
      expect(result).toHaveLength(1)
    })
  })
})
