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
 * - First 20s: 5s intervals (fast providers like Gmail/Outlook)
 * - After 20s: 10s intervals (slow providers like IMAP)
 * - Extended max timeout from 75s to 90s
 */
import { findBestMatchingCode } from "@/lib/matching/code-matcher"
import { StorageFactory } from "@/lib/storage/storage-factory"
import { EmailPollingService } from "@/lib/services/email-polling-service"
import { createAdaptersFromMailboxes } from "@/lib/services/provider-adapter"
import { SeenMessageStore } from "@/lib/services/seen-message-store"
import { SessionPoller } from "./session-poller"
import { extractETLD } from "@/lib/matching/domain-affinity"
import { WATCH_SESSION_SCORING } from "@/lib/matching/scoring-config"
import type { ExpectedShape } from "@/lib/matching/shape-matcher"
import type { PopupCacheManager } from "./popup-cache"

const SESSION_STORAGE_KEY = "inboxkey.sessions"

type SessionStatus = "active" | "filled" | "timedout" | "canceled"

interface SessionExpected {
  length?: number
  charset?: "digits" | "alnum"
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
  detectedChannels: Array<'email' | 'sms'>
  /**
   * Effective session timeout in seconds, after channel-specific capping.
   * SMS-only sessions are capped at 20s. Sent back to content script for chip timer.
   * @since SMS support
   */
  effectiveTimeout: number
  startedAt: number
  status: SessionStatus
  pollSchedule: number[]
  pollsCompleted: number[]
  lastUpdated: number
  lastCode?: SessionCodeResult
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

  constructor(
    private readonly callbacks: SessionControllerCallbacks,
    private readonly popupCacheManager?: PopupCacheManager
  ) {
    // V2: Initialize SessionPoller with callback to handlePoll
    this.poller = new SessionPoller(async (sessionId) => {
      await this.handlePoll(sessionId)
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
    detectedChannels?: Array<'email' | 'sms'>
  }): Promise<SessionState> {
    const { tabId, url, expected, timeoutSeconds, detectedChannels } = params

    // Cancel existing session for tab
    for (const existing of this.sessions.values()) {
      if (existing.tabId === tabId && existing.status === "active") {
        await this.cancelSession(existing.id)
      }
    }

    const id = crypto.randomUUID()
    const now = Date.now()

    // Compute effective timeout: SMS-only sessions capped at 20s
    const channels = detectedChannels ?? ['email']
    const effectiveTimeout = channels.length === 1 && channels[0] === 'sms'
      ? Math.min(timeoutSeconds ?? 30, 20)
      : (timeoutSeconds ?? 20)

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

    try {
      const { getMessagesTabManager } = await import('@/lib/providers/google-messages/tab-manager')
      getMessagesTabManager().resetPollCount(session.id)
      await getMessagesTabManager().closeIfOwned()
    } catch { /* tab manager not loaded */ }

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
  private async handlePoll(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session || session.status !== "active") {
      return
    }

    // Determine which poll index this is
    const pollIndex = session.pollsCompleted.length

    // Guard: already completed this poll
    if (session.pollsCompleted.includes(pollIndex)) {
      return
    }

    try {
      const code = await this.pollForCode(session)

      session.pollsCompleted.push(pollIndex)
      session.pollsCompleted.sort((a, b) => a - b)
      session.lastUpdated = Date.now()

      if (code) {
        session.status = "filled"
        session.lastCode = code
        try {
          const { getMessagesTabManager } = await import('@/lib/providers/google-messages/tab-manager')
          getMessagesTabManager().resetPollCount(session.id)
          await getMessagesTabManager().closeIfOwned()
        } catch { /* tab manager not loaded */ }
        await this.persistSessions()
        this.poller.cancelPolls(sessionId) // V2: Cancel remaining polls
        this.callbacks.onSessionCompleted(session, { status: "filled", code })
        return
      }

      const pollsRemaining =
        session.pollSchedule.length - session.pollsCompleted.length

      if (pollsRemaining <= 0) {
        session.status = "timedout"
        try {
          const { getMessagesTabManager } = await import('@/lib/providers/google-messages/tab-manager')
          getMessagesTabManager().resetPollCount(session.id)
          await getMessagesTabManager().closeIfOwned()
        } catch { /* tab manager not loaded */ }
        await this.persistSessions()
        this.poller.cancelPolls(sessionId) // V2: Clean up poller
        this.callbacks.onSessionCompleted(session, { status: "timedout" })
        return
      }

      await this.persistSessions()
      this.callbacks.onSessionUpdated?.(session)
      // V2: SessionPoller handles next poll scheduling automatically
    } catch (error) {
      console.error("[SessionController] Poll execution failed:", error)

      session.pollsCompleted.push(pollIndex)
      session.pollsCompleted.sort((a, b) => a - b)
      session.lastUpdated = Date.now()

      const pollsRemaining =
        session.pollSchedule.length - session.pollsCompleted.length

      if (pollsRemaining <= 0) {
        session.status = "timedout"
        try {
          const { getMessagesTabManager } = await import('@/lib/providers/google-messages/tab-manager')
          getMessagesTabManager().resetPollCount(session.id)
          await getMessagesTabManager().closeIfOwned()
        } catch { /* tab manager not loaded */ }
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
   * V2: Passes sessionStart and expectedShape to findBestMatchingCode() for v2 scoring.
   */
  private async pollForCode(
    session: SessionState
  ): Promise<SessionCodeResult | null> {
    try {
      // Get appropriate storage for current mode (plaintext or encrypted)
      const storage = await StorageFactory.create()

      // Check if Watch Sessions V2 is enabled
      const settings = await storage.getSettings()
      const v2Enabled = settings.watchSessionV2Enabled ?? false

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
      const channels = session.detectedChannels ?? ['email']
      const adapters = allAdapters.filter(adapter => {
        if (adapter.id === 'google-messages') {
          return channels.includes('sms')
        }
        return channels.includes('email')
      })

      // Poll emails from all connected mailboxes (v2 API) - share seenStore to persist across polls
      const pollingService = new EmailPollingService(adapters, this.seenStore)
      const { candidates, adapterResults } = await pollingService.pollOnce()
      console.log(
        `[SessionController] Email poll complete: ${candidates.length} candidates found`
      )

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
            })
          }

          return results
        })

        await this.popupCacheManager.updateWithNewCodes(ephemeralCodes, mailboxes.length, mailboxes)
      }

