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
  buildBodyPreview,
  BODY_PREVIEW_MAX_CHARS,
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

describe('buildBodyPreview', () => {
  it('prefers text body over html when both are present', () => {
    const result = buildBodyPreview('plain text body', '<p>html body</p>', [])
    expect(result?.kind).toBe('text')
    expect(result?.preview).toBe('plain text body')
  })

  it('falls back to html when text is empty', () => {
    const result = buildBodyPreview('', '<p>html only</p>', [])
    expect(result?.kind).toBe('html')
    expect(result?.preview).toBe('<p>html only</p>')
  })

  it('returns undefined when both bodies are empty', () => {
    expect(buildBodyPreview('', '', [])).toBeUndefined()
    expect(buildBodyPreview(undefined, undefined, [])).toBeUndefined()
  })

  it('truncates and flags when body exceeds the cap', () => {
    const long = 'x'.repeat(BODY_PREVIEW_MAX_CHARS + 100)
    const result = buildBodyPreview(long, '', [])
    expect(result?.preview.length).toBe(BODY_PREVIEW_MAX_CHARS)
    expect(result?.truncated).toBe(true)
  })

  it('redacts every supplied OTP code value out of the preview', () => {
    const body = 'Your code is 123456. Reset is at 99-88-77.'
    const result = buildBodyPreview(body, '', [
      { code: '123456' },
      { code: '998877', raw: '99-88-77' },
    ])
    expect(result?.preview).not.toContain('123456')
    expect(result?.preview).not.toContain('99-88-77')
    expect(result?.preview).not.toContain('998877')
  })

  it('preserves body content when no OTP candidates were extracted', () => {
    // The "extraction missed it" case: extractor returned no OTPs, so
    // we have no codes to redact. The persisted body is the raw email
    // text — that's the whole point, the user wants to see what
    // extraction missed.
    const body = 'There is a code 123456 buried in here.'
    const result = buildBodyPreview(body, '', [])
    expect(result?.preview).toBe(body)
  })
})
