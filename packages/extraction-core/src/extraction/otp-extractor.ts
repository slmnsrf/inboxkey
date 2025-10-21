
// otp-extractor.ts
// InboxKey — Robust OTP extraction (v2.3)
// Purpose: Parse plaintext or HTML email bodies and return high-confidence OTP candidates only.
// Design goals:
//  - Precision-first (prefer false-negatives over false-positives)
//  - Fast (linear scans; no heavy DOM parsing)
//  - Internationalized keyword support (delegated via CODE_KEYWORDS)
//  - Configurable (expected length/charset; thresholds; windows)
//  - Compatible with existing extractor wrapper (`extractor.ts`) and types in `extraction-types.ts`
//
// External contracts (do not change):
//  - Imports constants from `extraction-types.ts`
//  - Exports `extractOTPs(input, opts?)` as named and default export
//  - Returns an array of candidates sorted by confidence (desc).
//  - Returns [] when no trustworthy OTP is present; upstream will then ignore the mail.
//
// No new runtime dependencies. Pure TS/JS only.

import {
  // Regex preset set; each item is a RegExp meant for global matching
  COMMON_OTP_PATTERNS,
  // Keyword dictionary (array of strings or regex sources) in multiple locales
  CODE_KEYWORDS,
} from './extraction-types'

import { shapeScore, type ExpectedShape } from '../matching/shape-matcher'

/** Character set for OTP */
export type OtpCharset = 'digits' | 'alnum'

/** Candidate returned by the extractor */
export interface OTPCandidate {
  code: string            // normalized code (no spaces/hyphens; uppercased for alnum)
  raw?: string            // raw matched text exactly as it appeared
  charset: OtpCharset
  length: number
  confidence: number      // 0..1
  keyword?: string        // keyword that influenced the score the most
  context?: {
    // Start/end indices in the *normalized plain text* buffer
    start: number
    end: number
    // A 40–80 char snippet around the match for debugging/logging
    snippet?: string
    // Distance to the nearest keyword occurrence in characters
    keywordDistance?: number
    // Whether we penalized due to footer/signature
    footerPenalty?: boolean
  }
}

/** Options to steer extraction on a per-message basis */
export interface OTPExtractOptions {
  // Form expectations collected by page detector (optional, but improves accuracy)
  expectedLength?: number
  expectedCharset?: OtpCharset

  // Expected shape for shape bias scoring (alternative to individual expectedLength/expectedCharset)
  expectedShape?: ExpectedShape

  // If provided, increases score when keywords found in subject
  subject?: string

  // Tuning
  threshold?: number               // default 0.58 (precision-oriented)
  windowRadius?: number            // default 120 (±120 chars around keywords)
  maxResults?: number              // default 3

  // Allow alphanumeric codes in addition to digits (default true)
  allowAlnum?: boolean

  // Experimental: further restrict numeric code lengths (e.g., [4,6,8])
  allowedNumericLengths?: number[] // default from COMMON_OTP_PATTERNS
}

