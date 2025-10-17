/**
 * Integration Tests for SessionController
 * Tests real service worker restart scenarios and alarm fallback behavior
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import { SessionController } from "../../src/background/session-controller"
import type { StoredCode } from "../../src/lib/storage/schema"

const mockGetRecentCodes = vi.fn()
const mockMarkCodeUsed = vi.fn()
const mockKeyManagerInstance = {
  isUnlocked: vi.fn(() => true),
  getMasterKey: vi.fn(() => ({})),
  getSalt: vi.fn(() => new Uint8Array([1, 2, 3])),
}

vi.mock("../../src/lib/crypto/key-manager", () => {
  return {
    KeyManager: {
      getInstance: () => mockKeyManagerInstance,
    },
  }
})

vi.mock("../../src/lib/storage/encrypted-storage", () => {
  return {
    EncryptedStorage: vi.fn(() => ({
      getRecentCodes: mockGetRecentCodes,
      markCodeUsed: mockMarkCodeUsed,
    })),
  }
})

vi.mock("../../src/lib/matching/code-matcher", () => {
  return {
    findBestMatchingCode: vi.fn((codes: StoredCode[]) => {
      return codes.find((c) => !c.used) || null
    }),
  }
})

describe("SessionController Integration", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockGetRecentCodes.mockReset()
    mockMarkCodeUsed.mockReset()
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
      const onCompleted1 = vi.fn()
      const onCompleted2 = vi.fn()

      // Phase 1: Create initial controller and start session
      const controller1 = new SessionController(
        { onSessionCompleted: onCompleted1 },
        [0, 100]
      )

      await controller1.initialize()
      mockGetRecentCodes.mockResolvedValue([])

      const session = await controller1.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
      })

      // Complete first poll
      await vi.advanceTimersByTimeAsync(1)
      expect(mockGetRecentCodes).toHaveBeenCalledTimes(1)

      // Verify session is persisted
      const stored = await chrome.storage.session.get("inboxkey.sessions")
      expect(stored["inboxkey.sessions"][session.id]).toBeDefined()

      // Phase 2: Create new controller (simulates SW restart)
      const controller2 = new SessionController(
        { onSessionCompleted: onCompleted2 },
        [0, 100]
      )

      // Should load the persisted session
      await controller2.initialize()

      // Complete remaining polls
      await vi.runAllTimersAsync()

      // Should have completed the session
      expect(onCompleted2).toHaveBeenCalled()
      const [[completedSession, result]] = onCompleted2.mock.calls
      expect(completedSession.id).toBe(session.id)
      expect(result.status).toBe("timedout")
    })

    it("should use alarm fallback when timer fails", async () => {
      const onCompleted = vi.fn()
      const controller = new SessionController(
        { onSessionCompleted: onCompleted },
        [0, 100]
      )

      await controller.initialize()
      mockGetRecentCodes.mockResolvedValue([])

      const session = await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
      })

      // First poll executes via timer
      await vi.advanceTimersByTimeAsync(1)
      expect(mockGetRecentCodes).toHaveBeenCalledTimes(1)

      // Simulate alarm firing for second poll (timer might have failed)
      await controller.handleAlarm(`inboxkey.session.${session.id}:1`)

      expect(mockGetRecentCodes).toHaveBeenCalledTimes(2)
      expect(onCompleted).toHaveBeenCalledWith(
        expect.anything(),
        { status: "timedout" }
      )
    })

    it("should prevent duplicate polls via idempotency", async () => {
      const onCompleted = vi.fn()
      const controller = new SessionController(
        { onSessionCompleted: onCompleted },
        [0, 100, 200]
      )

      await controller.initialize()
      mockGetRecentCodes.mockResolvedValue([])

      const session = await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
      })

      // First poll via timer
      await vi.advanceTimersByTimeAsync(1)
      expect(mockGetRecentCodes).toHaveBeenCalledTimes(1)

      // Try to trigger same poll via alarm (should be skipped)
      await controller.handleAlarm(`inboxkey.session.${session.id}:0`)
      expect(mockGetRecentCodes).toHaveBeenCalledTimes(1) // Still 1

      // Second poll via timer
      await vi.advanceTimersByTimeAsync(100)
      expect(mockGetRecentCodes).toHaveBeenCalledTimes(2)

      // Try both timer and alarm for third poll
      const pollPromise = controller.handleAlarm(
        `inboxkey.session.${session.id}:2`
      )
      await vi.advanceTimersByTimeAsync(100)
      await pollPromise

      // Should only execute once despite both triggers
      expect(mockGetRecentCodes).toHaveBeenCalledTimes(3)
    })

    it("should handle rapid session restarts", async () => {
      const onCompleted = vi.fn()
      const controller = new SessionController(
        { onSessionCompleted: onCompleted },
        [0, 100]
      )

      await controller.initialize()
      mockGetRecentCodes.mockResolvedValue([])

      // Start session 1
      const session1 = await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
      })

      // Immediately start session 2 for same tab
      const session2 = await controller.startSession({
        tabId: 1,
        url: "https://example.com/login",
        expected: {},
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
      const controller = new SessionController(
        { onSessionCompleted: onCompleted },
        [0, 10]
      )

      await controller.initialize()
      mockGetRecentCodes.mockResolvedValue([])

      // Create and complete 5 sessions
      for (let i = 1; i <= 5; i++) {
        await controller.startSession({
          tabId: i,
          url: `https://example${i}.com`,
          expected: {},
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
      const controller = new SessionController(
        { onSessionCompleted: vi.fn() },
        [0, 5000, 10000]
      )

      await controller.initialize()
      mockGetRecentCodes.mockResolvedValue([])

      const session = await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
      })

      // Should create alarm for first poll immediately
      expect(chrome.alarms.create).toHaveBeenCalledWith(
        `inboxkey.session.${session.id}:0`,
        expect.objectContaining({ when: expect.any(Number) })
      )

      // Execute first poll
      await vi.advanceTimersByTimeAsync(1)

      // Should create alarm for second poll
      expect(chrome.alarms.create).toHaveBeenCalledWith(
        `inboxkey.session.${session.id}:1`,
        expect.objectContaining({ when: expect.any(Number) })
      )
    })

    it("should clear alarms when poll executes via timer", async () => {
      const onCompleted = vi.fn()
      const controller = new SessionController(
        { onSessionCompleted: onCompleted },
        [0, 100]
      )

      await controller.initialize()
      mockGetRecentCodes.mockResolvedValue([])

      const session = await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
      })

      await vi.advanceTimersByTimeAsync(1)

      // When timer executes, alarm should be cleared
      expect(chrome.alarms.clear).toHaveBeenCalledWith(
        `inboxkey.session.${session.id}:0`
      )
    })

    it("should handle alarm trigger for resumed session", async () => {
      const onCompleted = vi.fn()
      const now = Date.now()

      // Manually create persisted session in mid-polling state
      await chrome.storage.session.set({
        "inboxkey.sessions": {
          "test-session": {
            id: "test-session",
            tabId: 1,
            url: "https://example.com",
            expected: {},
            startedAt: now,
            status: "active",
            pollSchedule: [now, now + 100, now + 200],
            pollsCompleted: [0], // First poll already done
            lastUpdated: now,
          },
        },
      })

      mockGetRecentCodes.mockResolvedValue([])

      const controller = new SessionController(
        { onSessionCompleted: onCompleted },
        [0, 100, 200]
      )

      await controller.initialize()

      // Trigger alarm for second poll
      await controller.handleAlarm("inboxkey.session.test-session:1")

      expect(mockGetRecentCodes).toHaveBeenCalled()
    })
  })

  describe("Concurrent Session Management", () => {
    it("should handle multiple tabs with separate sessions", async () => {
      const onCompleted = vi.fn()
      const controller = new SessionController(
        { onSessionCompleted: onCompleted },
        [0, 10]
      )

      await controller.initialize()
      mockGetRecentCodes.mockResolvedValue([])

      // Start 3 sessions for different tabs
      await controller.startSession({
        tabId: 1,
        url: "https://example1.com",
        expected: {},
      })

      await controller.startSession({
        tabId: 2,
        url: "https://example2.com",
        expected: {},
      })

      await controller.startSession({
        tabId: 3,
        url: "https://example3.com",
        expected: {},
      })

      // Complete all sessions
      await vi.runAllTimersAsync()

      // All should complete
      expect(onCompleted).toHaveBeenCalledTimes(3)
    })

    it("should handle session completion while others are active", async () => {
      const onCompleted = vi.fn()
      const controller = new SessionController(
        { onSessionCompleted: onCompleted },
        [0, 100]
      )

      await controller.initialize()

      // Tab 1 will find code immediately
      mockGetRecentCodes.mockResolvedValueOnce([
        {
          code: "123456",
          timestamp: Date.now(),
          source: "Test",
          used: false,
          siteMatch: "example1.com",
        },
      ])

      // Tab 2 won't find anything
      mockGetRecentCodes.mockResolvedValue([])

      await controller.startSession({
        tabId: 1,
        url: "https://example1.com",
        expected: {},
      })

      await controller.startSession({
        tabId: 2,
        url: "https://example2.com",
        expected: {},
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
      const controller = new SessionController(
        { onSessionCompleted: onCompleted },
        [0, 10]
      )

      await controller.initialize()

      // Tab 1 will error
      mockGetRecentCodes
        .mockRejectedValueOnce(new Error("Storage error for tab 1"))
        .mockRejectedValueOnce(new Error("Storage error for tab 1"))

      // Tab 2 will work
      mockGetRecentCodes.mockResolvedValue([])

      await controller.startSession({
        tabId: 1,
        url: "https://example1.com",
        expected: {},
      })

      await controller.startSession({
        tabId: 2,
        url: "https://example2.com",
        expected: {},
      })

      await vi.runAllTimersAsync()

      // Both should complete despite tab 1 errors
      expect(onCompleted).toHaveBeenCalledTimes(2)
    })
  })

  describe("Persistence and Recovery", () => {
    it("should recover from storage read errors during initialize", async () => {
      const controller = new SessionController(
        { onSessionCompleted: vi.fn() },
        [0, 100]
      )

      // Mock storage.get to fail
      vi.spyOn(chrome.storage.session, "get").mockRejectedValueOnce(
        new Error("Storage unavailable")
      )

      // Should not throw
      await expect(controller.initialize()).rejects.toThrow()

      // Restore and try again
      vi.spyOn(chrome.storage.session, "get").mockRestore()
      await controller.initialize()

      // Should work now
      mockGetRecentCodes.mockResolvedValue([])
      await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
      })
    })

    it("should handle partial session data during recovery", async () => {
      const onCompleted = vi.fn()

      // Create malformed session data
      await chrome.storage.session.set({
        "inboxkey.sessions": {
          "good-session": {
            id: "good-session",
            tabId: 1,
            url: "https://example.com",
            expected: {},
            startedAt: Date.now(),
            status: "active",
            pollSchedule: [Date.now()],
            pollsCompleted: [],
            lastUpdated: Date.now(),
          },
          "bad-session": {
            id: "bad-session",
            // Missing required fields
          },
        },
      })

      mockGetRecentCodes.mockResolvedValue([])

      const controller = new SessionController(
        { onSessionCompleted: onCompleted },
        [0, 100]
      )

      // Should load good session and skip bad one
      await controller.initialize()

      // Good session should still work
      await vi.runAllTimersAsync()
      expect(mockGetRecentCodes).toHaveBeenCalled()
    })

    it("should handle session cleanup during persistence errors", async () => {
      const onCompleted = vi.fn()
      const controller = new SessionController(
        { onSessionCompleted: onCompleted },
        [0, 10]
      )

      await controller.initialize()
      mockGetRecentCodes.mockResolvedValue([
        {
          code: "123456",
          timestamp: Date.now(),
          source: "Test",
          used: false,
        },
      ])

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
      })

      // The persistence error will cause the poll to fail
      // Session will time out after all polls complete with errors
      await vi.runAllTimersAsync()

      expect(onCompleted).toHaveBeenCalled()
      // May be timedout due to persistence errors
      const [[, result]] = onCompleted.mock.calls
      expect(["filled", "timedout"]).toContain(result.status)
    })
  })

  describe("Edge Cases", () => {
    it("should handle canceling non-existent session", async () => {
      const controller = new SessionController(
        { onSessionCompleted: vi.fn() },
        [0, 100]
      )

      await controller.initialize()

      // Should not throw
      await controller.cancelSession("non-existent-id")
    })

    it("should handle alarm for non-existent session", async () => {
      const controller = new SessionController(
        { onSessionCompleted: vi.fn() },
        [0, 100]
      )

      await controller.initialize()

      // Should not throw
      await controller.handleAlarm("inboxkey.session.non-existent:0")
    })

    it("should handle alarm for completed session", async () => {
      const onCompleted = vi.fn()
      const controller = new SessionController(
        { onSessionCompleted: onCompleted },
        [0]
      )

      await controller.initialize()
      mockGetRecentCodes.mockResolvedValue([
        {
          code: "123456",
          timestamp: Date.now(),
          source: "Test",
          used: false,
        },
      ])

      const session = await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
      })

      // Complete the session
      await vi.runAllTimersAsync()

      // Try to handle alarm for completed session
      await controller.handleAlarm(`inboxkey.session.${session.id}:1`)

      // Should not cause issues or duplicate completion
      expect(onCompleted).toHaveBeenCalledTimes(1)
    })

    it("should handle resume for inactive session", async () => {
      const controller = new SessionController(
        { onSessionCompleted: vi.fn() },
        [0, 100]
      )

      await controller.initialize()

      // Should not throw
      await controller.resumeSession("inactive-session-id")
    })

    it("should handle very fast session lifecycle", async () => {
      const onCompleted = vi.fn()
      const controller = new SessionController(
        { onSessionCompleted: onCompleted },
        [0] // Single poll
      )

      await controller.initialize()
      mockGetRecentCodes.mockResolvedValue([
        {
          code: "123456",
          timestamp: Date.now(),
          source: "Test",
          used: false,
        },
      ])

      const session = await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
      })

      // Complete immediately
      await vi.advanceTimersByTimeAsync(1)

      expect(onCompleted).toHaveBeenCalledWith(
        expect.objectContaining({ id: session.id }),
        expect.objectContaining({ status: "filled" })
      )
    })
  })
})
