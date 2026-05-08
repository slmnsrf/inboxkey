
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
  CODE_WEAK_KEYWORDS,
} from './extraction-types.js'

import { shapeScore, type ExpectedShape } from '../matching/shape-matcher.js'

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

  // Allow all-letter codes only when explicitly expected. Default false:
  // ordinary prose words near "code" are otherwise indistinguishable from
  // alphabetic OTPs.
  allowAlphaOnly?: boolean

  // Experimental: further restrict numeric code lengths (e.g., [4,6,8])
  allowedNumericLengths?: number[] // default from COMMON_OTP_PATTERNS
}

/** Public API (named & default) */
export function extractOTPs(input: string, opts: OTPExtractOptions = {}): OTPCandidate[] {
  const threshold = clamp(opts.threshold ?? 0.58, 0, 1)
  const windowRadius = Math.max(40, Math.min(400, opts.windowRadius ?? 120))
  const allowAlnum = opts.allowAlnum ?? true
  const allowAlphaOnly = shouldAllowAlphaOnly(opts)
  const maxResults = Math.max(1, Math.min(10, opts.maxResults ?? 3))

  // Normalize to plain text; remove HTML noise early to reduce spurious matches.
  // NFC-normalize so `keywordText` (which decomposes Latin diacritics and
  // strips combining marks) preserves byte offsets relative to `text` —
  // any Latin character precomposed in NFC stays single-code-unit through
  // `normalizeKeywordText`, keeping window/candidate offsets aligned.
  const { text: rawText } = toPlainText(input)
  const text = rawText.normalize('NFC')
  const keywordText = normalizeKeywordText(text)

  // If there are no strong keywords at all in the whole message,
  // optionally admit weak password/code tokens behind stricter gates.
  const strongKwRegex = CODE_KEYWORDS_MATCHER
  strongKwRegex.lastIndex = 0
  const hasStrongKeywords = strongKwRegex.test(keywordText)

  const weakKwRegex = CODE_WEAK_KEYWORDS_MATCHER
  weakKwRegex.lastIndex = 0
  const hasWeakKeywords = !hasStrongKeywords && weakKwRegex.test(keywordText)
  const usesWeakKeywords = !hasStrongKeywords && hasWeakKeywords

  if (!hasStrongKeywords && !hasWeakKeywords) {
    // Edge allowance: brands routinely send keyword-free SMS in the form
    // "Brand: 123456 ..." (Amazon, Telegram, Discord). Admit only when the
    // caller signaled an expected shape AND the body opens with that
    // brand-prefix-code shape. Without the shape gate, plumbing
    // expectedLength alone causes false-positive autofills on prose digit
    // runs ("Your shipment of Item 123456", "Get 100000 points",
    // "ZIP 100234"). The shape requirement is structural, not lingual:
    // it gates on `Word:Code` form and works equally across the 21
    // supported languages.
    //
    // Defense-in-depth: CJK reset/management copy ("重置密码: 123456",
    // "비밀번호 재설정: 123456") can pass `hasBrandPrefixCodeShape` because
    // its leading non-Latin verb-noun cluster reads as a "brand" token.
    // Reject the entire body when password-reset/management context is
    // present so the brand-prefix path can't sneak past.
    if (isPasswordResetManagementContext(text.toLowerCase())) return []
    if (!opts.expectedLength && !opts.expectedShape) return []
    if (!hasBrandPrefixCodeShape(text)) return []
  }
  if (usesWeakKeywords && !hasExpectedShapeForWeakOtp(opts)) return []

  const kwRegex = usesWeakKeywords ? weakKwRegex : strongKwRegex
  // Reset lastIndex after tests
  kwRegex.lastIndex = 0

  // Build search windows around keywords to avoid scanning footers/long IDs
  const windows = collectWindows(keywordText, kwRegex, windowRadius)

  // If we had no keyword windows but do have expectedLength, scan the whole text but with strict scoring
  if (windows.length === 0 && !opts.expectedLength && !opts.expectedShape) {
    return []
  }
  const ranges = windows.length > 0 ? windows : [{ start: 0, end: text.length, reason: 'fallback-whole' }]

  // Extract raw matches in ranges, normalize, and score
  const rawCandidates = findCandidatesInRanges(text, ranges, {
    allowAlnum,
    allowAlphaOnly,
    expectedLength: opts.expectedLength,
    allowedNumericLengths: opts.allowedNumericLengths,
  })

  const viableCandidates = rawCandidates
    .filter(c => isPlausibleOtpCandidate(text, c))
    .filter(c => !usesWeakKeywords || hasWeakOtpCandidateSupport(text, c, opts))
  if (viableCandidates.length === 0) return []

  // Score each candidate with context signals
  const subject = (opts.subject || '').toLowerCase()
  const scored: OTPCandidate[] = viableCandidates.map(c => {
    const base = baseScore(c, opts)
    const near = nearestKeywordSignal(keywordText, c, kwRegex)
    const footer = footerPenalty(text, c)
    const subjectBoost = subject.includes('code') || subject.includes('otp') || subject.includes('verification') ? 0.08 : 0

    let confidence = base + near.score + subjectBoost
    if (usesWeakKeywords) confidence -= 0.14
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
    .filter(isNotContactMetadata)
    .filter(c => isNotTransactionReference(c, text))
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

/**
 * Normalize Latin diacritics only for keyword matching. Positions are
 * intentionally preserved for normal composed Unicode text, so keyword
 * windows still map back to the original plaintext used for candidate
 * extraction. This catches carrier/SMS transliterations like Turkish
 * "tek kullanimlik sifreniz" for "tek kullanımlık şifre" and also
 * helps Spanish/Portuguese/Czech/Polish/Nordic unaccented SMS copy.
 */
function normalizeKeywordText(s: string): string {
  const specialLatinMap: Record<string, string> = {
    'ı': 'i',
    'İ': 'I',
    'ł': 'l',
    'Ł': 'L',
    'đ': 'd',
    'Đ': 'D',
    'ø': 'o',
    'Ø': 'O',
    'ß': 's',
    'æ': 'a',
    'Æ': 'A',
    'œ': 'o',
    'Œ': 'O',
  }

  return s
    .replace(/[ıİłŁđĐøØßæÆœŒ]/g, ch => specialLatinMap[ch] ?? ch)
    .replace(/\p{Script=Latin}\p{M}*/gu, segment =>
      segment.normalize('NFD').replace(/\p{M}/gu, '')
    )
}

function keywordVariants(keyword: string): string[] {
  const germanicTransliteration = keyword.replace(/[äÄöÖüÜßæÆøØåÅ]/g, ch => {
    const map: Record<string, string> = {
      'ä': 'ae',
      'Ä': 'Ae',
      'ö': 'oe',
      'Ö': 'Oe',
      'ü': 'ue',
      'Ü': 'Ue',
      'ß': 'ss',
      'æ': 'ae',
      'Æ': 'Ae',
      'ø': 'oe',
      'Ø': 'Oe',
      'å': 'aa',
      'Å': 'Aa',
    }
    return map[ch] ?? ch
  })

  return Array.from(new Set([
    keyword,
    normalizeKeywordText(keyword),
    germanicTransliteration,
    normalizeKeywordText(germanicTransliteration),
  ]))
}

/**
 * Latin-script base-form keywords that admit suffix attachment in their
 * source language and therefore need loose trailing. These are the
 * agglutinative (Turkish, Finnish) and inflected (Polish, Czech, other
 * Slavic-Latin, Scandinavian) bare nouns where carrier/SMS copy
 * routinely glues a possessive/accusative ending onto the stem
 * ("kod" -> "kodu", "şifre" -> "şifreniz", "koodi" -> "koodin").
 *
 * Stored in lowercase, after diacritic-folding (`normalizeKeywordText`),
 * so both the original and the diacritic-stripped variants resolve to
 * the same key.
 *
 * Phrases like "doğrulama kodu" and "vahvistuskoodi" are NOT in this
 * set: they end on a fixed inflected form already and don't need to
 * tolerate further suffix attachment in real copy. Keeping them strict
 * preserves precision.
 */
const LOOSE_TRAILING_BASE_FORMS = new Set<string>([
  // Turkish (agglutinative; -u/-um/-un/-niz/-mla suffixes)
  'kod', 'sifre', 'parola',
  // Finnish (agglutinative; -n/-ssa/-lla)
  'koodi', 'salasana',
  // Polish (inflected; -u/-em/-ami)
  'haslo',
  // Czech / Slovak (inflected; -u/-em)
  'heslo',
  // Norwegian, Danish (inflected)
  'kode', 'passord', 'adgangskode',
  // Swedish (inflected)
  'losenord',
])

/** True if all letters in `keyword` belong to Latin script. */
function isLatinScriptKeyword(keyword: string): boolean {
  const letters = keyword.match(/\p{L}/gu)
  if (!letters || letters.length === 0) return false
  return letters.every(l => /\p{Script=Latin}/u.test(l))
}

/**
 * Choose loose vs. strict trailing for a keyword.
 *
 * Loose (no trailing constraint) catches morphological inflection in
 * agglutinative/inflected source languages. Strict (`(?![\p{L}\p{N}])`)
 * keeps generic English-like tokens (`code`, `passcode`, `password`)
 * from prefix-matching unrelated words ("Codex", "Codebase", "Codec",
 * "passwordless").
 *
 *   - explicit base-form opt-ins (LOOSE_TRAILING_BASE_FORMS) -> loose
 *   - non-Latin scripts (Cyrillic, Arabic, Devanagari, CJK)   -> loose
 *   - everything else (Latin phrases + generic English bases)  -> strict
 */
function shouldUseLooseTrailing(keyword: string): boolean {
  const lower = keyword.toLowerCase()
  if (LOOSE_TRAILING_BASE_FORMS.has(lower)) return true
  const normalizedLower = normalizeKeywordText(lower)
  if (LOOSE_TRAILING_BASE_FORMS.has(normalizedLower)) return true

  // Phrases that END with a known agglutinative/inflected base form
  // (e.g. "tek seferlik şifre" -> "şifreniz", "tek kullanımlık kod" ->
  // "kodu") inherit loose trailing so the suffix is allowed.
  const lastTok = lastToken(lower)
  if (lastTok && LOOSE_TRAILING_BASE_FORMS.has(lastTok)) return true
  const normalizedLastTok = lastToken(normalizedLower)
  if (normalizedLastTok && LOOSE_TRAILING_BASE_FORMS.has(normalizedLastTok)) return true

  if (!isLatinScriptKeyword(keyword)) return true
  return false
}

function lastToken(s: string): string | undefined {
  const tokens = s.split(/[-\s ‑–]+/u).filter(Boolean)
  return tokens[tokens.length - 1]
}

/** Build a case-insensitive word-boundary regex for an array of keywords/regex sources */
function buildKeywordRegex(words: readonly (string | RegExp)[]): RegExp {
  const strictParts: string[] = []
  const looseParts: string[] = []

  for (const w of words) {
    if (w instanceof RegExp) {
      // Conservatively bucket raw regex sources as loose so callers get
      // the same trailing semantics they had before this split.
      looseParts.push(w.source)
      continue
    }

    const variants = keywordVariants(w)
    const isLoose = shouldUseLooseTrailing(w)
    for (const variant of variants) {
      const esc = variant
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/[-\s]/g, '[-\\s\\u00A0\\u2011\\u2013]?')
      if (isLoose) {
        looseParts.push(esc)
      } else {
        strictParts.push(esc)
      }
    }
  }

  const branches: string[] = []
  // Strict-trailing alternatives reject prefix matches into longer
  // unrelated words ("code" must not match "Codex").
  if (strictParts.length > 0) {
    branches.push(`(?:${strictParts.join('|')})(?![\\p{L}\\p{N}])`)
  }
  // Loose alternatives allow morphological suffixes in agglutinative
  // and inflected source languages, plus all non-Latin scripts.
  if (looseParts.length > 0) {
    branches.push(`(?:${looseParts.join('|')})`)
  }

  // Leading boundary prevents false positives (e.g. "discount" won't
  // match the trailing "count" subset).
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${branches.join('|')})`, 'gimu')
}

const CODE_KEYWORDS_MATCHER = buildKeywordRegex(CODE_KEYWORDS)
const CODE_WEAK_KEYWORDS_MATCHER = buildKeywordRegex(CODE_WEAK_KEYWORDS)

/** Collect windows around keywords for targeted scanning */
function collectWindows(text: string, kw: RegExp, radius: number): { start: number; end: number; reason: string }[] {
  const ranges: { start: number; end: number; reason: string }[] = []
  kw.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = kw.exec(text))) {
    if (isNonOtpKeywordMatch(text, m)) continue

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
  cfg: {
    allowAlnum: boolean;
    allowAlphaOnly: boolean;
    expectedLength?: number;
    allowedNumericLengths?: number[];
  }
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
        const norm = normalizeCode(raw, {
          allowAlnum: cfg.allowAlnum,
          allowAlphaOnly: cfg.allowAlphaOnly,
        })
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

/**
 * Normalize a matched token: strip separators, uppercase letters, and
 * apply structural filters.
 *
 * When `allowAlnum` is false (numeric-only mode), any letter-containing
 * token is rejected. When `allowAlnum` is true, mixed letter+digit tokens
 * are accepted, but letter-only tokens require explicit opt-in because
 * normal prose near "code" produces convincing false positives.
 */
function normalizeCode(
  raw: string,
  opts: { allowAlnum: boolean; allowAlphaOnly: boolean } = {
    allowAlnum: false,
    allowAlphaOnly: false,
  }
): string | null {
  // Remove spaces/hyphens/underscores/non-breaking space and zero-width spaces
  const cleaned = raw
    .replace(/[\s\u00A0\u200B\u200C\u200D_-]+/g, '')
    .toUpperCase()

  // Reject if nothing meaningful remains
  if (!cleaned) return null

  const hasDigit = /\d/.test(cleaned)
  if (!hasDigit) {
    // Numeric-only mode: never allow letter-only tokens.
    if (!opts.allowAlnum) return null
    // Default alnum mode still rejects letter-only prose ("verify",
    // "access", names). Only explicit alpha-only expectation enables it.
    if (!opts.allowAlphaOnly) return null
    // Even explicit alpha-only codes need a length floor so short words
    // and button labels do not slip through.
    if (cleaned.length < 6) return null
  }

  return cleaned
}

function shouldAllowAlphaOnly(opts: OTPExtractOptions): boolean {
  return (
    opts.allowAlphaOnly === true ||
    opts.expectedCharset === 'alnum' ||
    opts.expectedShape?.charset === 'alnum'
  )
}

/**
 * Generic "code" is only useful when it means an OTP. Phrases like
 * "country code" and "phone country code" are metadata labels; using
 * them as keyword anchors turns addresses and phone records into OTP
 * windows.
 */
function isNonOtpKeywordMatch(text: string, match: RegExpExecArray): boolean {
  const rawKeyword = match[0]
    ?.trim()
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+/u, '')
  if (!rawKeyword) return false

  const genericCodeTerms = new Set([
    'code',
    'codigo',
    'kod',
    'kode',
    'kód',
    'codice',
    'código',
  ])

  if (!genericCodeTerms.has(rawKeyword)) {
    return false
  }

  const start = Math.max(0, match.index - 36)
  const end = Math.min(text.length, match.index + match[0].length + 36)
  const around = text.slice(start, end).toLowerCase()

  return (
    /\b(?:country|phone|postal|zip|area|dial(?:ling|ing)?|calling)\s+code\b/i.test(around) ||
    /\b(?:coupon|promo(?:tional)?|discount|voucher|referral|affiliate|invite|gutschein|rabatt)\s*[- ]?\s*code\b/i.test(around) ||
    /\b(?:status|error|source|tracking|booking|reservation|order)\s+code\b/i.test(around) ||
    /\b(?:claude\s+code|codepen|source\s+code|inline-code|code\s+editor|code\s+review|low-code|no-code|coding)\b/i.test(around)
  )
}

/**
 * SMS-style brand-prefix-code shape at the very start of the body.
 *
 * Matches the standard worldwide convention used by carriers and
 * brand-name SMS senders across scripts: "Amazon: 383931", "Яндекс: 12345",
 * "微信: 987654", "Discord:777888". Required components:
 *
 *   - optional leading non-letter/non-digit chars (skips whitespace,
 *     punctuation, emoji, etc., but stops before the first brand letter
 *     in any script)
 *   - a 3-25 char Unicode-letter-led brand token. Inner chars allow
 *     letters, digits, underscore, and the common brand specials `&'-`.
 *   - mandatory colon, optionally surrounded by whitespace
 *   - a 4-10 digit run with a trailing word-boundary
 *
 * Unicode notes: uses the `u` flag with `\p{L}` / `\p{N}` so Cyrillic,
 * Greek, CJK, Devanagari, Arabic and Turkish dotted-İ brand names all
 * admit. JavaScript's `\w` / `\W` are explicitly NOT Unicode-aware even
 * with `u`, so the original `^\W*[A-Za-z]` regex silently rejected
 * every non-Latin brand name.
 *
 * Deliberate false-negatives (worth the precision):
 *   - bracket forms: "[Brand] 123456" (no colon)
 *   - dash forms:   "Brand - 123456"  (no colon)
 *   - prose mentions of code later in the body ("Hello, Amazon: 12345 is...")
 *   - sender names with leading digits or dots ("3M:", "AT&T:")
 *
 * Deliberate rejections (the regression vectors):
 *   - "Your shipment of Item 123456" (multiple tokens before digits)
 *   - "Get 100000 points" (3-char first word fails brand-length minimum)
 *   - "$123456.00" (no leading alphabetic brand token)
 */
const BRAND_PREFIX_OTP_SHAPE = /^[^\p{L}\p{N}]*\p{L}[\p{L}\p{N}_&'\-]{2,24}\s*:\s*\d{4,10}\b/u

function hasBrandPrefixCodeShape(text: string): boolean {
  return BRAND_PREFIX_OTP_SHAPE.test(text)
}

function hasExpectedShapeForWeakOtp(opts: OTPExtractOptions): boolean {
  return (
    opts.expectedLength !== undefined ||
    opts.expectedCharset !== undefined ||
    opts.expectedShape?.len !== undefined ||
    opts.expectedShape?.charset !== undefined
  )
}

function candidateMatchesExpectedShape(
  c: InternalCandidate,
  opts: OTPExtractOptions
): boolean {
  const expectedLength = opts.expectedShape?.len ?? opts.expectedLength
  const expectedCharset = opts.expectedShape?.charset ?? opts.expectedCharset

  if (expectedLength !== undefined && c.length !== expectedLength) {
    return false
  }

  if (expectedCharset === 'digits' && c.charset !== 'digits') {
    return false
  }

  return true
}

function hasWeakOtpCandidateSupport(
  text: string,
  c: InternalCandidate,
  opts: OTPExtractOptions
): boolean {
  if (!candidateMatchesExpectedShape(c, opts)) return false

  const around = candidateWindow(text, c, 112).toLowerCase()
  if (isPasswordResetManagementContext(around)) return false

  return (
    hasSmsAppHashShape(text) ||
    hasCompactSmsLikeBody(text) ||
    hasSecurityShareContext(around)
  )
}

function hasCompactSmsLikeBody(text: string): boolean {
  const lineCount = text.split(/\n+/).filter(Boolean).length
  return text.length <= 260 && lineCount <= 4
}

function hasSmsAppHashShape(text: string): boolean {
  return /(?:^|\s)@[A-Za-z0-9.-]{3,80}\s+#?[A-Za-z0-9]{4,10}\s+B\d{3}\b/i.test(text)
}

function hasSecurityShareContext(around: string): boolean {
  return (
    /\b(?:do\s+not|don't|never)\s+share\b/i.test(around) ||
    /\b(?:share|send|give)\s+(?:it|this|code|password)\s+to\s+(?:no\s+one|nobody|anyone)\b/i.test(around) ||
    /\b(?:kimseyle|kimse\s+ile)\s+payla[sş]/i.test(around) ||
    /\b(?:guvenlig|g[üu]venli[gğ])\b/i.test(around) ||
    /\b(?:ne\s+partagez|no\s+comparta|não\s+compartilhe|non\s+condividere|nicht\s+teilen|niet\s+delen)\b/i.test(around)
  )
}

function isPasswordResetManagementContext(around: string): boolean {
  // Use Unicode-aware lookarounds instead of `\b`. Native `\b` only counts
  // ASCII word characters, so a "ş" or "é" left-edge silently bypasses the
  // guard for localized phrases like "Réinitialiser votre mot de passe"
  // or "Şifrenizi sıfırlayın".
  return PASSWORD_RESET_PATTERNS.some(p => p.test(around))
}

const PASSWORD_RESET_PATTERNS: ReadonlyArray<RegExp> = [
  // English
  /(?<![\p{L}\p{M}\p{N}])(?:reset|forgot|recover|change|update)\s+(?:your\s+)?password(?![\p{L}\p{M}\p{N}])/iu,
  /(?<![\p{L}\p{M}\p{N}])password\s+(?:reset|recovery|change|update)(?![\p{L}\p{M}\p{N}])/iu,
  // Turkish — base words admit possessive/case suffixes ("Şifrenizi
  // sıfırlayın"), so allow Latin-letter morphology between/after the
  // root verbs.
  /(?<![\p{L}\p{M}\p{N}])(?:sifre|şifre|parola)[\p{L}\p{M}]*\s+(?:sifirla|sıfırla|yenile|degistir|değiştir)[\p{L}\p{M}]*(?![\p{L}\p{M}\p{N}])/iu,
  // French
  /(?<![\p{L}\p{M}\p{N}])(?:réinitialiser|reinitialiser|récupérer|recuperer|changer|modifier|mettre\s+à\s+jour)\s+(?:votre\s+|ton\s+|le\s+)?mot\s+de\s+passe(?![\p{L}\p{M}\p{N}])/iu,
  /(?<![\p{L}\p{M}\p{N}])mot\s+de\s+passe\s+(?:oublié|perdu|réinitialisé|réinitialisation|récupération)(?![\p{L}\p{M}\p{N}])/iu,
  // Spanish — covers both infinitive ("restablecer") and imperative
  // ("restablece tu contraseña"), the more common CTA form.
  /(?<![\p{L}\p{M}\p{N}])(?:restablece|restablecer|recupera|recuperar|cambia|cambiar|actualiza|actualizar|olvidaste|olvidé)\s+(?:tu\s+|su\s+|la\s+|el\s+)?(?:contraseña|clave)(?![\p{L}\p{M}\p{N}])/iu,
  /(?<![\p{L}\p{M}\p{N}])(?:contraseña|clave)\s+(?:olvidada|nueva|restablecida|recuperación)(?![\p{L}\p{M}\p{N}])/iu,
  // German
  /(?<![\p{L}\p{M}\p{N}])passwort\s+(?:zurücksetzen|zuruecksetzen|ändern|aendern|aktualisieren|erneuern|wiederherstellen|vergessen)(?![\p{L}\p{M}\p{N}])/iu,
  /(?<![\p{L}\p{M}\p{N}])(?:neues|neu)\s+passwort(?![\p{L}\p{M}\p{N}])/iu,
  // Italian — allow up to two chained articles ("Reimposta la tua
  // password", "cambia la sua password").
  /(?<![\p{L}\p{M}\p{N}])(?:reimposta|reimpostare|recupera|recuperare|cambia|cambiare|aggiorna|aggiornare|dimenticato|dimenticata)\s+(?:(?:la|il|tua|sua|mia|tuo|suo|mio)\s+){0,2}password(?![\p{L}\p{M}\p{N}])/iu,
  /(?<![\p{L}\p{M}\p{N}])password\s+(?:dimenticata|smarrita|nuova)(?![\p{L}\p{M}\p{N}])/iu,
  // Portuguese
  /(?<![\p{L}\p{M}\p{N}])(?:redefinir|recuperar|alterar|atualizar|esqueci|esqueceu)\s+(?:sua\s+|a\s+|o\s+)?(?:senha|palavra-passe)(?![\p{L}\p{M}\p{N}])/iu,
  /(?<![\p{L}\p{M}\p{N}])(?:senha|palavra-passe)\s+(?:esquecida|nova|redefinida)(?![\p{L}\p{M}\p{N}])/iu,
  // Dutch
  /(?<![\p{L}\p{M}\p{N}])(?:reset|herstel|wijzig|verander|update|vernieuw)\s+(?:uw\s+|je\s+|jouw\s+|het\s+)?wachtwoord(?![\p{L}\p{M}\p{N}])/iu,
  /(?<![\p{L}\p{M}\p{N}])wachtwoord\s+(?:resetten|herstellen|wijzigen|veranderen|vernieuwen|vergeten|opnieuw\s+instellen|nieuw)(?![\p{L}\p{M}\p{N}])/iu,
  // Swedish
  /(?<![\p{L}\p{M}\p{N}])(?:återställ|aterstall|ändra|andra|byt|byta|uppdatera|glömt|glomt)\s+(?:ditt\s+|ert\s+)?(?:lösenord|losenord)[\p{L}\p{M}]*(?![\p{L}\p{M}\p{N}])/iu,
  // Finnish
  /(?<![\p{L}\p{M}\p{N}])(?:palauta|palauttaa|vaihda|muuta|päivitä|paivita|unohditko|unohtunut)\s+salasana[\p{L}\p{M}]*(?![\p{L}\p{M}\p{N}])/iu,
  // Danish
  /(?<![\p{L}\p{M}\p{N}])(?:nulstil|gendan|skift|ændr|aendr|opdater|glemt)\s+(?:din\s+|dit\s+)?adgangskode(?![\p{L}\p{M}\p{N}])/iu,
  // Norwegian
  /(?<![\p{L}\p{M}\p{N}])(?:tilbakestill|gjenopprett|endre|bytt|oppdater|glemt)\s+passord[\p{L}\p{M}]*(?:\s+ditt)?(?![\p{L}\p{M}\p{N}])/iu,
  // Polish
  /(?<![\p{L}\p{M}\p{N}])(?:resetuj|zresetuj|odzyskaj|zmień|zmien|aktualizuj|przypomnij)\s+(?:swoje\s+)?has(?:ł|l)o(?![\p{L}\p{M}\p{N}])/iu,
  // Czech
  /(?<![\p{L}\p{M}\p{N}])(?:obnovit|resetovat|změnit|zmenit|aktualizovat|zapomenuté|zapomenute)\s+(?:svoje\s+)?heslo(?![\p{L}\p{M}\p{N}])/iu,
  // Russian
  /(?<![\p{L}\p{M}\p{N}])(?:сбросить|восстановить|изменить|обновить|забыли|забыл|новый)\s+(?:ваш\s+)?пароль(?![\p{L}\p{M}\p{N}])/iu,
  // Ukrainian
  /(?<![\p{L}\p{M}\p{N}])(?:скинути|відновити|змінити|оновити|забули|новий)\s+(?:ваш\s+)?пароль(?![\p{L}\p{M}\p{N}])/iu,
  // Hindi
  /(?<![\p{L}\p{M}\p{N}])(?:अपना\s+)?पासवर्ड\s+(?:रीसेट|बदलें|बदले|अपडेट|पुनर्प्राप्त|नया)(?:\s+करें)?(?![\p{L}\p{M}\p{N}])/iu,
  /(?<![\p{L}\p{M}\p{N}])(?:रीसेट|बदलें|बदले|अपडेट|पुनर्प्राप्त)\s+(?:अपना\s+)?पासवर्ड(?![\p{L}\p{M}\p{N}])/iu,
  // Arabic
  /(?<![\p{L}\p{M}\p{N}])(?:إعادة\s+تعيين|اعادة\s+تعيين|استعادة|تغيير|تحديث)\s+(?:كلمة\s+المرور|كلمة\s+سر)(?![\p{L}\p{M}\p{N}])/iu,
  /(?<![\p{L}\p{M}\p{N}])(?:كلمة\s+المرور|كلمة\s+سر)\s+(?:الجديدة|جديدة|نسيت|إعادة\s+تعيين|اعادة\s+تعيين|استعادة)(?![\p{L}\p{M}\p{N}])/iu,
  // Japanese
  /(?<![\p{L}\p{M}\p{N}])パスワード(?:を)?(?:リセット|再設定|変更|更新|復元)(?:して(?:ください|下さい)?|する|します)?(?![\p{L}\p{M}\p{N}])/iu,
  /(?<![\p{L}\p{M}\p{N}])(?:新しい|新規)パスワード(?![\p{L}\p{M}\p{N}])/iu,
  // Korean
  /(?<![\p{L}\p{M}\p{N}])비밀번호(?:를)?\s*(?:재설정|초기화|변경|복구|업데이트)(?:하세요|합니다)?(?![\p{L}\p{M}\p{N}])/iu,
  /(?<![\p{L}\p{M}\p{N}])새\s*비밀번호(?![\p{L}\p{M}\p{N}])/iu,
  // Chinese
  /(?<![\p{L}\p{M}\p{N}])(?:重置|找回|修改|更改|更新|恢复)密码(?![\p{L}\p{M}\p{N}])/iu,
  /(?<![\p{L}\p{M}\p{N}])密码(?:重置|找回|修改|更改|更新|恢复)(?![\p{L}\p{M}\p{N}])/iu,
  /(?<![\p{L}\p{M}\p{N}])新密码(?![\p{L}\p{M}\p{N}])/iu,
  // Wi-Fi / network passwords (any language)
  /(?<![\p{L}\p{M}\p{N}])(?:wi[-\s]?fi|wireless|network|router)\s+(?:password|passcode|passwort|senha|wachtwoord|şifre|sifre|contraseña|clave|mot\s+de\s+passe)(?![\p{L}\p{M}\p{N}])/iu,
]

function isPlausibleOtpCandidate(text: string, c: InternalCandidate): boolean {
  const around = candidateWindow(text, c, 96).toLowerCase()

  if (isEmbeddedInUrl(text, c)) return false
  if (isCssToken(text, c)) return false
  if (isSmsAppHashToken(text, c)) return false
  if (isDateOrdinal(c.code)) return false
  if (isCommercialCodeContext(around)) return false
  if (isSoftwareCodeContext(around)) return false
  if (isStandaloneYear(c.code) && !hasStrongOtpContext(around)) return false

  return true
}

function candidateWindow(text: string, c: InternalCandidate, radius: number): string {
  return text.slice(Math.max(0, c.start - radius), Math.min(text.length, c.end + radius))
}

function isSmsAppHashToken(text: string, c: InternalCandidate): boolean {
  return /^B\d{3}$/i.test(c.code) && hasSmsAppHashShape(text)
}

function isEmbeddedInUrl(text: string, c: InternalCandidate): boolean {
  const segment = surroundingSegment(text, c.start, c.end)
  if (!segmentIncludesCandidate(segment, c)) return false

  return (
    /(?:https?:\/\/|www\.)/i.test(segment) ||
    /[?&][A-Za-z0-9_.~-]{1,40}=/.test(segment) ||
    /\/[A-Za-z0-9._~%+-]{4,}/.test(segment) ||
    /[A-Za-z0-9._~%+-]{16,}/.test(segment) && /[/?#&=]/.test(segment)
  )
}

function surroundingSegment(text: string, start: number, end: number): string {
  let left = start
  let right = end

  while (left > 0 && !/[\s<>"'()]/.test(text[left - 1])) left -= 1
  while (right < text.length && !/[\s<>"'()]/.test(text[right])) right += 1

  return text.slice(left, right)
}

function segmentIncludesCandidate(segment: string, c: InternalCandidate): boolean {
  const upper = segment.toUpperCase()
  return upper.includes(c.raw.toUpperCase()) || upper.includes(c.code)
}

function isCssToken(text: string, c: InternalCandidate): boolean {
  if (/^\d{1,4}(?:PX|EM|REM|VH|VW|PT|%)$/i.test(c.code)) {
    return true
  }

  if (!/^[0-9A-F]{6}$/i.test(c.code)) {
    return false
  }

  const around = candidateWindow(text, c, 40).toLowerCase()
  const escapedRaw = escapeRegExp(c.raw)
  return (
    new RegExp(`#\\s*${escapedRaw}`, 'i').test(around) ||
    /\b(?:background-color|color|border-color|style|inline-code)\b/i.test(around)
  )
}

function isCommercialCodeContext(around: string): boolean {
  return (
    /\b(?:coupon|promo(?:tional)?|discount|voucher|referral|affiliate|invite|deal|sale|register\s+now)\b/i.test(around) ||
    /\b(?:gutschein|rabatt|rabattcode|aktion|angebot|sparen|schulungskatalog|firmenkonditionen)\b/i.test(around) ||
    /\b(?:indirim|kupon|promosyon|kampanya|f[ıi]rsat|tasarruf|y[üu]zde)\b/i.test(around) ||
    /\b(?:r[ée]duction|remise|code\s+promo(?:tionnel)?|promotion|soldes|[ée]conomis(?:e|ez|er))\b/i.test(around) ||
    /\b(?:descuento|cup[oó]n|promoci[oó]n|oferta|ahorr(?:a|e|o)|c[oó]digo\s+promocional)\b/i.test(around) ||
    /\b(?:sconto|buono|promozione|offerta|risparmi(?:a|o)|codice\s+promo)\b/i.test(around) ||
    /\b(?:desconto|cup[oã]m|promo[cç][aã]o|oferta|economi(?:ze|zar)|c[oó]digo\s+promocional)\b/i.test(around) ||
    /\b(?:korting|kortingscode|actiecode|aanbieding|coupon)\b/i.test(around) ||
    /\b(?:rabat|rabatowy|kod\s+rabatowy|kupon|promocj[aei]|zni[zż]k[ai]|oszcz[eę]d[zź])\b/i.test(around) ||
    /\buse\s+(?:the\s+)?code\b.{0,40}\b(?:save|off|discount|deal|sale|register)\b/i.test(around) ||
    /\b(?:save|get)\s+\d{1,3}%\b/i.test(around) ||
    /\d{1,3}%\s+(?:off|discount|rabatt)\b/i.test(around) ||
    /\blifetime\s+(?:license|deal|access)\b/i.test(around)
  )
}

function isSoftwareCodeContext(around: string): boolean {
  if (hasStrongOtpContext(around)) return false

  return /\b(?:claude\s+code|codepen|source\s+code|inline-code|code\s+editor|code\s+review|low-code|no-code|coding|api\s+code|tutorials?|exercises?|classroom|w3schools|github|pull\s+request|issue\s+#?\d+|refactor|usecallback|current\s+docs|repository|repo)\b/i.test(around)
}

function isDateOrdinal(code: string): boolean {
  return /^\d{1,2}(?:ST|ND|RD|TH)$/i.test(code)
}

function isStandaloneYear(code: string): boolean {
  return /^(?:19|20)\d{2}$/.test(code)
}

function hasStrongOtpContext(around: string): boolean {
  return /\b(?:single-use|one[-\s]?time|verification|security|login|sign[-\s]?in|auth(?:entication)?|passcode|otp)\s+code\b/i.test(around) ||
    /\b(?:your|enter|use)\s+(?:verification\s+|security\s+|login\s+|sign[-\s]?in\s+|auth(?:entication)?\s+)?code\s+(?:is|below|to)\b/i.test(around)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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
    if (isNonOtpKeywordMatch(text, m)) continue

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
  // Only scan text AFTER the code. Real footers sit below the content;
  // scanning before the code produced false penalties when a preamble
  // contained neutral terms like "support" or "help" in a sentence
  // like "Need help? Your code is 123456."
  const after = text.slice(c.end, Math.min(text.length, c.end + 160)).toLowerCase()
  const footerHints =
    /\b(?:unsubscribe|preferences|support|help|customer\s+service|do\s+not\s+reply|please\s+do\s+not\s+reply|sent\s+from|regards|kind\s+regards|signature)\b/i
  return { applies: footerHints.test(after) }
}

/** Heuristic filter: looks like a phone number? */
function isNotPhoneLike(c: OTPCandidate): boolean {
  if (c.length >= 9 && c.charset === 'digits') return false // long pure number → likely not OTP
  // Penalize grouped patterns that resemble phone formatting in snippet
  const snip = (c.context?.snippet || '').toLowerCase()
  if (/\b(call|phone|tel|fax)\b/.test(snip)) return false
  return true
}

/**
 * Reject candidates that are the trailing digits of a transactional
 * reference number rather than a real OTP.
 *
 * Two grammars are detected, both anchored to the candidate's start
 * position so a real OTP appearing elsewhere in the same text is not
 * affected:
 *
 *   1. Reference label immediately preceding the candidate. A label
 *      token (`ref`, `reference`, `txn`, `tx`, `transaction`, `order`,
 *      `invoice`, `tracking`) followed only by ID-style noise
 *      (`:`, `.`, `#`, `-`, whitespace, alnum) up to the candidate.
 *      Catches "Ref: 1234", "txn ID 1234", "Order #1234".
 *
 *   2. Transactional grammar `[A-Z]{2,}\d{4,}-` immediately preceding
 *      the candidate. Catches the tail of compound IDs like
 *      `TXN20260505-1234` (the inner numeric `20260505` is excluded
 *      from candidacy by `RX_NUMERIC`'s look-behind, but the trailing
 *      `1234` is preceded only by `-` so it does match).
 *
 * Real OTP messages neighbor a verification keyword. When a message
 * carries both a real code and a reference tail, the OTP usually
 * outscores the tail and dedupe keeps the top entry; this filter is
 * mainly load-bearing for status-only messages ("OTP request pending,
 * Ref: TXN…") that contain no real code at all.
 */
function isNotTransactionReference(
  c: OTPCandidate,
  text: string
): boolean {
  if (c.charset !== 'digits') return true
  const start = c.context?.start
  if (start === undefined) return true

  // 30 chars is enough to capture "transaction id #" + a short ref ID;
  // cap at start to avoid scanning negative indices.
  const labelWindow = text.slice(Math.max(0, start - 30), start)
  const referenceLabel =
    /\b(?:ref(?:erence)?|txn|tx|transaction|order|invoice|tracking)\b[:.#\-\s]*[\w\-]*$/i
  if (referenceLabel.test(labelWindow)) return false

  const transactionalPrefix = /[A-Z]{2,}\d{4,}-$/
  const immediatePrefix = text.slice(Math.max(0, start - 25), start)
  if (transactionalPrefix.test(immediatePrefix)) return false

  return true
}

/** Reject candidates embedded in address/contact/domain metadata blocks. */
function isNotContactMetadata(c: OTPCandidate): boolean {
  const snip = (c.context?.snippet || '').toLowerCase()
  if (!snip) return true

  // "Address: 6295 ... City: ... State: ... Country code: ..."
  if (/\baddress\s*:\s*\d/.test(snip) && /\b(city|state|zip|postal|country)\b/.test(snip)) {
    return false
  }

  // Registrar/contact-review records often contain several metadata
  // fields in one compact block. These are not OTP contexts even when
  // a nearby label contains "country code" or "phone country code".
  const contactHints = [
    /\bcountry\s+code\b/,
    /\bphone\s+(?:country\s+)?code\b/,
    /\bphone\s+number\b/,
    /\bnameservers?\b/,
    /\bregistrant\b/,
    /\bicann\b/,
  ]
  const hitCount = contactHints.reduce((count, pattern) => (
    pattern.test(snip) ? count + 1 : count
  ), 0)

  if (hitCount >= 2 && /\b(address|city|state|zip|postal|country|phone)\b/.test(snip)) {
    return false
  }

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
