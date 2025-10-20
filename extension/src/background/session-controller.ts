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
 */
import { findBestMatchingCode } from "@/lib/matching/code-matcher"
import { StorageFactory } from "@/lib/storage/storage-factory"
import { EmailPollingService } from "@/lib/services/email-polling-service"
import { createAdaptersFromMailboxes } from "@/lib/services/provider-adapter"
import { SessionPoller } from "./session-poller"
import { extractETLD } from "@/lib/matching/domain-affinity"
import type { ExpectedShape } from "@/lib/matching/shape-matcher"
import type { PopupCacheManager } from "./popup-cache"

const SESSION_STORAGE_KEY = "inboxkey.sessions"
const DEFAULT_POLL_SCHEDULE = [0, 5000, 10000] as const

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

  constructor(
    private readonly callbacks: SessionControllerCallbacks,
    private readonly pollSchedule: readonly number[] = DEFAULT_POLL_SCHEDULE,
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
        // V2: Delegate poll scheduling to SessionPoller
        this.poller.schedulePolls(session.id, session.startedAt)
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
  }): Promise<SessionState> {
    const { tabId, url, expected } = params

    // Cancel existing session for tab
    for (const existing of this.sessions.values()) {
      if (existing.tabId === tabId && existing.status === "active") {
        await this.cancelSession(existing.id)
      }
    }

    const id = crypto.randomUUID()
    const now = Date.now()
    const pollSchedule = this.pollSchedule.map((delay) => now + delay)

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
      startedAt: now,
      status: "active",
      pollSchedule,
      pollsCompleted: [],
      lastUpdated: now,
    }

    this.sessions.set(id, session)
    await this.persistSessions()
    this.callbacks.onSessionStarted?.(session)

    // V2: Delegate poll scheduling to SessionPoller
    this.poller.schedulePolls(id, now)

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

    // V2: Delegate to SessionPoller
    this.poller.schedulePolls(sessionId, session.startedAt)
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
        await this.persistSessions()
        this.poller.cancelPolls(sessionId) // V2: Cancel remaining polls
        this.callbacks.onSessionCompleted(session, { status: "filled", code })
        return
      }

      const pollsRemaining =
        session.pollSchedule.length - session.pollsCompleted.length

      if (pollsRemaining <= 0) {
        session.status = "timedout"
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
      const adapters = await createAdaptersFromMailboxes(storage)

      // Poll emails from all connected mailboxes (v2 API)
      const pollingService = new EmailPollingService(adapters)
      const candidates = await pollingService.pollOnce()
      console.log(
        `[SessionController] Email poll complete: ${candidates.length} candidates found`
      )

      // Convert v2 candidates to StoredCode format and save to storage
      for (const candidate of candidates) {
        // Find mailbox for this provider
        const mailbox = mailboxes.find(m => m.providerId === candidate.provider)
        if (!mailbox) continue

        // V2: Extract senderETLD from email sender
        const senderETLD = candidate.from
          ? extractETLD(
              candidate.from.includes('@')
                ? candidate.from.split('@')[1]
                : candidate.from
            )
          : undefined

        if (candidate.code) {
          // Save OTP code
          const storedCode = {
            code: candidate.code.value,
            timestamp: candidate.receivedEpochMs || Date.now(),
            receivedAt: candidate.receivedEpochMs,  // V2: Store receivedAt
            source: `${candidate.from || 'Unknown'} - ${candidate.subject || 'No subject'}`,
            used: false,
            siteMatch: undefined,
            mailboxId: mailbox.id,
            senderETLD,  // V2: Store extracted sender eTLD+1
          }

          // Check for duplicates
          const recentCodes = await storage.getRecentCodes(50)
          const isDuplicate = recentCodes.some(c => c.code === storedCode.code)

          if (!isDuplicate) {
            await storage.addCode(storedCode)
            console.log(`[SessionController] Saved code: ${storedCode.code}`)
          }
        }

        if (candidate.link) {
          // Save magic link (with "magic-link:" prefix for compatibility)
          const storedLink = {
            code: `magic-link:${candidate.link.href}`,
            timestamp: candidate.receivedEpochMs || Date.now(),
            receivedAt: candidate.receivedEpochMs,  // V2: Store receivedAt
            source: `${candidate.from || 'Unknown'} - ${candidate.subject || 'No subject'}`,
            used: false,
            siteMatch: candidate.link.domain,
            mailboxId: mailbox.id,
            senderETLD,  // V2: Store extracted sender eTLD+1
          }

          // Check for duplicates
          const recentCodes = await storage.getRecentCodes(50)
          const isDuplicate = recentCodes.some(c => c.code === storedLink.code)

          if (!isDuplicate) {
            await storage.addCode(storedLink)
            console.log(`[SessionController] Saved magic link from: ${candidate.link.domain}`)
          }
        }
      }

      // Update lastSyncedAt for all mailboxes after successful polling
      const now = Date.now()
      for (const mailbox of mailboxes) {
        await storage.updateMailbox(mailbox.id, { lastSyncedAt: now })
      }

      // Update popup cache if available
      if (this.popupCacheManager && candidates.length > 0) {
        const recentCodes = await storage.getRecentCodes(10)
        await this.popupCacheManager.updateWithNewCodes(recentCodes, mailboxes.length, mailboxes)
      }

      // Check storage for matching codes
      const codes = await storage.getRecentCodes(10)

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

      // Mark code as used
      try {
        await storage.markCodeUsed(best.code)
      } catch (error) {
        console.warn(
          "[SessionController] Failed to mark code as used, continuing",
          error
        )
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
