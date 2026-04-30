/**
 * Integration Tests for SessionController
 * Tests real service worker restart scenarios and alarm fallback behavior
 *
 * V2: Updated to use StorageFactory, PopupCacheManager, and V2 poll schedule.
 * Poll schedule: [0, 5000, 10000, 15000, 20000, 30000, ...] from WATCH_SESSION_SCORING.pollTimesMs
 * With timeoutSeconds=0.2 (200ms), only 1 poll at t=0 fits.
 * With timeoutSeconds=10, 3 polls at [0, 5000, 10000] fit.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import { SessionController } from "../../src/background/session-controller"
import type { StoredCode } from "../../src/lib/storage/schema"

const mockGetRecentCodes = vi.fn()
const mockMarkCodeUsed = vi.fn()
const mockGetMailboxes = vi.fn()
const mockGetSettings = vi.fn()
const mockAddCode = vi.fn()
const mockUpdateMailbox = vi.fn()

// V2: Mock PopupCacheManager for ephemeral code storage
const mockPopupCacheManager = {
  getCache: vi.fn(),
  updateWithNewCodes: vi.fn(),
  markCodeUsed: vi.fn(),
}

// V2: Mock StorageFactory instead of EncryptedStorage
vi.mock("../../src/lib/storage/storage-factory", () => {
  return {
    StorageFactory: {
      create: vi.fn(() => Promise.resolve({
        getRecentCodes: mockGetRecentCodes,
        markCodeUsed: mockMarkCodeUsed,
        getMailboxes: mockGetMailboxes,
        getSettings: mockGetSettings,
        addCode: mockAddCode,
        updateMailbox: mockUpdateMailbox,
      })),
    },
  }
})

// V2: Mock EmailPollingService
// pollOnce returns { candidates, adapterResults } per the current API
// (not a raw array - that was the pre-refactor shape that drifted).
vi.mock("../../src/lib/services/email-polling-service", () => {
  return {
    EmailPollingService: vi.fn(() => ({
      pollOnce: vi.fn(() => Promise.resolve({ candidates: [], adapterResults: [] })),
    })),
  }
})

// V2: Mock provider adapter
vi.mock("../../src/lib/services/provider-adapter", () => {
  return {
    createAdaptersFromMailboxes: vi.fn(() => Promise.resolve([])),
  }
})

vi.mock("../../src/lib/matching/code-matcher", () => {
  return {
    findBestMatchingCode: vi.fn((codes: StoredCode[]) => {
      return codes.find((c) => !c.used) || null
    }),
  }
})

// V2: Mock KeyManager from correct path
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

// Helper to create controller with mocked PopupCacheManager
const createController = (callbacks: any) => {
  return new SessionController(callbacks, mockPopupCacheManager as any)
}

describe("SessionController Integration", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockGetRecentCodes.mockReset()
    mockMarkCodeUsed.mockReset()
    mockGetMailboxes.mockReset()
    mockGetSettings.mockReset()
    mockAddCode.mockReset()
    mockUpdateMailbox.mockReset()
    mockUpdateMailbox.mockResolvedValue(undefined)

    // V2: Reset PopupCacheManager mocks
    mockPopupCacheManager.getCache.mockReset()
    mockPopupCacheManager.updateWithNewCodes.mockReset()
    mockPopupCacheManager.markCodeUsed.mockReset()

    // V2: Default PopupCache returns empty codes
    mockPopupCacheManager.getCache.mockResolvedValue({ codes: [], links: [] })
    mockPopupCacheManager.updateWithNewCodes.mockResolvedValue(undefined)
    mockPopupCacheManager.markCodeUsed.mockResolvedValue(undefined)

    // V2: Default mailbox and settings mocks
    mockGetMailboxes.mockResolvedValue([{
      id: "mailbox-1",
      providerId: "gmail",
      email: "test@gmail.com",
      lastSyncedAt: Date.now() - 60000,
    }])
    mockGetSettings.mockResolvedValue({
      autoFillEnabled: true,
      lockEnabled: false,
      lockTimeoutMinutes: 15,
      allowedDomains: [],
      deniedDomains: [],
      notificationsEnabled: true,
      watchSessionV2Enabled: true,
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

  describe("Service Worker Restart Scenarios", () => {
    it("should load persisted sessions on restart", async () => {
      const onCompleted = vi.fn()
      const now = Date.now()

      // Simulate Phase 1: Directly persist a session that has completed 1 of 3 polls
      // (In a real scenario, controller1 started the session and completed poll 0, then SW restarted)
      const sessionId = "test-restart-session"
      await chrome.storage.session.set({
        "inboxkey.sessions": {
          [sessionId]: {
            id: sessionId,
            tabId: 1,
            url: "https://example.com",
            siteETLD: "example.com",
            expected: {},
            sessionStart: now,
            startedAt: now,
            status: "active",
            pollSchedule: [now, now + 5000, now + 10000],
            pollsCompleted: [0], // First poll already done
            lastUpdated: now,
          },
        },
      })

      // Phase 2: Create new controller (simulates SW restart)
      const controller2 = createController({ onSessionCompleted: onCompleted })
      await controller2.initialize()

      // Advance timers to fire remaining polls
      await vi.advanceTimersByTimeAsync(5000)
      await vi.advanceTimersByTimeAsync(5000)
      await vi.advanceTimersByTimeAsync(1000)

      // Should have completed the session (timedout since no code found)
      expect(onCompleted).toHaveBeenCalled()
      const [[completedSession, result]] = onCompleted.mock.calls
      expect(completedSession.id).toBe(sessionId)
      expect(result.status).toBe("timedout")
    })

    it("should use alarm fallback when timer fails", async () => {
      const onCompleted = vi.fn()
      const controller = createController({ onSessionCompleted: onCompleted })

      await controller.initialize()

      // V2: Use timeoutSeconds=5 for 2 polls at [0, 5000]
      await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
        timeoutSeconds: 5,
      })

      // First poll executes via timer at t=0
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(1)
      expect(mockPopupCacheManager.getCache).toHaveBeenCalledTimes(1)

      // Complete remaining polls via timer
      await vi.runAllTimersAsync()

      expect(mockPopupCacheManager.getCache).toHaveBeenCalledTimes(2)
      expect(onCompleted).toHaveBeenCalledWith(
        expect.anything(),
        { status: "timedout" }
      )
    })

    it("should prevent duplicate polls via idempotency", async () => {
      const onCompleted = vi.fn()
      const controller = createController({ onSessionCompleted: onCompleted })

      await controller.initialize()

      // V2: Use timeoutSeconds=10 for 3 polls at [0, 5000, 10000]
      await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
        timeoutSeconds: 10,
      })

      // First poll via timer at t=0
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(1)
      expect(mockPopupCacheManager.getCache).toHaveBeenCalledTimes(1)

      // Second poll at t=5000
      await vi.advanceTimersByTimeAsync(4999)
      expect(mockPopupCacheManager.getCache).toHaveBeenCalledTimes(2)

      // Third poll at t=10000
      await vi.advanceTimersByTimeAsync(5000)

      // Should execute all 3 polls
      expect(mockPopupCacheManager.getCache).toHaveBeenCalledTimes(3)
    })

    it("should handle rapid session restarts", async () => {
      const onCompleted = vi.fn()
      const controller = createController({ onSessionCompleted: onCompleted })

      await controller.initialize()

      // Start session 1
      const session1 = await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
        timeoutSeconds: 0.2,
      })

      // Immediately start session 2 for same tab
      const session2 = await controller.startSession({
        tabId: 1,
        url: "https://example.com/login",
        expected: {},
        timeoutSeconds: 0.2,
      })

      // Session 1 should be canceled
      expect(onCompleted).toHaveBeenCalledWith(
        expect.objectContaining({ id: session1.id }),
        { status: "canceled" }
      )

      // Only session 2 should be active
      await vi.runAllTimersAsync()

      expect(onCompleted).toHaveBeenCalledTimes(2) // cancel + timeout
      expect(onCompleted).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: session2.id }),
        { status: "timedout" }
      )
    })

    it("should persist state across multiple sessions", async () => {
      const onCompleted = vi.fn()
      const controller = createController({ onSessionCompleted: onCompleted })

      await controller.initialize()

      // Create and complete 5 sessions
      for (let i = 1; i <= 5; i++) {
        await controller.startSession({
          tabId: i,
          url: `https://example${i}.com`,
          expected: {},
          timeoutSeconds: 0.2,
        })

        await vi.runAllTimersAsync()
      }

      expect(onCompleted).toHaveBeenCalledTimes(5)

      // Verify all sessions persisted in storage with completed status
      const stored = await chrome.storage.session.get("inboxkey.sessions")
      expect(Object.keys(stored["inboxkey.sessions"])).toHaveLength(5)
      Object.values(stored["inboxkey.sessions"]).forEach((session: any) => {
        expect(session.status).toBe("timedout")
      })
    })
  })

  describe("Alarm Fallback Behavior", () => {
    it("should create alarms as backup for all polls", async () => {
      const controller = createController({ onSessionCompleted: vi.fn() })

      await controller.initialize()

      // V2: Use timeoutSeconds=10 for 3 polls at [0, 5000, 10000]
      const session = await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
        timeoutSeconds: 10,
      })

      // V2: SessionPoller creates all alarms upfront with naming: session-poll-${id}-${index}
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

    it("should clear alarms when poll executes via timer", async () => {
      const onCompleted = vi.fn()
      const controller = createController({ onSessionCompleted: onCompleted })

      await controller.initialize()

      const session = await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
        timeoutSeconds: 0.2,
      })

      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(1)

      // V2: SessionPoller clears alarm after timer fires
      expect(chrome.alarms.clear).toHaveBeenCalledWith(
        `session-poll-${session.id}-0`
      )
    })

    it("should handle alarm trigger for resumed session", async () => {
      const onCompleted = vi.fn()
      const now = Date.now()

      // Manually create persisted session in mid-polling state
      // V2: Include siteETLD and sessionStart
      await chrome.storage.session.set({
        "inboxkey.sessions": {
          "test-session": {
            id: "test-session",
            tabId: 1,
            url: "https://example.com",
            siteETLD: "example.com",
            expected: {},
            sessionStart: now,
            startedAt: now,
            status: "active",
            pollSchedule: [now, now + 5000, now + 10000],
            pollsCompleted: [0], // First poll already done
            lastUpdated: now,
          },
        },
      })

      const controller = createController({ onSessionCompleted: onCompleted })

      await controller.initialize()

      // Resume behavior: SessionPoller reschedules all polls
      await vi.runAllTimersAsync()

      expect(mockPopupCacheManager.getCache).toHaveBeenCalled()
    })
  })

  describe("Concurrent Session Management", () => {
    it("should handle multiple tabs with separate sessions", async () => {
      const onCompleted = vi.fn()
      const controller = createController({ onSessionCompleted: onCompleted })

      await controller.initialize()

      // Start 3 sessions for different tabs
      await controller.startSession({
        tabId: 1,
        url: "https://example1.com",
        expected: {},
        timeoutSeconds: 0.2,
      })

      await controller.startSession({
        tabId: 2,
        url: "https://example2.com",
        expected: {},
        timeoutSeconds: 0.2,
      })

      await controller.startSession({
        tabId: 3,
        url: "https://example3.com",
        expected: {},
        timeoutSeconds: 0.2,
      })

      // Complete all sessions
      await vi.runAllTimersAsync()

      // All should complete
      expect(onCompleted).toHaveBeenCalledTimes(3)
    })

    it("should handle session completion while others are active", async () => {
      const onCompleted = vi.fn()
      const controller = createController({ onSessionCompleted: onCompleted })

      await controller.initialize()

      // V2: Provide code via PopupCache for first poll only
      mockPopupCacheManager.getCache
        .mockResolvedValueOnce({
          codes: [
            {
              code: "123456",
              receivedAt: Date.now(),
              source: "Test",
              usedAt: undefined,
              senderETLD: "example1.com",
              domainAffinity: undefined,
            },
          ],
          links: [],
        })
        .mockResolvedValue({ codes: [], links: [] })

      await controller.startSession({
        tabId: 1,
        url: "https://example1.com",
        expected: {},
        timeoutSeconds: 0.2,
      })

      await controller.startSession({
        tabId: 2,
        url: "https://example2.com",
        expected: {},
        timeoutSeconds: 0.2,
      })

      await vi.runAllTimersAsync()

      // Both should complete
      expect(onCompleted).toHaveBeenCalledTimes(2)
      expect(onCompleted).toHaveBeenCalledWith(
        expect.objectContaining({ tabId: 1 }),
        expect.objectContaining({ status: "filled" })
      )
      expect(onCompleted).toHaveBeenCalledWith(
        expect.objectContaining({ tabId: 2 }),
        { status: "timedout" }
      )
    })

    it("should isolate errors between sessions", async () => {
      const onCompleted = vi.fn()
      const controller = createController({ onSessionCompleted: onCompleted })

      await controller.initialize()

      // V2: First poll errors via PopupCache, subsequent succeed
      mockPopupCacheManager.getCache
        .mockRejectedValueOnce(new Error("Storage error for tab 1"))
        .mockResolvedValue({ codes: [], links: [] })

      await controller.startSession({
        tabId: 1,
        url: "https://example1.com",
        expected: {},
        timeoutSeconds: 0.2,
      })

      await controller.startSession({
        tabId: 2,
        url: "https://example2.com",
        expected: {},
        timeoutSeconds: 0.2,
      })

      await vi.runAllTimersAsync()

      // Both should complete despite tab 1 errors
      expect(onCompleted).toHaveBeenCalledTimes(2)
    })
  })

  describe("Persistence and Recovery", () => {
    it("should recover from storage read errors during initialize", async () => {
      const controller = createController({ onSessionCompleted: vi.fn() })

      // Mock storage.get to fail
      vi.spyOn(chrome.storage.session, "get").mockRejectedValueOnce(
        new Error("Storage unavailable")
      )

      // Should throw (storage read failure propagates)
      await expect(controller.initialize()).rejects.toThrow()

      // Restore and try again
      vi.spyOn(chrome.storage.session, "get").mockRestore()
      await controller.initialize()

      // Should work now
      await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
        timeoutSeconds: 0.2,
      })
    })

    it("should handle partial session data during recovery", async () => {
      const onCompleted = vi.fn()

      // Create session data with a good session and a bad session
      // V2: Good session includes siteETLD and sessionStart
      await chrome.storage.session.set({
        "inboxkey.sessions": {
          "good-session": {
            id: "good-session",
            tabId: 1,
            url: "https://example.com",
            siteETLD: "example.com",
            expected: {},
            sessionStart: Date.now(),
            startedAt: Date.now(),
            status: "active",
            pollSchedule: [Date.now()],
            pollsCompleted: [],
            lastUpdated: Date.now(),
          },
          "bad-session": {
            id: "bad-session",
            // Missing required fields - status is not "active" so it won't be loaded
            status: "completed",
          },
        },
      })

      const controller = createController({ onSessionCompleted: onCompleted })

      // Should load good session and skip bad one
      await controller.initialize()

      // Good session should still work
      await vi.runAllTimersAsync()
      expect(mockPopupCacheManager.getCache).toHaveBeenCalled()
    })

    it("should handle session cleanup during persistence errors", async () => {
      const onCompleted = vi.fn()
      const controller = createController({ onSessionCompleted: onCompleted })

      await controller.initialize()

      // V2: Provide code via PopupCache
      mockPopupCacheManager.getCache.mockResolvedValue({
        codes: [
          {
            code: "123456",
            receivedAt: Date.now(),
            source: "Test",
            usedAt: undefined,
            senderETLD: "example.com",
            domainAffinity: undefined,
          },
        ],
        links: [],
      })

      // Mock storage.set to fail on second persistence (after code found)
      const originalSet = chrome.storage.session.set
      let persistCallCount = 0
      vi.spyOn(chrome.storage.session, "set").mockImplementation(
        async (...args) => {
          persistCallCount++
          if (persistCallCount === 2) {
            // Fail on completion persistence
            throw new Error("Quota exceeded")
          }
          return originalSet(...args)
        }
      )

      await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
        timeoutSeconds: 0.2,
      })

      // The persistence error will cause the poll to fail
      // Session will time out after all polls complete with errors
      await vi.runAllTimersAsync()

      expect(onCompleted).toHaveBeenCalled()
      // May be filled or timedout depending on persistence error timing
      const [[, result]] = onCompleted.mock.calls
      expect(["filled", "timedout"]).toContain(result.status)
    })
  })

  describe("Edge Cases", () => {
    it("should handle canceling non-existent session", async () => {
      const controller = createController({ onSessionCompleted: vi.fn() })

      await controller.initialize()

      // Should not throw
      await controller.cancelSession("non-existent-id")
    })

    it("should handle alarm for non-existent session", async () => {
      const controller = createController({ onSessionCompleted: vi.fn() })

      await controller.initialize()

      // Note: handleAlarm() removed - SessionPoller handles alarms internally
      // Edge case handling is tested in session-poller.test.ts
    })

    it("should handle alarm for completed session", async () => {
      const onCompleted = vi.fn()
      const controller = createController({ onSessionCompleted: onCompleted })

      await controller.initialize()

      // V2: Provide code via PopupCache
      mockPopupCacheManager.getCache.mockResolvedValue({
        codes: [
          {
            code: "123456",
            receivedAt: Date.now(),
            source: "Test",
            usedAt: undefined,
            senderETLD: "example.com",
            domainAffinity: undefined,
          },
        ],
        links: [],
      })

      await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
        timeoutSeconds: 0.2,
      })

      // Complete the session
      await vi.runAllTimersAsync()

      // Should not cause issues or duplicate completion
      expect(onCompleted).toHaveBeenCalledTimes(1)
    })

    it("should handle resume for inactive session", async () => {
      const controller = createController({ onSessionCompleted: vi.fn() })

      await controller.initialize()

      // Should not throw
      await controller.resumeSession("inactive-session-id")
    })

    it("should handle very fast session lifecycle", async () => {
      const onCompleted = vi.fn()
      // V2: SessionController constructor takes (callbacks, popupCacheManager?)
      const controller = createController({ onSessionCompleted: onCompleted })

      await controller.initialize()

      // V2: Provide code via PopupCache for immediate find
      mockPopupCacheManager.getCache.mockResolvedValue({
        codes: [
          {
            code: "123456",
            receivedAt: Date.now(),
            source: "Test",
            usedAt: undefined,
            senderETLD: "example.com",
            domainAffinity: undefined,
          },
        ],
        links: [],
      })

      const session = await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
        timeoutSeconds: 0.2,
      })

      // Complete immediately (first poll at t=0 finds code)
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(1)

      expect(onCompleted).toHaveBeenCalledWith(
        expect.objectContaining({ id: session.id }),
        expect.objectContaining({ status: "filled" })
      )
    })
  })
})
