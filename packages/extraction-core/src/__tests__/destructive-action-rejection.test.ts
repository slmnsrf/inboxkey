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

  describe('subject-level destructive veto', () => {
    // Subject is the cleanest declaration of email intent. A
    // destructive subject vetoes every link in the email regardless
    // of how innocuous individual links look.
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

    it('rejects email with "Reset your password" subject', () => {
      const html = `
        <a href="https://app.example.com/proceed?token=abc">Continue</a>
      `
      const result = extractMagicLinks({
        html,
        subject: 'Reset your password',
      })
      expect(result).toEqual([])
    })

    it('rejects destructive subject even with link text claiming login', () => {
      const html = `
        <a href="https://app.example.com/login?token=abc">Sign in</a>
      `
      const result = extractMagicLinks({
        html,
        subject: 'Cancel subscription',
      })
      expect(result).toEqual([])
    })
  })

  describe('link-local danger context (no whole-body veto)', () => {
    // Per Codex round-4: whole-body veto was too broad. Many real
    // sign-in emails have security footers like "If this wasn't you,
    // reset your password" - those should NOT kill the magic link.
    // Per-link, before-heavy local context check + strong-login-
    // evidence override is the right precision/recall tradeoff.

    it('rejects when destructive phrase appears immediately before a generic Continue link', () => {
      const html = `
        <p>To delete your account, click below:</p>
        <a href="https://app.example.com/action?token=abc">Continue</a>
      `
      const result = extractMagicLinks({ html, subject: 'Account update' })
      expect(result).toEqual([])
    })

    it('rejects when "Reset your password" appears before generic /action?token link', () => {
      const html = `
        <p>Reset your password:</p>
        <a href="https://app.example.com/action?token=abc">Continue</a>
      `
      const result = extractMagicLinks({ html, subject: 'Account update' })
      expect(result).toEqual([])
    })

    it('rejects when "Confirm account deletion" appears before generic Continue link', () => {
      const html = `
        <p>Confirm account deletion:</p>
        <a href="https://app.example.com/action?token=abc">Continue</a>
      `
      const result = extractMagicLinks({ html, subject: 'Account update' })
      expect(result).toEqual([])
    })

    it('ACCEPTS legitimate sign-in link with security footer mentioning password reset', () => {
      // This is the round-4 false-rejection case. The footer
      // "reset your password if this wasn't you" is AFTER the magic
      // link and is just a CYA note - the email's purpose is
      // sign-in. Whole-body veto would drop it; link-local veto
      // (before-heavy + strong-evidence override) keeps it.
      const html = `
        <p>Click the link below to sign in:</p>
        <a href="https://app.example.com/auth/login?token=abc">Sign in</a>
        <p>If this wasn't you, reset your password from your account settings.</p>
      `
      const result = extractMagicLinks({ html, subject: 'Sign in to your account' })
      expect(result).toHaveLength(1)
      expect(result[0].href).toBe('https://app.example.com/auth/login?token=abc')
    })

    it('ACCEPTS sign-in link in plain text with password-reset security footer', () => {
      const text = `
        Click the link below to sign in:
        https://app.example.com/auth/login?token=abc

        If this wasn't you, you can reset your password.
      `
      const result = extractMagicLinks({ text, subject: 'Sign in' })
      expect(result).toHaveLength(1)
    })

    it('ACCEPTS magic link with support / help footer', () => {
      const html = `
        <p>Click your magic link:</p>
        <a href="https://app.example.com/auth/magic?token=abc">Magic link</a>
        <p>Need help? Contact support or visit our help center.</p>
      `
      const result = extractMagicLinks({ html, subject: 'Magic link' })
      expect(result).toHaveLength(1)
    })

    it('strong login evidence in anchor text overrides nearby reset wording', () => {
      // "Sign in" anchor + nearby "reset your password" - strong
      // text marker overrides. This handles emails that surface
      // both sign-in and password-reset options.
      const html = `
        <p>Reset your password or sign in:</p>
        <a href="https://app.example.com/x?token=abc">Sign in to your account</a>
      `
      const result = extractMagicLinks({ html, subject: 'Account access' })
      expect(result).toHaveLength(1)
    })

    it('strong login evidence in URL path overrides nearby destructive wording', () => {
      // Path /login is a strong marker; nearby "delete your account"
      // shouldn't kill the link.
      const html = `
        <p>Delete your account or click below:</p>
        <a href="https://app.example.com/login?token=abc">Continue</a>
      `
      const result = extractMagicLinks({ html, subject: 'Account access' })
      expect(result).toHaveLength(1)
    })

    it('generic "verify" / "confirm" / "continue" do NOT count as strong evidence', () => {
      // Per Codex: "verify"/"confirm"/"continue" are too broad.
      // /verify path with destructive nearby context still rejects.
      const html = `
        <p>To delete your account, verify below:</p>
        <a href="https://app.example.com/verify?token=abc">Confirm</a>
      `
      const result = extractMagicLinks({ html, subject: 'Account access' })
      expect(result).toEqual([])
    })

    it('per-anchor local context: repeated anchor text resolves correctly', () => {
      // Codex round-5 finding. Two <a>Continue</a> anchors. The first
      // sits in a safe context. After enough filler, the second sits
      // immediately after a destructive purpose statement. With the
      // pre-fix indexOf-on-normalized-text approach, BOTH anchors
      // were checked against the *first* "Continue" position - so the
      // second (destructive) anchor passed because its local context
      // looked like the first. Per-anchor HTML windowing in
      // harvestAnchors fixes this.
      const filler = '<p>Welcome back to our service. ' + 'Lorem ipsum dolor sit amet '.repeat(40) + '</p>'
      const html = `
        <p>Click your magic link:</p>
        <a href="https://app.example.com/auth/login?token=SAFE">Continue</a>
        ${filler}
        <p>To delete your account, click below:</p>
        <a href="https://app.example.com/action?token=DELETE">Continue</a>
      `
      const result = extractMagicLinks({ html, subject: 'Magic link' })
      // Only the safe link should survive. The destructive second
      // anchor must be rejected via its OWN local context, not the
      // first anchor's.
      const hrefs = result.map(r => r.href).sort()
      expect(hrefs).toEqual(['https://app.example.com/auth/login?token=SAFE'])
    })

    it('per-anchor: safe second anchor is not rejected because of dangerous first anchor context', () => {
      // Symmetrical case. Destructive first, safe second. Without
      // per-anchor windowing, BOTH would be rejected because both
      // would inherit the first anchor's dangerous neighborhood.
      const filler = '<p>' + 'Lorem ipsum dolor sit amet '.repeat(40) + '</p>'
      const html = `
        <p>To delete your account, click below:</p>
        <a href="https://app.example.com/action?token=DELETE">Continue</a>
        ${filler}
        <p>Click your magic link to sign in:</p>
        <a href="https://app.example.com/auth/login?token=SAFE">Continue</a>
      `
      const result = extractMagicLinks({ html, subject: 'Account update' })
      const hrefs = result.map(r => r.href).sort()
      // Only the second (safe) link should survive.
      expect(hrefs).toEqual(['https://app.example.com/auth/login?token=SAFE'])
    })

    it('catches destructive context behind heavy table/inline-style markup', () => {
      // Codex round-6 finding. A 1500-raw-byte window before the
      // anchor missed visually-adjacent destructive copy when email
      // markup (table wrappers, deep inline styles, MSO comments)
      // consumed the byte budget. Visible-text slicing instead of
      // raw-byte slicing fixes this.
      const heavyStyle = 'font-family:Arial,Helvetica,sans-serif;'
        + 'background-color:#f5f5f5;border-radius:6px;padding:12px 24px;'
        + 'border:1px solid #cccccc;color:#333333;font-size:14px;line-height:1.5;'
        + 'text-align:center;'.repeat(8)
      const tableWrapper = `
        <table cellpadding="0" cellspacing="0" border="0" style="${heavyStyle}">
          <tr><td style="${heavyStyle}">
            <table style="${heavyStyle}">
              <tr><td style="${heavyStyle}">
                <table style="${heavyStyle}">
                  <tr><td style="${heavyStyle}">
      `
      const tableClose = `
                  </td></tr></table>
                </td></tr></table>
              </td></tr></table>
      `
      const html = `
        <p style="${heavyStyle}">To delete your account, click below:</p>
        ${tableWrapper}
        <a href="https://app.example.com/action?token=DELETE" style="${heavyStyle}">Continue</a>
        ${tableClose}
      `

      // Sanity: confirm raw HTML between the destructive copy and the
      // anchor exceeds the prior 1500-byte window so this test
      // actually exercises the regression.
      const purposeIdx = html.indexOf('To delete')
      const anchorIdx = html.indexOf('<a href=')
      expect(anchorIdx - purposeIdx).toBeGreaterThan(1500)

      const result = extractMagicLinks({ html, subject: 'Account update' })
      expect(result).toEqual([])
    })
  })
})
