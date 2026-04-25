/**
 * Audit tests for popup-dedup.normalizeUrl in the magic-link
 * collision case.
 *
 * normalizeUrl strips all query params except an allowlist (token,
 * code, verify, session, key, id) before hashing for dedup. Magic
 * links almost always carry their secret in `token`, so two distinct
 * magic links to the same path with different tokens MUST normalize
 * to different keys - otherwise dedupeByKey collapses them and we
 * silently drop one.
 *
 * After PR 1, the magic-link extraction throughput is much higher
 * (gate softening admits emails the old gate dropped). This test
 * locks in the dedup contract so a future tightening can't
 * silently re-introduce the collision.
 */

import { describe, it, expect } from 'vitest'
import { normalizeUrl, makeDedupKey, dedupeByKey } from '@/lib/popup/popup-dedup'
import type { LinkItem } from '@/shared/popup-messages'

const link = (overrides: Partial<LinkItem> = {}): LinkItem => ({
  kind: 'link',
  id: 'l',
  providerId: 'gmail',
  source: 'noreply@example.com - Magic link',
  receivedAt: 1_700_000_000_000,
  score: 0.7,
  url: 'https://app.example.com/auth/magic?token=abc',
  linkType: 'login',
  httpsOnly: true,
  domain: 'app.example.com',
  ...overrides,
})

describe('normalizeUrl: distinct magic-link tokens never collide', () => {
  it('two URLs with different token values normalize differently', () => {
    const a = normalizeUrl('https://app.example.com/auth/magic?token=AAA')
    const b = normalizeUrl('https://app.example.com/auth/magic?token=BBB')
    expect(a).not.toBe(b)
  })

  it('drops utm_* but keeps token at full fidelity', () => {
    const withUtm = normalizeUrl(
      'https://app.example.com/auth/magic?token=ABC123&utm_source=email&utm_campaign=jan',
    )
    const withoutUtm = normalizeUrl(
      'https://app.example.com/auth/magic?token=ABC123',
    )
    expect(withUtm).toBe(withoutUtm)
    expect(withUtm).toContain('token=ABC123')
  })

  it('preserves token differences even when utm_* differs', () => {
    const a = normalizeUrl(
      'https://app.example.com/auth/magic?token=AAA&utm_source=email',
    )
    const b = normalizeUrl(
      'https://app.example.com/auth/magic?token=BBB&utm_source=email',
    )
    expect(a).not.toBe(b)
  })

  it('preserves both code and token if both are present', () => {
    const url = normalizeUrl(
      'https://app.example.com/verify?code=123&token=secret',
    )
    expect(url).toContain('code=123')
    expect(url).toContain('token=secret')
  })

  it('different paths normalize differently even with the same token', () => {
    const a = normalizeUrl('https://app.example.com/auth/magic?token=X')
    const b = normalizeUrl('https://app.example.com/auth/verify?token=X')
    expect(a).not.toBe(b)
  })

  it('different hosts normalize differently even with the same path/token', () => {
    const a = normalizeUrl('https://app1.example.com/auth?token=X')
    const b = normalizeUrl('https://app2.example.com/auth?token=X')
    expect(a).not.toBe(b)
  })

  describe('extended provider param coverage', () => {
    // Each pair must normalize differently - distinct secret values
    // for the same provider param.
    const providerCases: Array<[string, string, string]> = [
      ['token_hash', 'aaa', 'bbb'],            // Supabase
      ['oobCode', 'aaa', 'bbb'],               // Firebase (mixed case)
      ['auth_token', 'aaa', 'bbb'],            // Auth0 / Stytch
      ['login_token', 'aaa', 'bbb'],           // custom flows
      ['access_token', 'aaa', 'bbb'],          // OAuth implicit
      ['magic_token', 'aaa', 'bbb'],           // Stytch / Magic.link
      ['ticket', 'st-aaa', 'st-bbb'],          // CAS / SAML
      ['state', 'aaa', 'bbb'],                 // OAuth state
      ['t', 'aaa', 'bbb'],                     // shorthand
      ['sig', 'aaa', 'bbb'],                   // signed-URL flows
    ]

    for (const [param, valueA, valueB] of providerCases) {
      it(`${param}=AAA vs ${param}=BBB normalize differently`, () => {
        const a = normalizeUrl(`https://app.example.com/auth/magic?${param}=${valueA}`)
        const b = normalizeUrl(`https://app.example.com/auth/magic?${param}=${valueB}`)
        expect(a).not.toBe(b)
      })
    }

    it('oobCode (Firebase mixed case) is recognized regardless of case', () => {
      // Firebase actually emits "oobCode" with mixed case in the wild.
      // Token allowlist must match case-insensitively so its values
      // are preserved at full fidelity.
      const a = normalizeUrl('https://app.example.com/__/auth/action?oobCode=AAA&mode=signIn')
      const b = normalizeUrl('https://app.example.com/__/auth/action?oobCode=BBB&mode=signIn')
      expect(a).not.toBe(b)
      expect(a).toContain('oobcode=AAA')
      // mode= is not in the allowlist - dropped
      expect(a).not.toContain('mode=')
    })
  })

  describe('URL fragment tokens (OAuth implicit flow / Firebase action links)', () => {
    it('distinct #access_token values normalize differently', () => {
      const a = normalizeUrl('https://app.example.com/callback#access_token=AAA')
      const b = normalizeUrl('https://app.example.com/callback#access_token=BBB')
      expect(a).not.toBe(b)
    })

    it('same #access_token value collapses (intended dedup)', () => {
      const a = normalizeUrl('https://app.example.com/callback#access_token=ABC&token_type=Bearer')
      const b = normalizeUrl('https://app.example.com/callback#access_token=ABC&token_type=bearer')
      // token_type isn't in the allowlist; only access_token contributes
      expect(a).toBe(b)
    })

    it('preserves both query and fragment tokens when present', () => {
      const url = normalizeUrl(
        'https://app.example.com/callback?state=xyz#access_token=secret',
      )
      expect(url).toContain('state=xyz')
      expect(url).toContain('access_token=secret')
      expect(url).toContain('#')
      expect(url).toContain('?')
    })

    it('fragment-only token still distinguishes links', () => {
      const a = normalizeUrl('https://app.example.com/cb#token=AAA')
      const b = normalizeUrl('https://app.example.com/cb#token=BBB')
      const same = normalizeUrl('https://app.example.com/cb#token=AAA')
      expect(a).not.toBe(b)
      expect(a).toBe(same)
    })

    it('empty fragment is ignored gracefully', () => {
      const noFragment = normalizeUrl('https://app.example.com/cb?token=A')
      const emptyFragment = normalizeUrl('https://app.example.com/cb?token=A#')
      expect(noFragment).toBe(emptyFragment)
    })
  })

  describe('SPA hash router fragments', () => {
    // Codex round-3 finding: feeding the whole hash to URLSearchParams
    // turns "#/auth/callback?access_token=A" into a single key named
    // "/auth/callback?access_token". Distinct hash-router magic links
    // collapsed silently. Strip the leading hash-path before the first
    // ? so the actual params are recovered.
    it('distinct hash-router #/path?access_token values normalize differently', () => {
      const a = normalizeUrl('https://app.example.com/#/auth/callback?access_token=AAA')
      const b = normalizeUrl('https://app.example.com/#/auth/callback?access_token=BBB')
      expect(a).not.toBe(b)
    })

    it('same hash-router access_token collapses (intended)', () => {
      const a = normalizeUrl('https://app.example.com/#/auth/callback?access_token=ABC&utm=email1')
      const b = normalizeUrl('https://app.example.com/#/auth/callback?access_token=ABC&utm=email2')
      expect(a).toBe(b)
    })

    it('hash-bang router (#!/path?token=X) is also handled', () => {
      const a = normalizeUrl('https://app.example.com/#!/auth?token=AAA')
      const b = normalizeUrl('https://app.example.com/#!/auth?token=BBB')
      expect(a).not.toBe(b)
    })

    it('hash router without query still produces no fragment params', () => {
      const a = normalizeUrl('https://app.example.com/?token=A#/auth/callback')
      const b = normalizeUrl('https://app.example.com/?token=A')
      // Pure path in fragment, no params - fragment contributes nothing
      expect(a).toBe(b)
    })

    it('plain (non-router) #access_token still works', () => {
      const a = normalizeUrl('https://app.example.com/cb#access_token=AAA')
      const b = normalizeUrl('https://app.example.com/cb#access_token=BBB')
      expect(a).not.toBe(b)
    })
  })
})

