/**
 * Unit tests for Code Fetcher module
 * Tests code matching algorithm and domain matching
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fetchBestCode } from '../../src/contents/code-fetcher'
import { findBestMatchingCode } from '../../src/lib/matching/code-matcher'
import type { StoredCode } from '../../src/lib/storage/schema'

describe('Code Fetcher', () => {
  describe('findBestMatchingCode()', () => {
    it('should return null for empty codes array', () => {
      const result = findBestMatchingCode([], 'https://example.com', Date.now())

      expect(result).toBeNull()
    })

    it('should prefer exact domain match', () => {
      const now = Date.now()
      const codes: StoredCode[] = [
        {
          code: '111111',
          timestamp: now - 1000,
          source: 'test@example.com',
          siteMatch: 'other.com',
          used: false,
        },
        {
          code: '222222',
          timestamp: now - 2000,
          source: 'test@example.com',
          siteMatch: 'example.com',
          used: false,
        },
      ]

      const result = findBestMatchingCode(codes, 'https://example.com', now)

      expect(result).not.toBeNull()
      expect(result?.code).toBe('222222')
    })

    it('should match subdomain to parent domain', () => {
      const now = Date.now()
      const codes: StoredCode[] = [
        {
          code: '123456',
          timestamp: now - 1000,
          source: 'test@example.com',
          siteMatch: 'example.com',
          used: false,
        },
      ]

      const result = findBestMatchingCode(codes, 'https://auth.example.com', now)

      expect(result).not.toBeNull()
      expect(result?.code).toBe('123456')
    })

    it('should prefer more recent codes', () => {
      const now = Date.now()
      const codes: StoredCode[] = [
        {
          code: '111111',
          timestamp: now - 10000, // 10 seconds ago
          siteMatch: 'example.com',
          used: false,
        },
        {
          code: '222222',
          timestamp: now - 1000, // 1 second ago
          siteMatch: 'example.com',
          used: false,
        },
      ]

      const result = findBestMatchingCode(codes, 'https://example.com', now)

      expect(result).not.toBeNull()
      expect(result?.code).toBe('222222')
    })

    it('should penalize used codes', () => {
      const now = Date.now()
      const codes: StoredCode[] = [
        {
          code: '111111',
          timestamp: now - 1000,
          source: 'test@example.com',
          siteMatch: 'example.com',
          used: true, // Already used
        },
        {
          code: '222222',
          timestamp: now - 2000, // Older but not used
          siteMatch: 'example.com',
          used: false,
        },
      ]

      const result = findBestMatchingCode(codes, 'https://example.com', now)

      expect(result).not.toBeNull()
      expect(result?.code).toBe('222222')
    })

    it('should reject codes older than 5 minutes', () => {
      const now = Date.now()
      const codes: StoredCode[] = [
        {
          code: '123456',
          timestamp: now - 6 * 60 * 1000, // 6 minutes ago
          siteMatch: 'example.com',
          used: false,
        },
      ]

      const result = findBestMatchingCode(codes, 'https://example.com', now)

      expect(result).toBeNull()
    })

    it('should handle codes with no siteMatch', () => {
      const now = Date.now()
      const codes: StoredCode[] = [
        {
          code: '123456',
          timestamp: now - 1000,
          source: 'test@example.com',
          siteMatch: undefined,
          used: false,
        },
      ]

      const result = findBestMatchingCode(codes, 'https://example.com', now)

      // Should still return the code based on recency
      expect(result).not.toBeNull()
      expect(result?.code).toBe('123456')
    })

    it('should return null if best score is below threshold', () => {
      const now = Date.now()
      const codes: StoredCode[] = [
        {
          code: '123456',
          timestamp: now - 10 * 60 * 1000, // 10 minutes ago (too old)
          siteMatch: 'different.com', // Wrong domain
          used: true, // Used
        },
      ]

      const result = findBestMatchingCode(codes, 'https://example.com', now)

      expect(result).toBeNull()
    })

    it('should handle multiple candidates and select best', () => {
      const now = Date.now()
      const codes: StoredCode[] = [
        {
          code: '111111',
          timestamp: now - 5000,
          source: 'test@example.com',
          siteMatch: 'other.com',
          used: false,
        },
        {
          code: '222222',
          timestamp: now - 3000,
          source: 'test@example.com',
          siteMatch: 'example.com',
          used: true, // Right domain but used
        },
        {
          code: '333333',
          timestamp: now - 1000,
          source: 'test@example.com',
          siteMatch: 'example.com',
          used: false, // Best match
        },
      ]

      const result = findBestMatchingCode(codes, 'https://example.com', now)

      expect(result).not.toBeNull()
      expect(result?.code).toBe('333333')
    })

    it('should handle case-insensitive domain matching', () => {
      const now = Date.now()
      const codes: StoredCode[] = [
        {
          code: '123456',
          timestamp: now - 1000,
          source: 'test@example.com',
          siteMatch: 'EXAMPLE.COM',
          used: false,
        },
      ]

      const result = findBestMatchingCode(codes, 'https://example.com', now)

      expect(result).not.toBeNull()
      expect(result?.code).toBe('123456')
    })

    it('should handle URLs with paths and query params', () => {
      const now = Date.now()
      const codes: StoredCode[] = [
        {
          code: '123456',
          timestamp: now - 1000,
          source: 'test@example.com',
          siteMatch: 'example.com',
          used: false,
        },
      ]

      const result = findBestMatchingCode(
        codes,
        'https://example.com/auth/verify?token=abc',
        now
      )

      expect(result).not.toBeNull()
      expect(result?.code).toBe('123456')
    })

    it('should prefer domain match over recency', () => {
      const now = Date.now()
      const codes: StoredCode[] = [
        {
          code: '111111',
          timestamp: now - 500, // More recent
          siteMatch: 'other.com',
          used: false,
        },
        {
          code: '222222',
          timestamp: now - 2000, // Less recent but right domain
          siteMatch: 'example.com',
          used: false,
        },
      ]

      const result = findBestMatchingCode(codes, 'https://example.com', now)

      expect(result).not.toBeNull()
      expect(result?.code).toBe('222222')
    })

    it('should handle www subdomain correctly', () => {
      const now = Date.now()
      const codes: StoredCode[] = [
        {
          code: '123456',
          timestamp: now - 1000,
          source: 'test@example.com',
          siteMatch: 'example.com',
          used: false,
        },
      ]

      const result = findBestMatchingCode(codes, 'https://www.example.com', now)

      expect(result).not.toBeNull()
      expect(result?.code).toBe('123456')
    })

    it('should calculate recency score correctly', () => {
      const now = Date.now()
      const codes: StoredCode[] = [
        {
          code: '111111',
          timestamp: now - 0, // Now
          siteMatch: 'example.com',
          used: false,
        },
        {
          code: '222222',
          timestamp: now - 2.5 * 60 * 1000, // 2.5 minutes ago (50% recency)
          siteMatch: 'example.com',
          used: false,
        },
      ]

      const result = findBestMatchingCode(codes, 'https://example.com', now)

      expect(result).not.toBeNull()
      expect(result?.code).toBe('111111') // Should prefer most recent
    })

    it('should handle future timestamps gracefully', () => {
      const now = Date.now()
      const codes: StoredCode[] = [
        {
          code: '123456',
          timestamp: now + 10000, // Future timestamp (clock skew)
          siteMatch: 'example.com',
          used: false,
        },
      ]

      const result = findBestMatchingCode(codes, 'https://example.com', now)

      // Should either reject or handle gracefully (score = 0 for future)
      expect(result).toBeNull()
    })
  })

  describe('fetchBestCode()', () => {
    beforeEach(() => {
      // Mock chrome.runtime.sendMessage
      global.chrome = {
        runtime: {
          sendMessage: vi.fn(),
        },
      } as any
    })

    it('should fetch codes and return best match', async () => {
      const now = Date.now()
      const mockCodes: StoredCode[] = [
        {
          code: '123456',
          timestamp: now - 1000,
          source: 'test@example.com',
          siteMatch: 'example.com',
          used: false,
        },
      ]

      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
        codes: mockCodes,
      })

      const result = await fetchBestCode('https://example.com', 1)

      expect(result).toBe('123456')
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'FETCH_CODE',
        url: 'https://example.com',
        timestamp: expect.any(Number),
          source: 'test@example.com',
        pollNumber: 1,
      })
    })

    it('should return null when no codes available', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
        codes: [],
      })

      const result = await fetchBestCode('https://example.com', 1)

      expect(result).toBeNull()
    })

    it('should return null on error', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
        error: 'Extension is locked',
        codes: [],
      })

      const result = await fetchBestCode('https://example.com', 1)

      expect(result).toBeNull()
    })

    it('should handle chrome.runtime.sendMessage rejection', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockRejectedValue(
        new Error('Connection error')
      )

      await expect(fetchBestCode('https://example.com', 1)).rejects.toThrow(
        'Connection error'
      )
    })

    it('should pass poll number to background', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
        codes: [],
      })

      await fetchBestCode('https://example.com', 5)

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          pollNumber: 5,
        })
      )
    })

    it('should select best code from multiple results', async () => {
      const now = Date.now()
      const mockCodes: StoredCode[] = [
        {
          code: '111111',
          timestamp: now - 5000,
          source: 'test@example.com',
          siteMatch: 'other.com',
          used: false,
        },
        {
          code: '222222',
          timestamp: now - 1000,
          source: 'test@example.com',
          siteMatch: 'example.com',
          used: false,
        },
      ]

      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
        codes: mockCodes,
      })

      const result = await fetchBestCode('https://example.com', 1)

      expect(result).toBe('222222')
    })
  })

  describe('Domain matching logic', () => {
    it('should match exact domain', () => {
      const now = Date.now()
      const codes: StoredCode[] = [
        {
          code: '123456',
          timestamp: now - 1000,
          source: 'test@example.com',
          siteMatch: 'example.com',
          used: false,
        },
      ]

      const result = findBestMatchingCode(codes, 'https://example.com', now)

      expect(result).not.toBeNull()
    })

    it('should match subdomain to parent', () => {
      const now = Date.now()
      const codes: StoredCode[] = [
        {
          code: '123456',
          timestamp: now - 1000,
          source: 'test@example.com',
          siteMatch: 'example.com',
          used: false,
        },
      ]

      const result = findBestMatchingCode(codes, 'https://auth.example.com', now)

      expect(result).not.toBeNull()
    })

    it('should not match different TLD', () => {
      const now = Date.now()
      const codes: StoredCode[] = [
        {
          code: '123456',
          timestamp: now - 1000,
          source: 'test@example.com',
          siteMatch: 'example.com',
          used: false,
        },
      ]

      const result = findBestMatchingCode(codes, 'https://example.org', now)

      expect(result).toBeNull()
    })

    it('should not match different domain', () => {
      const now = Date.now()
      const codes: StoredCode[] = [
        {
          code: '123456',
          timestamp: now - 1000,
          source: 'test@example.com',
          siteMatch: 'example.com',
          used: false,
        },
      ]

      const result = findBestMatchingCode(codes, 'https://other.com', now)

      expect(result).toBeNull()
    })

    it('should handle multi-level subdomains', () => {
      const now = Date.now()
      const codes: StoredCode[] = [
        {
          code: '123456',
          timestamp: now - 1000,
          source: 'test@example.com',
          siteMatch: 'example.com',
          used: false,
        },
      ]

      const result = findBestMatchingCode(
        codes,
        'https://auth.api.example.com',
        now
      )

      expect(result).not.toBeNull()
    })

    it('should handle country-code TLDs', () => {
      const now = Date.now()
      const codes: StoredCode[] = [
        {
          code: '123456',
          timestamp: now - 1000,
          source: 'test@example.com',
          siteMatch: 'example.co.uk',
          used: false,
        },
      ]

      const result = findBestMatchingCode(codes, 'https://auth.example.co.uk', now)

      expect(result).not.toBeNull()
    })
  })

  describe('Scoring algorithm', () => {
    it('should give 100 points for domain match', () => {
      const now = Date.now()
      const codes: StoredCode[] = [
        {
          code: '111111',
          timestamp: now - 1000,
          source: 'test@example.com',
          siteMatch: 'example.com', // +100 points
          used: false,
        },
        {
          code: '222222',
          timestamp: now - 500, // +~50 points for recency
          siteMatch: undefined,
          used: false,
        },
      ]

      const result = findBestMatchingCode(codes, 'https://example.com', now)

      expect(result?.code).toBe('111111') // Domain match wins
    })

    it('should give up to 50 points for recency', () => {
      const now = Date.now()
      const codes: StoredCode[] = [
        {
          code: '111111',
          timestamp: now - 0, // 50 points (max recency)
          siteMatch: undefined,
          used: false,
        },
        {
          code: '222222',
          timestamp: now - 5 * 60 * 1000, // 0 points (too old)
          siteMatch: undefined,
          used: false,
        },
      ]

      const result = findBestMatchingCode(codes, 'https://example.com', now)

      expect(result?.code).toBe('111111')
    })

    it('should subtract 50 points for used codes', () => {
      const now = Date.now()
      const codes: StoredCode[] = [
        {
          code: '111111',
          timestamp: now - 1000,
          source: 'test@example.com',
          siteMatch: 'example.com', // +100 points
          used: true, // -50 points = 50 total
        },
        {
          code: '222222',
          timestamp: now - 1000,
          source: 'test@example.com',
          siteMatch: undefined, // +~50 points for recency
          used: false, // 50 total
        },
      ]

      const result = findBestMatchingCode(codes, 'https://example.com', now)

      // Both have similar scores, but unused should win slightly
      expect(result?.code).toBe('111111') // Domain match still slightly wins
    })

    it('should require minimum score of 10', () => {
      const now = Date.now()
      const codes: StoredCode[] = [
        {
          code: '123456',
          timestamp: now - 6 * 60 * 1000, // 0 points (too old)
          siteMatch: 'other.com', // 0 points (wrong domain)
          used: false,
        },
      ]

      const result = findBestMatchingCode(codes, 'https://example.com', now)

      expect(result).toBeNull()
    })
  })
})
