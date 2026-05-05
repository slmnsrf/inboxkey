/**
 * Session Controller
 *
 * Coordinates watch sessions in the background service worker, ensuring that
 * polling continues even if the worker is restarted. A watch session monitors
 * recent verification codes and notifies the content script when a suitable
 * candidate is found.
 *
 * V2 CHANGES:
 * - Integrated SessionPoller for MV3-resilient polling (replaced custom polling logic)
 * - Added sessionStart and expectedShape to SessionState for v2 scoring
 * - Added siteETLD extraction and storage
 * - Added senderETLD extraction when adding codes
 * - Passes sessionStart and expectedShape to findBestMatchingCode() for v2 algorithm
 * - Reduced LOC from 477 to ~400 by delegating polling to SessionPoller
 * - Changed to fixed 12-poll schedule: [0, 5, 10, 15, 20, 30, 40, 50, 60, 70, 80, 90]s
 * - First 20s: 5s intervals (fast providers like Gmail)
 * - After 20s: 10s intervals (slow providers like IMAP)
 * - Extended max timeout from 75s to 90s
 */
import { findBestMatchingCode } from "@/lib/matching/code-matcher"
import { StorageFactory } from "@/lib/storage/storage-factory"
import { EmailPollingService, type CandidateRecord, type EmailLike } from "@/lib/services/email-polling-service"
import { createAdaptersFromMailboxes } from "@/lib/services/provider-adapter"
import { SeenMessageStore } from "@/lib/services/seen-message-store"
import { SessionPoller } from "./session-poller"
import { extractETLD, domainAffinity } from "@/lib/matching/domain-affinity"
import { shouldSuppressMatch } from "@/lib/matching/eligibility"
import { POSITIVE_SIGNAL_GATE_ENABLED } from "@/lib/constants"
import { getMessagesTabManager } from "@/lib/providers/google-messages/tab-manager"
import { WATCH_SESSION_SCORING } from "@/lib/matching/scoring-config"
import type { ExpectedShape } from "@/lib/matching/shape-matcher"
import type { PopupCacheManager } from "./popup-cache"

const SESSION_STORAGE_KEY = "inboxkey.sessions"

/**
 * Per-mailbox SMS conversation snapshot persisted in chrome.storage.session.
 * Survives service-worker idle restarts within a browser run; cleared on
 * browser close. Used to seed the SMS provenance baseline at the start of
 * each new session so an SMS that arrived during the previous session's
 * tab-warmup window is correctly classified.
 */
const SMS_SNAPSHOT_STORAGE_PREFIX = "inboxkey.sms_conversation_snapshot."

/**
 * Snapshot freshness window. A snapshot older than this is ignored and the
 * session falls back to the current poll's batch — same behavior as if no
 * snapshot existed. 10 minutes balances "long enough that consecutive auth
 * flows benefit" against "short enough that natural inbox activity hasn't
 * meaningfully diverged from the snapshot."
 */
const SMS_SNAPSHOT_TTL_MS = 10 * 60_000

/**
 * Pre-session grace for SMS receipt timestamps. When the snapshot-based
 * baseline classifies a candidate as "new arrival" via hash diff, we still
 * require the candidate's parsed receivedEpochMs to be no older than
 * `sessionStart - GRACE`. This guards against a stale snapshot turning an
 * actually-old SMS into a fresh-looking arrival. Set to 2 minutes because
 * Google Messages relative timestamps round down to the nearest minute
 * ("1 min ago" can mean 60-119s old), so a 1-minute grace would clip
 * genuinely-fresh arrivals at the edge.
 */
const SMS_CANDIDATE_PRESESSION_GRACE_MS = 2 * 60_000

type SessionStatus = "active" | "filled" | "timedout" | "canceled"
type SessionChannel = 'email' | 'sms'

function isGoogleComUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    return hostname === 'google.com' || hostname.endsWith('.google.com')
  } catch {
    return false
  }
}

function getEffectiveChannelsForUrl(channels: SessionChannel[], url: string): SessionChannel[] {
  if (!isGoogleComUrl(url)) {
    return channels
  }

  return channels.filter(channel => channel !== 'sms')
}

interface SessionExpected {
  length?: number
  charset?: "digits" | "alnum"
}

/**
 * SMS provenance baseline entry. Snapshot of one Google Messages
 * conversation at session start. Used to detect new arrivals on
 * later polls (new conversation, snippet change, or unread flip
 * false→true). Stable across reorder via conversationHref.
 *
 * snippetHash is SHA-256 of the preview text. Stored as a hash so the
 * cross-session snapshot can be persisted to chrome.storage.session
 * without writing OTP digits to disk-adjacent storage.
 */
interface SmsBaselineEntry {
  conversationHref: string
  snippetHash: string
  isUnread: boolean
}

/**
 * Cross-session SMS snapshot. Persisted under
 * `inboxkey.sms_conversation_snapshot.<mailboxId>` so the next session
 * can seed its baseline from the prior observed conversation list rather
 * than from "whatever was visible during this session's first scrape"
 * (which may include an OTP that just arrived during tab warmup).
 */
interface SmsConversationSnapshot {
  observedAt: number
  entries: SmsBaselineEntry[]
}