describe('makeDedupKey + dedupeByKey: distinct magic-link tokens are kept', () => {
  it('keeps two links with the same path but different tokens', () => {
    const a = link({ id: 'a', url: 'https://app.example.com/auth/magic?token=AAA' })
    const b = link({ id: 'b', url: 'https://app.example.com/auth/magic?token=BBB' })
    const result = dedupeByKey([a, b])
    expect(result).toHaveLength(2)
    const urls = result.map(r => (r as LinkItem).url).sort()
    expect(urls).toEqual([
      'https://app.example.com/auth/magic?token=AAA',
      'https://app.example.com/auth/magic?token=BBB',
    ])
  })

  it('collapses two anchors of the same magic link with different utm tags', () => {
    // The intended dedup case: the same magic-link email may include
    // multiple anchors to the same destination with different tracker
    // params. These SHOULD collapse - one entry in the popup, not 3.
    const a = link({
      id: 'a',
      url: 'https://app.example.com/auth/magic?token=ABC&utm_source=email1',
    })
    const b = link({
      id: 'b',
      url: 'https://app.example.com/auth/magic?token=ABC&utm_source=email2',
    })
    expect(dedupeByKey([a, b])).toHaveLength(1)
  })

  it('makeDedupKey shape includes domain, blocking cross-host collisions', () => {
    const a = link({
      id: 'a',
      url: 'https://app1.example.com/auth?token=X',
      domain: 'app1.example.com',
    })
    const b = link({
      id: 'b',
      url: 'https://app2.example.com/auth?token=X',
      domain: 'app2.example.com',
    })
    expect(makeDedupKey(a)).not.toBe(makeDedupKey(b))
  })
})
