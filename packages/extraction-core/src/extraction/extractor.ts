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
  RESET_LINK_PATH_PATTERNS,
  DESTRUCTIVE_ACTION_PATH_PATTERNS,
  HARD_DANGER_BODY_KEYWORDS,
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

  // Subject-level destructive veto. The subject is where the email
  // declares its primary purpose - "Confirm account deletion" or
  // "Reset your password" in the subject means the entire email is
  // about that flow, regardless of how innocuous individual links
  // look. Drop the email entirely.
  //
  // We deliberately do NOT veto on body-text matches. Many
  // legitimate sign-in emails include a security footer like "If
  // this wasn't you, reset your password" - vetoing on body would
  // drop the magic link in that email even though the actual
  // purpose is sign-in. Per-link link-local context checks (added
  // in scoreLinkCandidate below) catch the case where the danger
  // wording is adjacent to a specific link rather than in a footer.
  if (containsAny(subject, HARD_DANGER_BODY_KEYWORDS)) {
    return []
  }

  // Harvest URLs first - cheap regex work, and the URL itself is
  // strong evidence of intent. Real magic-link URLs almost always
  // contain at least one MAGIC_LINK_URL_HINT in the path/query
  // (login, signin, magic, token, session, verify, continue), so a
  // matching URL alone is enough to admit the email even when the
  // body uses generic prose like "Click the link below to sign in"
  // that doesn't quite hit the keyword list.
  const anchors = harvestAnchors(html)
  const rawUrls = harvestRawUrls(text)
  const hasUrlHint =
    anchors.some(a => containsAny(a.href.toLowerCase(), MAGIC_LINK_URL_HINTS)) ||
    rawUrls.some(href => containsAny(href.toLowerCase(), MAGIC_LINK_URL_HINTS))

  // Admit if any of body keyword, subject keyword, or URL hint matches.
  // Without the URL-hint arm, fixtures using plain wording ("Click
  // the link below to sign in: https://app/.../auth?token=...") were
  // rejected even though the URL was unmistakably a magic link.
  const hasIntent =
    containsAny(lower, MAGIC_LINK_KEYWORDS) ||
    containsAny(subject, MAGIC_LINK_KEYWORDS) ||
    hasUrlHint
  if (!hasIntent) return []

  // Build candidates
  const candidates: LinkCandidate[] = []

  // 1) From <a href="...">anchor</a>. Pass each anchor's own
  //    pre-built local-context window so per-anchor danger checks
  //    don't collapse onto the first occurrence of repeated visible
  //    text like "Continue" / "Sign in".
  for (const a of anchors) {
    const cand = scoreLinkCandidate(a.href, a.anchorText, text, ctx, subject, a.localContext)
    if (cand) candidates.push(cand)
  }

  // 2) From plain text URLs (avoid duplicates). No localContext for
  //    raw URLs - hasLocalDangerContext locates them by URL string,
  //    which is unique enough that first-occurrence is safe.
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

/**
 * Extract <a href="..."> anchors with visible text (regex-based for
 * worker safety).
 *
 * Each anchor also carries a `localContext` snippet derived from the
 * visible text around its position in the source HTML. This is what
 * hasLocalDangerContext checks against - using indexOf on the
 * normalized body text would latch every <a>Continue</a> onto the
 * *first* "Continue" in the email, so a safe early Continue link
 * followed by a destructive "To delete your account, click
 * [Continue]" pair would have BOTH anchors checked against the safe
 * early context. Per-anchor windowing avoids that ambiguity.
 *
 * Window construction is intentionally NOT capped by raw HTML byte
 * count. Real email markup (table layouts, button wrappers, long
 * inline styles, MSO conditional comments) easily consumes 1500+
 * raw bytes between the visible "To delete your account" copy and
 * the anchor, even though the text is visually adjacent. We instead
 * strip tags from the full pre-anchor and post-anchor HTML and slice
 * by visible-character count - so markup density doesn't shrink the
 * effective neighborhood.
 *
 * Targets: 240 visible chars before, 80 after. Before-heavy bias
 * matches real email structure: purpose statements precede the link;
 * security footers follow it.
 *
 * Performance: O(N*K) where N = anchors and K = HTML size, because
 * each anchor strips the full pre-anchor prefix. For typical email
 * shapes (5-15 anchors, <50KB HTML) this is sub-millisecond.
 */
