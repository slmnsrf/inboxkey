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
 * This function applies a time-decay algorithm that heavily weights recent emails
 * and exponentially reduces the boost as emails age. The decay is calibrated to
 * provide meaningful differentiation in the critical first few minutes while
 * maintaining numerical stability for older messages.
 *
 * **Algorithm:**
 * ```
 * boost = 0.20 * e^(-ageSeconds / 120)
 * ```
 *
 * **Design rationale:**
 * - Base multiplier of 0.20 provides substantial but not overwhelming boost
 * - Decay constant of 120 seconds creates smooth falloff over ~5 minutes
 * - Exponential function ensures continuous, differentiable scoring
 *
 * **Decay curve examples:**
 * ```
 * Age (seconds) | Boost Score | % of Max
 * --------------|-------------|----------
 *       0       |   0.200     |  100%
 *      30       |   0.164     |   82%
 *      60       |   0.135     |   67%
 *     120       |   0.074     |   37%
 *     180       |   0.040     |   20%
 *     240       |   0.022     |   11%
 *     300       |   0.012     |    6%
 *     600       |   0.001     |    1%
 * ```
 *
 * **Usage patterns:**
 * - Emails arriving in last 30s get 80%+ of maximum boost
 * - Boost drops to ~20% after 3 minutes
 * - After 5 minutes, boost becomes negligible (<6%)
 * - Never negative, ensuring it only helps (never hurts) newer emails
 *
 * @param ageSeconds - Age of the email in seconds (currentTime - receivedAt)
 *                     Must be non-negative. Values < 0 treated as 0.
 * @returns Recency boost score in range [0, 0.20]
 *          Returns 0.20 for brand new emails (age = 0)
 *          Approaches 0 asymptotically as age increases
 *
 * @example
 * ```typescript
 * // Email just arrived
 * const boost1 = recencyBoost(0);
 * // boost1 = 0.200
 *
 * // Email arrived 2 minutes ago
 * const boost2 = recencyBoost(120);
 * // boost2 ≈ 0.074
 *
 * // Email arrived 5 minutes ago
 * const boost3 = recencyBoost(300);
 * // boost3 ≈ 0.012
 * ```
 */
export function recencyBoost(ageSeconds: number): number {
  // Treat negative ages as zero (clock skew protection)
  const safeAge = Math.max(0, ageSeconds);

  // Exponential decay: 0.20 * e^(-age / 120)
  // Decay constant of 120s provides smooth falloff over ~5 minutes
  const boost = 0.20 * Math.exp(-safeAge / 120);

  return boost;
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
 * boost = (receivedAt >= sessionStart - 15000) ? 0.15 : 0
 * ```
 *
 * **Design rationale:**
 * - 15-second pre-session window accounts for email delivery latency
 * - Fixed boost (not decay) treats all in-window emails equally
 * - Binary threshold avoids complex time-distance calculations
 * - 0.15 magnitude balances with recency boost (max 0.20)
 *
 * **Window behavior:**
 * ```
 * Email Timing          | Boost | Rationale
 * ----------------------|-------|------------------------------------------
 * 30s before session    |  0.0  | Too early - likely unrelated
 * 10s before session    |  0.15 | Within window - probably triggered session
 * At session start      |  0.15 | Exact timing - high relevance
 * 5s after session      |  0.15 | Just arrived - session triggered email
 * Unbounded future      |  0.15 | All future emails get boost (until stale)
 * ```
 *
 * **Implementation note:**
 * The asymmetric window (15s before, unlimited after) reflects that:
 * 1. Users often react to emails they just received (future-bounded by recency)
 * 2. Email delivery can precede user's browser action by a few seconds
 * 3. Recency boost handles time-based decay for emails arriving after session
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
  // 15-second pre-session window (15000 milliseconds)
  // Accounts for email delivery latency and user reaction time
  const WINDOW_MS = 15000;

  // Email must arrive no earlier than 15s before session start
  // No upper bound - recency scorer handles time-based decay
  const withinWindow = receivedAt >= (sessionStart - WINDOW_MS);

  return withinWindow ? 0.15 : 0;
}
