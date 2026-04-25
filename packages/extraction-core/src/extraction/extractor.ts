// extractor.ts
// InboxKey — Unified extraction wrapper (OTP + Magic Link)
// MV3-safe • No external dependencies • Backward-compatible exports
//
// Exports (unchanged):
//   - extractFromEmail(email, ctx?, opt?) → { otps, links }
//   - extractMagicLinks(email, ctx?, opt?) → LinkCandidate[]
//   - default export { extractFromEmail, extractMagicLinks }
//
// Improvements:
//   • Stronger, windowed magic-link extraction with deny/allow heuristics
//   • Safer HTML → text conversion and anchor harvesting (regex-based, worker-safe)
//   • Domain proximity scoring vs. current page, subject/keyword boosts, HTTPS check
//   • Deterministic de-duplication and concise debug snippets
//   • Compatible with upgraded otp-extractor.ts (single options object)

/* eslint-disable no-useless-escape */

import {
  MAGIC_LINK_KEYWORDS,
  MAGIC_LINK_URL_HINTS,
  DANGEROUS_LINK_KEYWORDS,
  TRACKER_HOST_PATTERNS,
  TRACKER_PATH_PATTERNS,
  TRACKER_URL_PARAM_NAMES,
} from './extraction-types.js'
import { extractOTPs } from './otp-extractor.js'

// ---------------- Types (local, to avoid hard coupling) ----------------

export type Charset = 'digits' | 'alnum'

export interface ExtractContext {
  expected?: { length?: number; charset?: Charset }
  pageDomain?: string
  brandHints?: string[]
  meta?: {
    provider?: 'gmail' | 'outlook' | 'imap' | 'imap-bridge'
    sender?: string
    subject?: string
    received?: number
  }
}

export interface ExtractionOptions {
  /** Window radius for keyword proximity (used by OTP extractor when passed through). */
  keywordWindowRadius?: number
  /** Minimum score for returning magic links (0..1). Default: 0.5 */
  minScore?: number
  /** Cap returned links (after ranking). Default: 6 */
  maxLinks?: number
}

export interface LinkCandidate {
  kind: 'magic-link'
  href: string
  domain: string
  score: number      // 0..1
  reasons: string[]
  snippet?: string   // short excerpt around the URL/anchor text
}

export interface ExtractResult {
  otps: ReturnType<typeof extractOTPs>
  links: LinkCandidate[]
}

// ---------------- Public API ----------------

/** Unified extraction for a single email payload. */
export function extractFromEmail(
  email: { subject?: string; text?: string; html?: string },
  ctx: ExtractContext = {},
  opt: ExtractionOptions = {}
): ExtractResult {
  const body = pickBestBody(email)
  const subject = (ctx.meta?.subject ?? email.subject ?? '')

  // Pass a single options object to the OTP extractor (compatible with v2 API).
  const otps = extractOTPs(body, {
    expectedLength: ctx.expected?.length,
    expectedCharset: ctx.expected?.charset,
    subject,
    threshold: undefined,               // let extractor default to precision-first
    windowRadius: opt.keywordWindowRadius,
    maxResults: 3,
  })

  const links = extractMagicLinks(email, ctx, opt)
  return { otps, links }
}

/** Extract and rank Magic Links conservatively. */
export function extractMagicLinks(
  email: { subject?: string; text?: string; html?: string },
  ctx: ExtractContext = {},
  opt: ExtractionOptions = {}
): LinkCandidate[] {
  const minScore = clamp01(opt.minScore ?? 0.5)
  const maxLinks = Math.max(1, Math.min(12, opt.maxLinks ?? 6))

  const plain = (email.text ?? '')
  const html = (email.html ?? '')
  const subject = (ctx.meta?.subject ?? email.subject ?? '').toLowerCase()

  // Normalize sources
  const textFromHtml = html ? htmlToText(html) : ''
  const text = normalizeWhitespace((plain || '') + (textFromHtml ? (' ' + textFromHtml) : ''))
  const lower = text.toLowerCase()

  // Quick intent check before URL work
  const hasIntent = containsAny(lower, MAGIC_LINK_KEYWORDS) || containsAny(subject, MAGIC_LINK_KEYWORDS)
  if (!hasIntent) return []

  // Harvest anchors from HTML (best signal), then raw URLs from text/plain
  const anchors = harvestAnchors(html)
  const rawUrls = harvestRawUrls(text)

  // Build candidates
  const candidates: LinkCandidate[] = []

  // 1) From <a href="...">anchor</a>
  for (const a of anchors) {
    const cand = scoreLinkCandidate(a.href, a.anchorText, text, ctx, subject)
    if (cand) candidates.push(cand)
  }

  // 2) From plain text URLs (avoid duplicates)
  for (const href of rawUrls) {
    // Skip if already present from anchors
    if (anchors.some(a => sameUrl(a.href, href))) continue
    const cand = scoreLinkCandidate(href, '', text, ctx, subject)
    if (cand) candidates.push(cand)
  }

  // Rank, threshold, de-dup
  const deduped = dedupeLinks(candidates)
    .filter(c => c.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxLinks)

  return deduped
}

