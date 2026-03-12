/**
 * Load Tests for SessionController
 * Tests multiple concurrent sessions and resource management
 *
 * V2: Updated to use StorageFactory, PopupCacheManager, and V2 poll schedule.
 * Poll schedule: [0, 5000, 10000, 15000, 20000, 30000, ...] from WATCH_SESSION_SCORING.pollTimesMs
 * With timeoutSeconds=0.2, only 1 poll at t=0 fits.
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

describe("SessionController Load Testing", () => {
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

  describe("Concurrent Session Handling", () => {
    it("should handle 10 concurrent sessions", async () => {
      const onCompleted = vi.fn()
      const controller = createController({ onSessionCompleted: onCompleted })

      await controller.initialize()

      // Start 10 sessions simultaneously
      const sessions = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          controller.startSession({
            tabId: i + 1,
            url: `https://example${i + 1}.com`,
            expected: {},
            timeoutSeconds: 0.2,
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
      const controller = createController({ onSessionCompleted: onCompleted })

      await controller.initialize()

      // Start 25 sessions
      const sessions = await Promise.all(
        Array.from({ length: 25 }, (_, i) =>
          controller.startSession({
            tabId: i + 1,
            url: `https://site${i + 1}.com`,
            expected: {},
            timeoutSeconds: 0.2,
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
      const controller = createController({ onSessionCompleted: onCompleted })

      await controller.initialize()

      // V2: Mock different outcomes via PopupCache
      let callCount = 0
      mockPopupCacheManager.getCache.mockImplementation(async () => {
        callCount++
        const randomValue = Math.random()
        if (randomValue < 0.3) {
          // 30% find code
          return {
            codes: [
              {
                code: `CODE${Math.floor(Math.random() * 1000000)}`,
                receivedAt: Date.now(),
                source: "Test",
                usedAt: undefined,
                senderETLD: "example.com",
                domainAffinity: undefined,
              },
            ],
            links: [],
          }
        } else if (randomValue < 0.35) {
          // 5% error
          throw new Error("Storage error")
        } else {
          // 65% no code
          return { codes: [], links: [] }
        }
      })

      // Start 10 sessions
      await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          controller.startSession({
            tabId: i + 1,
            url: `https://example${i + 1}.com`,
            expected: {},
            timeoutSeconds: 0.2,
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
      const controller = createController({ onSessionCompleted: onCompleted })

      await controller.initialize()

      // Rapidly create and cancel 20 sessions
      for (let i = 0; i < 20; i++) {
        const session = await controller.startSession({
          tabId: 1,
          url: `https://example.com/${i}`,
          expected: {},
          timeoutSeconds: 0.2,
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
      const controller = createController({ onSessionCompleted: onCompleted })

      await controller.initialize()

      // Rapidly create 50 sessions for same tab (each cancels the previous)
      for (let i = 0; i < 50; i++) {
        await controller.startSession({
          tabId: 1,
          url: `https://example.com/${i}`,
          expected: {},
          timeoutSeconds: 0.2,
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
      const controller = createController({ onSessionCompleted: onCompleted })

      await controller.initialize()

      // Create sessions for 5 tabs
      const sessions = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          controller.startSession({
            tabId: i + 1,
            url: `https://tab${i + 1}.com`,
            expected: {},
            timeoutSeconds: 0.2,
          })
        )
      )

      // Cancel odd-numbered sessions before polls fire
      // (with timeoutSeconds=0.2, polls at t=0 would complete sessions immediately)
      await controller.cancelSession(sessions[0].id)
      await controller.cancelSession(sessions[2].id)
      await controller.cancelSession(sessions[4].id)

      // Complete remaining sessions
      await vi.runAllTimersAsync()

      // 3 canceled + 2 timedout = 5 total
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
      const controller = createController({ onSessionCompleted: onCompleted })

      await controller.initialize()

      const activeSessions = new Set<string>()

      // Simulate 20 tabs opening over time
      for (let i = 0; i < 20; i++) {
        const session = await controller.startSession({
          tabId: i + 1,
          url: `https://site${i + 1}.com`,
          expected: {},
          timeoutSeconds: 0.2,
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
      const controller = createController({ onSessionCompleted: onCompleted })

      await controller.initialize()

      // Burst: 15 sessions
      await Promise.all(
        Array.from({ length: 15 }, (_, i) =>
          controller.startSession({
            tabId: i + 1,
            url: `https://burst${i + 1}.com`,
            expected: {},
            timeoutSeconds: 0.2,
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
            timeoutSeconds: 0.2,
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
      const controller = createController({ onSessionCompleted: onCompleted })

      await controller.initialize()

      // Create and complete 10 sessions
      for (let i = 0; i < 10; i++) {
        await controller.startSession({
          tabId: i + 1,
          url: `https://site${i + 1}.com`,
          expected: {},
          timeoutSeconds: 0.2,
        })

        await vi.runAllTimersAsync()
      }

      // No pending timers should remain
      expect(vi.getTimerCount()).toBe(0)
    })

    it("should clean up alarms after sessions complete", async () => {
      const onCompleted = vi.fn()
      const controller = createController({ onSessionCompleted: onCompleted })

      await controller.initialize()

      await controller.startSession({
        tabId: 1,
        url: "https://example.com",
        expected: {},
        timeoutSeconds: 0.2,
      })

      await vi.runAllTimersAsync()

      // Alarms should be cleared
      expect(chrome.alarms.clear).toHaveBeenCalled()
    })

    it("should handle memory-intensive persistence operations", async () => {
      const onCompleted = vi.fn()
      const controller = createController({ onSessionCompleted: onCompleted })

      await controller.initialize()

      // Create 20 sessions with large expected objects
      await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          controller.startSession({
            tabId: i + 1,
            url: `https://site${i + 1}.com/very/long/path/with/many/segments`,
            expected: {
              length: 6,
              charset: "digits" as const,
            },
            timeoutSeconds: 0.2,
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
      const controller = createController({ onSessionCompleted: onCompleted })

      await controller.initialize()

      // Run 100 sessions sequentially
      for (let i = 0; i < 100; i++) {
        await controller.startSession({
          tabId: i + 1,
          url: `https://site${i + 1}.com`,
          expected: {},
          timeoutSeconds: 0.2,
        })

        await vi.runAllTimersAsync()
      }

      expect(onCompleted).toHaveBeenCalledTimes(100)
    })

    it("should handle overlapping poll schedules correctly", async () => {
      const onCompleted = vi.fn()
      const controller = createController({ onSessionCompleted: onCompleted })

      await controller.initialize()

      // V2: With timeoutSeconds=0.2, each session gets 1 poll at t=0
      // Start 3 sessions with overlapping timing
      await controller.startSession({
        tabId: 1,
        url: "https://site1.com",
        expected: {},
        timeoutSeconds: 0.2,
      })

      await vi.advanceTimersByTimeAsync(25)

      await controller.startSession({
        tabId: 2,
        url: "https://site2.com",
        expected: {},
        timeoutSeconds: 0.2,
      })

      await vi.advanceTimersByTimeAsync(25)

      await controller.startSession({
        tabId: 3,
        url: "https://site3.com",
        expected: {},
        timeoutSeconds: 0.2,
      })

      // Complete all
      await vi.runAllTimersAsync()

      expect(onCompleted).toHaveBeenCalledTimes(3)

      // V2: With timeoutSeconds=0.2, each session gets 1 poll
      // 3 sessions x 1 poll each = 3 getCache calls
      expect(mockPopupCacheManager.getCache).toHaveBeenCalledTimes(3)
    })

    it("should handle sessions with different poll schedules", async () => {
      const onCompleted1 = vi.fn()
      const onCompleted2 = vi.fn()

      const controller1 = createController({ onSessionCompleted: onCompleted1 })
      const controller2 = createController({ onSessionCompleted: onCompleted2 })

      await controller1.initialize()
      await controller2.initialize()

      // V2: Both use timeoutSeconds=0.2, so 1 poll each = 2 getCache calls total
      await controller1.startSession({
        tabId: 1,
        url: "https://fast.com",
        expected: {},
        timeoutSeconds: 0.2,
      })

      await controller2.startSession({
        tabId: 2,
        url: "https://slow.com",
        expected: {},
        timeoutSeconds: 0.2,
      })

      await vi.runAllTimersAsync()

      // 2 controllers x 1 poll each = 2 getCache calls
      expect(mockPopupCacheManager.getCache).toHaveBeenCalledTimes(2)
      expect(onCompleted1).toHaveBeenCalledTimes(1)
      expect(onCompleted2).toHaveBeenCalledTimes(1)
    })
  })

  describe("Stress Tests", () => {
    it("should survive 100 rapid tab replacements", async () => {
      const onCompleted = vi.fn()
      const controller = createController({ onSessionCompleted: onCompleted })

      await controller.initialize()

      // 100 rapid replacements on tab 1
      for (let i = 0; i < 100; i++) {
        await controller.startSession({
          tabId: 1,
          url: `https://page${i}.com`,
          expected: {},
          timeoutSeconds: 0.2,
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
      const controller = createController({ onSessionCompleted: onCompleted })

      await controller.initialize()

      // Alternating pattern: create tab 1, create tab 2, cancel tab 1, create tab 1, cancel tab 2...
      for (let i = 0; i < 50; i++) {
        const session1 = await controller.startSession({
          tabId: 1,
          url: `https://tab1-${i}.com`,
          expected: {},
          timeoutSeconds: 0.2,
        })

        const session2 = await controller.startSession({
          tabId: 2,
          url: `https://tab2-${i}.com`,
          expected: {},
          timeoutSeconds: 0.2,
        })

        await controller.cancelSession(session1.id)
        await controller.cancelSession(session2.id)
      }

      // All sessions should be canceled
      // Each iteration: tab 1 created (previous tab 1 canceled by replacement), tab 2 created (previous tab 2 canceled by replacement),
      // then explicit cancel of session1 and session2
      // First iteration has no previous, subsequent ones do
      expect(onCompleted.mock.calls.length).toBeGreaterThan(0)
      onCompleted.mock.calls.forEach(([, result]) => {
        expect(result.status).toBe("canceled")
      })
    })
  })
})
