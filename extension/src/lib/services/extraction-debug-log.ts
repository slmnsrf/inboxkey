/**
 * Extraction Debug Log
 * --------------------
 * Opt-in, persistent ring buffer that records what `EmailPollingService`
 * decided about each fetched email. Surfaced in Settings → Advanced →
 * Debug, used to diagnose "0 candidates found" cases by showing exactly
 * which gate rejected a message and why.
 *
 * Privacy posture
 *   - Stored only in chrome.storage.local; never leaves the device.
 *   - Captures email metadata (from, subject, received) and extraction
 *     traces (scores, keywords, snippets). NEVER captures full body
 *     content, full magic-link URLs, or raw OTP code values.
 *   - OTP code values are redacted (first 2 chars + asterisks + length).
 *   - Toggling off does NOT auto-wipe; the user clears explicitly.
 *
 * Storage shape
 *   - Toggle:     settings.extractionDebugLogEnabled (boolean)
 *   - Log array:  top-level key STORAGE_KEYS.EXTRACTION_DEBUG_LOG
 *                 (separate from settings so high-frequency appends
 *                  don't trigger settings-change observers)
 *
 * Concurrency
 *   - `pollOnce` fetches adapters in parallel; without batching, two
 *     concurrent appendEntry calls race on read-modify-write of the
 *     same chrome.storage key and silently drop entries.
 *   - The polling service therefore collects entries in a poll-local
 *     array and calls `appendEntries(batch)` once at end of poll.
 *   - Inside this module, an internal promise queue serializes writes
 *     so even if two batches overlap (e.g. concurrent pollOnce calls),
 *     no entry is lost.
 */

import { STORAGE_KEYS } from '@/lib/storage/schema'

/** Discriminated outcome — each branch describes one decision the polling service can take. */
export type ExtractionLogOutcome =
  | { kind: 'skipped-too-old'; ageMs: number; thresholdMs: number }
  | { kind: 'skipped-seen' }
  | {
      kind: 'extracted'
      topScore: number
      minScore: number
      passed: boolean
      otps: ExtractionLogOtp[]
      links: ExtractionLogLink[]
    }
  | { kind: 'extraction-error'; error: string }
  | { kind: 'provider-error'; error: string }

export interface ExtractionLogOtp {
  /** Redacted code: first 2 chars + asterisks + length (e.g. "12**** (6)"). */
  codeRedacted: string
  charset: 'digits' | 'alnum'
  confidence: number
  keyword?: string
  /** Snippet of body around the match, kept for debugging (≤ 80 chars). */
  snippet?: string
  /** Char distance to the nearest keyword. Lower is better. */
  keywordDistance?: number
}

export interface ExtractionLogLink {
  domain: string
  /** First 50 chars of the path; query string and fragment stripped (token safety). */
  pathPreview?: string
  score: number
  reasons: string[]
}

export interface ExtractionLogEntry {
  /** Decision timestamp (Date.now()). */
  ts: number
  /** Extractor version stamp at decision time. Lets us filter logs after a version bump. */
  extractorVersion: string
  /** Provider that fetched this message. */
  provider: 'imap' | 'imap-bridge' | 'google-messages'
  /** Mailbox UUID. */
  mailboxId: string
  /** Email metadata (no body, no full URLs). */
  message: {
    id: string
    from?: string
    subject?: string
    receivedEpochMs?: number
    bodyTextLen: number
    bodyHtmlLen: number
  }
  outcome: ExtractionLogOutcome
}

/** Maximum number of entries retained. ~500 bytes/entry → ~100 KB at full. */
export const EXTRACTION_DEBUG_LOG_CAP = 200

const STORAGE_KEY = STORAGE_KEYS.EXTRACTION_DEBUG_LOG

/**
 * Module-scoped write queue. Every read-modify-write goes through this
 * promise chain; concurrent callers are awaited rather than racing.
 * Trade-off: serialized writes have no parallelism, but the ring buffer
 * is small (≤200) and writes are infrequent (once per pollOnce batch).
 */
let writeQueue: Promise<void> = Promise.resolve()

function enqueueWrite(task: () => Promise<void>): Promise<void> {
  const next = writeQueue.then(task, task) // run task even if a prior task rejected
  writeQueue = next.catch(() => {})
  return next
}

