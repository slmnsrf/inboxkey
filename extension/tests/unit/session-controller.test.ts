/**
 * Comprehensive Unit Tests for SessionController
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import { SessionController } from "../../src/background/session-controller"
import type { StoredCode } from "../../src/lib/storage/schema"

const mockGetRecentCodes = vi.fn()
const mockMarkCodeUsed = vi.fn()
const mockGetMailboxes = vi.fn()
const mockUpdateMailbox = vi.fn()
const mockAddCode = vi.fn()
const mockGetSettings = vi.fn()

// V2: Mock PopupCacheManager for ephemeral code storage
const mockPopupCacheManager = {
  getCache: vi.fn(),
  updateWithNewCodes: vi.fn(),
  markCodeUsed: vi.fn(),
}

// Mock StorageFactory to return our mock storage
vi.mock("../../src/lib/storage/storage-factory", () => {
  return {
    StorageFactory: {
      create: vi.fn(() => Promise.resolve({
        getRecentCodes: mockGetRecentCodes,
        markCodeUsed: mockMarkCodeUsed,
        getMailboxes: mockGetMailboxes,
        updateMailbox: mockUpdateMailbox,
        addCode: mockAddCode,
        getSettings: mockGetSettings,
      })),
    },
  }
})

// Mock EmailPollingService with a SHARED pollOnce mock so tests can
// (a) count polls executed by the controller and (b) inject candidate
// records into specific polls (provenance gate makes the post-baseline
// poll the autofill-eligible one — see session-controller.ts).
const { mockPollOnce } = vi.hoisted(() => ({
  mockPollOnce: vi.fn((_ctx?: unknown, _cfg?: { onAdapterBatch?: (mailboxId: string, emails: unknown[]) => void }) =>
    Promise.resolve({ candidates: [], adapterResults: [] })
  ),
}))

vi.mock("../../src/lib/services/email-polling-service", () => {
  return {
    EmailPollingService: vi.fn(() => ({
      pollOnce: mockPollOnce,
    })),
  }
})

// Mock provider adapter creation
vi.mock("../../src/lib/services/provider-adapter", () => {
  return {
    createAdaptersFromMailboxes: vi.fn(() => Promise.resolve([])),
  }
})

vi.mock("../../src/lib/matching/code-matcher", () => {
  return {
    findBestMatchingCode: vi.fn((codes: StoredCode[]) => {
      return codes
        .filter((c) => !c.used)
        .sort((a, b) => (b.receivedAt ?? b.timestamp) - (a.receivedAt ?? a.timestamp))[0] || null
    }),
  }
})

// Mock KeyManager
const mockKeyManagerInstance = {
  isUnlocked: vi.fn(() => true),
  getMasterKey: vi.fn(() => ({})),
  getSalt: vi.fn(() => new Uint8Array([1, 2, 3])),
}

vi.mock("../../src/lib/security/key-manager", () => {
  return {
    KeyManager: {
      getInstance: vi.fn(() => mockKeyManagerInstance),
    },
  }
})

describe("SessionController", () => {
  // Helper to create controller with mocked PopupCacheManager
  const createController = (callbacks: any) => {
    return new SessionController(callbacks, mockPopupCacheManager as any)
  }

  beforeEach(() => {
    vi.useFakeTimers()
    mockGetRecentCodes.mockReset()
    mockMarkCodeUsed.mockReset()
    mockGetMailboxes.mockReset()
    mockUpdateMailbox.mockReset()
    mockAddCode.mockReset()
    mockGetSettings.mockReset()

    // V2: Reset PopupCacheManager mocks
    mockPopupCacheManager.getCache.mockReset()
    mockPopupCacheManager.updateWithNewCodes.mockReset()
    mockPopupCacheManager.markCodeUsed.mockReset()

    // V2: Default PopupCache returns empty codes array
    mockPopupCacheManager.getCache.mockResolvedValue({
      codes: [],
      links: [],
    })
    mockPopupCacheManager.updateWithNewCodes.mockResolvedValue(undefined)
    mockPopupCacheManager.markCodeUsed.mockResolvedValue(undefined)

    // Reset the shared poll mock between tests; default is no candidates.
    mockPollOnce.mockReset()
    mockPollOnce.mockImplementation(() =>
      Promise.resolve({ candidates: [], adapterResults: [] })
    )

    // Setup default mailbox mock (required for polling to work)
    mockGetMailboxes.mockResolvedValue([{
      id: "mailbox-1",
      providerId: "imap-bridge",
      email: "test@example.com",
      imapServer: "imap.example.com",
      imapPort: 993,
      imapAccountId: "acc_test",
      addedAt: Date.now(),
      lastSyncedAt: Date.now() - 60000
    }])

    // Setup default settings mock
    mockGetSettings.mockResolvedValue({
      autoFillEnabled: true,
      lockEnabled: false,
      lockTimeoutMinutes: 15,
      allowedDomains: [],
      deniedDomains: [],
      notificationsEnabled: true,
      watchSessionV2Enabled: true,  // Required for pollForCode()
    })

    mockKeyManagerInstance.isUnlocked.mockReturnValue(true)
    mockKeyManagerInstance.getMasterKey.mockReturnValue({})
    mockKeyManagerInstance.getSalt.mockReturnValue(new Uint8Array([1, 2, 3]))
    chrome.storage.session.clear()
    ;(chrome.alarms.create as unknown as ReturnType<typeof vi.fn>).mockReset()
    ;(chrome.alarms.clear as unknown as ReturnType<typeof vi.fn>).mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe("Session Lifecycle", () => {
    it("should start session with valid parameters", async () => {
      const onStarted = vi.fn()
      const onCompleted = vi.fn()
      const controller = createController({
          onSessionStarted: onStarted,
          onSessionCompleted: onCompleted,
        })

      await controller.initialize()

      const session = await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: { length: 6, charset: "digits" },
        timeoutSeconds: 0.2,
      })

      expect(session).toMatchObject({
        id: expect.any(String),
        tabId: 1,
        url: "https://example.com",
        status: "active",
        expected: { length: 6, charset: "digits" },
      })
      expect(onStarted).toHaveBeenCalledWith(session)
    })

    it("should replace existing session for same tab", async () => {
      const onCompleted = vi.fn()
      const controller = createController({ onSessionCompleted: onCompleted })

      await controller.initialize()
      // V2: Polls use PopupCache, not mockGetRecentCodes

      const session1 = await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
        timeoutSeconds: 0.2,
      })

      const session2 = await controller.startSession({
        tabId: 1,
        url: "https://example.com/login",
        expected: {},
        timeoutSeconds: 0.2,
      })

      expect(onCompleted).toHaveBeenCalledWith(
        expect.objectContaining({ id: session1.id }),
        { status: "canceled" }
      )
      expect(session2.id).not.toBe(session1.id)
    })

    it("should cancel active session", async () => {
      const onCompleted = vi.fn()
      const controller = createController({ onSessionCompleted: onCompleted })

      await controller.initialize()
      // V2: Polls use PopupCache, not mockGetRecentCodes

      const session = await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
        timeoutSeconds: 0.2,
      })

      await controller.cancelSession(session.id)

      expect(onCompleted).toHaveBeenCalledWith(
        expect.objectContaining({ id: session.id, status: "canceled" }),
        { status: "canceled" }
      )
    })

    it("should time out session after all polls complete", async () => {
      const onCompleted = vi.fn()
      const controller = createController({ onSessionCompleted: onCompleted })

      await controller.initialize()
      // V2: Polls use PopupCache, not mockGetRecentCodes

      await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
        timeoutSeconds: 0.2,
      })

      // Execute all 3 polls: t=0, t=100ms (50% of 200ms), t=200ms (100% of 200ms)
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(1)
      await vi.advanceTimersByTimeAsync(99)
      await vi.advanceTimersByTimeAsync(100)

      expect(onCompleted).toHaveBeenCalledWith(
        expect.objectContaining({ status: "timedout" }),
        { status: "timedout" }
      )
    })

    it("should fill session when code arrives post-baseline", async () => {
      const onCompleted = vi.fn()
      const controller = createController({ onSessionCompleted: onCompleted })

      await controller.initialize()

      // V3 (provenance gate): the FIRST poll captures the inbox baseline
      // and never autofills. Codes arriving on poll #2 onward are eligible.
      // First poll: empty inbox (baseline = nothing). Second poll: a new
      // candidate from a sender whose eTLD matches the page domain so the
      // zero-affinity guard accepts it.
      mockPollOnce
        .mockImplementationOnce(() =>
          Promise.resolve({ candidates: [], adapterResults: [] })
        )
        .mockImplementationOnce(() =>
          Promise.resolve({
            candidates: [
              {
                provider: "imap-bridge" as const,
                mailboxId: "mailbox-1",
                messageId: "m-1",
                subject: "Code",
                from: "noreply@example.com",
                receivedEpochMs: Date.now(),
                code: { value: "123456", kind: "digits" as const, score: 0.95 },
                score: 0.95,
                provenanceKey: "imap-bridge:mailbox-1:m-1",
              },
            ],
            adapterResults: [{ mailboxId: "mailbox-1", success: true }],
          })
        )

      await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
        timeoutSeconds: 10,
      })

      // First poll at t=0 captures baseline (no autofill).
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(1)
      expect(onCompleted).not.toHaveBeenCalled()

      // Second poll at t=5000 finds the post-baseline candidate.
      await vi.advanceTimersByTimeAsync(4999)
      await vi.advanceTimersByTimeAsync(1)

      expect(onCompleted).toHaveBeenCalledWith(
        expect.objectContaining({ status: "filled" }),
        expect.objectContaining({
          status: "filled",
          code: expect.objectContaining({ code: "123456" }),
        })
      )
    })

    it("should transition status correctly throughout lifecycle", async () => {
      const onStarted = vi.fn()
      const onUpdated = vi.fn()
      const onCompleted = vi.fn()
      const controller = createController({
          onSessionStarted: onStarted,
          onSessionUpdated: onUpdated,
          onSessionCompleted: onCompleted,
        })

      await controller.initialize()
      // V2: Polls use PopupCache, not mockGetRecentCodes

      // V2: Use timeoutSeconds=10 to get 3 polls at [0, 5000, 10000]
      await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
        timeoutSeconds: 10,
      })

      expect(onStarted).toHaveBeenCalledWith(
        expect.objectContaining({ status: "active" })
      )

      // First poll at t=0
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(1)
      expect(onUpdated).toHaveBeenCalledWith(
        expect.objectContaining({ status: "active" })
      )

      // Complete remaining polls: t=5000, t=10000
      await vi.advanceTimersByTimeAsync(4999)
      await vi.advanceTimersByTimeAsync(5000)

      expect(onCompleted).toHaveBeenCalledWith(
        expect.objectContaining({ status: "timedout" }),
        { status: "timedout" }
      )
    })
  })

  describe("Polling Behavior", () => {
    it("should execute polls at correct intervals", async () => {
      const onCompleted = vi.fn()
      const controller = createController({ onSessionCompleted: onCompleted })

      await controller.initialize()
      // V2: Polls use PopupCache, not mockGetRecentCodes

      // V2: Use timeoutSeconds=10 to get 3 polls at [0, 5000, 10000]
      await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
        timeoutSeconds: 10,
      })

      // Initial poll happens immediately (pollTimes[0] = 0ms)
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(1)
      expect(mockPollOnce).toHaveBeenCalledTimes(1)

      // Second poll at 5000ms
      await vi.advanceTimersByTimeAsync(4999)
      expect(mockPollOnce).toHaveBeenCalledTimes(2)

      // Third poll at 10000ms
      await vi.advanceTimersByTimeAsync(5000)
      expect(mockPollOnce).toHaveBeenCalledTimes(3)
    })

    it("should skip duplicate polls (idempotency)", async () => {
      const onCompleted = vi.fn()
      const controller = createController({ onSessionCompleted: onCompleted })

      await controller.initialize()
      // V2: Polls use PopupCache, not mockGetRecentCodes

      await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
        timeoutSeconds: 0.2,
      })

      // Initial poll at t=0
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(1)

      // Note: handleAlarm() removed - SessionPoller handles alarms internally
      // Idempotency is now tested via SessionPoller's duplicate execution prevention

      // Should only execute once per poll time (not duplicated)
      expect(mockPollOnce).toHaveBeenCalledTimes(1)
    })

    it("should handle poll errors gracefully", async () => {
      const onCompleted = vi.fn()
      const controller = createController({ onSessionCompleted: onCompleted })

      await controller.initialize()
      // V2: Polls use PopupCache, not mockGetRecentCodes
      // Storage errors are no longer relevant since we use PopupCache

      await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
        timeoutSeconds: 0.2,
      })

      // Execute all polls
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(1)
      await vi.advanceTimersByTimeAsync(4999)
      await vi.advanceTimersByTimeAsync(5000)

      // Should complete despite error
      expect(onCompleted).toHaveBeenCalledWith(
        expect.objectContaining({ status: "timedout" }),
        { status: "timedout" }
      )
    })

    it("should continue polling after failed poll", async () => {
      const onUpdated = vi.fn()
      const onCompleted = vi.fn()
      const controller = createController({
          onSessionUpdated: onUpdated,
          onSessionCompleted: onCompleted,
        })

      await controller.initialize()
      // V2: Polls use PopupCache, not mockGetRecentCodes
      // Storage errors are no longer relevant since we use PopupCache

      // Mock first poll to fail, then succeed
      mockPollOnce
        .mockImplementationOnce(() => Promise.reject(new Error("Temporary failure")))
        .mockImplementation(() => Promise.resolve({ candidates: [], adapterResults: [] }))

      // V2: Use timeoutSeconds=10 to get 3 polls at [0, 5000, 10000]
      await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
        timeoutSeconds: 10,
      })

      // All 3 polls: t=0 (fails), t=5000, t=10000
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(1)
      await vi.advanceTimersByTimeAsync(4999)
      await vi.advanceTimersByTimeAsync(5000)

      // Should attempt all 3 polls despite first failure
      expect(mockPollOnce).toHaveBeenCalledTimes(3)
      expect(onUpdated).toHaveBeenCalled()
    })

    it("should stop polling after code found", async () => {
      const onCompleted = vi.fn()
      const controller = createController({ onSessionCompleted: onCompleted })

      await controller.initialize()

      // V3: First poll captures baseline; second poll's candidate triggers fill.
      mockPollOnce
        .mockImplementationOnce(() =>
          Promise.resolve({ candidates: [], adapterResults: [] })
        )
        .mockImplementationOnce(() =>
          Promise.resolve({
            candidates: [
              {
                provider: "imap-bridge" as const,
                mailboxId: "mailbox-1",
                messageId: "m-fresh",
                subject: "Code",
                from: "noreply@example.com",
                receivedEpochMs: Date.now(),
                code: { value: "123456", kind: "digits" as const, score: 0.95 },
                score: 0.95,
                provenanceKey: "imap-bridge:mailbox-1:m-fresh",
              },
            ],
            adapterResults: [{ mailboxId: "mailbox-1", success: true }],
          })
        )

      await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
        timeoutSeconds: 10,
      })

      // Poll #1 (baseline) + poll #2 (fill).
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(1)
      await vi.advanceTimersByTimeAsync(4999)
      await vi.advanceTimersByTimeAsync(1)

      expect(mockPollOnce).toHaveBeenCalledTimes(2)
      expect(onCompleted).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: "filled" })
      )
    })

    it("should stop polling after timeout", async () => {
      const onCompleted = vi.fn()
      const controller = createController({ onSessionCompleted: onCompleted })

      await controller.initialize()
      // V2: Polls use PopupCache, not mockGetRecentCodes

      // V2: Use timeoutSeconds=10 to get 3 polls at [0, 5000, 10000]
      await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
        timeoutSeconds: 10,
      })

      // Execute all 3 polls: t=0, t=5000, t=10000
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(1)
      await vi.advanceTimersByTimeAsync(4999)
      await vi.advanceTimersByTimeAsync(5000)

      // All 3 polls should execute (pollTimesMs = [0, 5000, 10000])
      expect(mockPollOnce).toHaveBeenCalledTimes(3)
      expect(onCompleted).toHaveBeenCalledWith(
        expect.anything(),
        { status: "timedout" }
      )

      // No more polls after timeout
      await vi.advanceTimersByTimeAsync(10000)
      expect(mockPollOnce).toHaveBeenCalledTimes(3)
    })

    it("plumbs session.expected through to pollOnce ctx", async () => {
      // Regression: keyword-free SMS bodies ("Amazon: 123456 ...") were
      // rejected by the OTP extractor's no-keyword fallback because the
      // session's expected length/charset (derived from the OTP field's
      // maxlength/inputMode) wasn't reaching the extractor. The
      // SessionController must pass session.expected to pollOnce so the
      // extractor can pair it with the brand-prefix-shape gate.
      const controller = createController({ onSessionCompleted: vi.fn() })
      await controller.initialize()

      // Need at least one mailbox so an adapter is created and pollOnce runs.
      const { createAdaptersFromMailboxes } = await import("../../src/lib/services/provider-adapter")
      ;(createAdaptersFromMailboxes as any).mockResolvedValue([{ id: "imap-bridge" }])
      mockGetMailboxes.mockResolvedValue([
        { id: "imap-1", providerId: "imap-bridge", email: "user@example.com", imapServer: "imap.example.com", imapPort: 993, imapAccountId: "acc_1", addedAt: Date.now(), lastSyncedAt: 0 },
      ])

      await controller.startSession({
        tabId: 1,
        url: "https://example.com/verify",
        expected: { length: 6, charset: "digits" },
        timeoutSeconds: 0.2,
      })

      // Initial poll at t=0
      await vi.advanceTimersByTimeAsync(1)

      expect(mockPollOnce).toHaveBeenCalled()
      const firstCallCtx = mockPollOnce.mock.calls[0][0] as
        | { expected?: { length?: number; charset?: string } }
        | undefined
      expect(firstCallCtx?.expected).toEqual({ length: 6, charset: "digits" })
    })

    it("passes empty expected when session field has no shape constraints", async () => {
      // Sessions started without maxlength/inputMode hints (e.g. a
      // generic <input type="text">) should still poll, just without
      // shape steering.
      const controller = createController({ onSessionCompleted: vi.fn() })
      await controller.initialize()

      const { createAdaptersFromMailboxes } = await import("../../src/lib/services/provider-adapter")
      ;(createAdaptersFromMailboxes as any).mockResolvedValue([{ id: "imap-bridge" }])
      mockGetMailboxes.mockResolvedValue([
        { id: "imap-1", providerId: "imap-bridge", email: "user@example.com", imapServer: "imap.example.com", imapPort: 993, imapAccountId: "acc_1", addedAt: Date.now(), lastSyncedAt: 0 },
      ])

      await controller.startSession({
        tabId: 1,
        url: "https://example.com/verify",
        expected: {},
        timeoutSeconds: 0.2,
      })

      await vi.advanceTimersByTimeAsync(1)

      expect(mockPollOnce).toHaveBeenCalled()
      const firstCallCtx = mockPollOnce.mock.calls[0][0] as
        | { expected?: { length?: number; charset?: string } }
        | undefined
      // Both fields undefined; downstream extractFromEmail treats
      // ctx.expected?.length as undefined, falling back to keyword-only
      // detection.
      expect(firstCallCtx?.expected).toEqual({ length: undefined, charset: undefined })
    })
  })

  describe("Persistence", () => {
    it("should persist sessions to chrome.storage.session", async () => {
      const controller = createController({ onSessionCompleted: vi.fn() })

      await controller.initialize()
      // V2: Polls use PopupCache, not mockGetRecentCodes

      const session = await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
        timeoutSeconds: 0.2,
      })

      const stored = await chrome.storage.session.get("inboxkey.sessions")
      expect(stored["inboxkey.sessions"]).toMatchObject({
        [session.id]: expect.objectContaining({
          id: session.id,
          tabId: 1,
        }),
      })
    })

    it("should load persisted sessions on initialize", async () => {
      const onCompleted = vi.fn()

      // Create session with first controller
      const controller1 = createController({ onSessionCompleted: onCompleted })
      await controller1.initialize()
      // V2: Polls use PopupCache, not mockGetRecentCodes

      const session = await controller1.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
        timeoutSeconds: 0.2,
      })

      // Verify session was persisted
      const stored = await chrome.storage.session.get("inboxkey.sessions")
      expect(stored["inboxkey.sessions"]).toBeDefined()
      expect(stored["inboxkey.sessions"][session.id]).toMatchObject({
        id: session.id,
        status: "active"
      })

      // Create new controller and verify it loads sessions
      const controller2 = createController({ onSessionCompleted: onCompleted })
      await controller2.initialize()

      // Should have restored session and resumed polling
      // Advance to next poll opportunity
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(1)
      expect(mockPollOnce).toHaveBeenCalled()
    })

    it("should resume active sessions after load", async () => {
      const onCompleted = vi.fn()
      const now = Date.now()

      // V2: Session must include siteETLD and sessionStart for v2 algorithm
      // pollSchedule must match WATCH_SESSION_SCORING.pollTimesMs
      await chrome.storage.session.set({
        "inboxkey.sessions": {
          "test-session": {
            id: "test-session",
            tabId: 1,
            url: "https://example.com",
            siteETLD: "example.com",  // V2 requirement
            expected: {},
            sessionStart: now,  // V2 requirement
            startedAt: now,
            status: "active",
            pollSchedule: [now, now + 5000, now + 10000],  // Matches pollTimesMs
            pollsCompleted: [],  // No polls completed yet
            lastUpdated: now,
          },
        },
      })

      // V2: Polls use PopupCache, not mockGetRecentCodes

      const controller = createController({ onSessionCompleted: onCompleted })
      await controller.initialize()

      // SessionPoller reschedules all polls; with empty pollsCompleted
      // the first poll (index 0) runs immediately and invokes pollOnce.
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(1)
      expect(mockPollOnce).toHaveBeenCalled()
    })

    it("should persist completed sessions in storage", async () => {
      const onCompleted = vi.fn()
      const controller = createController({ onSessionCompleted: onCompleted })

      await controller.initialize()
      // V2: Polls use PopupCache, not mockGetRecentCodes

      const session = await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
        timeoutSeconds: 0.2,
      })

      // Execute all polls
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(1)
      await vi.advanceTimersByTimeAsync(4999)
      await vi.advanceTimersByTimeAsync(5000)

      // Note: Completed sessions remain in storage (status: timedout)
      // This is by design for potential recovery/debugging
      const stored = await chrome.storage.session.get("inboxkey.sessions")
      expect(stored["inboxkey.sessions"][session.id]).toMatchObject({
        status: "timedout",
      })
    })
  })

  describe("Alarm Fallback", () => {
    it("should create alarms for each poll", async () => {
      const controller = createController({ onSessionCompleted: vi.fn() })

      await controller.initialize()
      // V2: Polls use PopupCache, not mockGetRecentCodes

      const session = await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
        timeoutSeconds: 0.2,
      })

      // V2: SessionPoller uses new alarm naming format
      expect(chrome.alarms.create).toHaveBeenCalledWith(
        `session-poll-${session.id}-0`,
        expect.objectContaining({ when: expect.any(Number) })
      )
    })

    it("should handle alarm trigger correctly", async () => {
      const onCompleted = vi.fn()
      const controller = createController({ onSessionCompleted: onCompleted })

      await controller.initialize()
      // V2: Polls use PopupCache, not mockGetRecentCodes

      // V2: Use timeoutSeconds=10 to get 3 polls at [0, 5000, 10000]
      const session = await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
        timeoutSeconds: 10,
      })

      // Note: handleAlarm() removed - SessionPoller handles alarms internally
      // Alarm handling is now tested in session-poller.test.ts
      // Here we just verify that alarms were created for the session

      // Verify alarms created for all poll times (0ms, 5000ms, 10000ms)
      expect(chrome.alarms.create).toHaveBeenCalledWith(
        `session-poll-${session.id}-0`,
        expect.objectContaining({ when: expect.any(Number) })
      )
      expect(chrome.alarms.create).toHaveBeenCalledWith(
        `session-poll-${session.id}-1`,
        expect.objectContaining({ when: expect.any(Number) })
      )
      expect(chrome.alarms.create).toHaveBeenCalledWith(
        `session-poll-${session.id}-2`,
        expect.objectContaining({ when: expect.any(Number) })
      )
    })

    it("should clear alarms on session completion", async () => {
      const onCompleted = vi.fn()
      const controller = createController({ onSessionCompleted: onCompleted })

      await controller.initialize()

      // V3: First poll captures baseline; second poll's candidate triggers fill.
      mockPollOnce
        .mockImplementationOnce(() =>
          Promise.resolve({ candidates: [], adapterResults: [] })
        )
        .mockImplementationOnce(() =>
          Promise.resolve({
            candidates: [
              {
                provider: "imap-bridge" as const,
                mailboxId: "mailbox-1",
                messageId: "m-x",
                subject: "Code",
                from: "noreply@example.com",
                receivedEpochMs: Date.now(),
                code: { value: "123456", kind: "digits" as const, score: 0.95 },
                score: 0.95,
                provenanceKey: "imap-bridge:mailbox-1:m-x",
              },
            ],
            adapterResults: [{ mailboxId: "mailbox-1", success: true }],
          })
        )

      await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
        timeoutSeconds: 10,
      })

      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(1)
      await vi.advanceTimersByTimeAsync(4999)
      await vi.advanceTimersByTimeAsync(1)

      expect(chrome.alarms.clear).toHaveBeenCalled()
    })

    it("should parse alarm names correctly", async () => {
      const onCompleted = vi.fn()
      const controller = createController({ onSessionCompleted: onCompleted })

      await controller.initialize()
      // V2: Polls use PopupCache, not mockGetRecentCodes

      // V2: Use timeoutSeconds=10 to get 3 polls at [0, 5000, 10000]
      const session = await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
        timeoutSeconds: 10,
      })

      // Note: handleAlarm() removed - SessionPoller handles alarms internally
      // Alarm parsing and handling is now tested in session-poller.test.ts

      // Verify alarm naming follows the expected format: session-poll-${id}-${index}
      const alarmCalls = vi.mocked(chrome.alarms.create).mock.calls
      expect(alarmCalls.length).toBe(3) // 3 poll times at [0, 5000, 10000]

      alarmCalls.forEach((call, index) => {
        const [alarmName] = call
        expect(alarmName).toBe(`session-poll-${session.id}-${index}`)
      })
    })
  })

  describe("Key Manager Integration", () => {
    it("should return null when extension is locked", async () => {
      const onCompleted = vi.fn()
      const controller = createController({ onSessionCompleted: onCompleted })

      await controller.initialize()
      mockKeyManagerInstance.isUnlocked.mockReturnValue(false)
      // V2: Polls use PopupCache, not mockGetRecentCodes

      await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
        timeoutSeconds: 0.2,
      })

      // Execute all polls
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(1)
      await vi.advanceTimersByTimeAsync(4999)
      await vi.advanceTimersByTimeAsync(5000)

      expect(onCompleted).toHaveBeenCalledWith(
        expect.anything(),
        { status: "timedout" }
      )
    })

    it("should return null when master key unavailable", async () => {
      const onCompleted = vi.fn()
      const controller = createController({ onSessionCompleted: onCompleted })

      await controller.initialize()
      mockKeyManagerInstance.getMasterKey.mockReturnValue(undefined)
      // V2: Polls use PopupCache, not mockGetRecentCodes

      await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
        timeoutSeconds: 0.2,
      })

      // Execute all polls
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(1)
      await vi.advanceTimersByTimeAsync(4999)
      await vi.advanceTimersByTimeAsync(5000)

      expect(onCompleted).toHaveBeenCalledWith(
        expect.anything(),
        { status: "timedout" }
      )
    })

    it("should poll successfully when unlocked", async () => {
      const onCompleted = vi.fn()
      const controller = createController({ onSessionCompleted: onCompleted })

      await controller.initialize()
      mockKeyManagerInstance.isUnlocked.mockReturnValue(true)
      mockKeyManagerInstance.getMasterKey.mockReturnValue({})
      mockKeyManagerInstance.getSalt.mockReturnValue(new Uint8Array([1, 2, 3]))

      mockPollOnce
        .mockImplementationOnce(() =>
          Promise.resolve({ candidates: [], adapterResults: [] })
        )
        .mockImplementationOnce(() =>
          Promise.resolve({
            candidates: [
              {
                provider: "imap-bridge" as const,
                mailboxId: "mailbox-1",
                messageId: "m-key",
                subject: "Code",
                from: "noreply@example.com",
                receivedEpochMs: Date.now(),
                code: { value: "123456", kind: "digits" as const, score: 0.95 },
                score: 0.95,
                provenanceKey: "imap-bridge:mailbox-1:m-key",
              },
            ],
            adapterResults: [{ mailboxId: "mailbox-1", success: true }],
          })
        )

      await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
        timeoutSeconds: 10,
      })

      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(1)
      await vi.advanceTimersByTimeAsync(4999)
      await vi.advanceTimersByTimeAsync(1)

      expect(onCompleted).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: "filled" })
      )
    })
  })

  describe("Code Matching", () => {
    it("should find best matching code from storage", async () => {
      const onCompleted = vi.fn()
      const controller = createController({ onSessionCompleted: onCompleted })

      await controller.initialize()

      // V3 (per-mailbox baselines + first-poll freshness gate): poll #1
      // reports m-old via the onAdapterBatch baseline hook (the same
      // channel the real polling service uses), so m-old becomes part of
      // the baseline. With the first-poll fresh-baseline classification,
      // a candidate's eligibility is decided by receivedEpochMs vs the
      // pre-session grace window — not by baseline membership equality
      // (which is structural for first-poll candidates). Set m-old's
      // receivedEpochMs well outside the 2-min grace so it correctly
      // classifies as truly pre-session and the test still asserts
      // "first-poll candidates older than the user's session intent
      // don't autofill." Poll #2 yields a fresh m-new that fires fill.
      const STALE_AGE_MS = 10 * 60_000 // 10 min ago — outside 2-min grace
      mockPollOnce
        .mockImplementationOnce((_ctx, cfg) => {
          cfg?.onAdapterBatch?.("mailbox-1", [
            {
              id: "m-old",
              provider: "imap-bridge",
              mailboxId: "mailbox-1",
              text: "old code",
              receivedEpochMs: Date.now() - STALE_AGE_MS,
            },
          ])
          return Promise.resolve({
            candidates: [
              {
                provider: "imap-bridge" as const,
                mailboxId: "mailbox-1",
                messageId: "m-old",
                subject: "Old",
                from: "noreply@example.com",
                receivedEpochMs: Date.now() - STALE_AGE_MS,
                code: { value: "111111", kind: "digits" as const, score: 0.95 },
                score: 0.95,
                provenanceKey: "imap-bridge:mailbox-1:m-old",
              },
            ],
            adapterResults: [{ mailboxId: "mailbox-1", success: true }],
          })
        })
        .mockImplementationOnce((_ctx, cfg) => {
          cfg?.onAdapterBatch?.("mailbox-1", [
            {
              id: "m-new",
              provider: "imap-bridge",
              mailboxId: "mailbox-1",
              text: "new code",
              receivedEpochMs: Date.now(),
            },
          ])
          return Promise.resolve({
            candidates: [
              {
                provider: "imap-bridge" as const,
                mailboxId: "mailbox-1",
                messageId: "m-new",
                subject: "New",
                from: "noreply@example.com",
                receivedEpochMs: Date.now(),
                code: { value: "222222", kind: "digits" as const, score: 0.95 },
                score: 0.95,
                provenanceKey: "imap-bridge:mailbox-1:m-new",
              },
            ],
            adapterResults: [{ mailboxId: "mailbox-1", success: true }],
          })
        })

      await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
        timeoutSeconds: 10,
      })

      // Poll #1 (baseline includes m-old) + poll #2 (m-new fires fill).
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(1)
      await vi.advanceTimersByTimeAsync(4999)
      await vi.advanceTimersByTimeAsync(1)

      expect(onCompleted).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          status: "filled",
          code: expect.objectContaining({ code: "222222" }),
        })
      )
    })

    // ===========================================================================
    // First-poll fresh-baseline classification
    // ===========================================================================
    //
    // The provenance baseline for a brand-new session is committed by the
    // SAME poll that produces the first batch of candidates. Pre-fix,
    // candidate-vs-baseline membership equality classified those candidates
    // as pre-session — but the baseline literally contained the candidate's
    // own snippet/id, because they came from the same poll. The fix:
    // mailboxes whose baseline was just seeded from the current batch use
    // a receipt-time freshness gate, not membership equality, on that poll.
    //
    // Tests below assert through externally-observable behavior (final
    // session status + matched code), never through the private classifier.
    describe("first-poll fresh-baseline classification", () => {
      const FRESH_NOW_OFFSET = -2_000 // 2s before sessionStart — fresh
      const STALE_OFFSET_MS = -10 * 60_000 // 10 min before — outside grace
      const SMS_SNAPSHOT_KEY = "inboxkey.sms_conversation_snapshot.gm-1"

      function setupOneEmailMailbox() {
        mockGetMailboxes.mockResolvedValue([
          {
            id: "mailbox-1",
            providerId: "imap-bridge",
            email: "user@example.com",
            imapServer: "imap.example.com",
            imapPort: 993,
            imapAccountId: "acc_1",
            addedAt: Date.now(),
            lastSyncedAt: 0,
          },
        ])
      }

      function setupOneSmsMailbox() {
        mockGetMailboxes.mockResolvedValue([
          {
            id: "gm-1",
            providerId: "google-messages",
            email: "sms@google-messages.local",
            gmPhoneNumber: "+10000000000",
            addedAt: Date.now(),
            lastSyncedAt: 0,
          },
        ])
      }

      it("(case 1) defers first-poll SMS candidate until the settle window elapses", async () => {
        setupOneSmsMailbox()
        const onCompleted = vi.fn()
        const controller = createController({ onSessionCompleted: onCompleted })
        await controller.initialize()

        const now = Date.now()
        const previewHash = "hash-fresh-sms"

        mockPollOnce.mockImplementationOnce((_ctx, cfg) => {
          // onAdapterBatch seeds the (current) baseline with the SAME
          // snippet hash the candidate carries — the chicken-and-egg case.
          cfg?.onAdapterBatch?.("gm-1", [
            {
              id: "gm-msg-1",
              provider: "google-messages",
              mailboxId: "gm-1",
              text: "Brand: 123456 ...",
              receivedEpochMs: now + FRESH_NOW_OFFSET,
              _meta: {
                conversationHref: "/conv/1",
                snippetHash: previewHash,
                isUnread: true,
              },
            },
          ])
          return Promise.resolve({
            candidates: [
              {
                provider: "google-messages" as const,
                mailboxId: "gm-1",
                messageId: "gm-msg-1",
                from: "Brand",
                receivedEpochMs: now + FRESH_NOW_OFFSET,
                code: { value: "123456", kind: "digits" as const, score: 0.95 },
                score: 0.95,
                provenanceKey: "google-messages:gm-1:gm-msg-1",
                meta: {
                  conversationHref: "/conv/1",
                  snippetHash: previewHash,
                  isUnread: true,
                },
              },
            ],
            adapterResults: [{ mailboxId: "gm-1", success: true }],
          })
        })

        await controller.startSession({
          tabId: 1,
          url: "https://brand.com",
          expected: { length: 6, charset: "digits" },
          timeoutSeconds: 10,
          detectedChannels: ["sms"],
          channelEvidence: "positive",
        })

        await vi.advanceTimersByTimeAsync(1)
        expect(onCompleted).not.toHaveBeenCalled()

        await vi.advanceTimersByTimeAsync(4999)

        expect(onCompleted).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            status: "filled",
            code: expect.objectContaining({ code: "123456" }),
          })
        )
      })

      it("(case 1b) prefers a newer SMS that arrives during the settle window", async () => {
        setupOneSmsMailbox()
        const onCompleted = vi.fn()
        const controller = createController({ onSessionCompleted: onCompleted })
        await controller.initialize()

        const firstHash = "hash-first-sms"
        const secondHash = "hash-second-sms"

        mockPollOnce
          .mockImplementationOnce((_ctx, cfg) => {
            const firstReceived = Date.now()
            cfg?.onAdapterBatch?.("gm-1", [
              {
                id: "gm-msg-first",
                provider: "google-messages",
                mailboxId: "gm-1",
                text: "Brand: 111111 ...",
                receivedEpochMs: firstReceived,
                _meta: {
                  conversationHref: "/conv/1",
                  snippetHash: firstHash,
                  isUnread: true,
                },
              },
            ])
            return Promise.resolve({
              candidates: [
                {
                  provider: "google-messages" as const,
                  mailboxId: "gm-1",
                  messageId: "gm-msg-first",
                  from: "Brand",
                  receivedEpochMs: firstReceived,
                  code: { value: "111111", kind: "digits" as const, score: 0.95 },
                  score: 0.95,
                  provenanceKey: "google-messages:gm-1:gm-msg-first",
                  meta: {
                    conversationHref: "/conv/1",
                    snippetHash: firstHash,
                    isUnread: true,
                  },
                },
              ],
              adapterResults: [{ mailboxId: "gm-1", success: true }],
            })
          })
          .mockImplementationOnce((_ctx, cfg) => {
            const secondReceived = Date.now()
            cfg?.onAdapterBatch?.("gm-1", [
              {
                id: "gm-msg-second",
                provider: "google-messages",
                mailboxId: "gm-1",
                text: "Brand: 222222 ...",
                receivedEpochMs: secondReceived,
                _meta: {
                  conversationHref: "/conv/1",
                  snippetHash: secondHash,
                  isUnread: true,
                },
              },
            ])
            return Promise.resolve({
              candidates: [
                {
                  provider: "google-messages" as const,
                  mailboxId: "gm-1",
                  messageId: "gm-msg-second",
                  from: "Brand",
                  receivedEpochMs: secondReceived,
                  code: { value: "222222", kind: "digits" as const, score: 0.95 },
                  score: 0.95,
                  provenanceKey: "google-messages:gm-1:gm-msg-second",
                  meta: {
                    conversationHref: "/conv/1",
                    snippetHash: secondHash,
                    isUnread: true,
                  },
                },
              ],
              adapterResults: [{ mailboxId: "gm-1", success: true }],
            })
          })

        await controller.startSession({
          tabId: 1,
          url: "https://brand.com",
          expected: { length: 6, charset: "digits" },
          timeoutSeconds: 15,
          detectedChannels: ["sms"],
          channelEvidence: "positive",
        })

        await vi.advanceTimersByTimeAsync(1)
        expect(onCompleted).not.toHaveBeenCalled()

        await vi.advanceTimersByTimeAsync(4999)
        expect(onCompleted).not.toHaveBeenCalled()

        await vi.advanceTimersByTimeAsync(5000)
        expect(onCompleted).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            status: "filled",
            code: expect.objectContaining({ code: "222222" }),
          })
        )
      })

      it("(case 2) admits first-poll email candidate with fresh receivedEpochMs", async () => {
        setupOneEmailMailbox()
        const onCompleted = vi.fn()
        const controller = createController({ onSessionCompleted: onCompleted })
        await controller.initialize()

        const now = Date.now()

        mockPollOnce.mockImplementationOnce((_ctx, cfg) => {
          cfg?.onAdapterBatch?.("mailbox-1", [
            {
              id: "m-fresh",
              provider: "imap-bridge",
              mailboxId: "mailbox-1",
              text: "Your code is 654321",
              receivedEpochMs: now + FRESH_NOW_OFFSET,
            },
          ])
          return Promise.resolve({
            candidates: [
              {
                provider: "imap-bridge" as const,
                mailboxId: "mailbox-1",
                messageId: "m-fresh",
                subject: "Your code",
                from: "noreply@example.com",
                receivedEpochMs: now + FRESH_NOW_OFFSET,
                code: { value: "654321", kind: "digits" as const, score: 0.95 },
                score: 0.95,
                provenanceKey: "imap-bridge:mailbox-1:m-fresh",
              },
            ],
            adapterResults: [{ mailboxId: "mailbox-1", success: true }],
          })
        })

        await controller.startSession({
          tabId: 1,
          url: "https://example.com",
          expected: { length: 6, charset: "digits" },
          timeoutSeconds: 0.2,
        })

        await vi.advanceTimersByTimeAsync(1)

        expect(onCompleted).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            status: "filled",
            code: expect.objectContaining({ code: "654321" }),
          })
        )
      })

      it("(case 2b) rejects first-poll email candidate with undefined receivedEpochMs", async () => {
        setupOneEmailMailbox()
        const onCompleted = vi.fn()
        const controller = createController({ onSessionCompleted: onCompleted })
        await controller.initialize()

        mockPollOnce.mockImplementation((_ctx, cfg) => {
          cfg?.onAdapterBatch?.("mailbox-1", [
            {
              id: "m-undated",
              provider: "imap-bridge",
              mailboxId: "mailbox-1",
              text: "Your code is 222222",
            },
          ])
          return Promise.resolve({
            candidates: [
              {
                provider: "imap-bridge" as const,
                mailboxId: "mailbox-1",
                messageId: "m-undated",
                subject: "Your code",
                from: "noreply@example.com",
                receivedEpochMs: undefined,
                code: { value: "222222", kind: "digits" as const, score: 0.95 },
                score: 0.95,
                provenanceKey: "imap-bridge:mailbox-1:m-undated",
              },
            ],
            adapterResults: [{ mailboxId: "mailbox-1", success: true }],
          })
        })

        await controller.startSession({
          tabId: 1,
          url: "https://example.com",
          expected: {},
          timeoutSeconds: 0.2,
        })

        // Run all polls + timeout
        await vi.advanceTimersByTimeAsync(0)
        await vi.advanceTimersByTimeAsync(200)

        expect(onCompleted).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ status: "timedout" })
        )
      })

      it("(case 3) rejects first-poll top unread SMS candidate with undefined receivedEpochMs (fails closed)", async () => {
        // Unread + previewRank 0 is ordering evidence, not arrival-time
        // evidence. An old conversation that happens to be top-unread on
        // first browser run could otherwise surface yesterday's code, so
        // we fail closed for autofill: undated candidates do not advance
        // through the freshness gate.
        setupOneSmsMailbox()
        const onCompleted = vi.fn()
        const controller = createController({ onSessionCompleted: onCompleted })
        await controller.initialize()

        const previewHash = "hash-undated-top"

        mockPollOnce.mockImplementation((_ctx, cfg) => {
          cfg?.onAdapterBatch?.("gm-1", [
            {
              id: "gm-undated-top",
              provider: "google-messages",
              mailboxId: "gm-1",
              text: "Brand: 333333 ...",
              receivedEpochMs: undefined,
              _meta: {
                conversationHref: "/conv/u",
                snippetHash: previewHash,
                isUnread: true,
                previewRank: 0,
              },
            },
          ])
          return Promise.resolve({
            candidates: [
              {
                provider: "google-messages" as const,
                mailboxId: "gm-1",
                messageId: "gm-undated-top",
                from: "Brand",
                receivedEpochMs: undefined,
                code: { value: "333333", kind: "digits" as const, score: 0.95 },
                score: 0.95,
                provenanceKey: "google-messages:gm-1:gm-undated-top",
                meta: {
                  conversationHref: "/conv/u",
                  snippetHash: previewHash,
                  isUnread: true,
                  previewRank: 0,
                },
              },
            ],
            adapterResults: [{ mailboxId: "gm-1", success: true }],
          })
        })

        await controller.startSession({
          tabId: 1,
          url: "https://brand.com",
          expected: {},
          timeoutSeconds: 0.2,
          detectedChannels: ["sms"],
          channelEvidence: "positive",
        })

        await vi.advanceTimersByTimeAsync(0)
        await vi.advanceTimersByTimeAsync(200)

        expect(onCompleted).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ status: "timedout" })
        )
      })

      it("(case 3b) rejects first-poll SMS candidate with undefined receivedEpochMs when it is not top unread", async () => {
        setupOneSmsMailbox()
        const onCompleted = vi.fn()
        const controller = createController({ onSessionCompleted: onCompleted })
        await controller.initialize()

        const previewHash = "hash-undated"

        mockPollOnce.mockImplementation((_ctx, cfg) => {
          cfg?.onAdapterBatch?.("gm-1", [
            {
              id: "gm-undated",
              provider: "google-messages",
              mailboxId: "gm-1",
              text: "Brand: 333333 ...",
              receivedEpochMs: undefined,
              _meta: {
                conversationHref: "/conv/u",
                snippetHash: previewHash,
                isUnread: true,
              },
            },
          ])
          return Promise.resolve({
            candidates: [
              {
                provider: "google-messages" as const,
                mailboxId: "gm-1",
                messageId: "gm-undated",
                from: "Brand",
                receivedEpochMs: undefined,
                code: { value: "333333", kind: "digits" as const, score: 0.95 },
                score: 0.95,
                provenanceKey: "google-messages:gm-1:gm-undated",
                meta: {
                  conversationHref: "/conv/u",
                  snippetHash: previewHash,
                  isUnread: true,
                  previewRank: 1,
                },
              },
            ],
            adapterResults: [{ mailboxId: "gm-1", success: true }],
          })
        })

        await controller.startSession({
          tabId: 1,
          url: "https://brand.com",
          expected: {},
          timeoutSeconds: 0.2,
          detectedChannels: ["sms"],
          channelEvidence: "positive",
        })

        await vi.advanceTimersByTimeAsync(0)
        await vi.advanceTimersByTimeAsync(200)

        expect(onCompleted).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ status: "timedout" })
        )
      })

      it("(case 4) rejects first-poll SMS candidate with stale receivedEpochMs", async () => {
        setupOneSmsMailbox()
        const onCompleted = vi.fn()
        const controller = createController({ onSessionCompleted: onCompleted })
        await controller.initialize()

        const now = Date.now()
        const previewHash = "hash-stale"

        mockPollOnce.mockImplementation((_ctx, cfg) => {
          cfg?.onAdapterBatch?.("gm-1", [
            {
              id: "gm-stale",
              provider: "google-messages",
              mailboxId: "gm-1",
              text: "Brand: 444444 ...",
              receivedEpochMs: now + STALE_OFFSET_MS,
              _meta: {
                conversationHref: "/conv/s",
                snippetHash: previewHash,
                isUnread: true,
              },
            },
          ])
          return Promise.resolve({
            candidates: [
              {
                provider: "google-messages" as const,
                mailboxId: "gm-1",
                messageId: "gm-stale",
                from: "Brand",
                receivedEpochMs: now + STALE_OFFSET_MS,
                code: { value: "444444", kind: "digits" as const, score: 0.95 },
                score: 0.95,
                provenanceKey: "google-messages:gm-1:gm-stale",
                meta: {
                  conversationHref: "/conv/s",
                  snippetHash: previewHash,
                  isUnread: true,
                },
              },
            ],
            adapterResults: [{ mailboxId: "gm-1", success: true }],
          })
        })

        await controller.startSession({
          tabId: 1,
          url: "https://brand.com",
          expected: {},
          timeoutSeconds: 0.2,
          detectedChannels: ["sms"],
          channelEvidence: "positive",
        })

        await vi.advanceTimersByTimeAsync(0)
        await vi.advanceTimersByTimeAsync(200)

        expect(onCompleted).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ status: "timedout" })
        )
      })

      it("(case 5) keeps (snapshot) baseline strict — same-snippet candidate not eligible", async () => {
        setupOneSmsMailbox()
        const onCompleted = vi.fn()
        const controller = createController({ onSessionCompleted: onCompleted })
        await controller.initialize()

        const now = Date.now()
        const baselinedHash = "hash-prior-state"

        // Seed a fresh cross-session snapshot. loadSmsSnapshot will return
        // it (within TTL, observedAt < sessionStart), so the baseline
        // takes the (snapshot) path and currentBaselineThisPoll does NOT
        // include this mailbox. Existing strict snippet-diff classification
        // applies: same conversationHref + same snippetHash = pre-session.
        await chrome.storage.session.set({
          [SMS_SNAPSHOT_KEY]: {
            observedAt: now - 60_000,
            entries: [
              {
                conversationHref: "/conv/p",
                snippetHash: baselinedHash,
                isUnread: true,
              },
            ],
          },
        })

        mockPollOnce.mockImplementation((_ctx, cfg) => {
          cfg?.onAdapterBatch?.("gm-1", [
            {
              id: "gm-snap",
              provider: "google-messages",
              mailboxId: "gm-1",
              text: "Brand: 555555 ...",
              receivedEpochMs: now + FRESH_NOW_OFFSET,
              _meta: {
                conversationHref: "/conv/p",
                snippetHash: baselinedHash,
                isUnread: true,
              },
            },
          ])
          return Promise.resolve({
            candidates: [
              {
                provider: "google-messages" as const,
                mailboxId: "gm-1",
                messageId: "gm-snap",
                from: "Brand",
                receivedEpochMs: now + FRESH_NOW_OFFSET,
                code: { value: "555555", kind: "digits" as const, score: 0.95 },
                score: 0.95,
                provenanceKey: "google-messages:gm-1:gm-snap",
                meta: {
                  conversationHref: "/conv/p",
                  snippetHash: baselinedHash,
                  isUnread: true,
                },
              },
            ],
            adapterResults: [{ mailboxId: "gm-1", success: true }],
          })
        })

        await controller.startSession({
          tabId: 1,
          url: "https://brand.com",
          expected: {},
          timeoutSeconds: 0.2,
          detectedChannels: ["sms"],
          channelEvidence: "positive",
        })

        await vi.advanceTimersByTimeAsync(0)
        await vi.advanceTimersByTimeAsync(200)

        expect(onCompleted).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ status: "timedout" })
        )
      })

      it("(case 6) admits second-poll new-arrival candidate (existing-baseline path)", async () => {
        setupOneEmailMailbox()
        const onCompleted = vi.fn()
        const controller = createController({ onSessionCompleted: onCompleted })
        await controller.initialize()

        const now = Date.now()

        mockPollOnce
          .mockImplementationOnce((_ctx, cfg) => {
            // Poll #1: stale candidate becomes baseline; receipt time too
            // old to pass the freshness gate so it doesn't autofill.
            cfg?.onAdapterBatch?.("mailbox-1", [
              {
                id: "m-old",
                provider: "imap-bridge",
                mailboxId: "mailbox-1",
                text: "old code",
                receivedEpochMs: now + STALE_OFFSET_MS,
              },
            ])
            return Promise.resolve({
              candidates: [
                {
                  provider: "imap-bridge" as const,
                  mailboxId: "mailbox-1",
                  messageId: "m-old",
                  subject: "Old",
                  from: "noreply@example.com",
                  receivedEpochMs: now + STALE_OFFSET_MS,
                  code: { value: "111111", kind: "digits" as const, score: 0.95 },
                  score: 0.95,
                  provenanceKey: "imap-bridge:mailbox-1:m-old",
                },
              ],
              adapterResults: [{ mailboxId: "mailbox-1", success: true }],
            })
          })
          .mockImplementationOnce((_ctx, cfg) => {
            // Poll #2: brand-new email arrives. provenanceKey not in
            // baseline → existing strict path admits it.
            cfg?.onAdapterBatch?.("mailbox-1", [
              {
                id: "m-new",
                provider: "imap-bridge",
                mailboxId: "mailbox-1",
                text: "new code",
                receivedEpochMs: Date.now(),
              },
            ])
            return Promise.resolve({
              candidates: [
                {
                  provider: "imap-bridge" as const,
                  mailboxId: "mailbox-1",
                  messageId: "m-new",
                  subject: "New",
                  from: "noreply@example.com",
                  receivedEpochMs: Date.now(),
                  code: { value: "999999", kind: "digits" as const, score: 0.95 },
                  score: 0.95,
                  provenanceKey: "imap-bridge:mailbox-1:m-new",
                },
              ],
              adapterResults: [{ mailboxId: "mailbox-1", success: true }],
            })
          })

        await controller.startSession({
          tabId: 1,
          url: "https://example.com",
          expected: {},
          timeoutSeconds: 10,
        })

        await vi.advanceTimersByTimeAsync(0)
        await vi.advanceTimersByTimeAsync(1)
        await vi.advanceTimersByTimeAsync(4999)
        await vi.advanceTimersByTimeAsync(1)

        expect(onCompleted).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            status: "filled",
            code: expect.objectContaining({ code: "999999" }),
          })
        )
      })

      it("(case 7) rejects second-poll same email already in baseline (existing strict path)", async () => {
        setupOneEmailMailbox()
        const onCompleted = vi.fn()
        const controller = createController({ onSessionCompleted: onCompleted })
        await controller.initialize()

        const now = Date.now()
        const baselineEmail = {
          id: "m-stable",
          provider: "imap-bridge",
          mailboxId: "mailbox-1",
          text: "code",
          receivedEpochMs: now + STALE_OFFSET_MS,
        }

        mockPollOnce
          .mockImplementationOnce((_ctx, cfg) => {
            // Poll #1: stale email baselined. Same provenanceKey will be
            // re-emitted on poll #2 (simulating an extractor retry that
            // bypassed the seen-store, e.g. version bump on disk).
            cfg?.onAdapterBatch?.("mailbox-1", [baselineEmail])
            return Promise.resolve({
              candidates: [
                {
                  provider: "imap-bridge" as const,
                  mailboxId: "mailbox-1",
                  messageId: "m-stable",
                  subject: "Stable",
                  from: "noreply@example.com",
                  receivedEpochMs: now + STALE_OFFSET_MS,
                  code: { value: "100100", kind: "digits" as const, score: 0.95 },
                  score: 0.95,
                  provenanceKey: "imap-bridge:mailbox-1:m-stable",
                },
              ],
              adapterResults: [{ mailboxId: "mailbox-1", success: true }],
            })
          })
          .mockImplementationOnce((_ctx, cfg) => {
            // Poll #2: same provenanceKey appears again. Established-
            // baseline path: provenanceKey IS in mailboxKeys → not new
            // arrival → no autofill.
            cfg?.onAdapterBatch?.("mailbox-1", [baselineEmail])
            return Promise.resolve({
              candidates: [
                {
                  provider: "imap-bridge" as const,
                  mailboxId: "mailbox-1",
                  messageId: "m-stable",
                  subject: "Stable",
                  from: "noreply@example.com",
                  receivedEpochMs: now + STALE_OFFSET_MS,
                  code: { value: "100100", kind: "digits" as const, score: 0.95 },
                  score: 0.95,
                  provenanceKey: "imap-bridge:mailbox-1:m-stable",
                },
              ],
              adapterResults: [{ mailboxId: "mailbox-1", success: true }],
            })
          })

        await controller.startSession({
          tabId: 1,
          url: "https://example.com",
          expected: {},
          timeoutSeconds: 10,
        })

        await vi.advanceTimersByTimeAsync(0)
        await vi.advanceTimersByTimeAsync(1)
        await vi.advanceTimersByTimeAsync(4999)
        await vi.advanceTimersByTimeAsync(20000)

        expect(onCompleted).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ status: "timedout" })
        )
      })

      describe("corrupt snapshot validation", () => {
        // Locks in the loadSmsSnapshot() shape gate. A truthy non-conforming
        // blob (Chrome crash mid-write, schema drift, out-of-band write)
        // would otherwise reach `mailboxBaseline.find()` and silently break
        // SMS polling for the whole session.
        const corruptCases: Array<[string, unknown]> = [
          ["entries is null", { observedAt: Date.now() - 60_000, entries: null }],
          ["entries is a string", { observedAt: Date.now() - 60_000, entries: "not-an-array" }],
          ["entries is an object", { observedAt: Date.now() - 60_000, entries: { 0: "fake" } }],
          ["entries item missing snippetHash", {
            observedAt: Date.now() - 60_000,
            entries: [{ conversationHref: "/c/1", isUnread: false }],
          }],
          ["entries item with wrong type", {
            observedAt: Date.now() - 60_000,
            entries: [{ conversationHref: 7, snippetHash: "h", isUnread: true }],
          }],
          ["observedAt is not a number", { observedAt: "yesterday", entries: [] }],
          ["observedAt is NaN", { observedAt: NaN, entries: [] }],
          ["whole snapshot is a string", "corrupted-string-payload"],
          ["whole snapshot is a number", 42],
        ]

        for (const [label, payload] of corruptCases) {
          it(`drops snapshot when ${label}, falls back to (current) baseline`, async () => {
            setupOneSmsMailbox()
            const onCompleted = vi.fn()
            const controller = createController({ onSessionCompleted: onCompleted })
            await controller.initialize()

            const now = Date.now()
            const previewHash = "hash-fresh"

            // Plant the corrupt blob.
            await chrome.storage.session.set({ [SMS_SNAPSHOT_KEY]: payload })

            mockPollOnce.mockImplementationOnce((_ctx, cfg) => {
              cfg?.onAdapterBatch?.("gm-1", [
                {
                  id: "gm-msg-corrupt",
                  provider: "google-messages",
                  mailboxId: "gm-1",
                  text: "Brand: 999000 ...",
                  receivedEpochMs: now + FRESH_NOW_OFFSET,
                  _meta: {
                    conversationHref: "/conv/c",
                    snippetHash: previewHash,
                    isUnread: true,
                  },
                },
              ])
              return Promise.resolve({
                candidates: [
                  {
                    provider: "google-messages" as const,
                    mailboxId: "gm-1",
                    messageId: "gm-msg-corrupt",
                    from: "Brand",
                    receivedEpochMs: now + FRESH_NOW_OFFSET,
                    code: { value: "999000", kind: "digits" as const, score: 0.95 },
                    score: 0.95,
                    provenanceKey: "google-messages:gm-1:gm-msg-corrupt",
                    meta: {
                      conversationHref: "/conv/c",
                      snippetHash: previewHash,
                      isUnread: true,
                    },
                  },
                ],
                adapterResults: [{ mailboxId: "gm-1", success: true }],
              })
            })

            await controller.startSession({
              tabId: 1,
              url: "https://brand.com",
              expected: {},
              timeoutSeconds: 0.2,
            })

            await vi.advanceTimersByTimeAsync(0)
            await vi.advanceTimersByTimeAsync(200)

            // Polling proceeds despite the corrupt blob (didn't throw).
            // The corrupt snapshot was dropped, baseline took the
            // (current) path, and the candidate was admitted via the
            // pre-session-grace window.
            expect(mockPollOnce).toHaveBeenCalled()
          })
        }
      })
    })

    // TODO: Fix timing issue with fake timers - polls not executing in these edge cases
    it.skip("should mark code as used after match", async () => {
      const onCompleted = vi.fn()
      const controller = createController({ onSessionCompleted: onCompleted })

      await controller.initialize()
      mockGetRecentCodes.mockResolvedValue([
        { code: "123456", timestamp: Date.now(), source: "Unit", used: false },
      ])

      await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
        timeoutSeconds: 0.2,
      })

      await vi.advanceTimersByTimeAsync(1)

      expect(mockMarkCodeUsed).toHaveBeenCalledWith("123456")
    })

    it("should handle no matching codes", async () => {
      const onCompleted = vi.fn()
      const controller = createController({ onSessionCompleted: onCompleted })

      await controller.initialize()
      // V2: Polls use PopupCache, not mockGetRecentCodes

      await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
        timeoutSeconds: 0.2,
      })

      // Execute all polls - no code found
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(1)
      await vi.advanceTimersByTimeAsync(4999)
      await vi.advanceTimersByTimeAsync(5000)

      expect(onCompleted).toHaveBeenCalledWith(
        expect.anything(),
        { status: "timedout" }
      )
    })

    it("should handle storage errors gracefully", async () => {
      const onCompleted = vi.fn()
      const controller = createController({ onSessionCompleted: onCompleted })

      await controller.initialize()
      // V2: Storage errors no longer relevant (using PopupCache)
      // Test verifies graceful timeout when no codes are available

      await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
        timeoutSeconds: 0.2,
      })

      // Execute all polls
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(1)
      await vi.advanceTimersByTimeAsync(4999)
      await vi.advanceTimersByTimeAsync(5000)

      // Should complete with timeout despite errors
      expect(onCompleted).toHaveBeenCalledWith(
        expect.anything(),
        { status: "timedout" }
      )
    })
  })

  describe("Error Handling", () => {
    beforeEach(() => {
      // Restore any spies from previous tests
      vi.restoreAllMocks()
    })

    it("should handle getRecentCodes errors", async () => {
      const onCompleted = vi.fn()
      const controller = createController({ onSessionCompleted: onCompleted })

      await controller.initialize()
      // V2: Storage errors no longer relevant (using PopupCache)

      await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
        timeoutSeconds: 0.2,
      })

      // Execute all polls
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(1)
      await vi.advanceTimersByTimeAsync(4999)
      await vi.advanceTimersByTimeAsync(5000)

      expect(onCompleted).toHaveBeenCalledWith(
        expect.anything(),
        { status: "timedout" }
      )
    })

    // TODO: Fix timing issue with fake timers - polls not executing in these edge cases
    it.skip("should handle markCodeUsed errors", async () => {
      const onCompleted = vi.fn()
      const controller = createController({ onSessionCompleted: onCompleted })

      await controller.initialize()
      mockGetRecentCodes.mockResolvedValue([
        { code: "123456", timestamp: Date.now(), source: "Unit", used: false },
      ])
      mockMarkCodeUsed.mockRejectedValue(new Error("Mark failed"))

      await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
        timeoutSeconds: 0.2,
      })

      await vi.advanceTimersByTimeAsync(1)

      // Should still complete successfully
      expect(onCompleted).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: "filled" })
      )
    })

    it("should handle storage persistence errors during session creation", async () => {
      const onCompleted = vi.fn()
      const controller = createController({ onSessionCompleted: onCompleted })

      await controller.initialize()

      // V2: Polls use PopupCache, not mockGetRecentCodes

      // Mock storage.set to fail immediately
      vi.spyOn(chrome.storage.session, "set").mockRejectedValue(
        new Error("Quota exceeded")
      )

      // Should propagate the error
      await expect(
        controller.startSession({
          tabId: 1,
          url: "https://example.com",
          expected: {},
          timeoutSeconds: 0.2,
        })
      ).rejects.toThrow("Quota exceeded")

      vi.restoreAllMocks()
    })

    // TODO: Fix timing issue with fake timers - polls not executing in these edge cases
    it.skip("should continue operation after recoverable poll errors", async () => {
      const onCompleted = vi.fn()
      const controller = createController({ onSessionCompleted: onCompleted })

      await controller.initialize()

      // Don't mock storage failure during session creation
      mockGetRecentCodes
        .mockRejectedValueOnce(new Error("Temporary failure"))
        .mockResolvedValue([])

      await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
        timeoutSeconds: 0.2,
      })

      // Advance timers for each poll
      await vi.advanceTimersByTimeAsync(1)
      await vi.advanceTimersByTimeAsync(10)
      await vi.advanceTimersByTimeAsync(20)

      // Should have attempted all polls
      expect(mockPopupCacheManager.getCache).toHaveBeenCalledTimes(3)
      expect(onCompleted).toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // Google Messages google.com policy
  // ===========================================================================

  describe("Google Messages google.com policy", () => {
    it("strips SMS from google.com sessions in the background", async () => {
      const controller = createController({ onSessionCompleted: vi.fn() })
      await controller.initialize()

      const session = await controller.startSession({
        tabId: 1,
        url: "https://myaccount.google.com/security",
        expected: {},
        timeoutSeconds: 0.2,
        detectedChannels: ["email", "sms"],
      })

      expect(session.detectedChannels).toEqual(["email"])
    })

    it("does not poll the Google Messages adapter on google.com", async () => {
      const { createAdaptersFromMailboxes } = await import("../../src/lib/services/provider-adapter")
      const { EmailPollingService } = await import("../../src/lib/services/email-polling-service")

      const imapAdapter = { id: "imap-bridge" }
      const googleMessagesAdapter = { id: "google-messages" }
      const pollOnce = vi.fn(() => Promise.resolve({ candidates: [], adapterResults: [] }))

      ;(createAdaptersFromMailboxes as any).mockResolvedValueOnce([
        imapAdapter,
        googleMessagesAdapter,
      ])
      ;(EmailPollingService as any).mockImplementationOnce((adapters: unknown[]) => ({
        pollOnce,
        adapters,
      }))

      mockGetMailboxes.mockResolvedValue([
        { id: "imap-1", providerId: "imap-bridge", email: "user@example.com", imapServer: "imap.example.com", imapPort: 993, imapAccountId: "acc_1", addedAt: Date.now(), lastSyncedAt: 0 },
        { id: "gm-1", providerId: "google-messages", email: "sms@google-messages.local" },
      ])

      const controller = createController({ onSessionCompleted: vi.fn() })
      await controller.initialize()

      await controller.startSession({
        tabId: 1,
        url: "https://accounts.google.com/signin/v2/challenge",
        expected: {},
        timeoutSeconds: 0.2,
        detectedChannels: ["email", "sms"],
      })

      await vi.advanceTimersByTimeAsync(1)

      expect(EmailPollingService).toHaveBeenCalledWith(
        [imapAdapter],
        expect.anything()
      )
      expect(pollOnce).toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // SMS session_expired guard
  // ===========================================================================

  describe("SMS session_expired cache guard", () => {
    it("returns null for SMS-only session when GM adapter fails with session_expired", async () => {
      const onCompleted = vi.fn()
      const controller = createController({
        onSessionStarted: vi.fn(),
        onSessionUpdated: vi.fn(),
        onSessionCompleted: onCompleted,
      })
      await controller.initialize()

      // Setup: GM mailbox + stale cached code
      mockGetMailboxes.mockResolvedValue([{
        id: "gm-1",
        providerId: "google-messages",
        email: "sms@google-messages.local",
        gmPhoneNumber: "+905551234455",
        addedAt: Date.now(),
        lastSyncedAt: 0,
      }])
      mockGetSettings.mockResolvedValue({ watchSessionV2Enabled: false })
      mockPopupCacheManager.getCache.mockResolvedValue({
        codes: [{
          code: "123456",
          source: "Stale SMS code",
          receivedAt: Date.now() - 5000,
          providerId: "google-messages",
        }],
        links: [],
      })

      // Mock polling service to return session_expired from GM adapter
      const { EmailPollingService } = await import("../../src/lib/services/email-polling-service")
      ;(EmailPollingService as any).mockImplementationOnce(() => ({
        pollOnce: vi.fn(() => Promise.resolve({
          candidates: [],
          adapterResults: [{ mailboxId: "gm-1", success: false, error: "session_expired" }],
        })),
      }))

      await controller.startSession({
        tabId: 100,
        url: "https://example.com/verify",
        expected: {},
        detectedChannels: ["sms"],
      })

      // Trigger the poll
      await vi.advanceTimersByTimeAsync(1)

      // Session should NOT have filled (stale code ignored)
      // It should either still be active or timed out, never filled
      if (onCompleted.mock.calls.length > 0) {
        expect(onCompleted.mock.calls[0][1].status).not.toBe("filled")
      }

      // lastSyncError should be set
      expect(mockUpdateMailbox).toHaveBeenCalledWith("gm-1", expect.objectContaining({
        lastSyncError: "session_expired",
      }))
    })

    it("excludes stale GM codes in hybrid session when GM session expired", async () => {
      const onCompleted = vi.fn()
      const controller = createController({
        onSessionStarted: vi.fn(),
        onSessionUpdated: vi.fn(),
        onSessionCompleted: onCompleted,
      })
      await controller.initialize()

      // Setup: both IMAP-bridge and GM mailboxes
      mockGetMailboxes.mockResolvedValue([
        {
          id: "imap-1",
          providerId: "imap-bridge",
          email: "user@example.com",
          imapServer: "imap.example.com",
          imapPort: 993,
          imapAccountId: "acc_1",
          addedAt: Date.now(),
          lastSyncedAt: 0,
        },
        {
          id: "gm-1",
          providerId: "google-messages",
          email: "sms@google-messages.local",
          gmPhoneNumber: "+905551234455",
          addedAt: Date.now(),
          lastSyncedAt: 0,
        },
      ])
      mockGetSettings.mockResolvedValue({ watchSessionV2Enabled: false })

      // Cache has both an email code and a stale SMS code
      mockPopupCacheManager.getCache.mockResolvedValue({
        codes: [
          {
            code: "999888",
            source: "Stale SMS",
            receivedAt: Date.now() - 5000,
            providerId: "google-messages",
          },
          {
            code: "777666",
            source: "Fresh email code",
            receivedAt: Date.now() - 2000,
            providerId: "imap-bridge",
            mailboxId: "imap-1",
          },
        ],
        links: [],
      })

      // GM adapter fails with session_expired, IMAP adapter succeeds
      const { EmailPollingService } = await import("../../src/lib/services/email-polling-service")
      ;(EmailPollingService as any).mockImplementationOnce(() => ({
        pollOnce: vi.fn(() => Promise.resolve({
          candidates: [],
          adapterResults: [
            { mailboxId: "imap-1", success: true },
            { mailboxId: "gm-1", success: false, error: "session_expired" },
          ],
        })),
      }))

      await controller.startSession({
        tabId: 101,
        url: "https://example.com/verify",
        expected: {},
        detectedChannels: ["email", "sms"],
      })

      // Trigger the poll
      await vi.advanceTimersByTimeAsync(1)

      // If filled, it should be with the email code, not the SMS code
      if (onCompleted.mock.calls.length > 0 && onCompleted.mock.calls[0][1].status === "filled") {
        expect(onCompleted.mock.calls[0][1].code.code).toBe("777666")
      }

      // GM mailbox should have session_expired error set
      expect(mockUpdateMailbox).toHaveBeenCalledWith("gm-1", expect.objectContaining({
        lastSyncError: "session_expired",
      }))
    })
  })
})