interface SessionState {
  id: string
  tabId: number
  url: string
  /**
   * Effective top-level domain plus one label of the site (e.g., "github.com").
   * Used for v2 domain affinity scoring.
   * @since v2
   */
  siteETLD: string
  expected: SessionExpected
  /**
   * Expected code shape characteristics for pattern matching.
   * Used for v2 shape score tiebreaker.
   * @since v2
   */
  expectedShape?: ExpectedShape
  /**
   * Unix timestamp (ms) when watch session started.
   * Used for v2 session boost scoring.
   * @since v2
   */
  sessionStart: number
  /**
   * Delivery channels detected on the input field.
   * Used for channel-aware adapter filtering during polling.
   * @since SMS support
   */
  detectedChannels: SessionChannel[]
  /**
   * Phase 2 — quality of the channel signal. 'positive' when the field-
   * level classifier returned a known channel; 'unknown' when defaulted.
   * Optional for backward compat — absent values are treated as
   * 'positive' (preserves pre-Phase-2 behavior for restored sessions).
   * @since Phase 2
   */
  channelEvidence?: 'positive' | 'unknown'
  /**
   * Effective session timeout in seconds, after channel-specific capping.
   * Sent back to content script for chip timer. Default 45s for all session types.
   * @since SMS support
   */
  effectiveTimeout: number
  startedAt: number
  status: SessionStatus
  pollSchedule: number[]
  pollsCompleted: number[]
  lastUpdated: number
  lastCode?: SessionCodeResult
  /**
   * SMS conversation snapshot, keyed by mailboxId. Captured per
   * mailbox the first time that mailbox's adapter returns a batch
   * successfully. A mailbox without an entry here has not yet been
   * baselined — its candidates fail closed (treated as pre-session)
   * until baseline is captured. This per-mailbox shape closes a
   * partial-baseline leak: an adapter that throws on the first
   * poll can recover later without that recovery turning all of its
   * pre-session messages into apparent "new arrivals."
   * @since duplicate-request race fix (Codex pass 3)
   */
  smsBaseline?: Record<string, SmsBaselineEntry[]>
  /**
   * Email provenance keys (`provider:mailboxId:messageId`), keyed by
   * mailboxId. Same per-mailbox semantics as `smsBaseline` above.
   * @since duplicate-request race fix (Codex pass 3)
   */
  emailBaselineKeys?: Record<string, string[]>
  /**
   * Codes classified as "new arrivals" relative to this session's
   * baselines. Populated incrementally per poll. Only these are
   * eligible for autofill matching; pre-session codes flow only to
   * the popup cache. Persisted so SW restart preserves prior
   * decisions for in-flight polls.
   * @since duplicate-request race fix
   */
  newArrivalCodes?: SessionMatcherCode[]
}

/**
 * Subset of StoredCode we accumulate per session for the matcher.
 * Mirrors the shape findBestMatchingCode() consumes.
 */
interface SessionMatcherCode {
  code: string
  timestamp: number
  source: string
  used: boolean
  siteMatch?: string
  mailboxId?: string
  senderETLD?: string
  receivedAt?: number
}

export interface SessionCodeResult {
  code: string
  timestamp: number
  source: string
}

export type SessionCompletion =
  | { status: "filled"; code: SessionCodeResult }
  | { status: "timedout" }
  | { status: "canceled" }

interface SessionControllerCallbacks {
  onSessionStarted?: (session: SessionState) => void
  onSessionUpdated?: (session: SessionState) => void
  onSessionCompleted: (session: SessionState, result: SessionCompletion) => void
}

interface PersistedSessions {
  [sessionId: string]: SessionState
}

/**
 * Controller responsible for maintaining active watch sessions.
 */
export class SessionController {
  private sessions = new Map<string, SessionState>()
  private poller: SessionPoller  // V2: Replaces manual timer/alarm management
  private readonly seenStore = new SeenMessageStore()
  /**
   * Set of session IDs currently capturing their first-poll baseline.
   * Set synchronously before any provider await; cleared in the same
   * poll's finally. Concurrent poll callbacks (chrome.alarms +
   * setTimeout firing nearby poll indices) check this sentinel and
   * skip baseline capture if another poll is already in flight,
   * preventing a torn baseline from racing writes.
   */
  private baselineCapturing = new Set<string>()

  constructor(
    private readonly callbacks: SessionControllerCallbacks,
    private readonly popupCacheManager?: PopupCacheManager
  ) {
    // V2: Initialize SessionPoller with callback to handlePoll
    this.poller = new SessionPoller(async (sessionId, pollIndex) => {
      await this.handlePoll(sessionId, pollIndex)
    })
  }

  /**
    * Load sessions from storage and resume any active watches.
    */
  async initialize(): Promise<void> {
    // V2: Initialize poller's alarm listener first
    await this.poller.initialize()

    const persisted = await this.loadPersistedSessions()

    Object.values(persisted).forEach((session) => {
      if (session.status === "active") {
        this.sessions.set(session.id, session)
        // Calculate poll times from stored pollSchedule (relative offsets from startedAt)
        const pollTimesMs = session.pollSchedule.map(absoluteTime => absoluteTime - session.startedAt)
        // V2: Delegate poll scheduling to SessionPoller with calculated poll times
        this.poller.schedulePolls(session.id, session.startedAt, pollTimesMs)
      }
    })
  }

