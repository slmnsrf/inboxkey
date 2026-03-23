// email-polling-service.ts
// InboxKey — Email Polling Service (MV3-safe, no external deps)
// -----------------------------------------------------------------------------
// Goals
// • Fast, privacy-first polling limited to *recent* messages (default 10 minutes).
// • Minimal payload: fetch metadata first; fetch full bodies only when needed (adapter-level).
// • Strict gating: return *only* emails with a confident OTP or magic link.
// • Backward-compatible with earlier InboxKey polling signatures.
//
// Backward-compatible exports (superset):
//   - class EmailPollingService
//   - interfaces: ProviderAdapter, PollConfig, CandidateRecord
//   - methods: pollOnce(ctx, cfg?), getLast(), clear(), addAdapter(), removeAdapter()
//   - default export (EmailPollingService)
//
// This module depends on the extraction-core package:
//   import { extractFromEmail } from '@inboxkey/extraction-core'
// which provides OTP and magic-link extraction logic.
// -----------------------------------------------------------------------------

import { extractFromEmail } from '@inboxkey/extraction-core'
import { SCORE_POPUP } from '@/lib/popup/popup-config'
import { SeenMessageStore } from './seen-message-store'

// ---------------- Types ----------------

export type ProviderId = 'gmail' | 'outlook' | 'imap' | 'imap-bridge' | 'google-messages'

export interface EmailLike {
  id: string
  provider: ProviderId
  /** The specific mailbox this email came from (required for multi-account disambiguation). */
  mailboxId: string
  subject?: string
  from?: string
  receivedEpochMs?: number
  // At least one of the following should be present; adapters can pass lightweight snippets.
  text?: string
  html?: string
  // Optional optimization hints for adapters (opaque to service).
  _meta?: Record<string, unknown>
}

export interface ProviderAdapter {
  id: ProviderId
  /** The specific mailbox this adapter is bound to (required for multi-account disambiguation). */
  mailboxId: string
  /**
   * Fetch *recent* messages for this provider, bounded by time and count.
   * Implementations should do a metadata-first pass and, when possible,
   * only include lightweight previews (subject, from, small body excerpt).
   * If you paginate internally, use your own cursoring. The service keeps a seen-set.
   */
  listRecent(params: {
    sinceEpochMs: number,
    max: number,
    keywordHint?: string
  }): Promise<EmailLike[]>
}

export interface ExtractContext {
  expected?: { length?: number; charset?: 'digits'|'alnum' }
  pageDomain?: string
  brandHints?: string[]
  meta?: {
    provider?: ProviderId
    sender?: string
    subject?: string
    received?: number
  }
}

export interface PollConfig {
  /** Minutes back from now to consider "recent". Default: 10. */
  timeWindowMin?: number
  /** Cap *per provider* results pulled per poll. Default: 8. */
  perProviderMax?: number
  /** Global cap (across providers) processed per poll. Default: 20. */
  globalMax?: number
  /** Keep top-N candidates in memory for popup. Default: 5. */
  keepTopN?: number
  /** Minimum score to keep a candidate (OTP or link). Default: 0.60 (SCORE_POPUP). */
  minScore?: number
  /** Abort signal to cancel this poll (MV3 safe). */
  signal?: AbortSignal
}

export interface AdapterResult {
  mailboxId: string
  success: boolean
  error?: string
}

export interface PollResult {
  candidates: CandidateRecord[]
  adapterResults: AdapterResult[]
}

export interface CandidateRecord {
  provider: ProviderId
  /** Which specific mailbox this candidate came from (required for multi-account disambiguation). */
  mailboxId: string
  messageId: string
  subject?: string
  from?: string
  receivedEpochMs?: number
  /** OTP candidate (normalized) */
  code?: { value: string, kind: 'digits'|'alnum', score: number }
  /** Magic link candidate */
  link?: { href: string, domain: string, score: number }
  /** Debug: combined score used for ranking */
  score: number
}

// ---------------- Service ----------------

export class EmailPollingService {
  private adapters: ProviderAdapter[] = []
  private cache: CandidateRecord[] = []
  private seenMessageIds = new Set<string>()   // suppress duplicates between polls
  // @ts-expect-error: Reserved for future rate limiting
  private lastPollEpochMs = 0

  constructor(adapters: ProviderAdapter[] = [], private seenStore?: SeenMessageStore) {
    this.adapters = adapters.slice()
  }

  addAdapter(adapter: ProviderAdapter) {
    if (!this.adapters.find(a => a.id === adapter.id)) {
      this.adapters.push(adapter)
    }
  }

  removeAdapter(providerId: ProviderId) {
    this.adapters = this.adapters.filter(a => a.id !== providerId)
  }

  clear() {
    this.cache = []
    this.seenMessageIds.clear()
    this.lastPollEpochMs = 0
  }

  /** Return a shallow copy of last accepted candidates (for popup). */
  getLast(): CandidateRecord[] { return this.cache.slice() }

