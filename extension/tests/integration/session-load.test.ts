/**
 * Load Tests for SessionController
 * Tests multiple concurrent sessions and resource management
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

describe("SessionController Load Testing", () => {
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

  describe("Concurrent Session Handling", () => {
    it("should handle 10 concurrent sessions", async () => {
      const onCompleted = vi.fn()
      const controller = new SessionController(
        { onSessionCompleted: onCompleted },
        [0, 10, 20]
      )

      await controller.initialize()
      mockGetRecentCodes.mockResolvedValue([])

      // Start 10 sessions simultaneously
      const _sessions = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          controller.startSession({
            tabId: i + 1,
            url: `https://example${i + 1}.com`,
            expected: {},
          })
        )
      )

      expect(sessions).toHaveLength(10)

      // Complete all sessions
      await vi.runAllTimersAsync()

      // All should complete successfully
      expect(onCompleted).toHaveBeenCalledTimes(10)

      // Verify all completed with timeout
      sessions.forEach((session) => {
        expect(onCompleted).toHaveBeenCalledWith(
          expect.objectContaining({ id: session.id }),
          { status: "timedout" }
        )
      })

      // Verify all sessions persisted
      const stored = await chrome.storage.session.get("inboxkey.sessions")
      expect(Object.keys(stored["inboxkey.sessions"])).toHaveLength(10)
    })

    it("should handle 25 concurrent sessions", async () => {
      const onCompleted = vi.fn()
      const controller = new SessionController(
        { onSessionCompleted: onCompleted },
        [0, 10]
      )

      await controller.initialize()
      mockGetRecentCodes.mockResolvedValue([])

      // Start 25 sessions
      const _sessions = await Promise.all(
        Array.from({ length: 25 }, (_, i) =>
          controller.startSession({
            tabId: i + 1,
            url: `https://site${i + 1}.com`,
            expected: {},
          })
        )
      )

      expect(sessions).toHaveLength(25)

      // Complete all
      await vi.runAllTimersAsync()

      expect(onCompleted).toHaveBeenCalledTimes(25)
    })

    it("should handle mixed outcomes in concurrent sessions", async () => {
      const onCompleted = vi.fn()
      const controller = new SessionController(
        { onSessionCompleted: onCompleted },
        [0, 10]
      )

      await controller.initialize()

      // Mock different outcomes for different sessions
      mockGetRecentCodes.mockImplementation(async () => {
        const randomValue = Math.random()
        if (randomValue < 0.3) {
          // 30% find code
          return [
            {
              code: `CODE${Math.floor(Math.random() * 1000000)}`,
              timestamp: Date.now(),
              source: "Test",
              used: false,
            },
          ]
        } else if (randomValue < 0.35) {
          // 5% error
          throw new Error("Storage error")
        } else {
          // 65% no code
          return []
        }
      })

      // Start 10 sessions
      await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          controller.startSession({
            tabId: i + 1,
            url: `https://example${i + 1}.com`,
            expected: {},
          })
        )
      )

      await vi.runAllTimersAsync()

      // All should complete
      expect(onCompleted).toHaveBeenCalledTimes(10)

      // Should have mix of filled and timedout
      const filledCount = onCompleted.mock.calls.filter(
        ([, result]) => result.status === "filled"
      ).length
      const timedoutCount = onCompleted.mock.calls.filter(
        ([, result]) => result.status === "timedout"
      ).length

      expect(filledCount + timedoutCount).toBe(10)
    })
  })

  describe("Rapid Session Creation/Cancellation", () => {
    it("should handle rapid session creation and cancellation", async () => {
      const onCompleted = vi.fn()
      const controller = new SessionController(
        { onSessionCompleted: onCompleted },
        [0, 100]
      )

      await controller.initialize()
      mockGetRecentCodes.mockResolvedValue([])

      // Rapidly create and cancel 20 sessions
      for (let i = 0; i < 20; i++) {
        const session = await controller.startSession({
          tabId: 1,
          url: `https://example.com/${i}`,
          expected: {},
        })

        // Immediately cancel
        await controller.cancelSession(session.id)
      }

      // Verify all were canceled
      expect(onCompleted).toHaveBeenCalledTimes(20)
      onCompleted.mock.calls.forEach(([, result]) => {
        expect(result.status).toBe("canceled")
      })

      // Verify all cleaned from active sessions
      const stored = await chrome.storage.session.get("inboxkey.sessions")
      // Canceled sessions are removed from storage
      expect(stored["inboxkey.sessions"]).toEqual({})
    })

    it("should handle 50 rapid session replacements", async () => {
      const onCompleted = vi.fn()
      const controller = new SessionController(
        { onSessionCompleted: onCompleted },
        [0, 100]
      )

      await controller.initialize()
      mockGetRecentCodes.mockResolvedValue([])

      // Rapidly create 50 sessions for same tab (each cancels the previous)
      for (let i = 0; i < 50; i++) {
        await controller.startSession({
          tabId: 1,
          url: `https://example.com/${i}`,
          expected: {},
        })
      }

      // 49 should be canceled, 1 active
      expect(onCompleted).toHaveBeenCalledTimes(49)

      // Complete the last one
      await vi.runAllTimersAsync()
      expect(onCompleted).toHaveBeenCalledTimes(50)
    })

    it("should handle interleaved create/cancel across tabs", async () => {
      const onCompleted = vi.fn()
      const controller = new SessionController(
        { onSessionCompleted: onCompleted },
        [0, 100, 200]
      )

      await controller.initialize()
      mockGetRecentCodes.mockResolvedValue([])

      // Create sessions for 5 tabs
      const _sessions = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          controller.startSession({
            tabId: i + 1,
            url: `https://tab${i + 1}.com`,
            expected: {},
          })
        )
      )

      // Cancel odd-numbered sessions after first poll
      await vi.advanceTimersByTimeAsync(1)

      await controller.cancelSession(sessions[0].id)
      await controller.cancelSession(sessions[2].id)
      await controller.cancelSession(sessions[4].id)

      // Complete remaining sessions
      await vi.runAllTimersAsync()

      // 3 canceled + 2 completed
      expect(onCompleted).toHaveBeenCalledTimes(5)

      const canceledCount = onCompleted.mock.calls.filter(
        ([, result]) => result.status === "canceled"
      ).length
      expect(canceledCount).toBe(3)
    })
  })

  describe("Session Churn (Realistic Browser Behavior)", () => {
    it("should handle session churn - tabs opening and closing", async () => {
      const onCompleted = vi.fn()
      const controller = new SessionController(
        { onSessionCompleted: onCompleted },
        [0, 50, 100]
      )

      await controller.initialize()
      mockGetRecentCodes.mockResolvedValue([])

      const activeSessions = new Set<string>()

      // Simulate 20 tabs opening over time
      for (let i = 0; i < 20; i++) {
        const session = await controller.startSession({
          tabId: i + 1,
          url: `https://site${i + 1}.com`,
          expected: {},
        })

        activeSessions.add(session.id)

        // Some tabs close randomly
        if (Math.random() < 0.3) {
          const idsArray = Array.from(activeSessions)
          const toCancel = idsArray[Math.floor(Math.random() * idsArray.length)]
          await controller.cancelSession(toCancel)
          activeSessions.delete(toCancel)
        }

        // Advance time a bit
        await vi.advanceTimersByTimeAsync(10)
      }

      // Complete all remaining sessions
      await vi.runAllTimersAsync()

      // Verify all sessions completed
      expect(onCompleted.mock.calls.length).toBeGreaterThanOrEqual(20)

      // Verify sessions are persisted (some canceled, some completed)
      const stored = await chrome.storage.session.get("inboxkey.sessions")
      // Should have some sessions in storage (canceled ones are removed)
      expect(Object.keys(stored["inboxkey.sessions"] || {}).length).toBeGreaterThan(
        0
      )
    })

    it("should handle burst of sessions followed by quiet period", async () => {
      const onCompleted = vi.fn()
      const controller = new SessionController(
        { onSessionCompleted: onCompleted },
        [0, 50, 100]
      )

      await controller.initialize()
      mockGetRecentCodes.mockResolvedValue([])

      // Burst: 15 sessions
      await Promise.all(
        Array.from({ length: 15 }, (_, i) =>
          controller.startSession({
            tabId: i + 1,
            url: `https://burst${i + 1}.com`,
            expected: {},
          })
        )
      )

      expect(onCompleted).toHaveBeenCalledTimes(0) // None completed yet

      // Complete the burst
      await vi.runAllTimersAsync()

      expect(onCompleted).toHaveBeenCalledTimes(15)

      // Quiet period - no new sessions
      await vi.advanceTimersByTimeAsync(10000)

      // Then another burst
      await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          controller.startSession({
            tabId: i + 100,
            url: `https://burst2-${i + 1}.com`,
            expected: {},
          })
        )
      )

      await vi.runAllTimersAsync()

      expect(onCompleted).toHaveBeenCalledTimes(25)
    })
  })

  describe("Resource Management", () => {
    it("should not leak timers after sessions complete", async () => {
      const onCompleted = vi.fn()
      const controller = new SessionController(
        { onSessionCompleted: onCompleted },
        [0, 10]
      )

      await controller.initialize()
      mockGetRecentCodes.mockResolvedValue([])

      // Create and complete 10 sessions
      for (let i = 0; i < 10; i++) {
        await controller.startSession({
          tabId: i + 1,
          url: `https://site${i + 1}.com`,
          expected: {},
        })

        await vi.runAllTimersAsync()
      }

      // No pending timers should remain
      expect(vi.getTimerCount()).toBe(0)
    })

    it("should clean up alarms after sessions complete", async () => {
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

      // Alarms should be cleared
      expect(chrome.alarms.clear).toHaveBeenCalled()
    })

    it("should handle memory-intensive persistence operations", async () => {
      const onCompleted = vi.fn()
      const controller = new SessionController(
        { onSessionCompleted: onCompleted },
        [0, 10, 20]
      )

      await controller.initialize()
      mockGetRecentCodes.mockResolvedValue([])

      // Create 20 sessions with large expected objects
      const _sessions = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          controller.startSession({
            tabId: i + 1,
            url: `https://site${i + 1}.com/very/long/path/with/many/segments`,
            expected: {
              length: 6,
              charset: "digits" as const,
            },
          })
        )
      )

      // Verify all persisted
      const stored = await chrome.storage.session.get("inboxkey.sessions")
      expect(Object.keys(stored["inboxkey.sessions"])).toHaveLength(20)

      // Complete all
      await vi.runAllTimersAsync()

      // Verify all persisted
      const finalStored = await chrome.storage.session.get("inboxkey.sessions")
      expect(Object.keys(finalStored["inboxkey.sessions"])).toHaveLength(20)
    })
  })

  describe("Performance and Timing", () => {
    it("should complete 100 sequential sessions efficiently", async () => {
      const onCompleted = vi.fn()
      const controller = new SessionController(
        { onSessionCompleted: onCompleted },
        [0] // Single poll for speed
      )

      await controller.initialize()
      mockGetRecentCodes.mockResolvedValue([])

      // Run 100 sessions sequentially
      for (let i = 0; i < 100; i++) {
        await controller.startSession({
          tabId: i + 1,
          url: `https://site${i + 1}.com`,
          expected: {},
        })

        await vi.runAllTimersAsync()
      }

      expect(onCompleted).toHaveBeenCalledTimes(100)
    })

    it("should handle overlapping poll schedules correctly", async () => {
      const onCompleted = vi.fn()
      const controller = new SessionController(
        { onSessionCompleted: onCompleted },
        [0, 50, 100, 150, 200]
      )

      await controller.initialize()
      mockGetRecentCodes.mockResolvedValue([])

      // Start 3 sessions with overlapping polls
      await controller.startSession({
        tabId: 1,
        url: "https://site1.com",
        expected: {},
      })

      await vi.advanceTimersByTimeAsync(25)

      await controller.startSession({
        tabId: 2,
        url: "https://site2.com",
        expected: {},
      })

      await vi.advanceTimersByTimeAsync(25)

      await controller.startSession({
        tabId: 3,
        url: "https://site3.com",
        expected: {},
      })

      // Complete all
      await vi.runAllTimersAsync()

      expect(onCompleted).toHaveBeenCalledTimes(3)

      // Verify correct number of polls
      // Session 1: 5 polls, Session 2: 5 polls, Session 3: 5 polls
      expect(mockGetRecentCodes).toHaveBeenCalledTimes(15)
    })

    it("should handle sessions with different poll schedules", async () => {
      const onCompleted1 = vi.fn()
      const onCompleted2 = vi.fn()

      const controller1 = new SessionController(
        { onSessionCompleted: onCompleted1 },
        [0, 10]
      )

      const controller2 = new SessionController(
        { onSessionCompleted: onCompleted2 },
        [0, 20, 40, 60]
      )

      await controller1.initialize()
      await controller2.initialize()

      mockGetRecentCodes.mockResolvedValue([])

      await controller1.startSession({
        tabId: 1,
        url: "https://fast.com",
        expected: {},
      })

      await controller2.startSession({
        tabId: 2,
        url: "https://slow.com",
        expected: {},
      })

      await vi.runAllTimersAsync()

      // Fast controller: 2 polls
      expect(mockGetRecentCodes).toHaveBeenCalledTimes(6)
      expect(onCompleted1).toHaveBeenCalledTimes(1)
      expect(onCompleted2).toHaveBeenCalledTimes(1)
    })
  })

  describe("Stress Tests", () => {
    it("should survive 100 rapid tab replacements", async () => {
      const onCompleted = vi.fn()
      const controller = new SessionController(
        { onSessionCompleted: onCompleted },
        [0, 50]
      )

      await controller.initialize()
      mockGetRecentCodes.mockResolvedValue([])

      // 100 rapid replacements on tab 1
      for (let i = 0; i < 100; i++) {
        await controller.startSession({
          tabId: 1,
          url: `https://page${i}.com`,
          expected: {},
        })
      }

      // 99 canceled + 1 active
      expect(onCompleted).toHaveBeenCalledTimes(99)

      // Complete the last one
      await vi.runAllTimersAsync()
      expect(onCompleted).toHaveBeenCalledTimes(100)
    })

    it("should handle alternating create/cancel pattern", async () => {
      const onCompleted = vi.fn()
      const controller = new SessionController(
        { onSessionCompleted: onCompleted },
        [0, 100]
      )

      await controller.initialize()
      mockGetRecentCodes.mockResolvedValue([])

      // Alternating pattern: create tab 1, create tab 2, cancel tab 1, create tab 1, cancel tab 2...
      for (let i = 0; i < 50; i++) {
        const session1 = await controller.startSession({
          tabId: 1,
          url: `https://tab1-${i}.com`,
          expected: {},
        })

        const session2 = await controller.startSession({
          tabId: 2,
          url: `https://tab2-${i}.com`,
          expected: {},
        })

        if (i % 2 === 0) {
          await controller.cancelSession(session1.id)
        } else {
          await controller.cancelSession(session2.id)
        }
      }

      // Complete remaining sessions
      await vi.runAllTimersAsync()

      // Should have many completions (mix of cancel and timeout)
      expect(onCompleted.mock.calls.length).toBeGreaterThanOrEqual(50)
    })
  })
})
