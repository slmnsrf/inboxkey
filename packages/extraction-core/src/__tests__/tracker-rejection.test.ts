/**
 * Tests for ESP click-tracker URL rejection in magic-link extraction.
 *
 * The extractor must never surface a tracker URL as a "magic link" -
 * the tracker's 302 lands the user on the real destination but the
 * popup would show them an unexpected redirector hostname (and leak
 * a click event before the user even decided to follow the link).
 */

import { describe, it, expect } from 'vitest'
import { extractMagicLinks, isTrackerUrl } from '../extraction/extractor.js'

describe('isTrackerUrl', () => {
  describe('hostname-based detection', () => {
    const trackerHosts = [
      'https://dxxRf404.na2.hubspotlinks.com/Ctc/JB+113/abc',
      'https://list.us9.list-manage.com/track/click?u=xyz',
      'https://email.mandrillapp.com/track/click/abc',
      'https://example.us-east-1.sendgrid.net/wf/click?upn=abc',
      'https://email.mailgun.org/c/eJxyz',
      'https://px.sparkpostmail.com/q/abc',
      'https://r.brevo.com/tr/cl/abc',
      'https://email.sendinblue.com/c/abc',
      'https://go.mktomail.com/r/abc',
      'https://nl.pardot.com/e/abc/123',
      'https://cl.s10.exct.net/?qs=abc',
      'https://399c056d.click.convertkit-mail4.com/abc',
      'https://r1.cmail19.com/t/r-abc',
      'https://email.createsend.com/t/r-abc',
      'https://links.iterable.com/u/click?_t=abc',
      'https://trk.klaviyomail.com/ls/click?upn=abc',
      'https://track.customeriomail.com/track/abc',
      'https://send.aweber.com/url.cgi?u=abc',
      'https://example.activehosted.com/click.php',
      'https://link.beehiiv.net/c/abc',
      'https://click.example.com/redirect?id=xyz',
      'https://clicks.example.com/r/abc',
      'https://track.example.com/abc',
      'https://tracking.example.com/abc',
    ]

    for (const url of trackerHosts) {
      it(`rejects ${new URL(url).hostname}`, () => {
        expect(isTrackerUrl(url)).toBe(true)
      })
    }
  })

  describe('path-based detection (HubSpot under brand subdomain)', () => {
    const trackerPaths = [
      'https://e.deepgram.com/e3t/Ctc/5D+113/cQMRG04/abc',
      'https://e.langchain.dev/Ctc/JB+113/dxxRf40/abc',
      'https://email.example.com/CL0/https%3A%2F%2Fexample.com/abc',
      'https://app.example.com/wf/click?upn=abc',
      'https://app.example.com/ls/click?upn=abc',
      'https://r.example.com/c/abcdefgh',
      'https://r.example.com/r/abcdefgh',
      'https://send.example.com/track/abc',
      'https://x.example.com/redirect?to=abc',
      'https://x.example.com/redir?to=abc',
    ]

    for (const url of trackerPaths) {
      it(`rejects ${new URL(url).pathname.split('/').slice(0, 3).join('/')}`, () => {
        expect(isTrackerUrl(url)).toBe(true)
      })
    }
  })

  describe('embedded-destination query detection', () => {
    it('rejects ?u= with raw HTTPS destination', () => {
      expect(
        isTrackerUrl('https://shortener.example/x?u=https://real-magic.com/auth')
      ).toBe(true)
    })

    it('rejects ?url= with percent-encoded destination', () => {
      expect(
        isTrackerUrl('https://shortener.example/x?url=https%3A%2F%2Freal-magic.com%2Fauth')
      ).toBe(true)
    })

    it('rejects ?redirect=, ?goto=, ?to=, ?destination=', () => {
      expect(isTrackerUrl('https://x.example/r?redirect=https://target.com/a')).toBe(true)
      expect(isTrackerUrl('https://x.example/r?goto=https://target.com/a')).toBe(true)
      expect(isTrackerUrl('https://x.example/r?to=https://target.com/a')).toBe(true)
      expect(isTrackerUrl('https://x.example/r?destination=https://target.com/a')).toBe(true)
    })

    it('does not reject ?u= when value is not an http(s) URL', () => {
      // Some sites use ?u=<user-id> or ?u=<utm-source-name>; only embedded
      // URL values count.
      expect(isTrackerUrl('https://example.com/page?u=user123')).toBe(false)
      expect(isTrackerUrl('https://example.com/page?u=newsletter_jan')).toBe(false)
    })
  })

  describe('legitimate magic-link URLs are not flagged', () => {
    const legit = [
      'https://github.com/login?token=abc123',
      'https://accounts.google.com/o/oauth2/v2/auth?client_id=x',
      'https://auth0.example.com/u/login?state=xyz',
      'https://app.notion.so/magic-link?token=abc',
      'https://supabase.co/dashboard/sign-in?token=xyz',
      'https://app.example.com/verify?token=abc',
      'https://example.com/auth/magic?token=abc',
      'https://login.example.com/continue?session=xyz',
    ]

    for (const url of legit) {
      it(`accepts ${url}`, () => {
        expect(isTrackerUrl(url)).toBe(false)
      })
    }
  })

  describe('malformed input', () => {
    it('returns false for non-URL strings', () => {
      expect(isTrackerUrl('not a url')).toBe(false)
      expect(isTrackerUrl('')).toBe(false)
    })
  })
})

describe('extractMagicLinks tracker rejection', () => {
  it('drops anchor pointing to a known tracker host', () => {
    const html = `
      <p>Click below to use your magic link:</p>
      <a href="https://abc123.click.convertkit-mail4.com/p/xyz">Magic link</a>
    `
    const result = extractMagicLinks({ html, subject: 'Your magic link' })
    expect(result).toEqual([])
  })

  it('drops anchor matching HubSpot path under brand subdomain', () => {
    const html = `
      <p>Use your magic link:</p>
      <a href="https://e.deepgram.com/e3t/Ctc/abc/VVNRkn3Cjz4j">Sign in</a>
    `
    const result = extractMagicLinks({ html, subject: 'Magic link' })
    expect(result).toEqual([])
  })

  it('drops anchor with embedded-destination query', () => {
    const html = `
      <a href="https://shortener.example/click?u=https%3A%2F%2Freal-magic.com%2Fauth">Login link</a>
    `
    const result = extractMagicLinks({ html, subject: 'Your login link' })
    expect(result).toEqual([])
  })

  it('keeps the direct destination when both tracker and direct URL appear', () => {
    // The most important case: an email with a tracker anchor AND a
    // plain-text fallback to the real destination. Pre-fix, the
    // tracker outscored the direct URL (anchor:intent bonus). Post-fix,
    // the tracker is dropped and the direct URL is the only candidate.
    const html = `
      <p>Your magic link:</p>
      <a href="https://abc.click.convertkit-mail4.com/p/xyz">Magic link</a>
    `
    const text = `
      Your magic link:
      https://app.example.com/auth/magic?token=abc123
    `
    const result = extractMagicLinks({ html, text, subject: 'Magic link' })
    expect(result).toHaveLength(1)
    expect(result[0].href).toBe('https://app.example.com/auth/magic?token=abc123')
    expect(result[0].domain).toBe('app.example.com')
  })

  it('keeps a legitimate magic-link anchor that is not a tracker', () => {
    const html = `
      <p>Click your magic link:</p>
      <a href="https://app.example.com/login?token=abc123">Magic link</a>
    `
    const result = extractMagicLinks({ html, subject: 'Magic link' })
    expect(result).toHaveLength(1)
    expect(result[0].domain).toBe('app.example.com')
  })
})
