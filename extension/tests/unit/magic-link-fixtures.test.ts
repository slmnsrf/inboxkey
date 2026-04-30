/**
 * Enforced regression coverage for the magic-link extractor against
 * the canonical fixture corpus.
 *
 * Pre-PR-1 baseline: 0/19 magic-link fixtures extracted because the
 * extractor's intent gate required a body keyword match before any
 * URL was considered. Every fixture uses generic "Click the link
 * below to sign in" wording, which didn't match the narrow keyword
 * list. The fix has two parts:
 *   - keyword expansion (commit cca2982)
 *   - URL-hint admission in the intent gate (commit e0df367)
 *
 * This file locks in the expected outcomes so a future tightening of
 * either the keyword list or the gate can't silently regress the
 * fixture corpus.
 *
 * Negative coverage: password-reset emails must NOT be extracted as
 * magic links. They look almost identical (same "Click here" wording,
 * same /reset?token=... URL shape) but the extractor's
 * DANGEROUS_LINK_KEYWORDS list rejects them. This test enforces that
 * separation since adding "click here" / "use this link" patterns to
 * MAGIC_LINK_KEYWORDS makes a regression more likely.
 */

import { describe, it, expect } from 'vitest'
import { extractMagicLinks } from '@inboxkey/extraction-core'
import { loadEmailsByType } from '../helpers/fixture-loader'

describe('magic-link fixture corpus', () => {
  it('extracts the expected URL from every fixture', async () => {
    const fixtures = await loadEmailsByType('magic-links')

    expect(fixtures.length).toBeGreaterThan(0)

    const failures: Array<{ id: string; expected: string; got: string | null }> = []

    for (const fixture of fixtures) {
      const result = extractMagicLinks({
        subject: fixture.subject,
        text: fixture.body,
      })

      const got = result[0]?.href ?? null
      const expected = fixture.extracted.link as string

      if (got !== expected) {
        failures.push({ id: fixture.id, expected, got })
      }
    }

    if (failures.length > 0) {
      const detail = failures
        .map(f => `  ${f.id}\n    expected: ${f.expected}\n    got:      ${f.got}`)
        .join('\n')
      throw new Error(
        `${failures.length}/${fixtures.length} magic-link fixtures did not extract the expected URL:\n${detail}`
      )
    }
  })

  it('returns at least one candidate for every fixture (no silent rejections)', async () => {
    const fixtures = await loadEmailsByType('magic-links')

    for (const fixture of fixtures) {
      const result = extractMagicLinks({
        subject: fixture.subject,
        text: fixture.body,
      })

      expect(result, `fixture ${fixture.id} returned no candidates`).not.toEqual([])
    }
  })
})

describe('magic-link extractor must reject password-reset fixtures', () => {
  it('returns no candidates for any password-reset fixture', async () => {
    // Password-reset URLs share the magic-link surface (anchor with
    // "click here" text + /reset?token=... destination) but must
    // never be auto-suggested. DANGEROUS_LINK_KEYWORDS contains
    // 'password reset' and 'reset your password' which scoreLinkCandidate
    // hard-rejects, so the candidate list should be empty even when
    // the intent gate admits the email (most reset emails do contain
    // URL hints like 'token').
    const fixtures = await loadEmailsByType('password-resets')

    expect(fixtures.length).toBeGreaterThan(0)

    const leaked: Array<{ id: string; href: string }> = []

    for (const fixture of fixtures) {
      const result = extractMagicLinks({
        subject: fixture.subject,
        text: fixture.body,
      })

      if (result.length > 0) {
        leaked.push({ id: fixture.id, href: result[0].href })
      }
    }

    if (leaked.length > 0) {
      const detail = leaked.map(l => `  ${l.id}: ${l.href}`).join('\n')
      throw new Error(
        `${leaked.length}/${fixtures.length} password-reset fixtures leaked through as magic links:\n${detail}`
      )
    }
  })
})