  /**
   * Start or restart a watch session for a given tab.
   * Any existing session for the tab is canceled before the new one begins.
   */
  async startSession(params: {
    tabId: number
    url: string
    expected: SessionExpected
    timeoutSeconds?: number
    detectedChannels?: SessionChannel[]
    /**
     * Phase 2 — channel evidence quality. 'positive' when the field-level
     * classifier returned a known channel; 'unknown' when defaulted.
     * Absent → treated as 'positive' (backward compat).
     */
    channelEvidence?: 'positive' | 'unknown'
  }): Promise<SessionState> {
    const { tabId, url, expected, timeoutSeconds, detectedChannels, channelEvidence } = params

    // Cancel existing session for tab
    for (const existing of this.sessions.values()) {
      if (existing.tabId === tabId && existing.status === "active") {
        await this.cancelSession(existing.id)
      }
    }

    const id = crypto.randomUUID()
    const now = Date.now()

    // Compute effective timeout (same for all session types)
    const channels = getEffectiveChannelsForUrl(detectedChannels ?? ['email'], url)
    const effectiveTimeout = timeoutSeconds ?? 60

    // Use fixed poll schedule, filtered by effective timeout
    // This allows users to control session duration while maintaining optimized poll density
    const timeoutMs = effectiveTimeout * 1000

    // Filter poll times that fall within user's timeout
    const pollTimesMs = WATCH_SESSION_SCORING.pollTimesMs.filter(
      pollTime => pollTime <= timeoutMs
    )

    // Guard: ensure at least one poll at t=0
    if (pollTimesMs.length === 0) {
      pollTimesMs.push(0)
    }

    // Store absolute timestamps for tracking
    const pollSchedule = pollTimesMs.map(offset => now + offset)

    // V2: Extract siteETLD from URL
    const siteETLD = extractETLD(new URL(url).hostname)

    // V2: Convert expected to ExpectedShape format for v2 scoring
    const expectedShape: ExpectedShape | undefined =
      expected.length || expected.charset
        ? {
            len: expected.length,
            charset: expected.charset,
          }
        : undefined

    const session: SessionState = {
      id,
      tabId,
      url,
      siteETLD,              // V2: Store extracted eTLD+1
      expected,
      expectedShape,         // V2: Store shape for v2 matching
      sessionStart: now,     // V2: Store session start for sessionBoost
      detectedChannels: channels,  // SMS: Channel-aware adapter filtering
      // Phase 2: store the explicit 'positive' default so restored
      // sessions and debug traces unambiguously show the policy.
      channelEvidence: channelEvidence ?? 'positive',
      effectiveTimeout,            // SMS: Capped timeout sent back to content script
      startedAt: now,
      status: "active",
      pollSchedule,
      pollsCompleted: [],
      lastUpdated: now,
    }

    this.sessions.set(id, session)
    await this.persistSessions()
    this.callbacks.onSessionStarted?.(session)

    // V2: Delegate poll scheduling to SessionPoller with dynamic poll times
    this.poller.schedulePolls(id, now, pollTimesMs)

    return session
  }