function harvestAnchors(html: string): Array<{ href: string; anchorText: string; localContext: string }> {
  const res: Array<{ href: string; anchorText: string; localContext: string }> = []
  if (!html) return res

  const re = /<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const href = (m[1] || '').trim()
    if (!href || /^(mailto:|tel:|#)/i.test(href)) continue
    // deny obvious dangerous anchors quickly
    if (containsAny(href.toLowerCase(), DANGEROUS_LINK_KEYWORDS)) continue
    const text = normalizeWhitespace(stripTags(m[2] || ''))

    // Per-anchor context. Strip the full pre/post HTML to visible
    // text, then slice by visible-char counts. Re-uses htmlToText so
    // script/style blocks and HTML entities are handled the same way
    // they are in the body normalization upstream.
    const beforeHtml = html.slice(0, m.index)
    const afterHtml = html.slice(m.index + m[0].length)
    const beforeText = htmlToText(beforeHtml)
    const afterText = htmlToText(afterHtml)
    const beforeWindow = beforeText.length > 240
      ? beforeText.slice(beforeText.length - 240)
      : beforeText
    const afterWindow = afterText.length > 80
      ? afterText.slice(0, 80)
      : afterText
    const localContext = `${beforeWindow} ${afterWindow}`.trim()

    res.push({ href, anchorText: text, localContext })
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

/**
 * Build and score one link candidate from context. Returns null if
 * clearly unsafe/noise.
 *
 * `localContext` is the per-anchor visible-text window from
 * harvestAnchors; for raw URLs it's omitted and the danger check
 * falls back to locating the URL in the full body. The distinction
 * matters because anchor visible text often repeats ("Continue" /
 * "Sign in" appear many times in promotional emails) so a body-wide
 * indexOf would attach every anchor to the first occurrence.
 */
function scoreLinkCandidate(href: string, anchorText: string, fullText: string, ctx: ExtractContext, subjectLower: string, localContext?: string): LinkCandidate | null {
  try { new URL(href) } catch { return null }

  const hrefLower = href.toLowerCase()
  const domain = safeHostname(href)

  // Hard denylists
  if (!domain) return null
  if (/^http:\/\//i.test(href)) return null // disallow plain HTTP for security
  // Dangerous wording in the URL itself (legacy: "/password-reset/",
  // "unsubscribe?...") OR in the anchor text the user actually sees
  // ("Verify account deletion" anchored to /verify-account-deletion).
  // Both surfaces matter because destructive links commonly use
  // innocent-looking URLs with the warning only in the visible text.
  const anchorLower = anchorText.toLowerCase()
  if (
    containsAny(hrefLower, DANGEROUS_LINK_KEYWORDS) ||
    (anchorLower && containsAny(anchorLower, DANGEROUS_LINK_KEYWORDS))
  ) {
    return null
  }

  // Link-local destructive-context veto. For each candidate, look at
  // the visible text immediately before/around the link in the body.
  // If a hard-danger phrase (e.g. "Reset your password", "Confirm
  // account deletion") appears in that local window AND the link
  // itself lacks strong login evidence, reject.
  //
  // The local window is intentionally before-heavy: real sign-in
  // emails often include a security footer ("If this wasn't you,
  // reset your password") AFTER the magic link. A whole-body or
  // after-only check would drop those legitimate links.
  //
  // Strong login evidence (anchor text "Sign in" / "Magic link" /
  // "Passwordless"; href path /login, /signin, /magic, /session)
  // overrides the veto - those signals are precise enough that a
  // co-located warning shouldn't kill the link.
  if (hasLocalDangerContext(fullText, href, anchorText, localContext) && !hasStrongLoginEvidence(href, anchorText)) {
    return null
  }

  // Reject password-reset / account-recovery and destructive-action
  // URLs. Both consume sensitive tokens and force flows the user may
  // not have initiated. Pre-PR-1 these were filtered indirectly via
  // the strict body-keyword intent gate; that gate now also admits
  // on URL hints (so magic-link emails with generic prose work), so
  // both reset (/reset?token=...) and destructive
  // (/verify-account-deletion?token=...) emails need explicit
  // path-anchored filters.
  try {
    const pathname = new URL(href).pathname
    if (RESET_LINK_PATH_PATTERNS.some(p => p.test(pathname))) return null
    if (DESTRUCTIVE_ACTION_PATH_PATTERNS.some(p => p.test(pathname))) return null
  } catch { /* unparseable URL - already rejected above */ }

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
 * True if the visible text immediately around the link contains a
 * hard-danger phrase. "Around" leans heavily before the link because
 * email security footers (often AFTER the link) routinely say "If
 * this wasn't you, reset your password" - that's noise, not intent.
 *
 * For HTML anchors, callers pass `localContext` - the per-anchor
 * visible-text window built from the anchor's actual position in the
 * source HTML. This is the precise path: every anchor gets its own
 * neighborhood, even when many anchors share visible text.
 *
 * For raw plain-text URLs, no localContext is provided and we
 * locate the URL by searching `fullText`. Raw URLs almost never
 * repeat (they carry unique tokens), so first-occurrence is safe.
 */
function hasLocalDangerContext(
  fullText: string,
  href: string,
  anchorText: string,
  localContext?: string,
): boolean {
  // Anchor path: harvest provided a precomputed window.
  if (localContext !== undefined) {
    if (!localContext) return false
    return containsAny(localContext.toLowerCase(), HARD_DANGER_BODY_KEYWORDS)
  }

  // Raw-URL path: locate by URL string in body.
  const text = fullText || ''
  const idx = text.indexOf(href)
  if (idx === -1) {
    // URL not directly in normalized body (rare). Fall back to
    // checking anchor text + href in isolation.
    const fallback = (anchorText + ' ' + href).toLowerCase()
    return containsAny(fallback, HARD_DANGER_BODY_KEYWORDS)
  }

  // Before-heavy window: 240 chars before, 80 after.
  const start = Math.max(0, idx - 240)
  const end = Math.min(text.length, idx + href.length + 80)
  const window = text.slice(start, end).toLowerCase()
  return containsAny(window, HARD_DANGER_BODY_KEYWORDS)
}

/**
 * True if the link itself carries strong login-flow signal. These
 * markers are precise enough that a co-located danger phrase
 * shouldn't kill the link (real magic-link emails sometimes show a
 * sign-in link right next to a "or reset your password" alternative).
 *
 * Generic markers like "verify", "confirm", "continue", and the
 * "token" query param are deliberately NOT counted as strong - they
 * appear too broadly across destructive flows too.
 */
function hasStrongLoginEvidence(href: string, anchorText: string): boolean {
  const STRONG_TEXT_MARKERS = [
    'sign in', 'sign-in', 'signin',
    'log in', 'log-in', 'login',
    'magic link',
    'passwordless',
    'sso',
    'single sign-on',
    'single sign on',
  ]
  const STRONG_PATH_MARKERS = ['/login', '/signin', '/sign-in', '/magic', '/session']

  const text = (anchorText || '').toLowerCase()
  if (text && STRONG_TEXT_MARKERS.some(m => text.includes(m))) return true

  try {
    const path = new URL(href).pathname.toLowerCase()
    if (STRONG_PATH_MARKERS.some(m => path.includes(m))) return true
  } catch { /* ignore */ }

  return false
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