  /**
   * Poll all providers once. Returns only candidates (OTP or magic link)
   * meeting minScore. Keeps a small, recent cache for the popup.
   *
   * Behavior:
   *  • Queries only "recent" emails (default 10 minutes).
   *  • Caps per-provider fetches (default 8) and a global processed cap (default 20).
   *  • Uses seenMessageIds to avoid re-processing the same items.
   *  • Extracts OTPs and magic links via extractFromEmail().
   *  • Keeps top-N by (recency → score) in memory (default 5).
   */
  async pollOnce(ctx: ExtractContext = {}, cfg: PollConfig = {}): Promise<PollResult> {
    const now = Date.now()
    const since = now - 1000 * 60 * (cfg.timeWindowMin ?? 10)
    const perProviderMax = clampInt(cfg.perProviderMax ?? 8, 1, 50)
    const globalMax = clampInt(cfg.globalMax ?? 20, 1, 100)
    const minScore = clamp01(cfg.minScore ?? SCORE_POPUP)
    const keepTopN = clampInt(cfg.keepTopN ?? 5, 1, 20)

    // Build hint to reduce provider payloads
    const keywordHint = 'code OR verification OR "one-time" OR otp OR "magic link" OR login'

    const results: CandidateRecord[] = []
    const adapterResults: AdapterResult[] = []
    let processed = 0

    // Fetch from providers in parallel but respect AbortSignal
    await Promise.all(this.adapters.map(async (ad) => {
      if (cfg.signal?.aborted) return
      if (!ad.mailboxId) {
        console.warn(`[EmailPollingService] skipping adapter without mailboxId: ${ad.id}`)
        adapterResults.push({ mailboxId: ad.mailboxId || 'unknown', success: false, error: 'missing mailboxId' })
        return
      }
      try {
        const batch = await ad.listRecent({ sinceEpochMs: since, max: perProviderMax, keywordHint })
        for (const msg of batch) {
          if (cfg.signal?.aborted) break
          if (processed >= globalMax) break

          // Service-side freshness floor: reject messages outside time window
          // (compensates for Gmail's day-granularity newerThan rounding)
          if (msg.receivedEpochMs && msg.receivedEpochMs < since) continue

          // Skip messages we've processed before (use adapter.mailboxId for multi-account)
          const seenKey = `${ad.mailboxId}:${msg.id}`
          if (this.seenStore) {
            if (await this.seenStore.hasSeen(seenKey)) continue
            await this.seenStore.add(seenKey)
          } else {
            // Fallback to in-memory set (backward compat for callers that don't pass store)
            if (this.seenMessageIds.has(seenKey)) continue
            this.seenMessageIds.add(seenKey)
          }

          const subject = msg.subject || ''
          const ext = extractFromEmail(
            { subject: msg.subject, text: msg.text, html: msg.html },
            {
              expected: ctx.expected,
              pageDomain: ctx.pageDomain,
              brandHints: ctx.brandHints,
              meta: {
                // Cast: google-messages adapters don't use extractFromEmail (SMS has its own pipeline)
                provider: msg.provider as 'gmail' | 'outlook' | 'imap' | 'imap-bridge',
                sender: msg.from,
                subject,
                received: msg.receivedEpochMs
              }
            },
            // ExtractionOptions currently unused — reserved for future tuning
            {}
          )

          // Choose the better of OTP or link by their own score
          const topOtp = ext.otps && ext.otps[0]
          const topLink = ext.links && ext.links[0]

          const otpScore = topOtp ? topOtp.confidence : 0
          const linkScore = topLink ? (topLink.score ?? 0) : 0
          const topScore = Math.max(otpScore, linkScore)

          // Gate by minScore; ignore everything else
          if (topScore >= minScore) {
            const rec: CandidateRecord = {
              provider: msg.provider,
              mailboxId: ad.mailboxId,
              messageId: msg.id,
              subject: msg.subject,
              from: msg.from,
              receivedEpochMs: msg.receivedEpochMs,
              score: topScore,
            }
            if (otpScore >= linkScore && topOtp) {
              const kind = topOtp.charset
              rec.code = { value: topOtp.code, kind, score: otpScore }
            } else if (topLink) {
              rec.link = { href: topLink.href, domain: topLink.domain, score: linkScore }
            }
            results.push(rec)
            processed++
          }
        }
        adapterResults.push({ mailboxId: ad.mailboxId, success: true })
      } catch (err) {
        // Swallow provider errors to keep other adapters running
        adapterResults.push({
          mailboxId: ad.mailboxId,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }))

    // Merge with cache; dedupe by code value or link href (prefer newer & higher score)
    const merged = dedupeCandidates([...this.cache, ...results])

    // Sort: newest first, then by score
    merged.sort((a, b) =>
      (b.receivedEpochMs ?? 0) - (a.receivedEpochMs ?? 0) || b.score - a.score
    )

    // Keep top N
    this.cache = merged.slice(0, keepTopN)
    this.lastPollEpochMs = now
    return { candidates: this.cache.slice(), adapterResults }
  }
}

// ---------------- Dedupe & helpers ----------------

/** Prefer newer & higher scoring candidate on collisions (same code or same link). */
function dedupeCandidates(items: CandidateRecord[]): CandidateRecord[] {
  const map = new Map<string, CandidateRecord>()
  for (const it of items) {
    const key = it.code
      ? `c:${it.provider}:${it.from || ''}:${it.code.value}`
      : it.link
        ? `l:${normalizeUrl(it.link.href)}`
        : `m:${it.messageId}`
    const prev = map.get(key)
    if (!prev) { map.set(key, it); continue }

    // Prefer newer received time; tie-break on score
    const prevTs = prev.receivedEpochMs ?? 0
    const curTs = it.receivedEpochMs ?? 0
    if (curTs > prevTs) { map.set(key, it); continue }
    if (curTs === prevTs && it.score > prev.score) { map.set(key, it); continue }
  }
  return Array.from(map.values())
}

function normalizeUrl(u: string): string {
  try {
    const x = new URL(u)
    // Remove trailing slash parity; keep query intact
    x.pathname = x.pathname.replace(/\/+$/, '')
    return x.toString()
  } catch { return u }
}

function clampInt(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(n)))
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : +n.toFixed(4)
}

// ---------------- Default export ----------------

export default EmailPollingService