  /**
   * Cancel a session if it exists.
   */
  async cancelSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      return
    }

    if (session.status === "active") {
      session.status = "canceled"
      session.lastUpdated = Date.now()
    }

    // Clean up Google Messages poll state only for SMS sessions
    if (session.detectedChannels?.includes('sms')) {
      try {
        getMessagesTabManager().resetPollCount(session.id)
        await getMessagesTabManager().closeIfOwned()
      } catch { /* tab manager not loaded or no GM session */ }
    }

    // V2: Delegate to SessionPoller for cancellation
    this.poller.cancelPolls(sessionId)

    this.sessions.delete(sessionId)
    await this.persistSessions()
    this.callbacks.onSessionCompleted(session, { status: "canceled" })
  }

  /**
   * Resume an existing session without creating a new one.
   * V2: Delegates to SessionPoller for scheduling.
   */
  async resumeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session || session.status !== "active") return

    // Calculate poll times from stored pollSchedule (relative offsets from startedAt)
    const pollTimesMs = session.pollSchedule.map(absoluteTime => absoluteTime - session.startedAt)

    // V2: Delegate to SessionPoller with calculated poll times
    this.poller.schedulePolls(sessionId, session.startedAt, pollTimesMs)
  }

  /**
   * Handle a poll callback from SessionPoller.
   * V2: This replaces the old executePoll() method, simplified by SessionPoller.
   */
  private async handlePoll(sessionId: string, pollIndex: number): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session || session.status !== "active") {
      return
    }

    // Persisted idempotency: if this specific poll already ran (e.g., it
    // completed before a service-worker restart and the persisted alarm
    // re-fires after resume), skip it. session.pollsCompleted survives
    // restart via persistSessions(); SessionPoller's in-memory Set does
    // not, so this is the authoritative guard.
    if (session.pollsCompleted.includes(pollIndex)) {
      return
    }

    try {
      const code = await this.pollForCode(session)

      // Concurrent baseline capture short-circuited this poll. Don't
      // mark the index completed -- if we did, pollsCompleted.length
      // would advance against pollSchedule.length and the session
      // could time out one tick early. Letting the index sit unmarked
      // keeps `pollsRemaining` honest; the next scheduled poll runs
      // normally once the in-flight baseline finishes.
      if (code === 'skipped') {
        return
      }

      session.pollsCompleted.push(pollIndex)
      session.pollsCompleted.sort((a, b) => a - b)
      session.lastUpdated = Date.now()

      if (code) {
        session.status = "filled"
        session.lastCode = code
        if (session.detectedChannels?.includes('sms')) {
          try {
            getMessagesTabManager().resetPollCount(session.id)
            await getMessagesTabManager().closeIfOwned()
          } catch { /* tab manager not loaded or no GM session */ }
        }
        await this.persistSessions()
        this.poller.cancelPolls(sessionId) // V2: Cancel remaining polls
        this.callbacks.onSessionCompleted(session, { status: "filled", code })
        return
      }

      const pollsRemaining =
        session.pollSchedule.length - session.pollsCompleted.length

      if (pollsRemaining <= 0) {
        session.status = "timedout"
        if (session.detectedChannels?.includes('sms')) {
          try {
            getMessagesTabManager().resetPollCount(session.id)
            await getMessagesTabManager().closeIfOwned()
          } catch { /* tab manager not loaded or no GM session */ }
        }
        await this.persistSessions()
        this.poller.cancelPolls(sessionId) // V2: Clean up poller
        this.callbacks.onSessionCompleted(session, { status: "timedout" })
        return
      }

      await this.persistSessions()
      this.callbacks.onSessionUpdated?.(session)
      // V2: SessionPoller handles next poll scheduling automatically
    } catch (error) {
      console.warn("[SessionController] Poll execution failed:", error)

      session.pollsCompleted.push(pollIndex)
      session.pollsCompleted.sort((a, b) => a - b)
      session.lastUpdated = Date.now()

      const pollsRemaining =
        session.pollSchedule.length - session.pollsCompleted.length

      if (pollsRemaining <= 0) {
        session.status = "timedout"
        if (session.detectedChannels?.includes('sms')) {
          try {
            getMessagesTabManager().resetPollCount(session.id)
            await getMessagesTabManager().closeIfOwned()
          } catch { /* tab manager not loaded or no GM session */ }
        }
        await this.persistSessions()
        this.poller.cancelPolls(sessionId) // V2: Clean up poller
        this.callbacks.onSessionCompleted(session, { status: "timedout" })
        return
      }

      await this.persistSessions()
      // V2: SessionPoller handles next poll scheduling automatically
    }
  }

  /**
   * Poll for codes and return best match, or null if no match found.
   *
   * Provenance gate (duplicate-request race fix):
   * - The first poll for each channel captures a baseline snapshot
   *   (SMS conversation list / email message IDs) and is autofill-only-
   *   from-the-baseline-onward. Pre-session candidates flow into the
   *   popup cache for manual selection but never autofill.
   * - Subsequent polls classify candidates against the baseline:
   *   new-arrival (post-session) or pre-session. Only new-arrival
   *   candidates are eligible for autofill. A zero-affinity guard
   *   then suppresses unrelated fresh SMS (e.g. a personal text that
   *   happened to arrive during the session).
   */
  private async pollForCode(
    session: SessionState
  ): Promise<SessionCodeResult | null | 'skipped'> {
    try {
      // Get appropriate storage for current mode (plaintext or encrypted)
      const storage = await StorageFactory.create()

      // Get mailboxes
      const mailboxes = await storage.getMailboxes()

      if (mailboxes.length === 0) {
        console.log('[SessionController] No mailboxes configured, skipping poll')
        return null
      }

      // Create adapters from mailboxes (v2 pattern)
      // Pass session.id so google-messages adapters get poll budgeting
      const allAdapters = await createAdaptersFromMailboxes(storage, session.id)

      // Channel-aware filtering: only poll adapters matching detected channels
      // Fallback to ['email'] for sessions restored from storage before SMS support
      const channels = getEffectiveChannelsForUrl(session.detectedChannels ?? ['email'], session.url)
      if (channels.length === 0) {
        console.log('[SessionController] No permitted channels for this session URL, skipping poll')
        return null
      }
      const adapters = allAdapters.filter(adapter => {
        if (adapter.id === 'google-messages') {
          return channels.includes('sms')
        }
        return channels.includes('email')
      })

      // ─── Baseline capture set-up ────────────────────────────────────────
      // Per-mailbox baselines (Codex pass 3): each mailbox's baseline is
      // captured the first time its adapter returns a batch successfully.
      // Mailboxes whose adapter throws or returns no batch on this poll
      // simply remain unbaselined and their candidates fail closed on
      // subsequent polls until baseline is recorded. The in-memory
      // sentinel still serializes baseline writes per session so a
      // concurrent poll within the same SW tick can't tear the dict.
      session.smsBaseline = session.smsBaseline ?? {}
      session.emailBaselineKeys = session.emailBaselineKeys ?? {}
      if (this.baselineCapturing.has(session.id)) {
        // Another poll is already mid-capture; skip to avoid double
        // writes. Return the 'skipped' sentinel so handlePoll does NOT
        // mark this pollIndex completed — a `null` return would consume
        // the poll slot and starve the schedule on slow networks where
        // the in-flight poll takes longer than the next poll's offset.
        // The next scheduled poll will fire at its normal time, and by
        // then the in-flight baseline will have been captured.
        console.log(
          `[SessionController] Baseline capture in progress for session ${session.id}; skipping concurrent poll (will retry on next tick)`
        )
        return 'skipped'
      }
      this.baselineCapturing.add(session.id)

      // Per-poll buffers, keyed by mailboxId. Filled inside the
      // synchronous onAdapterBatch hook below, BEFORE any per-message
      // seen-store / extraction filtering, so they reflect the honest
      // batch returned by each adapter on this poll.
      const smsBatchByMailbox: Record<string, SmsBaselineEntry[]> = {}
      const emailKeyBatchByMailbox: Record<string, string[]> = {}

      try {
        // Poll emails from all connected mailboxes (v2 API) - share seenStore to persist across polls
        const pollingService = new EmailPollingService(adapters, this.seenStore)
        // Plumb the watch-session's expected shape (derived from the OTP
        // field's maxlength/inputMode at session start) into the
        // extractor's context. Without this, keyword-free SMS bodies
        // ("Amazon: 123456 ...") were rejected by the extractor's
        // no-keyword fallback because expectedLength/expectedShape was
        // unset. The extractor pairs this with a brand-prefix-code shape
        // gate so prose digit runs (shipping IDs, prices, ZIPs) don't
        // become false-positive autofills.
        const { candidates, adapterResults } = await pollingService.pollOnce({
          expected: {
            length: session.expected.length,
            charset: session.expected.charset,
          },
        }, {
          onAdapterBatch: (mailboxId: string, emails: EmailLike[]) => {
            for (const email of emails) {
              if (email.provider === 'google-messages') {
                if (channels.includes('sms') && !session.smsBaseline![mailboxId]) {
                  const meta = email._meta as
                    | { conversationHref?: string; isUnread?: boolean; snippetHash?: string }
                    | undefined
                  // Both fields are required to participate in the
                  // diff. The adapter always populates them; a missing
                  // value means a structural change (e.g. DOM scrape
                  // failure) and we skip rather than baselining a
                  // half-known entry.
                  if (!meta?.conversationHref || !meta?.snippetHash) continue
                  ;(smsBatchByMailbox[mailboxId] ??= []).push({
                    conversationHref: meta.conversationHref,
                    snippetHash: meta.snippetHash,
                    isUnread: meta.isUnread ?? false,
                  })
                }
              } else {
                if (channels.includes('email') && !session.emailBaselineKeys![mailboxId]) {
                  ;(emailKeyBatchByMailbox[mailboxId] ??= []).push(
                    `${email.provider}:${mailboxId}:${email.id}`
                  )
                }
              }
            }
          },
        })
        console.log(
          `[SessionController] Email poll complete: ${candidates.length} candidates found`
        )

        // Defer the rest of the body to a helper so the finally below
        // always releases the baseline-capturing sentinel even if
        // anything throws downstream.
        return await this.processPollResult({
          session,
          channels,
          mailboxes,
          storage,
          candidates,
          adapterResults,
          smsBatchByMailbox,
          emailKeyBatchByMailbox,
        })
      } finally {
        this.baselineCapturing.delete(session.id)
      }
    } catch (error) {
      console.warn("[SessionController] Poll failed:", error)
      return null
    }
  }

  /**
   * Continue pollForCode processing after candidates and adapter
   * results are in hand. Split out so the baseline-capture sentinel
   * release stays anchored to the await around pollOnce().
   */
  private async processPollResult(args: {
    session: SessionState
    channels: SessionChannel[]
    mailboxes: Awaited<ReturnType<Awaited<ReturnType<typeof StorageFactory.create>>['getMailboxes']>>
    storage: Awaited<ReturnType<typeof StorageFactory.create>>
    candidates: CandidateRecord[]
    adapterResults: { mailboxId: string; success: boolean; error?: string }[]
    smsBatchByMailbox: Record<string, SmsBaselineEntry[]>
    emailKeyBatchByMailbox: Record<string, string[]>
  }): Promise<SessionCodeResult | null> {
    const {
      session,
      channels,
      mailboxes,
      storage,
      candidates,
      adapterResults,
      smsBatchByMailbox,
      emailKeyBatchByMailbox,
    } = args

    try {

      // Convert v2 candidates to StoredCode format and save to storage
      for (const candidate of candidates) {
        // Find mailbox by ID (multi-account safe)
        const mailbox = mailboxes.find(m => m.id === candidate.mailboxId)
        if (!mailbox) {
          console.warn(`[SessionController] No mailbox found for mailboxId: ${candidate.mailboxId}`)
          continue
        }

        if (candidate.code) {
          // V2: Codes are ephemeral-only (stored in PopupCache via chrome.storage.session)
          // No persistence to chrome.storage.local
          console.log(`[SessionController] Found code: ${candidate.code.value}`)
        }

        if (candidate.link) {
          // V2: Links are ephemeral-only (stored in PopupCache via chrome.storage.session)
          // No persistence to chrome.storage.local
          console.log(`[SessionController] Found magic link from: ${candidate.link.domain}`)
        }
      }

      // Update sync status for all mailboxes based on adapter results
      const now = Date.now()
      for (const result of adapterResults) {
        const mailbox = mailboxes.find(m => m.id === result.mailboxId)
        if (!mailbox) continue

        if (result.success) {
          await storage.updateMailbox(mailbox.id, {
            lastSyncedAt: now,
            lastSyncError: undefined, // Clear error on success
          })
        } else if (result.error) {
          await storage.updateMailbox(mailbox.id, {
            lastSyncError: result.error,
          })
        }
      }

      // If Google Messages session expired, abort before cache matching.
      // Prevents stale SMS codes from autofilling on a disconnected account.
      const gmSessionExpired = adapterResults.some(
        r => !r.success && r.error === 'session_expired'
      )
      if (gmSessionExpired && channels.length === 1 && channels[0] === 'sms') {
        return null  // SMS-only: don't match stale codes, let session timeout
      }

      // Update popup cache if available (using ephemeral candidates)
      if (this.popupCacheManager && candidates.length > 0) {
        // Convert candidates to StoredCode format for PopupCache
        const ephemeralCodes = candidates.flatMap(candidate => {
          const mailbox = mailboxes.find(m => m.id === candidate.mailboxId)
          if (!mailbox) return []

          const senderETLD = candidate.from
            ? extractETLD(
                candidate.from.includes('@')
                  ? candidate.from.split('@')[1]
                  : candidate.from
              )
            : undefined

          const results = []

          if (candidate.code) {
            results.push({
              code: candidate.code.value,
              timestamp: candidate.receivedEpochMs || Date.now(),
              receivedAt: candidate.receivedEpochMs,
              source: `${candidate.from || 'Unknown'} - ${candidate.subject || 'No subject'}`,
              used: false,
              siteMatch: undefined,
              mailboxId: mailbox.id,
              senderETLD,
              extractionScore: candidate.code.score,
            })
          }

          if (candidate.link) {
            results.push({
              code: `magic-link:${candidate.link.href}`,
              timestamp: candidate.receivedEpochMs || Date.now(),
              receivedAt: candidate.receivedEpochMs,
              source: `${candidate.from || 'Unknown'} - ${candidate.subject || 'No subject'}`,
              used: false,
              siteMatch: candidate.link.domain,
              mailboxId: mailbox.id,
              senderETLD,
              extractionScore: candidate.link.score,
            })
          }

          return results
        })

        await this.popupCacheManager.updateWithNewCodes(ephemeralCodes, mailboxes.length, mailboxes)
      }

      // ─── Provenance baseline capture / classification ───────────────────
      // Per-mailbox capture: only mailboxes whose adapter SUCCEEDED on
      // this poll get their baseline written. Failed adapters leave their
      // mailbox unbaselined so a later recovery doesn't suddenly flip
      // pre-session messages into "new arrivals." Each mailbox's baseline
      // is captured exactly once (the first successful poll). Classification
      // then runs against the per-mailbox baseline; a candidate from an
      // unbaselined mailbox is treated as pre-session (fail closed).
      session.smsBaseline = session.smsBaseline ?? {}
      session.emailBaselineKeys = session.emailBaselineKeys ?? {}
      session.newArrivalCodes = session.newArrivalCodes ?? []

      // Commit per-mailbox baseline for any adapter that succeeded on
      // this poll. Successful response with empty buffer (mailbox is
      // empty / no matching messages) still counts as a baseline — we
      // want subsequent post-baseline arrivals to be eligible for
      // autofill. The provider on the mailbox decides which baseline
      // dict to write to (SMS vs email).
      //
      // For SMS, baseline seeding prefers a fresh cross-session snapshot
      // over the current poll's batch. The snapshot represents the
      // conversation list as it was BEFORE this session started, so an
      // SMS that arrived during GM tab warmup (and thus appears in the
      // very first scrape) will diff against the snapshot and be
      // classified as a new arrival rather than mistakenly baselined.
      // When no fresh snapshot exists (first session in this browser
      // run, snapshot expired, or no prior session ever ran), we fall
      // back to the current batch — same conservative behavior as before.
      const newlyBaselined: string[] = []
      // Mailboxes whose baseline was JUST seeded from this poll's own
      // batch (SMS "(current)" fallback or any first-time email baseline).
      // For these, candidate-vs-baseline membership equality is structural
      // — the baseline literally contains the candidate's own snippet/id,
      // because they were both produced by this same poll. Snippet-diff /
      // provenanceKey-includes therefore cannot disqualify; the
      // receipt-time freshness gate is the load-bearing check instead.
      // Transient (lives only in this poll iteration), so SW restart and
      // restored sessions naturally fall through to the strict path.
      const currentBaselineThisPoll = new Set<string>()
      for (const result of adapterResults) {
        if (!result.success) continue
        const mailbox = mailboxes.find(m => m.id === result.mailboxId)
        if (!mailbox) continue
        if (mailbox.providerId === 'google-messages') {
          if (!session.smsBaseline[result.mailboxId]) {
            const snapshot = await loadSmsSnapshot(
              result.mailboxId,
              session.sessionStart
            )
            if (snapshot) {
              session.smsBaseline[result.mailboxId] = snapshot.entries
              newlyBaselined.push(`sms:${result.mailboxId}(snapshot)`)
              // (snapshot) source represents prior state — strict
              // snippet-diff classification stays correct, do not add
              // to currentBaselineThisPoll.
            } else {
              session.smsBaseline[result.mailboxId] =
                smsBatchByMailbox[result.mailboxId] ?? []
              newlyBaselined.push(`sms:${result.mailboxId}(current)`)
              currentBaselineThisPoll.add(result.mailboxId)
            }
          }
          // Persist the current batch as the next session's snapshot.
          // We persist on every successful poll so the snapshot tracks
          // the latest observed state — important for the duplicate-
          // request scenario where session N+1 should baseline against
          // session N's final state, not against an early state.
          if (smsBatchByMailbox[result.mailboxId]) {
            try {
              await saveSmsSnapshot(
                result.mailboxId,
                smsBatchByMailbox[result.mailboxId]
              )
            } catch (err) {
              console.warn(
                '[SessionController] Failed to persist SMS snapshot:',
                err
              )
            }
          }
        } else {
          if (!session.emailBaselineKeys[result.mailboxId]) {
            session.emailBaselineKeys[result.mailboxId] =
              emailKeyBatchByMailbox[result.mailboxId] ?? []
            newlyBaselined.push(`email:${result.mailboxId}`)
            // Email baselines are always seeded from the current poll
            // (no email-snapshot mechanism). The candidate's own
            // provenanceKey is in the baseline — membership equality
            // can't disqualify on the very poll that committed it.
            currentBaselineThisPoll.add(result.mailboxId)
          }
        }
      }

      // Classify every candidate against its mailbox's baseline. Candidates
      // whose mailbox has no baseline yet (e.g. adapter failed both this
      // poll and any earlier poll) fail closed and never autofill.
      for (const candidate of candidates) {
        if (currentBaselineThisPoll.has(candidate.mailboxId)) {
          // Fresh-baseline path: the baseline was just seeded from this
          // poll's own batch, so snippet-diff / provenanceKey-includes
          // are structurally meaningless. Require a confirmed parsed
          // receipt timestamp inside the pre-session grace window
          // instead. Missing timestamp fails closed (an SMS the parser
          // couldn't date can't be proven fresh).
          if (candidate.receivedEpochMs === undefined) continue
          if (
            candidate.receivedEpochMs <
            session.sessionStart - SMS_CANDIDATE_PRESESSION_GRACE_MS
          ) {
            continue
          }
        } else {
          // Established-baseline path: existing strict snippet-diff /
          // provenanceKey classification.
          if (!isNewArrivalCandidate(candidate, session)) continue
          // SMS pre-session freshness gate. The snapshot-based baseline
          // diffs "newer than the snapshot" — not "newer than session
          // start". An SMS that arrived between the previous session's
          // end and this session's start is "new" relative to the
          // snapshot but predates this session, so it must not autofill.
          //
          // We fail CLOSED for candidates with no parsed timestamp: an
          // SMS the GM adapter couldn't date (clock-only / "today" /
          // malformed text) cannot be proven fresh, and the snapshot
          // diff alone is not a freshness gate (it's a "happened after
          // the snapshot" gate, which spans the inter-session gap).
          // The blast radius is narrow — most GM rows parse to an
          // absolute timestamp; only ambiguous strings fall here.
          if (candidate.provider === 'google-messages') {
            if (candidate.receivedEpochMs === undefined) continue
            if (
              candidate.receivedEpochMs <
              session.sessionStart - SMS_CANDIDATE_PRESESSION_GRACE_MS
            ) {
              continue
            }
          }
        }
        const senderETLD = candidate.from
          ? extractETLD(
              candidate.from.includes('@')
                ? candidate.from.split('@')[1]
                : candidate.from
            )
          : undefined
        const codeValue = candidate.code
          ? candidate.code.value
          : candidate.link
            ? `magic-link:${candidate.link.href}`
            : undefined
        if (!codeValue) continue
        // Receipt timestamp may be undefined for SMS when the relative
        // parser couldn't resolve a value; fall back to "now" for matcher
        // tie-breaking (the provenance gate already proved freshness).
        const receivedAt = candidate.receivedEpochMs ?? Date.now()
        const source = `${candidate.from || 'Unknown'} - ${candidate.subject || 'No subject'}`
        session.newArrivalCodes.push({
          code: codeValue,
          timestamp: receivedAt,
          source,
          used: false,
          siteMatch: candidate.link?.domain,
          mailboxId: candidate.mailboxId,
          senderETLD,
          receivedAt,
        })
      }

      await this.persistSessions()

      if (newlyBaselined.length > 0) {
        console.log(
          `[SessionController] Baseline captured (${newlyBaselined.join(', ')}) for session ${session.id}`
        )
      }

      // ─── Provenance gate: only new-arrival candidates can autofill ──────
      // Drop entries from disconnected GM adapter outright (stale and
      // cannot be revalidated). Then enforce zero-affinity guard at >=0.6
      // to keep unrelated fresh SMS (e.g. a personal text from a friend
      // that landed during the session) out of the autofill set.
      const siteETLD = extractETLD(new URL(session.url).hostname)
      const eligibleCodes = (session.newArrivalCodes ?? []).filter(c => {
        if (gmSessionExpired && c.code && this.isGoogleMessagesCode(c)) {
          return false
        }
        const senderETLDForAffinity = c.senderETLD || extractETLD(c.siteMatch || '')
        const affinity = domainAffinity(siteETLD, senderETLDForAffinity, c.source)
        return affinity >= 0.6
      })

      // Observability: when new-arrival candidates exist but all of them
      // get filtered out, log the senderETLDs so silent eligibility-gate
      // misses are diagnosable in one log read instead of code-tracing.
      // Covers both branches above (GM-expired drops + affinity rejections),
      // hence the broader "eligibility gate" wording.
      if ((session.newArrivalCodes?.length ?? 0) > 0 && eligibleCodes.length === 0) {
        const distinctSenders = [
          ...new Set(
            session.newArrivalCodes!.map(c => c.senderETLD || '(unknown)')
          ),
        ].join(', ')
        console.log(
          `[SessionController] All new-arrival candidates filtered by eligibility gate — sessionId=${session.id} siteETLD=${siteETLD} candidates=${session.newArrivalCodes!.length} senderETLDs=[${distinctSenders}]`
        )
      }

      const best = findBestMatchingCode(
        eligibleCodes,
        session.url,
        Date.now(),
        session.sessionStart,
        session.expectedShape
      )

      if (!best) {
        return null
      }

      // Phase 2: positive-signal eligibility gate. Suppresses matches
      // for sessions that started without positive channel evidence
      // unless the matched code's sender strictly matches the page
      // domain. See shouldSuppressMatch for the full predicate.
      const pageHost = new URL(session.url).hostname
      const senderETLD = best.senderETLD || extractETLD(best.siteMatch || '')
      if (
        shouldSuppressMatch(
          POSITIVE_SIGNAL_GATE_ENABLED,
          session.channelEvidence,
          session.detectedChannels,
          pageHost,
          senderETLD,
        )
      ) {
        // Never log code material — only metadata.
        console.log(
          '[SessionController] Phase 2 gate: suppressing match for unknown-channel session',
          {
            pageHost,
            senderETLD: senderETLD || '(unknown)',
            sessionId: session.id,
          }
        )
        return null
      }

      // Mark code as used in PopupCache (ephemeral only)
      if (this.popupCacheManager) {
        try {
          await this.popupCacheManager.markCodeUsed(best.code)
        } catch (error) {
          console.warn(
            "[SessionController] Failed to mark code as used, continuing",
            error
          )
        }
      }

      return {
        code: best.code,
        source: best.source,
        timestamp: best.timestamp,
      }
    } catch (error) {
      console.warn("[SessionController] Poll failed:", error)
      return null
    }
  }

  /**
   * Persist sessions to chrome.storage.session.
   */
  private async persistSessions(): Promise<void> {
    const serialized: PersistedSessions = {}
    for (const session of this.sessions.values()) {
      serialized[session.id] = session
    }

    await chrome.storage.session.set({
      [SESSION_STORAGE_KEY]: serialized,
    })
  }

  /**
   * Load sessions from chrome.storage.session.
   */
  private async loadPersistedSessions(): Promise<PersistedSessions> {
    const result = await chrome.storage.session.get(SESSION_STORAGE_KEY)
    return (result[SESSION_STORAGE_KEY] as PersistedSessions) || {}
  }

  /**
   * Heuristic: does this matcher code originate from Google Messages?
   * Used to drop SMS codes when the GM adapter is disconnected. The
   * matcher-level entries do not carry a providerId, so we infer from
   * the source string (set in processPollResult to "from - subject"
   * with from = senderName for SMS).
   */
  private isGoogleMessagesCode(code: SessionMatcherCode): boolean {
    // SMS sources have no email "@"; magic links carry siteMatch.
    // This is a conservative heuristic — better to err toward INCLUDING
    // a non-SMS code than to silently exclude one when GM expires.
    return !code.siteMatch && !!code.source && !code.source.includes('@')
  }
}