// ---------------- Implementation ----------------

/** Prefer text/plain; fallback to HTML→text; otherwise a trimmed subject. */
function pickBestBody(email: { subject?: string; text?: string; html?: string }): string {
  if (email.text && email.text.trim()) return email.text
  if (email.html && email.html.trim()) return htmlToText(email.html)
  return (email.subject || '').trim()
}

/** Minimal HTML→text conversion (MV3 worker-safe). */
function htmlToText(html: string): string {
  if (!html) return ''
  // Remove script/style/comments first
  let s = html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
              .replace(/<style[\s\S]*?<\/style>/gi, ' ')
              .replace(/<!--[\s\S]*?-->/g, ' ')
  // Replace common block separators with newlines to preserve some structure
  s = s.replace(/<(?:br|\/p|\/div|\/li|\/tr|\/table)\b[^>]*>/gi, '\n')
  // Strip tags
  s = s.replace(/<\/?[^>]+>/g, ' ')
  // Decode minimal entities
  s = s.replace(/&nbsp;/gi, ' ')
       .replace(/&amp;/gi, '&')
       .replace(/&lt;/gi, '<')
       .replace(/&gt;/gi, '>')
  return normalizeWhitespace(s)
}

/** Extract <a href="..."> anchors with visible text (regex-based for worker safety). */
function harvestAnchors(html: string): Array<{ href: string; anchorText: string }> {
  const res: Array<{ href: string; anchorText: string }> = []
  if (!html) return res

  const re = /<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const href = (m[1] || '').trim()
    if (!href || /^(mailto:|tel:|#)/i.test(href)) continue
    // deny obvious dangerous anchors quickly
    if (containsAny(href.toLowerCase(), DANGEROUS_LINK_KEYWORDS)) continue
    const text = normalizeWhitespace(stripTags(m[2] || ''))
    res.push({ href, anchorText: text })
  }
  return res
}

/** Harvest bare URLs from plain text safely (no HTML tags). */
function harvestRawUrls(text: string): string[] {
  if (!text) return []
  const urls = Array.from(text.matchAll(/\bhttps?:\/\/[^\s<>"']{6,}/gi)).map(m => m[0])
  return Array.from(new Set(urls))
}

/** Strip tags from a small fragment (used for anchor text). */
function stripTags(s: string): string {
  return s.replace(/<\/?[^>]+>/g, ' ')
}

/** Normalize/condense whitespace. */
function normalizeWhitespace(s: string): string {
  return (s || '').replace(/\s+/g, ' ').trim()
}

/** Build and score one link candidate from context. Returns null if clearly unsafe/noise. */
function scoreLinkCandidate(href: string, anchorText: string, fullText: string, ctx: ExtractContext, subjectLower: string): LinkCandidate | null {
  try { new URL(href) } catch { return null }

  const hrefLower = href.toLowerCase()
  const domain = safeHostname(href)

  // Hard denylists
  if (!domain) return null
  if (/^http:\/\//i.test(href)) return null // disallow plain HTTP for security
  if (containsAny(hrefLower, DANGEROUS_LINK_KEYWORDS)) return null // unsubscribe, reset password, etc.

  // Reject ESP click-tracking redirectors. The tracker's 302 lands the
  // user on the real destination, but we surface URLs to the user
  // verbatim - showing them a "magic link" that points to
  // click.example-tracker.com erodes trust and leaks click events.
  if (isTrackerUrl(href)) return null

  // Base score & reasons
  let score = 0.30
  const reasons: string[] = []

  // Keyword intent (anywhere in the message)
  if (containsAny(fullText.toLowerCase(), MAGIC_LINK_KEYWORDS) || anchorContainsIntent(anchorText)) {
    score += 0.18; reasons.push('keyword:intent')
  }

  // URL hints
  if (containsAny(hrefLower, MAGIC_LINK_URL_HINTS)) {
    score += 0.24; reasons.push('url-hint')
  }

  // Subject participation
  if (containsAny(subjectLower, MAGIC_LINK_KEYWORDS)) {
    score += 0.10; reasons.push('subject:intent')
  }

  // Domain proximity to current page (if provided)
  const page = (ctx.pageDomain || '').toLowerCase()
  if (page && sameOrSubdomain(domain, hostOnly(page))) {
    score += 0.26; reasons.push('domain≈page')
  } else if (ctx.brandHints?.length) {
    // Light brand hint from caller
    const bh = ctx.brandHints.map(s => s.toLowerCase())
    if (bh.some(b => domain.includes(b))) { score += 0.10; reasons.push('brand-hint') }
  }

  // Anchor language (friendly button text often used by magic links)
  if (anchorContainsIntent(anchorText)) {
    score += 0.10; reasons.push('anchor:intent')
  }

  // Final clamp
  score = clamp01(score)

  return {
    kind: 'magic-link',
    href,
    domain,
    score,
    reasons,
    snippet: snippetAround(fullText, href, 96),
  }
}

function anchorContainsIntent(text: string): boolean {
  const t = (text || '').toLowerCase()
  if (!t) return false
  return containsAny(t, MAGIC_LINK_KEYWORDS) || /^(open|continue|sign\s?in|log\s?in|verify|confirm)/i.test(t)
}

/** True if URLs are essentially equal once normalized (case-insensitive). */
function sameUrl(a: string, b: string): boolean {
  try {
    const ua = new URL(a), ub = new URL(b)
    return ua.protocol === ub.protocol &&
           ua.hostname.toLowerCase() === ub.hostname.toLowerCase() &&
           ua.pathname === ub.pathname &&
           ua.search === ub.search
  } catch { return a === b }
}

function dedupeLinks(list: LinkCandidate[]): LinkCandidate[] {
  const map = new Map<string, LinkCandidate>()
  for (const c of list) {
    const key = c.href
    const prev = map.get(key)
    if (!prev || c.score > prev.score) map.set(key, c)
  }
  return Array.from(map.values())
}

// ---------------- Small helpers ----------------

function containsAny(hay: string, needles: readonly string[]): boolean {
  const l = (hay || '').toLowerCase()
  return needles.some(n => l.includes(n.toLowerCase()))
}

function safeHostname(u: string): string {
  try { return new URL(u).hostname.toLowerCase() } catch { return '' }
}

/**
 * True if the URL is an ESP click-tracking redirector. Detection is
 * three-pronged because trackers split between dedicated hostnames
 * (hubspotlinks.com), brand subdomains hosting redirector paths
 * (e.deepgram.com/e3t/...), and generic shorteners that embed the
 * destination in a query param (?u=https%3A%2F%2F...).
 */
export function isTrackerUrl(href: string): boolean {
  let url: URL
  try { url = new URL(href) } catch { return false }

  const host = url.hostname.toLowerCase()
  for (const pattern of TRACKER_HOST_PATTERNS) {
    if (pattern.test(host)) return true
  }

  const pathname = url.pathname
  for (const pattern of TRACKER_PATH_PATTERNS) {
    if (pattern.test(pathname)) return true
  }

  // Embedded-destination query: any tracker param whose value parses
  // as an http(s) URL. Catches generic shorteners that don't match
  // the host or path lists above.
  for (const name of TRACKER_URL_PARAM_NAMES) {
    const value = url.searchParams.get(name)
    if (!value) continue
    if (/^https?:\/\//i.test(value)) return true
    // Try one decode pass for percent-encoded inner URLs
    try {
      if (/^https?:\/\//i.test(decodeURIComponent(value))) return true
    } catch { /* malformed encoding, ignore */ }
  }

  return false
}

function hostOnly(d: string): string {
  try { return new URL(/^https?:\/\//.test(d) ? d : `https://${d}`).hostname.toLowerCase() } catch { return d.toLowerCase() }
}

function sameOrSubdomain(a: string, b: string): boolean {
  if (!a || !b) return false
  return a === b || a.endsWith('.' + b) || b.endsWith('.' + a)
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : +n.toFixed(4)
}

function snippetAround(text: string, token: string, radius = 80): string {
  const idx = text.indexOf(token)
  if (idx === -1) return ''
  const start = Math.max(0, idx - radius)
  const end = Math.min(text.length, idx + token.length + radius)
  const left = start > 0 ? '…' : ''
  const right = end < text.length ? '…' : ''
  return left + text.slice(start, end).replace(/\s+/g, ' ') + right
}

// ---------------- Default export ----------------

export default { extractFromEmail, extractMagicLinks }