/** Read the current log (newest first). Empty array if disabled or never written. */
export async function getEntries(): Promise<ExtractionLogEntry[]> {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY)
    const entries = stored[STORAGE_KEY]
    return Array.isArray(entries) ? (entries as ExtractionLogEntry[]) : []
  } catch (err) {
    console.warn('[extraction-debug-log] read failed:', err)
    return []
  }
}

/**
 * Append a batch of entries to the ring buffer.
 *
 * Trims to EXTRACTION_DEBUG_LOG_CAP, newest first. Guarded by the
 * module-scoped write queue so concurrent batches don't lose entries.
 */
export async function appendEntries(batch: ExtractionLogEntry[]): Promise<void> {
  if (batch.length === 0) return
  await enqueueWrite(async () => {
    const current = await getEntries()
    // Newest first; ensure batch internally newest-first too
    const sortedBatch = [...batch].sort((a, b) => b.ts - a.ts)
    const merged = [...sortedBatch, ...current].slice(0, EXTRACTION_DEBUG_LOG_CAP)
    await chrome.storage.local.set({ [STORAGE_KEY]: merged })
  })
}

/** Wipe the log entirely. Toggle state is unaffected. */
export async function clearLog(): Promise<void> {
  await enqueueWrite(async () => {
    await chrome.storage.local.remove(STORAGE_KEY)
  })
}

/**
 * Redact an OTP code to a debug-safe representation.
 *
 *   "123456"   → "12**** (6)"
 *   "AB-XY-12" → "AB****** (8)"  (post-normalization, hyphens already stripped upstream)
 *   "ZZ"       → "** (2)"        (too short to keep prefix)
 */
export function redactOtpCode(code: string): string {
  if (!code) return ''
  const len = code.length
  if (len <= 2) return `${'*'.repeat(len)} (${len})`
  return `${code.slice(0, 2)}${'*'.repeat(Math.max(0, len - 2))} (${len})`
}

/**
 * Sanitize a URL into { domain, pathPreview }. Strips query string and
 * fragment so single-use magic-link tokens never enter the log.
 */
export function sanitizeLinkForLog(href: string): { domain: string; pathPreview?: string } {
  try {
    const u = new URL(href)
    const domain = u.hostname.toLowerCase()
    const path = u.pathname.replace(/\/+$/, '')
    const pathPreview = path && path !== '/' ? path.slice(0, 50) : undefined
    return { domain, pathPreview }
  } catch {
    return { domain: 'invalid-url' }
  }
}

/**
 * Redact occurrences of an OTP code from a context snippet before
 * persisting. The OTP extractor builds snippets around the matched
 * code, so the raw value lives inside the surrounding text by default;
 * the user-visible eye toggle only hides it from the screen, not from
 * storage.
 *
 * Replaces both `raw` (original matched form, may contain spaces or
 * hyphens) and `code` (post-normalization) with the redacted form.
 */
export function redactCodeFromSnippet(snippet: string, code: string, raw?: string): string {
  if (!snippet) return snippet
  const redacted = redactOtpCode(code)
  let out = snippet
  if (raw && raw.length > 0) {
    out = out.split(raw).join(redacted)
  }
  if (code && code !== raw && code.length > 0) {
    out = out.split(code).join(redacted)
  }
  return out
}

/**
 * Cross-context message contract for clearing the log. The service
 * worker's `extractionDebugLog` writes (appendEntries) flow through
 * the module-scoped queue in this file; for serialization to actually
 * hold, the clear must execute in the same context. Options-page UI
 * therefore sends this message instead of calling `clearLog` directly.
 */
export const EXTRACTION_DEBUG_LOG_CLEAR_MESSAGE = 'EXTRACTION_DEBUG_LOG_CLEAR' as const

export interface ExtractionDebugLogClearMessage {
  type: typeof EXTRACTION_DEBUG_LOG_CLEAR_MESSAGE
}

export interface ExtractionDebugLogClearResponse {
  ok: boolean
  error?: string
}

/** Client helper for non-SW contexts: ask the SW to clear the log. */
export async function requestClearLog(): Promise<void> {
  const response: ExtractionDebugLogClearResponse = await chrome.runtime.sendMessage({
    type: EXTRACTION_DEBUG_LOG_CLEAR_MESSAGE,
  } satisfies ExtractionDebugLogClearMessage)
  if (!response?.ok) {
    throw new Error(response?.error ?? 'Failed to clear extraction debug log')
  }
}