/**
 * Classify a candidate against its mailbox's baseline. Returns true
 * when the candidate represents a post-session arrival eligible for
 * autofill consideration.
 *
 * Per-mailbox baselines (Codex pass 3): a candidate from a mailbox
 * that has not yet been baselined fails closed (treated as pre-session).
 * This prevents an adapter that recovers from an early failure from
 * flooding the autofill matcher with previously-undisclosed pre-session
 * messages.
 *
 * SMS (google-messages):
 *  - new-arrival when conversationHref absent from this mailbox's
 *    baseline OR snippet text changed OR isUnread flipped false -> true.
 *  - Conversations without a stable conversationHref are treated as
 *    pre-session (fail closed).
 *
 * Email:
 *  - new-arrival when provenanceKey absent from this mailbox's baseline.
 */
function isNewArrivalCandidate(
  candidate: CandidateRecord,
  session: SessionState
): boolean {
  if (candidate.provider === 'google-messages') {
    const mailboxBaseline = session.smsBaseline?.[candidate.mailboxId]
    // Mailbox not yet baselined => fail closed.
    if (!mailboxBaseline) return false
    const meta = candidate.meta
    if (!meta?.conversationHref) return false
    const prior = mailboxBaseline.find(e => e.conversationHref === meta.conversationHref)
    if (!prior) return true
    if (prior.snippetHash !== (meta.snippetHash ?? '')) return true
    // Unread flip false -> true means a new message arrived in an
    // existing conversation. The reverse (true -> false) is just the
    // user reading; not a new arrival.
    if (!prior.isUnread && meta.isUnread === true) return true
    return false
  }
  // Email path: per-mailbox baseline list of provenance keys.
  const mailboxKeys = session.emailBaselineKeys?.[candidate.mailboxId]
  if (!mailboxKeys) return false
  return !mailboxKeys.includes(candidate.provenanceKey)
}

