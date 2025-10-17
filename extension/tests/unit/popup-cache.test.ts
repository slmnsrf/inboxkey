/**
 * Unit Tests for PopupCacheManager
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PopupCacheManager } from '../../src/background/popup-cache'
import type { StoredCode } from '../../src/lib/storage/schema'
import type { PopupCache } from '../../src/shared/popup-messages'

// Mock chrome.storage.session
const mockStorage = new Map<string, any>()

global.chrome = {
  storage: {
    session: {
      get: vi.fn((keys: string | string[]) => {
        const keyArray = typeof keys === 'string' ? [keys] : keys
        const result: Record<string, any> = {}
        keyArray.forEach((key) => {
          if (mockStorage.has(key)) {
            result[key] = mockStorage.get(key)
          }
        })
        return Promise.resolve(result)
      }),
      set: vi.fn((items: Record<string, any>) => {
        Object.entries(items).forEach(([key, value]) => {
          mockStorage.set(key, value)
        })
        return Promise.resolve()
      }),
    },
  },
} as any

describe('PopupCacheManager', () => {
  let cacheManager: PopupCacheManager

  beforeEach(() => {
    mockStorage.clear()
    cacheManager = new PopupCacheManager()
  })

  describe('initialize', () => {
    it('should initialize with empty cache when storage is empty', async () => {
      await cacheManager.initialize()
      const cache = await cacheManager.getCache()

      expect(cache).toEqual({
        codes: [],
        magicLinks: [],
        lastSync: 0,
        mailboxCount: 0,
      })
    })

    it('should restore cache from storage', async () => {
      const existingCache: PopupCache = {
        codes: [
          {
            code: '123456',
            source: 'test@example.com - Subject',
            receivedAt: Date.now(),
          },
        ],
        magicLinks: [],
        lastSync: Date.now(),
        mailboxCount: 1,
      }

      mockStorage.set('inboxkey.popup_cache', existingCache)

      await cacheManager.initialize()
      const cache = await cacheManager.getCache()

      expect(cache).toEqual(existingCache)
    })
  })

  describe('getCache', () => {
    it('should return warm cache if available', async () => {
      await cacheManager.initialize()
      const cache1 = await cacheManager.getCache()
      const cache2 = await cacheManager.getCache()

      // Should be the same object reference (warm cache)
      expect(cache1).toBe(cache2)
    })

    it('should read from storage on cold start', async () => {
      const existingCache: PopupCache = {
        codes: [
          {
            code: '999999',
            source: 'cold@example.com',
            receivedAt: Date.now(),
          },
        ],
        magicLinks: [],
        lastSync: Date.now(),
        mailboxCount: 1,
      }

      mockStorage.set('inboxkey.popup_cache', existingCache)

      // Don't initialize, simulate cold start
      const cache = await cacheManager.getCache()

      expect(cache.codes[0].code).toBe('999999')
    })
  })

  describe('updateWithNewCodes', () => {
    it('should add new verification codes to cache', async () => {
      await cacheManager.initialize()

      const storedCodes: StoredCode[] = [
        {
          code: '123456',
          timestamp: Date.now(),
          source: 'test@example.com - Verification',
          used: false,
        },
        {
          code: '789012',
          timestamp: Date.now() - 1000,
          source: 'test@example.com - Login',
          used: false,
        },
      ]

      await cacheManager.updateWithNewCodes(storedCodes, 1)

      const cache = await cacheManager.getCache()

      expect(cache.codes).toHaveLength(2)
      expect(cache.codes[0].code).toBe('123456')
      expect(cache.codes[1].code).toBe('789012')
      expect(cache.mailboxCount).toBe(1)
      expect(cache.lastSync).toBeGreaterThan(0)
    })

    it('should keep only last 5 codes', async () => {
      await cacheManager.initialize()

      const storedCodes: StoredCode[] = Array.from({ length: 7 }, (_, i) => ({
        code: `CODE${i}`,
        timestamp: Date.now() - i * 1000,
        source: `source${i}`,
        used: false,
      }))

      await cacheManager.updateWithNewCodes(storedCodes, 1)

      const cache = await cacheManager.getCache()

      expect(cache.codes).toHaveLength(5)
      expect(cache.codes[0].code).toBe('CODE0')
      expect(cache.codes[4].code).toBe('CODE4')
    })

    it('should not add duplicate codes', async () => {
      await cacheManager.initialize()

      const storedCodes: StoredCode[] = [
        {
          code: '123456',
          timestamp: Date.now(),
          source: 'test@example.com',
          used: false,
        },
      ]

      await cacheManager.updateWithNewCodes(storedCodes, 1)
      await cacheManager.updateWithNewCodes(storedCodes, 1) // Add again

      const cache = await cacheManager.getCache()

      expect(cache.codes).toHaveLength(1)
    })

    it('should extract magic links from codes with magic-link prefix', async () => {
      await cacheManager.initialize()

      const storedCodes: StoredCode[] = [
        {
          code: 'magic-link:https://example.com/verify?token=abc123',
          timestamp: Date.now(),
          source: 'test@example.com - Verify Email',
          used: false,
          siteMatch: 'example.com',
        },
        {
          code: 'magic-link:https://example.com/reset?token=xyz789',
          timestamp: Date.now() - 1000,
          source: 'test@example.com - Reset Password',
          used: false,
          siteMatch: 'example.com',
        },
      ]

      await cacheManager.updateWithNewCodes(storedCodes, 1)

      const cache = await cacheManager.getCache()

      expect(cache.codes).toHaveLength(0) // Magic links not in codes
      expect(cache.magicLinks).toHaveLength(2)
      expect(cache.magicLinks[0].url).toBe(
        'https://example.com/verify?token=abc123'
      )
      expect(cache.magicLinks[0].type).toBe('verify')
      expect(cache.magicLinks[1].url).toBe(
        'https://example.com/reset?token=xyz789'
      )
      expect(cache.magicLinks[1].type).toBe('reset')
    })

    it('should keep only last 3 magic links', async () => {
      await cacheManager.initialize()

      const storedCodes: StoredCode[] = Array.from({ length: 5 }, (_, i) => ({
        code: `magic-link:https://example.com/link${i}`,
        timestamp: Date.now() - i * 1000,
        source: `source${i}`,
        used: false,
      }))

      await cacheManager.updateWithNewCodes(storedCodes, 1)

      const cache = await cacheManager.getCache()

      expect(cache.magicLinks).toHaveLength(3)
      expect(cache.magicLinks[0].url).toContain('link0')
      expect(cache.magicLinks[2].url).toContain('link2')
    })

    it('should determine magic link type from URL patterns', async () => {
      await cacheManager.initialize()

      const storedCodes: StoredCode[] = [
        {
          code: 'magic-link:https://example.com/login?token=1',
          timestamp: Date.now(),
          source: 'login',
          used: false,
        },
        {
          code: 'magic-link:https://example.com/verify?token=2',
          timestamp: Date.now(),
          source: 'verify',
          used: false,
        },
        {
          code: 'magic-link:https://example.com/reset?token=3',
          timestamp: Date.now(),
          source: 'reset',
          used: false,
        },
        {
          code: 'magic-link:https://example.com/confirm?token=4',
          timestamp: Date.now(),
          source: 'confirm',
          used: false,
        },
        {
          code: 'magic-link:https://example.com/password?token=5',
          timestamp: Date.now(),
          source: 'password',
          used: false,
        },
      ]

      await cacheManager.updateWithNewCodes(storedCodes, 1)

      const cache = await cacheManager.getCache()

      expect(cache.magicLinks[0].type).toBe('login')
      expect(cache.magicLinks[1].type).toBe('verify')
      expect(cache.magicLinks[2].type).toBe('reset')
    })

    it('should not add duplicate magic links', async () => {
      await cacheManager.initialize()

      const storedCodes: StoredCode[] = [
        {
          code: 'magic-link:https://example.com/verify?token=abc',
          timestamp: Date.now(),
          source: 'test@example.com',
          used: false,
        },
      ]

      await cacheManager.updateWithNewCodes(storedCodes, 1)
      await cacheManager.updateWithNewCodes(storedCodes, 1) // Add again

      const cache = await cacheManager.getCache()

      expect(cache.magicLinks).toHaveLength(1)
    })

    it('should handle mixed codes and magic links', async () => {
      await cacheManager.initialize()

      const storedCodes: StoredCode[] = [
        {
          code: '123456',
          timestamp: Date.now(),
          source: 'regular code',
          used: false,
        },
        {
          code: 'magic-link:https://example.com/verify',
          timestamp: Date.now(),
          source: 'magic link',
          used: false,
        },
        {
          code: '789012',
          timestamp: Date.now(),
          source: 'another code',
          used: false,
        },
      ]

      await cacheManager.updateWithNewCodes(storedCodes, 1)

      const cache = await cacheManager.getCache()

      expect(cache.codes).toHaveLength(2)
      expect(cache.magicLinks).toHaveLength(1)
    })

    it('should preserve usedAt timestamp from stored codes', async () => {
      await cacheManager.initialize()

      const timestamp = Date.now()
      const storedCodes: StoredCode[] = [
        {
          code: '123456',
          timestamp,
          source: 'test',
          used: true,
        },
      ]

      await cacheManager.updateWithNewCodes(storedCodes, 1)

      const cache = await cacheManager.getCache()

      expect(cache.codes[0].usedAt).toBe(timestamp)
    })
  })

  describe('markCodeUsed', () => {
    it('should mark code as used', async () => {
      await cacheManager.initialize()

      const storedCodes: StoredCode[] = [
        {
          code: '123456',
          timestamp: Date.now(),
          source: 'test',
          used: false,
        },
      ]

      await cacheManager.updateWithNewCodes(storedCodes, 1)
      await cacheManager.markCodeUsed('123456')

      const cache = await cacheManager.getCache()

      expect(cache.codes[0].usedAt).toBeGreaterThan(0)
    })

    it('should do nothing if code not found', async () => {
      await cacheManager.initialize()

      await cacheManager.markCodeUsed('NONEXISTENT')

      const cache = await cacheManager.getCache()

      expect(cache.codes).toHaveLength(0)
    })

    it('should persist changes to storage', async () => {
      await cacheManager.initialize()

      const storedCodes: StoredCode[] = [
        {
          code: '123456',
          timestamp: Date.now(),
          source: 'test',
          used: false,
        },
      ]

      await cacheManager.updateWithNewCodes(storedCodes, 1)
      await cacheManager.markCodeUsed('123456')

      // Verify it was saved to storage
      const savedCache = mockStorage.get('inboxkey.popup_cache')
      expect(savedCache.codes[0].usedAt).toBeGreaterThan(0)
    })
  })

  describe('markLinkOpened', () => {
    it('should mark magic link as opened', async () => {
      await cacheManager.initialize()

      const storedCodes: StoredCode[] = [
        {
          code: 'magic-link:https://example.com/verify',
          timestamp: Date.now(),
          source: 'test',
          used: false,
        },
      ]

      await cacheManager.updateWithNewCodes(storedCodes, 1)
      await cacheManager.markLinkOpened('https://example.com/verify')

      const cache = await cacheManager.getCache()

      expect(cache.magicLinks[0].openedAt).toBeGreaterThan(0)
    })

    it('should do nothing if link not found', async () => {
      await cacheManager.initialize()

      await cacheManager.markLinkOpened('https://nonexistent.com/verify')

      const cache = await cacheManager.getCache()

      expect(cache.magicLinks).toHaveLength(0)
    })

    it('should persist changes to storage', async () => {
      await cacheManager.initialize()

      const storedCodes: StoredCode[] = [
        {
          code: 'magic-link:https://example.com/verify',
          timestamp: Date.now(),
          source: 'test',
          used: false,
        },
      ]

      await cacheManager.updateWithNewCodes(storedCodes, 1)
      await cacheManager.markLinkOpened('https://example.com/verify')

      // Verify it was saved to storage
      const savedCache = mockStorage.get('inboxkey.popup_cache')
      expect(savedCache.magicLinks[0].openedAt).toBeGreaterThan(0)
    })
  })

  describe('warmCache', () => {
    it('should preload cache with recent codes', async () => {
      await cacheManager.initialize()

      const recentCodes: StoredCode[] = [
        {
          code: '111111',
          timestamp: Date.now(),
          source: 'warm',
          used: false,
        },
        {
          code: '222222',
          timestamp: Date.now() - 1000,
          source: 'warm2',
          used: false,
        },
      ]

      await cacheManager.warmCache(recentCodes, 2)

      const cache = await cacheManager.getCache()

      expect(cache.codes).toHaveLength(2)
      expect(cache.mailboxCount).toBe(2)
    })
  })

  describe('cache persistence', () => {
    it('should persist cache to chrome.storage.session', async () => {
      await cacheManager.initialize()

      const storedCodes: StoredCode[] = [
        {
          code: '123456',
          timestamp: Date.now(),
          source: 'test',
          used: false,
        },
      ]

      await cacheManager.updateWithNewCodes(storedCodes, 1)

      const savedCache = mockStorage.get('inboxkey.popup_cache')

      expect(savedCache).toBeDefined()
      expect(savedCache.codes).toHaveLength(1)
      expect(savedCache.codes[0].code).toBe('123456')
    })

    it('should survive service worker restart', async () => {
      // First instance
      const manager1 = new PopupCacheManager()
      await manager1.initialize()

      const storedCodes: StoredCode[] = [
        {
          code: 'PERSISTENT',
          timestamp: Date.now(),
          source: 'test',
          used: false,
        },
      ]

      await manager1.updateWithNewCodes(storedCodes, 1)

      // Simulate service worker restart - create new instance
      const manager2 = new PopupCacheManager()
      await manager2.initialize()

      const cache = await manager2.getCache()

      expect(cache.codes).toHaveLength(1)
      expect(cache.codes[0].code).toBe('PERSISTENT')
    })
  })

  describe('Real-world scenarios', () => {
    it('should handle typical email polling update', async () => {
      await cacheManager.initialize()

      const firstBatch: StoredCode[] = [
        {
          code: '123456',
          timestamp: Date.now(),
          source: 'gmail:user@gmail.com - GitHub verification',
          used: false,
          siteMatch: 'github.com',
        },
      ]

      await cacheManager.updateWithNewCodes(firstBatch, 1)

      const secondBatch: StoredCode[] = [
        {
          code: '789012',
          timestamp: Date.now(),
          source: 'gmail:user@gmail.com - Twitter login',
          used: false,
          siteMatch: 'twitter.com',
        },
      ]

      await cacheManager.updateWithNewCodes(secondBatch, 1)

      const cache = await cacheManager.getCache()

      expect(cache.codes).toHaveLength(2)
      expect(cache.codes[0].code).toBe('789012') // Most recent first
      expect(cache.codes[1].code).toBe('123456')
    })

    it('should handle popup copy-to-clipboard workflow', async () => {
      await cacheManager.initialize()

      const storedCodes: StoredCode[] = [
        {
          code: '123456',
          timestamp: Date.now(),
          source: 'test',
          used: false,
        },
      ]

      await cacheManager.updateWithNewCodes(storedCodes, 1)

      // User copies code from popup
      await cacheManager.markCodeUsed('123456')

      const cache = await cacheManager.getCache()

      expect(cache.codes[0].usedAt).toBeDefined()
    })

    it('should handle edge case: empty update', async () => {
      await cacheManager.initialize()

      await cacheManager.updateWithNewCodes([], 0)

      const cache = await cacheManager.getCache()

      expect(cache.codes).toHaveLength(0)
      expect(cache.magicLinks).toHaveLength(0)
      expect(cache.mailboxCount).toBe(0)
    })
  })
})