/** Public API (named & default) */
export function extractOTPs(input: string, opts: OTPExtractOptions = {}): OTPCandidate[] {
  const threshold = clamp(opts.threshold ?? 0.58, 0, 1)
  const windowRadius = Math.max(40, Math.min(400, opts.windowRadius ?? 120))
  const allowAlnum = opts.allowAlnum ?? true
  const maxResults = Math.max(1, Math.min(10, opts.maxResults ?? 3))

  // Normalize to plain text; remove HTML noise early to reduce spurious matches
  const { text } = toPlainText(input)

  // If there are no keywords at all in the whole message, short-circuit (fast fail)
  const kwRegex = buildKeywordRegex(CODE_KEYWORDS)
  const hasKeywords = kwRegex.test(text)
  if (!hasKeywords) {
    // Edge allowance: Some brands send bare codes without keyword; try only if expectedLength is set.
    if (!opts.expectedLength && !opts.expectedShape) return []
  }
  // Reset lastIndex after test
  kwRegex.lastIndex = 0

  // Build search windows around keywords to avoid scanning footers/long IDs
  const windows = collectWindows(text, kwRegex, windowRadius)

  // If we had no keyword windows but do have expectedLength, scan the whole text but with strict scoring
  const ranges = windows.length > 0 ? windows : [{ start: 0, end: text.length, reason: 'fallback-whole' }]

  // Extract raw matches in ranges, normalize, and score
  const rawCandidates = findCandidatesInRanges(text, ranges, {
    allowAlnum,
    expectedLength: opts.expectedLength,
    allowedNumericLengths: opts.allowedNumericLengths,
  })

  if (rawCandidates.length === 0) return []

  // Score each candidate with context signals
  const subject = (opts.subject || '').toLowerCase()
  const scored: OTPCandidate[] = rawCandidates.map(c => {
    const base = baseScore(c, opts)
    const near = nearestKeywordSignal(text, c, kwRegex)
    const footer = footerPenalty(text, c)
    const subjectBoost = subject.includes('code') || subject.includes('otp') || subject.includes('verification') ? 0.08 : 0

    let confidence = base + near.score + subjectBoost
    if (footer.applies) confidence -= 0.2

    // Clamp and attach context
    confidence = clamp(confidence, 0, 1)

    // Store raw shape bias for tiebreaking (before clamping)
    const shapeBias = getShapeBias(c, opts)

    return {
      code: c.code,
      raw: c.raw,
      charset: c.charset,
      length: c.length,
      confidence,
      keyword: near.keyword,
      context: {
        start: c.start,
        end: c.end,
        snippet: snippetAround(text, c.start, c.end),
        keywordDistance: near.distance,
        footerPenalty: footer.applies,
      },
      _shapeBias: shapeBias,
    }
  })

  // Filter: high precision; drop anything below threshold or looking like a phone/order
  const precise = scored
    .filter(isNotPhoneLike)
    .filter(s => s.confidence >= threshold)

  if (precise.length === 0) return []

  // Dedupe by code (keep highest confidence & shortest distance to keyword)
  const deduped = dedupeByCode(precise)

  // Sort by confidence desc, then by shape bias (if expectedShape provided),
  // then by closeness to keyword, then by shorter length
  const hasExpectedShape = !!(opts.expectedShape || opts.expectedLength || opts.expectedCharset)
  const sorted = deduped.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence

    // When confidences are equal and we have shape expectations, prefer better shape match
    if (hasExpectedShape) {
      const aShape = (a as any)._shapeBias ?? 0
      const bShape = (b as any)._shapeBias ?? 0
      if (bShape !== aShape) return bShape - aShape
    }

    // Then sort by keyword proximity
    const ad = a.context?.keywordDistance ?? Number.MAX_SAFE_INTEGER
    const bd = b.context?.keywordDistance ?? Number.MAX_SAFE_INTEGER
    if (ad !== bd) return ad - bd

    return a.length - b.length
  })

  // Clean up internal field before returning
  return sorted.slice(0, maxResults).map(c => {
    const clean = { ...c }
    delete (clean as any)._shapeBias
    return clean
  })
}

export default extractOTPs

// --------------------------- Implementation details ---------------------------

type InternalCandidate = {
  code: string
  raw: string
  start: number
  end: number
  length: number
  charset: OtpCharset
}

/** Convert HTML/multipart-ish text to a robust plaintext for scanning */
function toPlainText(input: string): { text: string; isHtml: boolean } {
  const looksHtml = /<\/?[a-z][\s\S]*>/i.test(input) || /&[a-z]+;|&#\d+;/.test(input)

  if (!looksHtml) {
    // Normalize whitespace, collapse runs, unify NBSP
    const text = normalizeWhitespace(input)
    return { text, isHtml: false }
  }

  // Very small HTML-to-text pass: strip tags, decode a subset of entities
  let text = input
    // Remove script/style blocks
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    // Replace <br> and <p> with newlines
    .replace(/<(br|\/p|\/div)\s*\/?>/gi, '\n')
    // Strip all remaining tags
    .replace(/<\/?[^>]+>/g, ' ')
  // Decode HTML entities (basic set + numeric)
  text = decodeEntities(text)
  text = normalizeWhitespace(text)
  return { text, isHtml: true }
}

function normalizeWhitespace(s: string): string {
  return s
    .replace(/\u00A0/g, ' ')   // NBSP
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[ \u2000-\u200B]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n') // limit newlines
    .trim()
}

function decodeEntities(s: string): string {
  const named: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
    nbsp: ' ', ensp: ' ', emsp: ' ', ndash: '–', mdash: '—',
  }
  s = s.replace(/&([a-z]{2,6});/gi, (_, name) => named[name.toLowerCase()] ?? _)
  s = s.replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
  s = s.replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
  return s
}

