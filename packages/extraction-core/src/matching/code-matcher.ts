/**
 * Code matching utilities shared between background and content scripts.
 *
 * These helpers score stored codes against the current site context to
 * determine the best candidate for autofill.
 *
 * VERSION 2 CHANGES:
 * - Replaced simple domain matching with graduated domain affinity scoring
 * - Replaced linear recency decay with exponential decay algorithm
 * - Added session alignment boost for emails arriving near session start
 * - Added expected shape matching for verification code patterns
 * - Upgraded to points-based scoring system with configurable weights
 * - Added backward compatibility for optional v2 fields (senderETLD, receivedAt)
 *
 * FEATURE FLAG:
 * - V2 features are gated by Settings.watchSessionV2Enabled (default: false)
 * - When enabled: sessionStart and expectedShape parameters activate v2 scoring
 * - When disabled: call without sessionStart/expectedShape for basic matching
 * - V1 implementation has been removed; v2 is the only algorithm
 */

import type { StoredCode } from "@/lib/storage/schema"
import { domainAffinity, extractETLD } from "./domain-affinity"
import { recencyBoost, sessionBoost } from "./recency-scorer"
import { shapeScore, type ExpectedShape } from "./shape-matcher"
import { WATCH_SESSION_SCORING } from "./scoring-config"

/**
 * Extract hostname from a URL string.
 *
 * @deprecated This function is preserved for backward compatibility and testing.
 * v2 code should use domain-affinity.extractETLD() instead.
 */
function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url)
    return urlObj.hostname
  } catch {
    return ""
  }
}

/**
 * Determine whether two domains match directly or via subdomain relationship.
 *
 * @deprecated This function is preserved for backward compatibility and testing.
 * v2 code should use domain-affinity.domainAffinity() instead.
 */
function domainsMatch(domain1: string, domain2: string): boolean {
  if (!domain1 || !domain2) return false

  const d1 = domain1.toLowerCase()
  const d2 = domain2.toLowerCase()

  if (d1 === d2) {
    return true
  }

  const parts1 = d1.split(".").reverse()
  const parts2 = d2.split(".").reverse()

  if (parts1.length >= 2 && parts2.length >= 2) {
    return parts1[0] === parts2[0] && parts1[1] === parts2[1]
  }

  return false
}

/**
 * Calculate a recency score where newer codes rank higher.
 *
 * @deprecated This function is preserved for backward compatibility and testing.
 * v2 code should use recency-scorer.recencyBoost() instead.
 *
 * @param timestamp Unix epoch milliseconds when code was captured
 * @param currentTime Current epoch milliseconds
 * @returns Score 0-1 (1 = most recent)
 */
function calculateRecencyScore(
  timestamp: number,
  currentTime: number
): number {
  const ageMs = currentTime - timestamp
  const maxAgeMs = 5 * 60 * 1000 // 5 minutes

  if (ageMs < 0) return 0
  if (ageMs > maxAgeMs) return 0

  return 1 - ageMs / maxAgeMs
}

/**
 * Select the best matching stored code for the provided context.
 *
 * V2 ALGORITHM:
 * This function uses a points-based scoring system that combines:
 * 1. Domain affinity (100 pts max) - graduated scoring for exact, alias, and token matches
 * 2. Recency boost (250 pts max) - exponential decay favoring recent emails
 * 3. Session boost (100 pts max) - bonus for emails arriving near session start
 * 4. Shape match (8 pts) - tiebreaker for expected code patterns
 * 5. Used penalty (-50 pts) - deduct points for already-used codes
 *
 * Minimum acceptance threshold: 10 points
 *
 * BACKWARD COMPATIBILITY:
 * - sessionStart and expectedShape parameters are optional
 * - Falls back to code.timestamp when code.receivedAt is missing
 * - Falls back to extractETLD(code.siteMatch) when code.senderETLD is missing
 * - Preserves v1 behavior when new parameters are not provided
 *
 * @param codes Stored codes ordered newest-first
 * @param pageUrl URL of page requesting code
 * @param timestamp Current time (epoch ms)
 * @param sessionStart Optional session start timestamp (epoch ms) for session boost
 * @param expectedShape Optional expected code characteristics for shape matching
 * @returns Best matching code or null if none meet threshold
 */
