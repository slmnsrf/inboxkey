/**
 * Session Controller
 *
 * Coordinates watch sessions in the background service worker, ensuring that
 * polling continues even if the worker is restarted. A watch session monitors
 * recent verification codes and notifies the content script when a suitable
 * candidate is found.
 */
import { findBestMatchingCode } from "@/lib/matching/code-matcher"
import { StorageFactory } from "@/lib/storage/storage-factory"
import { EmailPollingService } from "@/lib/services/email-polling-service"
import { createAdaptersFromMailboxes } from "@/lib/services/provider-adapter"
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
  expected: SessionExpected
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
  private timers = new Map<string, NodeJS.Timeout>()

  constructor(
    private readonly callbacks: SessionControllerCallbacks,
    private readonly pollSchedule: readonly number[] = DEFAULT_POLL_SCHEDULE,
    private readonly popupCacheManager?: PopupCacheManager
  ) {}

  /**
    * Load sessions from storage and resume any active watches.
    */
  async initialize(): Promise<void> {
    const persisted = await this.loadPersistedSessions()

    Object.values(persisted).forEach((session) => {
      if (session.status === "active") {
        this.sessions.set(session.id, session)
        this.scheduleNextPoll(session)
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

    const session: SessionState = {
      id,
      tabId,
      url,
      expected,
      startedAt: now,
      status: "active",
      pollSchedule,
      pollsCompleted: [],
      lastUpdated: now,
    }

    this.sessions.set(id, session)
    await this.persistSessions()
    this.callbacks.onSessionStarted?.(session)
    this.scheduleNextPoll(session)

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

    this.clearTimers(sessionId)
    this.sessions.delete(sessionId)
    await this.persistSessions()
    this.callbacks.onSessionCompleted(session, { status: "canceled" })
  }

  /**
   * Handle alarm fallback when service worker was restarted mid-session.
   */
  async handleAlarm(alarmName: string): Promise<void> {
    const parsed = this.parseAlarmName(alarmName)
    if (!parsed) return

    const { sessionId, pollIndex } = parsed
    await this.executePoll(sessionId, pollIndex)
  }

  /**
   * Resume an existing session without creating a new one.
   */
  async resumeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session || session.status !== "active") return

    this.scheduleNextPoll(session)
  }

  /**
   * Execute the next poll for a session (triggered by timer or alarm).
   */
  private async executePoll(
    sessionId: string,
    pollIndex: number
  ): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) return

    if (session.status !== "active") {
      return
    }

    if (session.pollsCompleted.includes(pollIndex)) {
      return
    }

    // Clear alarm for this poll to avoid duplicate execution
    chrome.alarms.clear(this.getAlarmName(session.id, pollIndex))

    try {
      const code = await this.pollForCode(session)

      session.pollsCompleted.push(pollIndex)
      session.pollsCompleted.sort((a, b) => a - b)
      session.lastUpdated = Date.now()

      if (code) {
        session.status = "filled"
        session.lastCode = code
        await this.persistSessions()
        this.clearTimers(sessionId)
        this.callbacks.onSessionCompleted(session, { status: "filled", code })
        return
      }

      const pollsRemaining =
        session.pollSchedule.length - session.pollsCompleted.length

      if (pollsRemaining <= 0) {
        session.status = "timedout"
        await this.persistSessions()
        this.clearTimers(sessionId)
        this.callbacks.onSessionCompleted(session, { status: "timedout" })
        return
      }

      await this.persistSessions()
      this.callbacks.onSessionUpdated?.(session)
      this.scheduleNextPoll(session)
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
        this.clearTimers(sessionId)
        this.callbacks.onSessionCompleted(session, { status: "timedout" })
        return
      }

      await this.persistSessions()
      this.scheduleNextPoll(session)
    }
  }

  /**
   * Schedule the next poll for a session using both setTimeout and alarms.
   */
  private scheduleNextPoll(session: SessionState): void {
    if (session.status !== "active") {
      return
    }

    const nextPollIndex = session.pollsCompleted.length
    if (nextPollIndex >= session.pollSchedule.length) {
      return
    }

    const targetTime = session.pollSchedule[nextPollIndex]
    const delay = Math.max(targetTime - Date.now(), 0)

    this.clearTimers(session.id)

    const timer = setTimeout(() => {
      this.executePoll(session.id, nextPollIndex).catch((error) => {
        console.error("[SessionController] Timer poll failed:", error)
      })
    }, delay)

    this.timers.set(session.id, timer)

    chrome.alarms.create(this.getAlarmName(session.id, nextPollIndex), {
      when: targetTime,
    })
  }

  /**
   * Poll for codes and return best match, or null if no match found.
   */
  private async pollForCode(
    session: SessionState
  ): Promise<SessionCodeResult | null> {
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

        if (candidate.code) {
          // Save OTP code
          const storedCode = {
            code: candidate.code.value,
            timestamp: candidate.receivedEpochMs || Date.now(),
            source: `${candidate.from || 'Unknown'} - ${candidate.subject || 'No subject'}`,
            used: false,
            siteMatch: undefined,
            mailboxId: mailbox.id,
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
            source: `${candidate.from || 'Unknown'} - ${candidate.subject || 'No subject'}`,
            used: false,
            siteMatch: candidate.link.domain,
            mailboxId: mailbox.id,
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
      const best = findBestMatchingCode(codes, session.url, Date.now())

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

  /**
   * Clear timers and alarms for a session.
   */
  private clearTimers(sessionId: string): void {
    const timer = this.timers.get(sessionId)
    if (timer) {
      clearTimeout(timer)
    }
    this.timers.delete(sessionId)

    // Clear all alarms for this session
    chrome.alarms.getAll((alarms) => {
      alarms
        .filter((alarm) => alarm.name?.startsWith(this.prefixAlarm(sessionId)))
        .forEach((alarm) => {
          if (alarm.name) {
            chrome.alarms.clear(alarm.name)
          }
        })
    })
  }

  /**
   * Build alarm name for a session/poll.
   */
  private getAlarmName(sessionId: string, pollIndex: number): string {
    return `${this.prefixAlarm(sessionId)}:${pollIndex}`
  }

  /**
   * Alarm name prefix helper.
   */
  private prefixAlarm(sessionId: string): string {
    return `inboxkey.session.${sessionId}`
  }

  /**
   * Parse alarm name into sessionId/pollIndex.
   */
  private parseAlarmName(
    alarmName: string
  ): { sessionId: string; pollIndex: number } | null {
    if (!alarmName.startsWith("inboxkey.session.")) {
      return null
    }

    const [, , sessionAndPoll] = alarmName.split(".")
    const [sessionId, pollIndexStr] = sessionAndPoll.split(":")

    if (!sessionId || pollIndexStr === undefined) {
      return null
    }

    const pollIndex = Number.parseInt(pollIndexStr, 10)
    if (Number.isNaN(pollIndex)) {
      return null
    }

    return { sessionId, pollIndex }
  }
}

export type { SessionState }
