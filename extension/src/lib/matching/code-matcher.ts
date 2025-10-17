/**
 * Code matching utilities shared between background and content scripts.
 *
 * These helpers score stored codes against the current site context to
 * determine the best candidate for autofill.
 */

import type { StoredCode } from "@/lib/storage/schema"

/**
 * Extract hostname from a URL string.
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
 * @param codes Stored codes ordered newest-first
 * @param pageUrl URL of page requesting code
 * @param timestamp Current time (epoch ms)
 * @returns Best matching code or null if none meet threshold
 */
export function findBestMatchingCode(
  codes: StoredCode[],
  pageUrl: string,
  timestamp: number
): StoredCode | null {
  if (codes.length === 0) {
    return null
  }

  const currentDomain = extractDomain(pageUrl)
  const currentTime = timestamp

  const scored = codes.map((code) => {
    let score = 0

    if (code.siteMatch && domainsMatch(currentDomain, code.siteMatch)) {
      score += 100
    }

    const recencyScore = calculateRecencyScore(code.timestamp, currentTime)
    score += recencyScore * 50

    if (code.used) {
      score -= 50
    }

    return { code, score }
  })

  scored.sort((a, b) => b.score - a.score)

  const best = scored[0]

  if (!best || best.score < 10) {
    return null
  }

  return best.code
}

export const __testing = {
  extractDomain,
  domainsMatch,
  calculateRecencyScore,
}
