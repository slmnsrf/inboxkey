/**
 * Unit tests for the extraction debug log redaction contract.
 *
 * The privacy posture relies on the redaction helpers never persisting
 * a usable OTP code or a magic-link token. These tests pin those
 * guarantees so a future refactor can't quietly regress them.
 */

import { describe, it, expect } from 'vitest'
import {
  redactOtpCode,
  redactCodeFromSnippet,
  sanitizeLinkForLog,
} from '@/lib/services/extraction-debug-log'

describe('redactOtpCode', () => {
  it('keeps the first two characters and asterisks the rest with a length suffix', () => {
    expect(redactOtpCode('123456')).toBe('12**** (6)')
    expect(redactOtpCode('AB12CD')).toBe('AB**** (6)')
    expect(redactOtpCode('99887766')).toBe('99****** (8)')
  })

  it('handles short codes without revealing usable substrings', () => {
    expect(redactOtpCode('AB')).toBe('** (2)')
    expect(redactOtpCode('A')).toBe('* (1)')
    expect(redactOtpCode('')).toBe('')
  })
})

describe('redactCodeFromSnippet', () => {
  it('redacts the exact normalized code', () => {
    const out = redactCodeFromSnippet(
      'Your verification code is 123456. Use it within 5 minutes.',
      '123456'
    )
    expect(out).not.toContain('123456')
    expect(out).toContain('12**** (6)')
  })

  it('redacts the original raw form when separators differ from the normalized code', () => {
    const out = redactCodeFromSnippet(
      'Code: 12-34-56 (expires soon)',
      '123456',
      '12-34-56'
    )
    expect(out).not.toContain('12-34-56')
    expect(out).not.toContain('123456')
  })

  it('redacts space-separated forms even when raw is missing', () => {
    // Snippet builders sometimes collapse whitespace; the stored
    // snippet can contain a separator-normalized form that matches
    // neither the exact raw nor the normalized code.
    const out = redactCodeFromSnippet(
      'Your code is 12 34 56 — please enter it now.',
      '123456'
    )
    expect(out).not.toContain('12 34 56')
  })

  it('redacts hyphen-separated alnum codes in alternate form', () => {
    const out = redactCodeFromSnippet('Login code: AB-12-CD', 'AB12CD', 'AB-12-CD')
    expect(out).not.toContain('AB-12-CD')
    expect(out).not.toContain('AB12CD')
  })

  it('is case-insensitive (alnum codes get uppercased during normalization)', () => {
    const out = redactCodeFromSnippet('reset link uses ab12cd', 'AB12CD')
    expect(out.toLowerCase()).not.toContain('ab12cd')
  })

  it('returns the snippet unchanged when no code or empty snippet', () => {
    expect(redactCodeFromSnippet('', '123456')).toBe('')
    expect(redactCodeFromSnippet('hello', '')).toBe('hello')
  })
})

describe('sanitizeLinkForLog', () => {
  it('strips query string and fragment so magic-link tokens never persist', () => {
    const result = sanitizeLinkForLog(
      'https://example.com/auth/verify?token=abcdef123456&ref=email#frag'
    )
    expect(result.domain).toBe('example.com')
    expect(result.pathPreview).toBe('/auth/verify')
    // The output object must NOT carry the token in any field.
    expect(JSON.stringify(result)).not.toContain('abcdef123456')
    expect(JSON.stringify(result)).not.toContain('ref=email')
  })

  it('truncates very long paths to 50 chars', () => {
    const longPath = '/a/very/deeply/nested/login/confirmation/path/that/exceeds/the/cap'
    const result = sanitizeLinkForLog(`https://example.com${longPath}`)
    expect(result.pathPreview?.length ?? 0).toBeLessThanOrEqual(50)
  })

  it('omits pathPreview when the path is empty or just /', () => {
    expect(sanitizeLinkForLog('https://example.com/').pathPreview).toBeUndefined()
    expect(sanitizeLinkForLog('https://example.com').pathPreview).toBeUndefined()
  })

  it('returns an invalid-url marker rather than throwing on bad input', () => {
    expect(sanitizeLinkForLog('not a url').domain).toBe('invalid-url')
  })
})
