/**
 * Scoring Configuration for Watch Session Matching
 *
 * This module provides configuration constants for the watch session scoring algorithm.
 * It defines domain aliases, scoring weights, timing parameters, and confidence thresholds
 * used to match emails with their corresponding browser watch sessions.
 *
 * @module lib/matching/scoring-config
 */

/**
 * Domain alias mapping for normalizing email sender domains.
 *
 * Maps alternative domain names to their canonical forms. This ensures that emails
 * from different subdomains or related domains of the same service are correctly
 * matched to watch sessions.
 *
 * @example
 * // "no-reply@dropboxmail.com" normalizes to "dropbox.com"
 * const normalized = DOMAIN_ALIASES["dropboxmail.com"] || "dropboxmail.com";
 */
export const DOMAIN_ALIASES: Record<string, string> = {
  "dropboxmail.com": "dropbox.com",
  "github.com": "github.com",
  "battlestategames.com": "battlestategames.com",
};

/**
 * Core scoring configuration for watch session matching algorithm.
 *
 * This configuration object defines all the weights, timing parameters, and thresholds
 * used by the scoring algorithm to match incoming emails with browser watch sessions.
 *
 * Scoring Algorithm Overview:
 * - Domain match provides the base score
 * - Email recency adds bonus points (decays over time)
 * - Active watch session adds significant boost
 * - Expected email shape provides minor tiebreaker
 * - Already-used sessions receive penalty
 *
 * @property {number[]} pollTimesMs - Polling intervals in milliseconds for checking new emails
 * @property {number} newerThanMinutes - Time window to consider emails as "recent"
 * @property {number} domainWeight - Base points awarded for domain match
 * @property {number} recencyToPoints - Maximum bonus points for email recency
 * @property {number} sessionToPoints - Bonus points for active watch session
 * @property {number} expectedShapeTieBreaker - Minor points for matching expected email shape
 * @property {number} usedPenalty - Penalty points for already-used sessions
 * @property {number} acceptMin - Minimum score required to accept a match
 * @property {number} recencyDecaySeconds - Time period over which recency bonus decays to zero
 * @property {number} sessionBoostWindow - Time window (ms) for session activity boost
 */
export const WATCH_SESSION_SCORING = {
  /**
   * Fixed polling schedule optimized for email delivery patterns (in milliseconds).
   *
   * Strategy:
   * - First 20s: Dense 5s intervals → catches fast providers (Gmail)
   * - After 20s: Sparse 10s intervals → catches slow providers (IMAP)
   *
   * Full schedule: [0, 5, 10, 15, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]s
   * Total: 15 polls over 120 seconds maximum
   *
   * User timeout setting filters which polls execute:
   * - 10s → [0, 5, 10] = 3 polls
   * - 30s → [0, 5, 10, 15, 20, 30] = 6 polls (default)
   * - 60s → [0, 5, 10, 15, 20, 30, 40, 50, 60] = 9 polls
   * - 120s → all 15 polls
   */
  pollTimesMs: [0, 5000, 10000, 15000, 20000, 30000, 40000, 50000, 60000, 70000, 80000, 90000, 100000, 110000, 120000] as const,

  /**
   * Time window (in minutes) to consider emails as "recent".
   * Only emails newer than this will be considered for matching.
   */
  newerThanMinutes: 10,

  /**
   * Base score awarded when email domain matches watch session domain.
   * This is the foundation of the scoring algorithm.
   */
  domainWeight: 100,

  /**
   * Maximum bonus points for email recency.
   * Newer emails receive higher scores, decaying over time.
   * A brand new email gets the full 250 points.
   */
  recencyToPoints: 250,

  /**
   * Bonus points awarded when a watch session is actively being monitored.
   * This significantly boosts the score for sessions the user is currently watching.
   */
  sessionToPoints: 100,

  /**
   * Minor tiebreaker points for matching expected email shape.
   * Used to prefer sessions that expect specific email patterns (e.g., OTP codes).
   */
  expectedShapeTieBreaker: 8,

  /**
   * Penalty points applied to sessions that have already been used.
   * Prevents reusing the same session for multiple emails. Scaled to
   * -250 so it outweighs the full recency range (also 0..250) -- an
   * already-used code should never beat an unused alternative purely
   * on freshness. Prior value of -50 was calibrated against the
   * previously-broken recency scale capped at 50 points.
   */
  usedPenalty: -250,

  /**
   * Minimum score threshold to accept a match.
   * Scores below this value are rejected as too uncertain.
   */
  acceptMin: 10,

  /**
   * Time period (in seconds) over which recency bonus decays to zero.
   * A linear decay function is applied: newer emails get higher recency scores.
   */
  recencyDecaySeconds: 120,

  /**
   * Time window (in milliseconds) for considering a session as "active".
   * Sessions with activity within this window receive the sessionToPoints boost.
   */
  sessionBoostWindow: 15000,
} as const;
