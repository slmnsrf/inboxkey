/**
 * recency-scorer.ts
 *
 * Provides scoring functions for email recency and session timing alignment.
 * These functions boost the relevance score of emails based on:
 * 1. How recently the email was received (recency boost)
 * 2. Whether the email arrived near the start of a browsing session (session boost)
 *
 * The recency boost uses exponential decay to strongly favor very recent emails
 * while gracefully degrading the boost for older messages. The session boost
 * provides a fixed bonus for emails that arrive within a temporal window of
 * when a user started interacting with a website.
 *
 * @module recency-scorer
 */

/**
 * Calculates a recency boost score based on email age using exponential decay.
 *
 * **Algorithm:**
 * ```
 * boost = e^(-ageSeconds / 120)
 * ```
 *
 * Returns a value in [0, 1.0] - a brand-new email receives the full
 * 1.0 and the callers (code-matcher, popup-priority) multiply by their
 * own weight (e.g. recencyToPoints = 250 for code-matcher).
 *
 * Previously the base coefficient was 0.20, which capped the real
 * contribution at 0.20 x 250 = 50 points instead of the 250 documented
 * in scoring-config. CONFIDENCE_THRESHOLDS were calibrated against the
 * documented (correct) range and were effectively unreachable under the
 * broken scale.
 *
 * **Decay curve (unchanged - 120s half-life):**
 * ```
 * Age (seconds) | Boost | % of Max
 * --------------|-------|----------
 *       0       | 1.000 |  100%
 *      30       | 0.779 |   78%
 *      60       | 0.607 |   61%
 *     120       | 0.368 |   37%
 *     240       | 0.135 |   14%
 *     600       | 0.007 |    1%
 * ```
 *
 * @param ageSeconds - Email age in seconds (currentTime - receivedAt).
 *                     Values < 0 treated as 0 (clock-skew safety).
 * @returns Recency boost in [0, 1.0].
 */
export function recencyBoost(ageSeconds: number): number {
  const safeAge = Math.max(0, ageSeconds);
  return Math.exp(-safeAge / 120);
}

/**
 * Calculates a session alignment boost for emails arriving near session start.
 *
 * This function provides a fixed bonus score when an email's received timestamp
 * falls within a temporal window around when the user began a browsing session
 * on a particular domain. This helps surface emails that are contextually
 * relevant to the current session's trigger event (e.g., "password reset" email
 * arriving just as user visits reset page).
 *
 * **Algorithm:**
 * ```
 * boost = (receivedAt within [sessionStart - 15s, sessionStart + 120s]) ? 0.15 : 0
 * ```
 *
 * **Design rationale:**
 * - 15-second pre-session window accounts for email delivery latency
 * - 120-second post-session window matches the watch session poll horizon
 *   (WATCH_SESSION_SCORING.recencyDecaySeconds); emails arriving after
 *   the watch ends are almost certainly unrelated to the session trigger.
 * - Fixed boost (not decay) treats all in-window emails equally
 * - Binary threshold avoids complex time-distance calculations
 *
 * **Window behavior:**
 * ```
 * Email Timing            | Boost | Rationale
 * ------------------------|-------|------------------------------------------
 * 30s before session      |  0.0  | Too early - likely unrelated
 * 10s before session      |  0.15 | Within pre-window - probably triggered session
 * At session start        |  0.15 | Exact timing - high relevance
 * 5s after session        |  0.15 | Just arrived - session-triggered email
 * 100s after session      |  0.15 | Still within active watch window
 * 130s after session      |  0.0  | Past watch horizon - unrelated arrival
 * ```
 *
 * **Implementation note:**
 * Bounded symmetrical window keeps the boost tied to the actual session
 * lifetime. Before the fix, an email arriving hours later still got the
 * full boost because there was no upper bound, which could surface an
 * unrelated promotional email above a correct (but slightly older) one.
 *
 * @param receivedAt - Email received timestamp (milliseconds since epoch)
 * @param sessionStart - Session start timestamp (milliseconds since epoch)
 * @returns Session boost score: 0.15 if within window, 0 otherwise
 *
 * @example
 * ```typescript
 * const sessionStart = Date.now(); // e.g., 1700000000000
 *
 * // Email arrived 10 seconds before session (within 15s window)
 * const boost1 = sessionBoost(sessionStart - 10000, sessionStart);
 * // boost1 = 0.15
 *
 * // Email arrived 20 seconds before session (outside window)
 * const boost2 = sessionBoost(sessionStart - 20000, sessionStart);
 * // boost2 = 0
 *
 * // Email arrived exactly at session start
 * const boost3 = sessionBoost(sessionStart, sessionStart);
 * // boost3 = 0.15
 *
 * // Email arrived after session started
 * const boost4 = sessionBoost(sessionStart + 5000, sessionStart);
 * // boost4 = 0.15
 * ```
 */
export function sessionBoost(receivedAt: number, sessionStart: number): number {
  // 15-second pre-session window: email delivery latency slack.
  const PRE_WINDOW_MS = 15000;
  // 120-second post-session window: matches the active watch horizon.
  const POST_WINDOW_MS = 120000;

  const lowerBound = sessionStart - PRE_WINDOW_MS;
  const upperBound = sessionStart + POST_WINDOW_MS;

  return (receivedAt >= lowerBound && receivedAt <= upperBound) ? 0.15 : 0;
}
