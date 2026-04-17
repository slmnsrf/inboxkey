/**
 * Session Polling Scheduler
 *
 * This module provides MV3-resilient polling logic for watch sessions.
 * It uses a dual-timer strategy (setTimeout + chrome.alarms) to ensure
 * polls execute even if the service worker is terminated.
 *
 * Polling Strategy:
 * - Schedules polls at configured intervals (default: 0ms, 5s, 10s)
 * - Each poll uses BOTH setTimeout (fast) and chrome.alarms (persistent)
 * - Whichever fires first executes the callback and clears the other
 * - Survives service worker restarts via chrome.alarms
 *
 * @module background/session-poller
 */

import { WATCH_SESSION_SCORING } from "@/lib/matching/scoring-config";

/**
 * Represents a scheduled polling sequence for a watch session.
 *
 * @property {string} sessionId - Unique identifier for the watch session
 * @property {number[]} pollTimes - Millisecond offsets from startedAt when polls should occur
 * @property {number} startedAt - Unix timestamp (ms) when polling sequence started
 */
export interface PollingSchedule {
  sessionId: string;
  pollTimes: number[];
  startedAt: number;
}

/**
 * Manages polling schedules for watch sessions with MV3 resilience.
 *
 * This class orchestrates dual-timer polling using both setTimeout (for immediate
 * execution when service worker is active) and chrome.alarms (for persistence across
 * service worker restarts).
 *
 * Architecture:
 * - Each poll time gets BOTH a timeout and an alarm
 * - First timer to fire wins: executes callback, cancels the other
 * - Alarms are named: `session-poll-${sessionId}-${pollIndex}`
 * - Schedules stored in Map for restart recovery
 *
 * @example
 * const poller = new SessionPoller(async (sessionId, pollIndex) => {
 *   console.log(`Polling session ${sessionId} (poll #${pollIndex})`);
 * });
 * await poller.initialize();
 * poller.schedulePolls("session-123", Date.now());
 */
export class SessionPoller {
  /**
   * Active polling schedules, keyed by session ID.
   * Used for tracking and cancellation.
   */
  private activeSchedules: Map<string, PollingSchedule> = new Map();

  /**
   * Active setTimeout IDs, keyed by alarm name.
   * Allows cancellation when alarm fires first.
   */
  private timeoutIds: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Tracks which poll/alarm combinations have already executed.
   * Prevents duplicate execution if both timers fire.
   */
  private executedPolls: Set<string> = new Set();

  /**
   * Creates a new SessionPoller instance.
   *
   * @param {function} onPoll - Callback invoked when a poll fires.
   *                            Receives the session ID and the poll's
   *                            index within its schedule. The pollIndex
   *                            lets the handler idempotency-check against
   *                            persisted state (survives SW restart).
   *                            Should be async and handle its own errors.
   */
  constructor(private onPoll: (sessionId: string, pollIndex: number) => Promise<void>) {}

  /**
   * Initializes the poller by registering the chrome.alarms listener.
   *
   * MUST be called once during service worker startup before scheduling polls.
   * The listener handles alarm events and coordinates with setTimeout timers.
   *
   * @returns {Promise<void>}
   */
  public async initialize(): Promise<void> {
    chrome.alarms.onAlarm.addListener((alarm) => {
      void this.onAlarm(alarm);
    });
  }

  /**
   * Schedules a polling sequence for a watch session.
   *
   * Creates dual timers (setTimeout + chrome.alarms) for each poll time
   * defined in WATCH_SESSION_SCORING.pollTimesMs or custom poll times.
   * Whichever timer fires first executes the poll and clears the other.
   *
   * @param {string} sessionId - Unique identifier for the watch session
   * @param {number} startedAt - Unix timestamp (ms) when session started
   * @param {number[]} customPollTimes - Optional custom poll times (ms offsets from startedAt)
   *
   * @example
   * // Schedule polls at t=0, 5s, 10s from now (default)
   * poller.schedulePolls("session-456", Date.now());
   *
   * // Schedule polls at t=0, 10s, 20s from now (custom)
   * poller.schedulePolls("session-456", Date.now(), [0, 10000, 20000]);
   */
  public schedulePolls(sessionId: string, startedAt: number, customPollTimes?: number[]): void {
    const pollTimes = customPollTimes ?? WATCH_SESSION_SCORING.pollTimesMs;

    // Store schedule for tracking
    const schedule: PollingSchedule = {
      sessionId,
      pollTimes: [...pollTimes],
      startedAt,
    };
    this.activeSchedules.set(sessionId, schedule);

    const now = Date.now();

    pollTimes.forEach((pollOffset, index) => {
      const pollTime = startedAt + pollOffset;
      const delayMs = Math.max(0, pollTime - now);
      const alarmName = this.getAlarmName(sessionId, index);

      // Schedule setTimeout (fast, but lost on service worker restart)
      const timeoutId = setTimeout(() => {
        void this.executePoll(sessionId, alarmName, index);
      }, delayMs);

      this.timeoutIds.set(alarmName, timeoutId);

      // Schedule chrome.alarm (persistent, but slightly delayed)
      try {
        chrome.alarms.create(alarmName, {
          when: pollTime,
        });
      } catch (err) {
        console.warn(`[SessionPoller] Failed to create alarm ${alarmName}:`, err)
      }
    });
  }

