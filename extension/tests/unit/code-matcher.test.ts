/**
 * Comprehensive Unit Tests for Code Matcher
 */

import { describe, it, expect } from "vitest"
import {
  findBestMatchingCode,
  __testing,
} from "../../src/lib/matching/code-matcher"
import type { StoredCode } from "../../src/lib/storage/schema"

const { extractDomain, domainsMatch, calculateRecencyScore } = __testing

describe("Code Matcher", () => {
  describe("extractDomain", () => {
    it("should extract domain from valid URL", () => {
      expect(extractDomain("https://example.com/path")).toBe("example.com")
      expect(extractDomain("https://www.example.com")).toBe("www.example.com")
      expect(extractDomain("https://sub.example.com/login")).toBe(
        "sub.example.com"
      )
    })

    it("should handle URLs with ports", () => {
      expect(extractDomain("https://example.com:8080/path")).toBe(
        "example.com"
      )
    })

    it("should handle different protocols", () => {
      expect(extractDomain("http://example.com")).toBe("example.com")
      expect(extractDomain("https://example.com")).toBe("example.com")
    })

    it("should return empty string for invalid URLs", () => {
      expect(extractDomain("not-a-url")).toBe("")
      expect(extractDomain("")).toBe("")
      expect(extractDomain("javascript:void(0)")).toBe("")
    })

    it("should handle URLs with query parameters", () => {
      expect(extractDomain("https://example.com/path?foo=bar")).toBe(
        "example.com"
      )
    })

    it("should handle URLs with fragments", () => {
      expect(extractDomain("https://example.com/path#section")).toBe(
        "example.com"
      )
    })
  })

  describe("domainsMatch", () => {
    it("should match exact domains", () => {
      expect(domainsMatch("example.com", "example.com")).toBe(true)
      expect(domainsMatch("www.example.com", "www.example.com")).toBe(true)
    })

    it("should match same TLD and second-level domain", () => {
      expect(domainsMatch("www.example.com", "mail.example.com")).toBe(true)
      expect(domainsMatch("sub1.example.com", "sub2.example.com")).toBe(true)
      expect(domainsMatch("example.com", "www.example.com")).toBe(true)
    })

    it("should not match different domains", () => {
      expect(domainsMatch("example.com", "other.com")).toBe(false)
      expect(domainsMatch("example.net", "example.com")).toBe(false)
      expect(domainsMatch("foo.com", "bar.com")).toBe(false)
    })

    it("should be case insensitive", () => {
      expect(domainsMatch("Example.com", "example.com")).toBe(true)
      expect(domainsMatch("EXAMPLE.COM", "example.com")).toBe(true)
      expect(domainsMatch("www.Example.COM", "www.example.com")).toBe(true)
    })

    it("should handle empty or null domains", () => {
      expect(domainsMatch("", "example.com")).toBe(false)
      expect(domainsMatch("example.com", "")).toBe(false)
      expect(domainsMatch("", "")).toBe(false)
    })

    it("should not match single-segment domains", () => {
      expect(domainsMatch("localhost", "localhost")).toBe(true)
      expect(domainsMatch("localhost", "example.com")).toBe(false)
    })

    it("should handle complex subdomains", () => {
      expect(
        domainsMatch("a.b.c.example.com", "x.y.z.example.com")
      ).toBe(true)
      expect(domainsMatch("example.com", "subdomain.example.com")).toBe(true)
    })
  })

  describe("calculateRecencyScore", () => {
    it("should return 1 for very recent codes", () => {
      const now = Date.now()
      expect(calculateRecencyScore(now, now)).toBe(1)
      expect(calculateRecencyScore(now - 1000, now)).toBeCloseTo(0.996, 2)
    })

    it("should return 0 for codes older than 5 minutes", () => {
      const now = Date.now()
      const fiveMinutesAgo = now - 5 * 60 * 1000
      expect(calculateRecencyScore(fiveMinutesAgo, now)).toBe(0)
      expect(calculateRecencyScore(fiveMinutesAgo - 1000, now)).toBe(0)
    })

    it("should return 0 for future timestamps", () => {
      const now = Date.now()
      const future = now + 10000
      expect(calculateRecencyScore(future, now)).toBe(0)
    })

    it("should calculate linear decay", () => {
      const now = Date.now()
      const maxAgeMs = 5 * 60 * 1000

      expect(calculateRecencyScore(now - maxAgeMs * 0.5, now)).toBeCloseTo(
        0.5,
        2
      )
      expect(calculateRecencyScore(now - maxAgeMs * 0.25, now)).toBeCloseTo(
        0.75,
        2
      )
      expect(calculateRecencyScore(now - maxAgeMs * 0.75, now)).toBeCloseTo(
        0.25,
        2
      )
    })

    it("should handle edge cases", () => {
      const now = Date.now()
      expect(calculateRecencyScore(0, now)).toBe(0)
      expect(calculateRecencyScore(now, now)).toBe(1)
    })
  })

  describe("findBestMatchingCode", () => {
    const createCode = (overrides: Partial<StoredCode> = {}): StoredCode => ({
      code: "123456",
      timestamp: Date.now(),
      source: "Test",
      used: false,
      siteMatch: "example.com",
      ...overrides,
    })

    it("should return null for empty array", () => {
      expect(findBestMatchingCode([], "https://example.com", Date.now())).toBe(
        null
      )
    })

    it("should select code with matching domain", () => {
      const now = Date.now()
      const codes = [
        createCode({
          code: "111111",
          siteMatch: "other.com",
          timestamp: now,
        }),
        createCode({
          code: "222222",
          siteMatch: "example.com",
          timestamp: now,
        }),
      ]

      const result = findBestMatchingCode(codes, "https://example.com", now)
      expect(result?.code).toBe("222222")
    })

    it("should prefer recent codes over old codes", () => {
      const now = Date.now()
      const codes = [
        createCode({
          code: "OLD",
          timestamp: now - 4 * 60 * 1000,
          siteMatch: null,
        }),
        createCode({
          code: "NEW",
          timestamp: now,
          siteMatch: null,
        }),
      ]

      const result = findBestMatchingCode(codes, "https://example.com", now)
      expect(result?.code).toBe("NEW")
    })

    it("should penalize used codes", () => {
      const now = Date.now()
      const codes = [
        createCode({ code: "USED", used: true, timestamp: now }),
        createCode({ code: "UNUSED", used: false, timestamp: now }),
      ]

      const result = findBestMatchingCode(codes, "https://example.com", now)
      expect(result?.code).toBe("UNUSED")
    })

    it("should return null when all scores below threshold", () => {
      const now = Date.now()
      const codes = [
        createCode({
          code: "123456",
          timestamp: now - 10 * 60 * 1000, // Too old
          siteMatch: null,
        }),
      ]

      const result = findBestMatchingCode(codes, "https://example.com", now)
      expect(result).toBe(null)
    })

    it("should combine scoring factors correctly", () => {
      const now = Date.now()
      const codes = [
        // High recency, no domain match, used
        createCode({
          code: "A",
          timestamp: now,
          siteMatch: null,
          used: true,
        }),
        // Medium recency, domain match, unused
        createCode({
          code: "B",
          timestamp: now - 2 * 60 * 1000,
          siteMatch: "example.com",
          used: false,
        }),
        // Low recency, domain match, unused
        createCode({
          code: "C",
          timestamp: now - 4 * 60 * 1000,
          siteMatch: "example.com",
          used: false,
        }),
      ]

      const result = findBestMatchingCode(codes, "https://example.com", now)
      // Domain match (100) + medium recency (~20-30) should win
      expect(result?.code).toBe("B")
    })

    it("should handle subdomain matching", () => {
      const now = Date.now()
      const codes = [
        createCode({
          code: "111111",
          siteMatch: "www.example.com",
          timestamp: now,
        }),
      ]

      const result = findBestMatchingCode(
        codes,
        "https://mail.example.com",
        now
      )
      expect(result?.code).toBe("111111")
    })

    it("should handle codes without siteMatch", () => {
      const now = Date.now()
      const codes = [
        createCode({
          code: "123456",
          siteMatch: null,
          timestamp: now,
          used: false,
        }),
      ]

      const result = findBestMatchingCode(codes, "https://example.com", now)
      // Should still find it based on recency alone (50 points)
      expect(result?.code).toBe("123456")
    })

    it("should sort candidates by score descending", () => {
      const now = Date.now()
      const codes = [
        createCode({
          code: "LOW",
          timestamp: now - 4 * 60 * 1000,
          siteMatch: null,
        }),
        createCode({
          code: "HIGH",
          timestamp: now,
          siteMatch: "example.com",
        }),
        createCode({
          code: "MEDIUM",
          timestamp: now - 2 * 60 * 1000,
          siteMatch: null,
        }),
      ]

      const result = findBestMatchingCode(codes, "https://example.com", now)
      expect(result?.code).toBe("HIGH")
    })

    it("should handle multiple codes with same score", () => {
      const now = Date.now()
      const codes = [
        createCode({ code: "FIRST", timestamp: now, siteMatch: "example.com" }),
        createCode({
          code: "SECOND",
          timestamp: now,
          siteMatch: "example.com",
        }),
      ]

      const result = findBestMatchingCode(codes, "https://example.com", now)
      // Should return first one with highest score
      expect(result?.code).toBe("FIRST")
    })

    it("should handle invalid page URLs gracefully", () => {
      const now = Date.now()
      const codes = [createCode({ timestamp: now })]

      const result = findBestMatchingCode(codes, "not-a-url", now)
      // Should still work based on recency
      expect(result).not.toBe(null)
    })

    it("should prioritize domain match over recency", () => {
      const now = Date.now()
      const codes = [
        // Very recent but no domain match
        createCode({
          code: "RECENT",
          timestamp: now,
          siteMatch: "other.com",
        }),
        // Slightly older but has domain match
        createCode({
          code: "MATCHED",
          timestamp: now - 1 * 60 * 1000,
          siteMatch: "example.com",
        }),
      ]

      const result = findBestMatchingCode(codes, "https://example.com", now)
      // Domain match (100) should outweigh the recency difference (~8 points)
      expect(result?.code).toBe("MATCHED")
    })

    it("should handle edge case: all codes used and old", () => {
      const now = Date.now()
      const codes = [
        createCode({
          code: "123456",
          used: true,
          timestamp: now - 10 * 60 * 1000,
          siteMatch: null,
        }),
      ]

      const result = findBestMatchingCode(codes, "https://example.com", now)
      // Too old (>5 min) + used = no score, should be null
      expect(result).toBe(null)
    })

    it("should handle single code scenarios", () => {
      const now = Date.now()
      const codes = [createCode({ timestamp: now })]

      const result = findBestMatchingCode(codes, "https://example.com", now)
      expect(result?.code).toBe("123456")
    })

    it("should handle codes with same timestamp", () => {
      const now = Date.now()
      const codes = [
        createCode({ code: "A", timestamp: now }),
        createCode({ code: "B", timestamp: now }),
        createCode({ code: "C", timestamp: now }),
      ]

      const result = findBestMatchingCode(codes, "https://example.com", now)
      // Should return first one
      expect(result?.code).toBe("A")
    })

    it("should apply used penalty correctly", () => {
      const now = Date.now()
      const codes = [
        createCode({
          code: "USED_MATCHED",
          used: true,
          siteMatch: "example.com",
          timestamp: now,
        }),
        createCode({
          code: "UNUSED_UNMATCHED",
          used: false,
          siteMatch: null,
          timestamp: now,
        }),
      ]

      const result = findBestMatchingCode(codes, "https://example.com", now)
      // Used + domain match = 100 + 50 - 50 = 100
      // Unused + no match = 50
      // Used matched should still win
      expect(result?.code).toBe("USED_MATCHED")
    })

    it("should handle codes at threshold boundary", () => {
      const now = Date.now()
      // Create code that scores above threshold
      // Recency: 4.5min = 90% of 5min = 10% score = 0.1 * 50 = 5 points
      const codes = [
        createCode({
          code: "THRESHOLD",
          timestamp: now - 4.5 * 60 * 1000, // ~5 points from recency
          siteMatch: "example.com", // +100 points for domain match
          used: false,
        }),
      ]

      const result = findBestMatchingCode(codes, "https://example.com", now)
      expect(result?.code).toBe("THRESHOLD")
    })

    it("should reject codes just below threshold", () => {
      const now = Date.now()
      const codes = [
        createCode({
          code: "BELOW",
          timestamp: now - 4.9 * 60 * 1000, // ~9 points
          siteMatch: null,
          used: false,
        }),
      ]

      const result = findBestMatchingCode(codes, "https://example.com", now)
      expect(result).toBe(null)
    })
  })

  describe("Real-world scenarios", () => {
    it("should handle typical autofill scenario", () => {
      const now = Date.now()
      const codes = [
        {
          code: "123456",
          timestamp: now - 10000, // 10 seconds ago
          source: "Gmail",
          used: false,
          siteMatch: "example.com",
        },
        {
          code: "789012",
          timestamp: now - 60000, // 1 minute ago
          source: "Gmail",
          used: false,
          siteMatch: "other.com",
        },
      ]

      const result = findBestMatchingCode(codes, "https://example.com", now)
      expect(result?.code).toBe("123456")
    })

    it("should handle multiple recent codes from same domain", () => {
      const now = Date.now()
      const codes = [
        {
          code: "FIRST",
          timestamp: now - 5000,
          source: "Gmail",
          used: true,
          siteMatch: "example.com",
        },
        {
          code: "SECOND",
          timestamp: now - 2000,
          source: "Gmail",
          used: false,
          siteMatch: "example.com",
        },
      ]

      const result = findBestMatchingCode(codes, "https://example.com", now)
      expect(result?.code).toBe("SECOND")
    })

    it("should handle no recent codes scenario", () => {
      const now = Date.now()
      const codes = [
        {
          code: "123456",
          timestamp: now - 10 * 60 * 1000, // 10 minutes ago
          source: "Gmail",
          used: false,
          siteMatch: null, // No domain match
        },
      ]

      const result = findBestMatchingCode(codes, "https://example.com", now)
      // Too old (>5min) = 0 recency score, no domain match = null
      expect(result).toBe(null)
    })
  })
})