/**
 * Storage key for a mailbox's cross-session SMS snapshot.
 */
function smsSnapshotKey(mailboxId: string): string {
  return `${SMS_SNAPSHOT_STORAGE_PREFIX}${mailboxId}`
}

/**
 * Load the persisted SMS conversation snapshot for `mailboxId`, or null
 * when no fresh snapshot is available.
 *
 * Returns null when:
 *   - no snapshot has been persisted for this mailbox
 *   - the snapshot is older than SMS_SNAPSHOT_TTL_MS at session start
 *     (stale snapshots could include conversations the user has read
 *     since they were captured, leading to spurious new-arrival diffs)
 *   - the snapshot's observedAt is in the future relative to sessionStart
 *     (clock skew / corrupted record; safer to ignore)
 */
/**
 * Validate a persisted snapshot's shape. A truthy non-conforming blob
 * (e.g. partially-written record after a Chrome crash, schema drift, or
 * an out-of-band write) reaching `mailboxBaseline.find()` would silently
 * break SMS polling for the whole session. We fail closed: malformed
 * snapshots are dropped and the session falls back to seeding the
 * baseline from this poll's own batch.
 */
function isValidSnapshot(value: unknown): value is SmsConversationSnapshot {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<SmsConversationSnapshot>
  if (typeof v.observedAt !== 'number' || !Number.isFinite(v.observedAt)) return false
  if (!Array.isArray(v.entries)) return false
  for (const e of v.entries) {
    if (!e || typeof e !== 'object') return false
    const entry = e as Partial<SmsBaselineEntry>
    if (typeof entry.conversationHref !== 'string') return false
    if (typeof entry.snippetHash !== 'string') return false
    if (typeof entry.isUnread !== 'boolean') return false
  }
  return true
}