  /**
   * Cancels all scheduled polls for a watch session.
   *
   * Clears both setTimeout timers and chrome.alarms, and removes
   * the session from active schedules.
   *
   * @param {string} sessionId - Session whose polls should be cancelled
   */
  public cancelPolls(sessionId: string): void {
    const schedule = this.activeSchedules.get(sessionId);
    if (!schedule) {
      return;
    }

    // Clear all timeouts and alarms for this session
    schedule.pollTimes.forEach((_, index) => {
      const alarmName = this.getAlarmName(sessionId, index);

      // Clear setTimeout
      const timeoutId = this.timeoutIds.get(alarmName);
      if (timeoutId) {
        clearTimeout(timeoutId);
        this.timeoutIds.delete(alarmName);
      }

      // Clear chrome.alarm
      try { chrome.alarms.clear(alarmName) } catch { /* orphaned alarm is harmless */ }

      // Clear execution tracking
      this.executedPolls.delete(alarmName);
    });

    this.activeSchedules.delete(sessionId);
  }

  /**
   * Handles chrome.alarms.onAlarm events.
   *
   * Filters for session-poll alarms, executes the poll if not already
   * executed by setTimeout, and clears the corresponding timeout.
   *
   * @param {chrome.alarms.Alarm} alarm - The alarm that fired
   * @returns {Promise<void>}
   * @private
   */
  private async onAlarm(alarm: chrome.alarms.Alarm): Promise<void> {
    // Only handle session-poll alarms
    if (!alarm.name.startsWith("session-poll-")) {
      return;
    }

    const parsed = this.parseAlarmName(alarm.name);
    if (!parsed) {
      console.warn(`[SessionPoller] Invalid alarm name: ${alarm.name}`);
      return;
    }

    await this.executePoll(parsed.sessionId, alarm.name, parsed.pollIndex);
  }

  /**
   * Executes a poll for a session, ensuring it runs only once per alarm.
   *
   * Guards against duplicate execution using executedPolls set.
   * Clears both the timeout and alarm after execution.
   *
   * @param {string} sessionId - Session to poll
   * @param {string} alarmName - Name of the alarm/timeout
   * @returns {Promise<void>}
   * @private
   */
  private async executePoll(
    sessionId: string,
    alarmName: string,
    pollIndex: number
  ): Promise<void> {
    // Intra-process guard: stops setTimeout and chrome.alarm from both
    // firing for the same poll within a single SW lifetime. Post-restart
    // idempotency is the controller's job (session.pollsCompleted).
    if (this.executedPolls.has(alarmName)) {
      return;
    }
    this.executedPolls.add(alarmName);

    // Clear the other timer (whichever didn't fire yet)
    const timeoutId = this.timeoutIds.get(alarmName);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.timeoutIds.delete(alarmName);
    }
    try { chrome.alarms.clear(alarmName) } catch { /* harmless */ }

    // Execute the poll callback
    try {
      await this.onPoll(sessionId, pollIndex);
    } catch (error) {
      console.warn(`[SessionPoller] Error polling session ${sessionId}:`, error);
    }
  }

  /**
   * Generates a unique alarm name for a session poll.
   *
   * @param {string} sessionId - Session identifier
   * @param {number} pollIndex - Index in the pollTimes array
   * @returns {string} Alarm name in format: session-poll-${sessionId}-${pollIndex}
   * @private
   */
  private getAlarmName(sessionId: string, pollIndex: number): string {
    return `session-poll-${sessionId}-${pollIndex}`;
  }

  /**
   * Parses session ID and poll index from an alarm name.
   *
   * Alarm-name format: session-poll-{sessionId}-{pollIndex}
   * Uses a non-greedy capture for sessionId plus a trailing numeric
   * group so ambiguous session IDs (e.g., ones ending in -\d+) still
   * resolve to the correct poll index.
   *
   * @param {string} alarmName - Alarm name to parse
   * @returns Parsed parts, or null if the name is malformed.
   * @private
   */
  private parseAlarmName(alarmName: string): { sessionId: string; pollIndex: number } | null {
    const match = alarmName.match(/^session-poll-(.+?)-(\d+)$/);
    if (!match) {
      return null;
    }
    const pollIndex = Number.parseInt(match[2], 10);
    if (!Number.isFinite(pollIndex) || pollIndex < 0) {
      return null;
    }
    return { sessionId: match[1], pollIndex };
  }
}