/** Build a case-insensitive word-boundary regex for an array of keywords/regex sources */
function buildKeywordRegex(words: readonly (string | RegExp)[]): RegExp {
  // Treat incoming RegExp.source as literal where possible; keywords already curated in extraction-types
  const parts = words.map(w => {
    if (w instanceof RegExp) return w.source
    // Escape keyword and allow hyphen/space variants (e.g., one-time / one time / one‑time)
    const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return esc.replace(/[-\s]/g, '[-\\s\\u00A0\\u2011\\u2013]?')
  })
  // Word boundary-ish; allow matches in e.g., "verification code", "one time", etc.
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${parts.join('|')})(?=$|[^\\p{L}\\p{N}])`, 'gimu')
}

/** Collect windows around keywords for targeted scanning */
function collectWindows(text: string, kw: RegExp, radius: number): { start: number; end: number; reason: string }[] {
  const ranges: { start: number; end: number; reason: string }[] = []
  kw.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = kw.exec(text))) {
    const center = m.index + m[0].length / 2
    const start = Math.max(0, Math.floor(center - radius))
    const end = Math.min(text.length, Math.ceil(center + radius))
    mergeRange(ranges, { start, end, reason: 'kw' })
  }
  // If we found none, return []
  return ranges
}

function mergeRange(ranges: { start: number; end: number; reason: string }[], r: { start: number; end: number; reason: string }) {
  const last = ranges[ranges.length - 1]
  if (last && r.start <= last.end + 20) {
    last.end = Math.max(last.end, r.end)
    return
  }
  ranges.push(r)
}

/** Find candidates (raw) inside ranges using COMMON_OTP_PATTERNS */
function findCandidatesInRanges(
  text: string,
  ranges: { start: number; end: number }[],
  cfg: { allowAlnum: boolean; expectedLength?: number; allowedNumericLengths?: number[] }
): InternalCandidate[] {
  // Construct working pattern set: clone to avoid mutating shared instances
  const patterns: RegExp[] = COMMON_OTP_PATTERNS
    .filter(re => {
      const src = re.source
      if (!cfg.allowAlnum && /[A-Z]\d|\d[A-Z]|[A-Z]{2,}/i.test(src)) {
        // Heuristic: skip patterns that obviously target alnum (best-effort; depends on how patterns are authored)
        return !/alnum/i.test((re as any).name ?? '')
      }
      return true
    })
    .map(re => new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))

  const out: InternalCandidate[] = []

  for (const { start, end } of ranges) {
    const slice = text.slice(start, end)
    for (const re of patterns) {
      re.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = re.exec(slice))) {
        const raw = m[1] ?? m[0]
        const norm = normalizeCode(raw)
        if (!norm) continue
        const charset: OtpCharset = /^[0-9]+$/.test(norm) ? 'digits' : 'alnum'
        const len = norm.length

        // Fast structural filters
        if (charset === 'digits') {
          const allowed = cfg.allowedNumericLengths
          if (allowed && allowed.length > 0 && !allowed.includes(len)) continue
          if (len < 4 || len > 8) continue
        } else {
          if (!cfg.allowAlnum) continue
          if (len < 4 || len > 10) continue
          // Ensure at least one digit for alnum (relaxed: allow mixed case)
          if (!/[0-9]/.test(norm) && norm.length > 6) continue
        }

        // Ignore obviously embedded in larger number-ish tokens (order IDs, long tracking #)
        if (/^\d{9,}$/.test(norm)) continue

        // Push with absolute positions
        out.push({
          code: norm,
          raw,
          start: start + m.index,
          end: start + m.index + (m[0]?.length ?? raw.length),
          length: len,
          charset,
        })
      }
    }
  }

  return out
}

/** Normalize matched token: strip separators, uppercase letters */
function normalizeCode(raw: string): string | null {
  // Remove spaces/hyphens/underscores/non-breaking space and zero-width spaces
  const cleaned = raw
    .replace(/[\s\u00A0\u200B\u200C\u200D_-]+/g, '')
    .toUpperCase()

  // Reject if nothing meaningful remains
  if (!cleaned) return null

  // Reject if all letters (no digits) and not meant to be alnum
  if (!/\d/.test(cleaned)) return null

  return cleaned
}

/**
 * Extract raw shape bias score for tiebreaking in sort
 *
 * @param c - Internal candidate
 * @param opts - Extraction options
 * @returns Raw shape bias score (can be negative for penalties)
 */
function getShapeBias(c: InternalCandidate, opts: OTPExtractOptions): number {
  // Priority 1: Use expectedShape if provided
  if (opts.expectedShape) {
    return shapeScore(c.code, opts.expectedShape)
  }
  // Priority 2: Construct shape from individual fields
  else if (opts.expectedLength || opts.expectedCharset) {
    const expectedShape: ExpectedShape = {
      len: opts.expectedLength,
      charset: opts.expectedCharset
    }
    return shapeScore(c.code, expectedShape)
  }
  // No shape expectations
  return 0
}

/**
 * Compute base score from expectations (length/charset alignment)
 *
 * This function applies shape bias scoring when expected OTP characteristics
 * are provided. Shape bias uses the shapeScore function from shape-matcher
 * to evaluate how well a candidate matches the expected length and charset.
 *
 * When expectedShape is provided, the shape score is calculated and directly
 * added to the base score. Otherwise, falls back to individual expectedLength
 * and expectedCharset fields for backward compatibility.
 *
 * @param c - Internal candidate to score
 * @param opts - Extraction options containing expected shape characteristics
 * @returns Base confidence score (0..1 range after clamping)
 */
function baseScore(c: InternalCandidate, opts: OTPExtractOptions): number {
  let s = 0.5 // base prior

  // Priority 1: Use expectedShape if provided (preferred approach)
  if (opts.expectedShape) {
    const shapeBias = shapeScore(c.code, opts.expectedShape)
    s += shapeBias // Shape score is in 0..1 scale (e.g., 0.20 for exact length match)
  }
  // Priority 2: Construct shape from individual fields (backward compatibility)
  else if (opts.expectedLength || opts.expectedCharset) {
    const expectedShape: ExpectedShape = {
      len: opts.expectedLength,
      charset: opts.expectedCharset
    }
    const shapeBias = shapeScore(c.code, expectedShape)
    s += shapeBias
  }
  // Priority 3: Fallback heuristics when no expectations provided
  else {
    if (c.charset === 'digits') {
      if (c.length === 6 || c.length === 8) s += 0.08
      else if (c.length === 4) s += 0.0 // No bonus for 4-digit to keep confidence lower
    }
    if (c.charset === 'alnum' && (c.length >= 6 && c.length <= 8)) s += 0.05
  }

  return s
}

/** Keyword proximity signal: closer keyword → higher score */
function nearestKeywordSignal(text: string, c: InternalCandidate, kw: RegExp): { score: number; distance: number; keyword?: string } {
  kw.lastIndex = 0
  let bestDist = Number.MAX_SAFE_INTEGER
  let bestKw: string | undefined

  let m: RegExpExecArray | null
  while ((m = kw.exec(text))) {
    const center = m.index + m[0].length / 2
    const dist = distancePointToRange(center, c.start, c.end)
    if (dist < bestDist) {
      bestDist = dist
      bestKw = m[0]
    }
  }

  if (bestDist === Number.MAX_SAFE_INTEGER) {
    // No keyword found at all (edge fallback); penalize slightly
    return { score: -0.05, distance: bestDist }
  }

  // Map distance to a 0..0.42 boost (inverse); within 20 chars ≈ 0.42, 120 chars ≈ 0.08
  // Increased from 0.3 max to make keyword proximity more impactful
  const boost = Math.max(0.08, 0.42 * Math.exp(-bestDist / 45))
  return { score: boost, distance: bestDist, keyword: sanitizeKw(bestKw) }
}

function sanitizeKw(s?: string): string | undefined {
  return s?.trim().slice(0, 40)
}

function distancePointToRange(p: number, a: number, b: number): number {
  if (p < a) return a - p
  if (p > b) return p - b
  return 0
}

/** Penalize codes inside obvious footers/signatures/unsubscribe blocks */
function footerPenalty(text: string, c: InternalCandidate): { applies: boolean } {
  const around = text.slice(Math.max(0, c.start - 120), Math.min(text.length, c.end + 160)).toLowerCase()
  const footerHints =
    /(unsubscribe|preferences|support|help|customer\s+service|do\s+not\s+reply|please\s+do\s+not\s+reply|sent\s+from|regards|kind\s+regards|signature)/i
  return { applies: footerHints.test(around) }
}

/** Heuristic filter: looks like a phone number? */
function isNotPhoneLike(c: OTPCandidate): boolean {
  if (c.length >= 9 && c.charset === 'digits') return false // long pure number → likely not OTP
  // Penalize grouped patterns that resemble phone formatting in snippet
  const snip = (c.context?.snippet || '').toLowerCase()
  if (/\b(call|phone|tel|fax)\b/.test(snip)) return false
  return true
}

/** Return a short snippet around a region */
function snippetAround(text: string, start: number, end: number, width = 40): string {
  const s = Math.max(0, start - width)
  const e = Math.min(text.length, end + width)
  const left = s > 0 ? '…' : ''
  const right = e < text.length ? '…' : ''
  return left + text.slice(s, e).replace(/\s+/g, ' ') + right
}

/** Dedupe candidates by code (keep max confidence; if tie, keep min distance to keyword) */
function dedupeByCode(cands: OTPCandidate[]): OTPCandidate[] {
  const map = new Map<string, OTPCandidate>()
  for (const c of cands) {
    const prev = map.get(c.code)
    if (!prev) {
      map.set(c.code, c)
    } else {
      if (
        c.confidence > prev.confidence ||
        (c.confidence === prev.confidence &&
          (c.context?.keywordDistance ?? Number.MAX_SAFE_INTEGER) <
            (prev.context?.keywordDistance ?? Number.MAX_SAFE_INTEGER))
      ) {
        map.set(c.code, c)
      }
    }
  }
  return Array.from(map.values())
}

/** Clamp helper */
function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}