async function loadSmsSnapshot(
  mailboxId: string,
  sessionStart: number
): Promise<SmsConversationSnapshot | null> {
  try {
    const key = smsSnapshotKey(mailboxId)
    const result = await chrome.storage.session.get(key)
    const raw = result[key]
    if (!raw) return null
    if (!isValidSnapshot(raw)) {
      console.warn(
        `[SessionController] loadSmsSnapshot: malformed snapshot at ${key}, dropping`
      )
      return null
    }
    if (raw.observedAt > sessionStart) return null
    if (sessionStart - raw.observedAt > SMS_SNAPSHOT_TTL_MS) return null
    return raw
  } catch (err) {
    console.warn('[SessionController] loadSmsSnapshot failed:', err)
    return null
  }
}

/**
 * Persist the current SMS conversation list for `mailboxId` as a snapshot
 * the next session can use as its baseline. Called after every successful
 * SMS poll so the snapshot tracks the latest observed state.
 */
async function saveSmsSnapshot(
  mailboxId: string,
  entries: SmsBaselineEntry[]
): Promise<void> {
  await chrome.storage.session.set({
    [smsSnapshotKey(mailboxId)]: {
      observedAt: Date.now(),
      entries,
    } satisfies SmsConversationSnapshot,
  })
}

export type { SessionState }
