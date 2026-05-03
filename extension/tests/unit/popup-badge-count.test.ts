/**
 * Tests for countBadgeEligible.
 *
 * The badge count must match what the user sees when they open the
 * popup. Pre-PR-1 the count was a separate filter applied only to
 * cache.codes, which silently undercounted (magic links never
 * incremented the badge) and could overstate (links/codes that the
 * popup hides as unsafe could still bump the badge if the legacy
 * arrays disagreed).
 *
 * countBadgeEligible runs items through the same filterPopupItems
 * pipeline as the popup display, then drops items the user has
 * already acted on (seenAt / usedAt / openedAt).
 */

import { describe, it, expect } from 'vitest'
import { countBadgeEligible } from '@/lib/popup/popup-filters'
import type { CodeItem, LinkItem, PopupItem } from '@/shared/popup-messages'

const NOW = 1_700_000_000_000

const code = (overrides: Partial<CodeItem> = {}): CodeItem => ({
  kind: 'code',
  id: 'c1',
  providerId: 'imap-bridge',
  source: 'noreply@example.com - Code',
  receivedAt: NOW - 60_000,
  score: 0.9,
  code: '123456',
  len: 6,
  ...overrides,
})

const link = (overrides: Partial<LinkItem> = {}): LinkItem => ({
  kind: 'link',
  id: 'l1',
  providerId: 'imap-bridge',
  source: 'noreply@example.com - Magic link',
  receivedAt: NOW - 60_000,
  score: 0.7,
  url: 'https://app.example.com/auth/magic?token=abc',
  linkType: 'login',
  httpsOnly: true,
  ...overrides,
})

describe('countBadgeEligible', () => {
  it('counts a single fresh unseen code', () => {
    expect(countBadgeEligible([code()], NOW)).toBe(1)
  })

  it('counts a single fresh unseen magic link', () => {
    expect(countBadgeEligible([link()], NOW)).toBe(1)
  })

  it('counts both codes and magic links in the same cache', () => {
    expect(
      countBadgeEligible(
        [code({ id: 'c1' }), link({ id: 'l1' }), code({ id: 'c2', code: '654321' })],
        NOW,
      ),
    ).toBe(3)
  })

  it('excludes items the user has already seen', () => {
    expect(
      countBadgeEligible([code({ seenAt: NOW - 30_000 })], NOW),
    ).toBe(0)
  })

  it('excludes used codes', () => {
    expect(
      countBadgeEligible([code({ usedAt: NOW - 30_000 })], NOW),
    ).toBe(0)
  })

  it('excludes opened magic links', () => {
    expect(
      countBadgeEligible([link({ openedAt: NOW - 30_000 })], NOW),
    ).toBe(0)
  })

  it('excludes magic links the popup would hide as unsafe (HTTP)', () => {
    // filterPopupItems / isSafeLink rejects non-HTTPS links. Badge
    // must agree with that hiding decision.
    const httpLink = link({ url: 'http://example.com/auth?token=abc' })
    expect(countBadgeEligible([httpLink], NOW)).toBe(0)
  })

  it('excludes magic links of hidden type (reset)', () => {
    // HIDDEN_LINK_TYPES includes 'reset'. Reset links shouldn't
    // contribute to the badge for the same reason they don't appear
    // in the popup by default.
    const resetLink = link({ linkType: 'reset' })
    expect(countBadgeEligible([resetLink], NOW)).toBe(0)
  })

  it('respects maxAgeMs (BADGE_EXPIRY_MS use case)', () => {
    const old = code({ id: 'old', receivedAt: NOW - 12 * 60_000 })
    const fresh = code({ id: 'fresh', receivedAt: NOW - 1 * 60_000 })
    const items: PopupItem[] = [old, fresh]
    expect(countBadgeEligible(items, NOW, 10 * 60_000)).toBe(1)
  })

  it('returns 0 for an empty cache', () => {
    expect(countBadgeEligible([], NOW)).toBe(0)
  })
})