export function findBestMatchingCode(
  codes: StoredCode[],
  pageUrl: string,
  timestamp: number,
  sessionStart?: number,
  expectedShape?: ExpectedShape
): StoredCode | null {
  if (codes.length === 0) {
    return null
  }

  // Extract site domain as eTLD+1 (e.g., "github.com")
  const currentDomain = extractDomain(pageUrl)
  const siteETLD = extractETLD(currentDomain)

  // Score each code using v2 algorithm
  const scored = codes.map((code) => {
    // ──────────────────────────────────────────────────────────────────────
    // COMPONENT 1: Domain Affinity (0-100 points)
    // ──────────────────────────────────────────────────────────────────────
    // v2: Use graduated affinity scoring (1.0, 0.9, 0.6, or 0.0)
    // v1 fallback: Extract eTLD from siteMatch if senderETLD is missing
    const senderETLD = code.senderETLD || extractETLD(code.siteMatch || "")
    const affinity = domainAffinity(siteETLD, senderETLD, code.source)
    const domainPoints = affinity * WATCH_SESSION_SCORING.domainWeight

    // ──────────────────────────────────────────────────────────────────────
    // COMPONENT 2: Recency Boost (0-250 points)
    // ──────────────────────────────────────────────────────────────────────
    // v2: Use exponential decay based on email age
    // v1 fallback: Use code.timestamp if receivedAt is missing
    const emailTimestamp = code.receivedAt || code.timestamp
    const ageSeconds = (timestamp - emailTimestamp) / 1000
    const recency = recencyBoost(ageSeconds)
    const recencyPoints = Math.round(recency * WATCH_SESSION_SCORING.recencyToPoints)

    // ──────────────────────────────────────────────────────────────────────
    // COMPONENT 3: Session Boost (0-100 points)
    // ──────────────────────────────────────────────────────────────────────
    // v2: Bonus for emails arriving within 15s window of session start
    // Only applied if sessionStart parameter is provided
    const sessionBoostValue = sessionStart
      ? sessionBoost(emailTimestamp, sessionStart)
      : 0
    const sessionPoints = Math.round(sessionBoostValue * WATCH_SESSION_SCORING.sessionToPoints)

    // ──────────────────────────────────────────────────────────────────────
    // COMPONENT 4: Shape Match (0-8 points)
    // ──────────────────────────────────────────────────────────────────────
    // v2: Tiebreaker for codes matching expected length/charset
    // Only applied if expectedShape parameter is provided
    const shapeValue = expectedShape ? shapeScore(code.code, expectedShape) : 0
    const shapePoints = shapeValue > 0 ? WATCH_SESSION_SCORING.expectedShapeTieBreaker : 0

    // ──────────────────────────────────────────────────────────────────────
    // COMPONENT 5: Used Penalty (-50 points)
    // ──────────────────────────────────────────────────────────────────────
    // v2: Deduct points for codes already marked as used
    const usedPoints = code.used ? WATCH_SESSION_SCORING.usedPenalty : 0

    // ──────────────────────────────────────────────────────────────────────
    // TOTAL SCORE CALCULATION
    // ──────────────────────────────────────────────────────────────────────
    const points =
      domainPoints +
      recencyPoints +
      sessionPoints +
      shapePoints +
      usedPoints

    return { code, score: points }
  })

  // Sort by score descending (highest score first)
  scored.sort((a, b) => b.score - a.score)

  const best = scored[0]

  // ────────────────────────────────────────────────────────────────────────
  // ACCEPTANCE THRESHOLD
  // ────────────────────────────────────────────────────────────────────────
  // v2: Use configurable minimum threshold (default: 10 points)
  // v1: Used hardcoded threshold of 10 points
  if (!best || best.score < WATCH_SESSION_SCORING.acceptMin) {
    return null
  }

  return best.code
}

/**
 * Exported test helpers for backward compatibility.
 *
 * NOTE: These v1 functions are deprecated in production code but preserved
 * for existing test suites. New tests should use the v2 modules directly:
 * - domain-affinity.ts for domain matching
 * - recency-scorer.ts for time-based scoring
 * - shape-matcher.ts for pattern matching
 */
export const __testing = {
  extractDomain,
  domainsMatch,
  calculateRecencyScore,
}
