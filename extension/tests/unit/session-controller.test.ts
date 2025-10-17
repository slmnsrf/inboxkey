/**
 * Comprehensive Unit Tests for SessionController
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

describe("SessionController", () => {
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

  describe("Session Lifecycle", () => {
    it("should start session with valid parameters", async () => {
      const onStarted = vi.fn()
      const onCompleted = vi.fn()
      const controller = new SessionController(
        {
          onSessionStarted: onStarted,
          onSessionCompleted: onCompleted,
        },
        [0, 100]
      )

      await controller.initialize()

      const session = await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: { length: 6, charset: "digits" },
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
      const controller = new SessionController(
        { onSessionCompleted: onCompleted },
        [0, 100]
      )

      await controller.initialize()
      mockGetRecentCodes.mockResolvedValue([])

      const session1 = await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
      })

      const session2 = await controller.startSession({
        tabId: 1,
        url: "https://example.com/login",
        expected: {},
      })

      expect(onCompleted).toHaveBeenCalledWith(
        expect.objectContaining({ id: session1.id }),
        { status: "canceled" }
      )
      expect(session2.id).not.toBe(session1.id)
    })

    it("should cancel active session", async () => {
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

      await controller.cancelSession(session.id)

      expect(onCompleted).toHaveBeenCalledWith(
        expect.objectContaining({ id: session.id, status: "canceled" }),
        { status: "canceled" }
      )
    })

    it("should time out session after all polls complete", async () => {
      const onCompleted = vi.fn()
      const controller = new SessionController(
        { onSessionCompleted: onCompleted },
        [0, 10, 20]
      )

      await controller.initialize()
      mockGetRecentCodes.mockResolvedValue([])

      await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
      })

      await vi.runAllTimersAsync()

      expect(onCompleted).toHaveBeenCalledWith(
        expect.objectContaining({ status: "timedout" }),
        { status: "timedout" }
      )
    })

    it("should fill session when code found", async () => {
      const onCompleted = vi.fn()
      const controller = new SessionController(
        { onSessionCompleted: onCompleted },
        [0, 10]
      )

      await controller.initialize()

      mockGetRecentCodes.mockResolvedValue([
        { code: "123456", timestamp: Date.now(), source: "Unit", used: false },
      ])

      await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
      })

      await vi.runAllTimersAsync()

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
      const controller = new SessionController(
        {
          onSessionStarted: onStarted,
          onSessionUpdated: onUpdated,
          onSessionCompleted: onCompleted,
        },
        [0, 10, 20]
      )

      await controller.initialize()
      mockGetRecentCodes.mockResolvedValue([])

      await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
      })

      expect(onStarted).toHaveBeenCalledWith(
        expect.objectContaining({ status: "active" })
      )

      await vi.advanceTimersByTimeAsync(1)
      expect(onUpdated).toHaveBeenCalledWith(
        expect.objectContaining({ status: "active" })
      )

      await vi.runAllTimersAsync()
      expect(onCompleted).toHaveBeenCalledWith(
        expect.objectContaining({ status: "timedout" }),
        { status: "timedout" }
      )
    })
  })

  describe("Polling Behavior", () => {
    it("should execute polls at correct intervals", async () => {
      const onCompleted = vi.fn()
      const controller = new SessionController(
        { onSessionCompleted: onCompleted },
        [0, 5000, 10000]
      )

      await controller.initialize()
      mockGetRecentCodes.mockResolvedValue([])

      await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
      })

      // Initial poll happens immediately
      await vi.advanceTimersByTimeAsync(1)
      expect(mockGetRecentCodes).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(5000)
      expect(mockGetRecentCodes).toHaveBeenCalledTimes(2)

      await vi.advanceTimersByTimeAsync(5000)
      expect(mockGetRecentCodes).toHaveBeenCalledTimes(3)
    })

    it("should skip duplicate polls (idempotency)", async () => {
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

      // Try to handle same alarm multiple times
      await controller.handleAlarm(`inboxkey.session.${session.id}:0`)
      await controller.handleAlarm(`inboxkey.session.${session.id}:0`)

      // Should only execute once
      expect(mockGetRecentCodes).toHaveBeenCalledTimes(1)
    })

    it("should handle poll errors gracefully", async () => {
      const onCompleted = vi.fn()
      const controller = new SessionController(
        { onSessionCompleted: onCompleted },
        [0, 10, 20]
      )

      await controller.initialize()
      mockGetRecentCodes.mockRejectedValueOnce(new Error("Storage error"))
      mockGetRecentCodes.mockResolvedValue([])

      await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
      })

      await vi.runAllTimersAsync()

      // Should complete despite error
      expect(onCompleted).toHaveBeenCalledWith(
        expect.objectContaining({ status: "timedout" }),
        { status: "timedout" }
      )
    })

    it("should continue polling after failed poll", async () => {
      const onUpdated = vi.fn()
      const onCompleted = vi.fn()
      const controller = new SessionController(
        {
          onSessionUpdated: onUpdated,
          onSessionCompleted: onCompleted,
        },
        [0, 10, 20]
      )

      await controller.initialize()
      mockGetRecentCodes.mockRejectedValueOnce(new Error("Storage error"))
      mockGetRecentCodes.mockResolvedValue([])

      await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
      })

      // First poll will fail but schedule next
      await vi.advanceTimersByTimeAsync(1)

      await vi.runAllTimersAsync()
      expect(mockGetRecentCodes).toHaveBeenCalledTimes(3)
      expect(onUpdated).toHaveBeenCalled()
    })

    it("should stop polling after code found", async () => {
      const onCompleted = vi.fn()
      const controller = new SessionController(
        { onSessionCompleted: onCompleted },
        [0, 10, 20]
      )

      await controller.initialize()
      mockGetRecentCodes.mockResolvedValueOnce([
        { code: "123456", timestamp: Date.now(), source: "Unit", used: false },
      ])

      await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
      })

      await vi.runAllTimersAsync()

      // Only first poll should execute
      expect(mockGetRecentCodes).toHaveBeenCalledTimes(1)
      expect(onCompleted).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: "filled" })
      )
    })

    it("should stop polling after timeout", async () => {
      const onCompleted = vi.fn()
      const controller = new SessionController(
        { onSessionCompleted: onCompleted },
        [0, 10]
      )

      await controller.initialize()
      mockGetRecentCodes.mockResolvedValue([])

      await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
      })

      await vi.runAllTimersAsync()

      expect(mockGetRecentCodes).toHaveBeenCalledTimes(2)
      expect(onCompleted).toHaveBeenCalledWith(
        expect.anything(),
        { status: "timedout" }
      )

      // No more polls after timeout
      await vi.advanceTimersByTimeAsync(100)
      expect(mockGetRecentCodes).toHaveBeenCalledTimes(2)
    })
  })

  describe("Persistence", () => {
    it("should persist sessions to chrome.storage.session", async () => {
      const controller = new SessionController(
        { onSessionCompleted: vi.fn() },
        [0, 100]
      )

      await controller.initialize()
      mockGetRecentCodes.mockResolvedValue([])

      const session = await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
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
      const controller1 = new SessionController(
        { onSessionCompleted: onCompleted },
        [0, 5000]
      )
      await controller1.initialize()
      mockGetRecentCodes.mockResolvedValue([])

      await controller1.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
      })

      // Create new controller and verify it loads sessions
      const controller2 = new SessionController(
        { onSessionCompleted: onCompleted },
        [0, 5000]
      )

      await controller2.initialize()

      // Should have restored session
      await vi.advanceTimersByTimeAsync(5000)
      expect(mockGetRecentCodes).toHaveBeenCalled()
    })

    it("should resume active sessions after load", async () => {
      const onCompleted = vi.fn()
      const now = Date.now()

      // Manually persist a session
      await chrome.storage.session.set({
        "inboxkey.sessions": {
          "test-session": {
            id: "test-session",
            tabId: 1,
            url: "https://example.com",
            expected: {},
            startedAt: now,
            status: "active",
            pollSchedule: [now + 100, now + 200],
            pollsCompleted: [0],
            lastUpdated: now,
          },
        },
      })

      mockGetRecentCodes.mockResolvedValue([])

      const controller = new SessionController(
        { onSessionCompleted: onCompleted },
        [100, 200]
      )

      await controller.initialize()

      // Should resume and complete remaining polls
      await vi.advanceTimersByTimeAsync(300)
      expect(mockGetRecentCodes).toHaveBeenCalled()
    })

    it("should persist completed sessions in storage", async () => {
      const onCompleted = vi.fn()
      const controller = new SessionController(
        { onSessionCompleted: onCompleted },
        [0, 10]
      )

      await controller.initialize()
      mockGetRecentCodes.mockResolvedValue([])

      const session = await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
      })

      await vi.runAllTimersAsync()

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

      expect(chrome.alarms.create).toHaveBeenCalledWith(
        `inboxkey.session.${session.id}:0`,
        expect.objectContaining({ when: expect.any(Number) })
      )
    })

    it("should handle alarm trigger correctly", async () => {
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

      // Simulate alarm firing
      await controller.handleAlarm(`inboxkey.session.${session.id}:1`)

      await vi.runAllTimersAsync()

      expect(mockGetRecentCodes).toHaveBeenCalled()
    })

    it("should clear alarms on session completion", async () => {
      const onCompleted = vi.fn()
      const controller = new SessionController(
        { onSessionCompleted: onCompleted },
        [0, 10]
      )

      await controller.initialize()
      mockGetRecentCodes.mockResolvedValue([
        { code: "123456", timestamp: Date.now(), source: "Unit", used: false },
      ])

      await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
      })

      await vi.runAllTimersAsync()

      expect(chrome.alarms.clear).toHaveBeenCalled()
    })

    it("should parse alarm names correctly", async () => {
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

      // Valid alarm
      await controller.handleAlarm(`inboxkey.session.${session.id}:0`)
      expect(mockGetRecentCodes).toHaveBeenCalled()
    })

    it("should handle invalid alarm names", async () => {
      const controller = new SessionController(
        { onSessionCompleted: vi.fn() },
        [0, 100]
      )

      await controller.initialize()

      // These should not throw
      await controller.handleAlarm("invalid-alarm")
      await controller.handleAlarm("inboxkey.other.alarm")
      await controller.handleAlarm("inboxkey.session.invalid")
      await controller.handleAlarm("inboxkey.session.id:notanumber")
    })
  })

  describe("Key Manager Integration", () => {
    it("should return null when extension is locked", async () => {
      const onCompleted = vi.fn()
      const controller = new SessionController(
        { onSessionCompleted: onCompleted },
        [0, 10]
      )

      await controller.initialize()
      mockKeyManagerInstance.isUnlocked.mockReturnValue(false)
      mockGetRecentCodes.mockResolvedValue([])

      await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
      })

      await vi.runAllTimersAsync()

      expect(onCompleted).toHaveBeenCalledWith(
        expect.anything(),
        { status: "timedout" }
      )
    })

    it("should return null when master key unavailable", async () => {
      const onCompleted = vi.fn()
      const controller = new SessionController(
        { onSessionCompleted: onCompleted },
        [0, 10]
      )

      await controller.initialize()
      mockKeyManagerInstance.getMasterKey.mockReturnValue(null)
      mockGetRecentCodes.mockResolvedValue([])

      await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
      })

      await vi.runAllTimersAsync()

      expect(onCompleted).toHaveBeenCalledWith(
        expect.anything(),
        { status: "timedout" }
      )
    })

    it("should poll successfully when unlocked", async () => {
      const onCompleted = vi.fn()
      const controller = new SessionController(
        { onSessionCompleted: onCompleted },
        [0, 10]
      )

      await controller.initialize()
      mockKeyManagerInstance.isUnlocked.mockReturnValue(true)
      mockKeyManagerInstance.getMasterKey.mockReturnValue({})
      mockKeyManagerInstance.getSalt.mockReturnValue(new Uint8Array([1, 2, 3]))
      mockGetRecentCodes.mockResolvedValue([
        { code: "123456", timestamp: Date.now(), source: "Unit", used: false },
      ])

      await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
      })

      await vi.runAllTimersAsync()

      expect(onCompleted).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: "filled" })
      )
    })
  })

  describe("Code Matching", () => {
    it("should find best matching code from storage", async () => {
      const onCompleted = vi.fn()
      const controller = new SessionController(
        { onSessionCompleted: onCompleted },
        [0]
      )

      await controller.initialize()
      mockGetRecentCodes.mockResolvedValue([
        {
          code: "111111",
          timestamp: Date.now() - 10000,
          source: "Old",
          used: true,
        },
        {
          code: "222222",
          timestamp: Date.now(),
          source: "New",
          used: false,
        },
      ])

      await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
      })

      await vi.runAllTimersAsync()

      expect(onCompleted).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          status: "filled",
          code: expect.objectContaining({ code: "222222" }),
        })
      )
    })

    it("should mark code as used after match", async () => {
      const onCompleted = vi.fn()
      const controller = new SessionController(
        { onSessionCompleted: onCompleted },
        [0]
      )

      await controller.initialize()
      mockGetRecentCodes.mockResolvedValue([
        { code: "123456", timestamp: Date.now(), source: "Unit", used: false },
      ])

      await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
      })

      await vi.runAllTimersAsync()

      expect(mockMarkCodeUsed).toHaveBeenCalledWith("123456")
    })

    it("should handle no matching codes", async () => {
      const onCompleted = vi.fn()
      const controller = new SessionController(
        { onSessionCompleted: onCompleted },
        [0, 10]
      )

      await controller.initialize()
      mockGetRecentCodes.mockResolvedValue([])

      await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
      })

      await vi.runAllTimersAsync()

      expect(onCompleted).toHaveBeenCalledWith(
        expect.anything(),
        { status: "timedout" }
      )
    })

    it("should handle storage errors gracefully", async () => {
      const onCompleted = vi.fn()
      const controller = new SessionController(
        { onSessionCompleted: onCompleted },
        [0, 10]
      )

      await controller.initialize()
      mockGetRecentCodes.mockRejectedValue(new Error("Storage failed"))

      await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
      })

      await vi.runAllTimersAsync()

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
      const controller = new SessionController(
        { onSessionCompleted: onCompleted },
        [0, 10]
      )

      await controller.initialize()
      mockGetRecentCodes.mockRejectedValue(new Error("Storage unavailable"))

      await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
      })

      await vi.runAllTimersAsync()

      expect(onCompleted).toHaveBeenCalledWith(
        expect.anything(),
        { status: "timedout" }
      )
    })

    it("should handle markCodeUsed errors", async () => {
      const onCompleted = vi.fn()
      const controller = new SessionController(
        { onSessionCompleted: onCompleted },
        [0]
      )

      await controller.initialize()
      mockGetRecentCodes.mockResolvedValue([
        { code: "123456", timestamp: Date.now(), source: "Unit", used: false },
      ])
      mockMarkCodeUsed.mockRejectedValue(new Error("Mark failed"))

      await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
      })

      await vi.runAllTimersAsync()

      // Should still complete successfully
      expect(onCompleted).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: "filled" })
      )
    })

    it("should handle storage persistence errors during session creation", async () => {
      const onCompleted = vi.fn()
      const controller = new SessionController(
        { onSessionCompleted: onCompleted },
        [0]
      )

      await controller.initialize()

      mockGetRecentCodes.mockResolvedValue([])

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
        })
      ).rejects.toThrow("Quota exceeded")

      vi.restoreAllMocks()
    })

    it("should continue operation after recoverable poll errors", async () => {
      const onCompleted = vi.fn()
      const controller = new SessionController(
        { onSessionCompleted: onCompleted },
        [0, 10, 20]
      )

      await controller.initialize()

      // Don't mock storage failure during session creation
      mockGetRecentCodes
        .mockRejectedValueOnce(new Error("Temporary failure"))
        .mockResolvedValue([])

      await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
      })

      await vi.runAllTimersAsync()

      // Should have attempted all polls
      expect(mockGetRecentCodes).toHaveBeenCalledTimes(3)
      expect(onCompleted).toHaveBeenCalled()
    })
  })
})