      // Get codes from PopupCache (ephemeral only)
      const cache = this.popupCacheManager ? await this.popupCacheManager.getCache() : null
      const allCachedCodes = cache ? cache.codes : []

      // Filter cached codes by channel to prevent cross-channel contamination
      // SMS-only sessions should only see google-messages codes; email-only should exclude them
      const channelFilteredCodes = allCachedCodes.filter(c => {
        if (channels.includes('sms') && !channels.includes('email')) {
          return c.providerId === 'google-messages'
        }
        if (channels.includes('email') && !channels.includes('sms')) {
          return c.providerId !== 'google-messages'
        }
        return true // hybrid: keep all
      })

      const codes = channelFilteredCodes.map(c => ({
        code: c.code,
        timestamp: c.receivedAt,
        source: c.source,
        used: c.usedAt !== undefined,
        siteMatch: undefined, // PopupCacheCode doesn't have siteMatch
        mailboxId: undefined, // PopupCacheCode doesn't have mailboxId
        senderETLD: c.senderETLD,
        receivedAt: c.receivedAt,
        domainAffinity: c.domainAffinity,
      }))

      // V2: Pass sessionStart and expectedShape to v2 scoring algorithm (if enabled)
      // When v2 is disabled, fall back to basic matching without session/shape parameters
      const best = v2Enabled
        ? findBestMatchingCode(
            codes,
            session.url,
            Date.now(),
            session.sessionStart,   // V2: Enable sessionBoost
            session.expectedShape   // V2: Enable shape matching
          )
        : findBestMatchingCode(
            codes,
            session.url,
            Date.now()
            // V1-compatible: no sessionStart or expectedShape
          )

      if (!best) {
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
      console.error("[SessionController] Poll failed:", error)
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
}

export type { SessionState }
