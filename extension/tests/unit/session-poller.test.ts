/**
 * Unit tests for SessionPoller
 * Tests dual-timer polling strategy (setTimeout + chrome.alarms)
 * for MV3-resilient watch session polling.
 */

import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import { SessionPoller } from "@/background/session-poller";
import { WATCH_SESSION_SCORING } from "@/lib/matching/scoring-config";

describe("SessionPoller", () => {
  let poller: SessionPoller;
  let onPollMock: ReturnType<typeof vi.fn>;
  let alarmListeners: Array<(alarm: chrome.alarms.Alarm) => void> = [];

  beforeEach(() => {
    vi.clearAllMocks();
    alarmListeners = [];

    // Setup chrome.alarms mock
    vi.mocked(chrome.alarms.create).mockImplementation(() => {});
    vi.mocked(chrome.alarms.clear).mockImplementation(() => {});
    vi.mocked(chrome.alarms.onAlarm.addListener).mockImplementation((fn) => {
      alarmListeners.push(fn);
    });

    // Create poller with mock callback - returns Promise<void>
    onPollMock = vi.fn<[string, number], Promise<void>>().mockResolvedValue(undefined);
    poller = new SessionPoller(onPollMock);
  });

  afterEach(() => {
    vi.clearAllTimers();
    alarmListeners = [];
  });

  describe("Alarm scheduling", () => {
    it("should schedule alarms for all poll times", async () => {
      // Initialize poller
      await poller.initialize();

      // Schedule polls
      const sessionId = "test-session-123";
      const startedAt = Date.now();
      poller.schedulePolls(sessionId, startedAt);

      // Verify chrome.alarms.create called for each poll time
      const expectedPollTimes = WATCH_SESSION_SCORING.pollTimesMs;
      expect(chrome.alarms.create).toHaveBeenCalledTimes(expectedPollTimes.length);

      // Verify each alarm has correct timing
      expectedPollTimes.forEach((pollOffset, index) => {
        const alarmName = `session-poll-${sessionId}-${index}`;
        const expectedWhen = startedAt + pollOffset;

        expect(chrome.alarms.create).toHaveBeenCalledWith(alarmName, {
          when: expectedWhen,
        });
      });
    });

    it("should use correct alarm naming convention", async () => {
      await poller.initialize();

      const sessionId = "session-abc-def-456";
      const startedAt = Date.now();
      poller.schedulePolls(sessionId, startedAt);

      // Verify alarm names follow pattern: session-poll-${sessionId}-${pollIndex}
      const pollCount = WATCH_SESSION_SCORING.pollTimesMs.length;
      for (let i = 0; i < pollCount; i++) {
        const expectedName = `session-poll-${sessionId}-${i}`;
        expect(chrome.alarms.create).toHaveBeenCalledWith(
          expectedName,
          expect.any(Object)
        );
      }
    });

    it("should clear alarms on cancel", async () => {
      await poller.initialize();

      const sessionId = "test-session-789";
      const startedAt = Date.now();
      poller.schedulePolls(sessionId, startedAt);

      // Clear mocks to isolate cancellation calls
      vi.clearAllMocks();

      // Cancel polls
      poller.cancelPolls(sessionId);

      // Verify chrome.alarms.clear called for all polls
      const pollCount = WATCH_SESSION_SCORING.pollTimesMs.length;
      expect(chrome.alarms.clear).toHaveBeenCalledTimes(pollCount);

      // Verify each alarm cleared by name
      for (let i = 0; i < pollCount; i++) {
        const expectedName = `session-poll-${sessionId}-${i}`;
        expect(chrome.alarms.clear).toHaveBeenCalledWith(expectedName);
      }
    });
  });

  describe("Restart recovery", () => {
    it("should handle alarm callbacks", async () => {
      // Initialize poller
      await poller.initialize();
      expect(alarmListeners).toHaveLength(1);

      // Schedule polls
      const sessionId = "test-session-restart";
      const startedAt = Date.now();
      poller.schedulePolls(sessionId, startedAt);

      // Simulate alarm firing (e.g., after service worker restart)
      const alarmName = `session-poll-${sessionId}-0`;
      const mockAlarm: chrome.alarms.Alarm = {
        name: alarmName,
        scheduledTime: startedAt,
      };

      // Trigger alarm listener
      const alarmListener = alarmListeners[0];
      await alarmListener(mockAlarm);

      // Verify onPoll callback was invoked with correct sessionId and pollIndex
      expect(onPollMock).toHaveBeenCalledTimes(1);
      expect(onPollMock).toHaveBeenCalledWith(sessionId, 0);
    });

    it("should prevent duplicate execution", async () => {
      vi.useFakeTimers();

      await poller.initialize();

      const sessionId = "test-session-duplicate";
      const startedAt = Date.now();

      // Schedule polls with future start time to prevent immediate timeout execution
      const futureStart = startedAt + 5000;
      poller.schedulePolls(sessionId, futureStart);

      // Simulate alarm firing BEFORE setTimeout for the FIRST poll (index 0)
      const alarmName = `session-poll-${sessionId}-0`;
      const mockAlarm: chrome.alarms.Alarm = {
        name: alarmName,
        scheduledTime: futureStart,
      };

      const alarmListener = alarmListeners[0];
      await alarmListener(mockAlarm);

      // Verify onPoll called once from alarm (for first poll)
      expect(onPollMock).toHaveBeenCalledTimes(1);
      expect(onPollMock).toHaveBeenCalledWith(sessionId, 0);

      // Now advance timers to trigger all setTimeout calls
      vi.runAllTimers();

      // Verify first poll was NOT called again (duplicate prevented),
      // but other polls (index 1, 2) should have executed
      const totalPolls = WATCH_SESSION_SCORING.pollTimesMs.length;
      expect(onPollMock).toHaveBeenCalledTimes(totalPolls);

      vi.useRealTimers();
    });
  });

  describe("Error handling", () => {
    it("should handle invalid alarm names gracefully", async () => {
      await poller.initialize();
      expect(alarmListeners).toHaveLength(1);

      // Test various malformed alarm names
      const invalidAlarms = [
        { name: "session-poll-", scheduledTime: Date.now() }, // Missing sessionId and index
        { name: "session-poll-abc", scheduledTime: Date.now() }, // Missing index
        { name: "wrong-prefix-session-123-0", scheduledTime: Date.now() }, // Wrong prefix
        { name: "session-poll-abc-def-xyz", scheduledTime: Date.now() }, // Non-numeric index
        { name: "unrelated-alarm", scheduledTime: Date.now() }, // Unrelated alarm
        { name: "", scheduledTime: Date.now() }, // Empty name
      ];

      const alarmListener = alarmListeners[0];

      // None of these should throw errors or crash
      for (const alarm of invalidAlarms) {
        // Call listener - should not throw
        await alarmListener(alarm as chrome.alarms.Alarm);
      }

      // Verify onPoll was never called for invalid alarms
      expect(onPollMock).not.toHaveBeenCalled();
    });
  });

  describe("Timeout and alarm coordination", () => {
    it("should clear timeout when alarm fires first", async () => {
      vi.useFakeTimers();

      await poller.initialize();

      const sessionId = "test-session-alarm-first";
      const startedAt = Date.now();

      // Schedule with non-zero delay so timeout doesn't fire immediately
      const futureStart = startedAt + 1000;
      poller.schedulePolls(sessionId, futureStart);

      // Simulate alarm firing BEFORE timeout completes for FIRST poll
      const alarmName = `session-poll-${sessionId}-0`;
      const mockAlarm: chrome.alarms.Alarm = {
        name: alarmName,
        scheduledTime: futureStart,
      };

      const alarmListener = alarmListeners[0];

      // Clear mock to isolate alarm execution call
      vi.clearAllMocks();

      await alarmListener(mockAlarm);

      // Verify alarm cleared the other timer
      expect(chrome.alarms.clear).toHaveBeenCalledWith(alarmName);

      // Verify poll executed once (for first poll)
      expect(onPollMock).toHaveBeenCalledTimes(1);

      // Now run timeouts - first poll should not execute again,
      // but other polls (index 1, 2) should execute
      vi.runAllTimers();
      const totalPolls = WATCH_SESSION_SCORING.pollTimesMs.length;
      expect(onPollMock).toHaveBeenCalledTimes(totalPolls);

      vi.useRealTimers();
    });

    it("should clear alarm when timeout fires first", async () => {
      vi.useFakeTimers();

      await poller.initialize();

      const sessionId = "test-session-timeout-first";
      const startedAt = Date.now();
      poller.schedulePolls(sessionId, startedAt);

      // Let timeout fire first
      vi.runAllTimers();

      // Verify poll executed via timeout
      expect(onPollMock).toHaveBeenCalledTimes(
        WATCH_SESSION_SCORING.pollTimesMs.length
      );

      // Verify alarms were cleared
      const pollCount = WATCH_SESSION_SCORING.pollTimesMs.length;
      expect(chrome.alarms.clear).toHaveBeenCalledTimes(pollCount);

      for (let i = 0; i < pollCount; i++) {
        expect(chrome.alarms.clear).toHaveBeenCalledWith(
          `session-poll-${sessionId}-${i}`
        );
      }

      vi.useRealTimers();
    });
  });

  describe("Multiple session management", () => {
    it("should handle multiple concurrent sessions independently", async () => {
      vi.useFakeTimers();

      await poller.initialize();

      const sessionId1 = "session-1";
      const sessionId2 = "session-2";
      const startedAt = Date.now();

      // Schedule polls for both sessions
      poller.schedulePolls(sessionId1, startedAt);
      poller.schedulePolls(sessionId2, startedAt);

      // Verify alarms created for both sessions
      const pollCount = WATCH_SESSION_SCORING.pollTimesMs.length;
      expect(chrome.alarms.create).toHaveBeenCalledTimes(pollCount * 2);

      // Cancel only first session
      vi.clearAllMocks();
      poller.cancelPolls(sessionId1);

      // Verify only session1 alarms cleared
      expect(chrome.alarms.clear).toHaveBeenCalledTimes(pollCount);
      for (let i = 0; i < pollCount; i++) {
        expect(chrome.alarms.clear).toHaveBeenCalledWith(`session-poll-${sessionId1}-${i}`);
      }

      // Run timers - should still execute session2 polls
      vi.runAllTimers();
      expect(onPollMock).toHaveBeenCalledWith(sessionId2, expect.any(Number));
      expect(onPollMock).not.toHaveBeenCalledWith(sessionId1, expect.any(Number));

      vi.useRealTimers();
    });

    it("should allow rescheduling same session after cancellation", async () => {
      vi.useFakeTimers();

      await poller.initialize();

      const sessionId = "test-session-reschedule";
      const startedAt1 = Date.now();

      // Schedule first time
      poller.schedulePolls(sessionId, startedAt1);

      // Cancel
      poller.cancelPolls(sessionId);

      // Clear mocks
      vi.clearAllMocks();

      // Schedule again with new timestamp
      const startedAt2 = Date.now() + 5000;
      poller.schedulePolls(sessionId, startedAt2);

      // Verify alarms created again
      const pollCount = WATCH_SESSION_SCORING.pollTimesMs.length;
      expect(chrome.alarms.create).toHaveBeenCalledTimes(pollCount);

      // Run timers
      vi.runAllTimers();

      // Verify polls executed
      expect(onPollMock).toHaveBeenCalledWith(sessionId, expect.any(Number));

      vi.useRealTimers();
    });
  });

  describe("Poll callback error handling", () => {
    it("should handle onPoll errors without crashing", async () => {
      vi.useFakeTimers();

      // Mock console.warn to suppress error output (SessionPoller logs
      // callback errors via console.warn, not console.error).
      const consoleErrorSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      // Create poller with failing callback
      const failingCallback = vi.fn().mockRejectedValue(new Error("Poll failed"));
      const errorPoller = new SessionPoller(failingCallback);

      // Reset alarm listeners for new poller
      alarmListeners = [];
      vi.mocked(chrome.alarms.onAlarm.addListener).mockImplementation((fn) => {
        alarmListeners.push(fn);
      });

      await errorPoller.initialize();

      const sessionId = "test-session-error";
      const startedAt = Date.now();
      errorPoller.schedulePolls(sessionId, startedAt);

      // Run all timers to trigger setTimeout path (which will fail)
      await vi.runAllTimersAsync();

      // Verify callback was called multiple times (once per poll time)
      const pollCount = WATCH_SESSION_SCORING.pollTimesMs.length;
      expect(failingCallback).toHaveBeenCalledTimes(pollCount);
      expect(failingCallback).toHaveBeenCalledWith(sessionId, expect.any(Number));

      // Verify error was logged for each failed poll
      expect(consoleErrorSpy).toHaveBeenCalledTimes(pollCount);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(`[SessionPoller] Error polling session ${sessionId}`),
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
      vi.useRealTimers();
    });
  });

  describe("Poll timing accuracy", () => {
    it("should schedule polls at correct times relative to startedAt", async () => {
      await poller.initialize();

      const sessionId = "test-session-timing";
      const startedAt = Date.now() - 2000; // Started 2 seconds ago
      poller.schedulePolls(sessionId, startedAt);

      // Poll times: [0, 5000, 10000]ms from startedAt
      // Expected alarm times:
      const expectedTimes = WATCH_SESSION_SCORING.pollTimesMs.map(
        (offset) => startedAt + offset
      );

      // Verify each alarm scheduled at correct absolute time
      expectedTimes.forEach((expectedWhen, index) => {
        const alarmName = `session-poll-${sessionId}-${index}`;
        expect(chrome.alarms.create).toHaveBeenCalledWith(alarmName, {
          when: expectedWhen,
        });
      });
    });

    it("should handle past poll times correctly", async () => {
      vi.useFakeTimers();

      await poller.initialize();

      const sessionId = "test-session-past";
      const startedAt = Date.now() - 10000; // Started 10 seconds ago
      poller.schedulePolls(sessionId, startedAt);

      // All poll times (0, 5000, 10000) are in the past
      // setTimeout should use Math.max(0, ...) to fire immediately
      vi.runAllTimers();

      // All polls should execute
      expect(onPollMock).toHaveBeenCalledTimes(
        WATCH_SESSION_SCORING.pollTimesMs.length
      );

      vi.useRealTimers();
    });
  });
});
