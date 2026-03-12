/**
 * Unit Tests for PopupCacheManager
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PopupCacheManager } from '../../src/background/popup-cache'
import type { StoredCode } from '../../src/lib/storage/schema'

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
        items: [],
        codes: [],
        magicLinks: [],
        lastSync: 0,
        mailboxCount: 0,
      })
    })

    it('should restore cache from storage', async () => {
      const now = Date.now()
      // Store an internal cache with items[] (new format)
      const existingCache = {
        items: [
          {
            kind: 'code' as const,
            id: 'gmail:unknown:' + now,
            providerId: 'gmail' as const,
            source: 'test@example.com - Subject',
            receivedAt: now,
            score: 0.65,
            code: '123456',
            len: 6,
          },
        ],
        lastSync: now,
        mailboxCount: 1,
        ts: now,
      }

      mockStorage.set('inboxkey.popup_cache', existingCache)

      await cacheManager.initialize()
      const cache = await cacheManager.getCache()

      // Items restored from storage, legacy arrays derived
      expect(cache.items).toHaveLength(1)
      expect(cache.codes).toHaveLength(1)
      expect(cache.codes[0].code).toBe('123456')
      expect(cache.lastSync).toBe(now)
      expect(cache.mailboxCount).toBe(1)
    })
  })

  describe('getCache', () => {
    it('should return warm cache if available', async () => {
      await cacheManager.initialize()
      const cache1 = await cacheManager.getCache()
      const cache2 = await cacheManager.getCache()

      // getCache() now derives legacy arrays on each call, so object identity differs
      // but the data should be deeply equal
      expect(cache1).toStrictEqual(cache2)
    })

    it('should read from storage on cold start', async () => {
      const now = Date.now()
      // Store internal cache format (items-first)
      const existingCache = {
        items: [
          {
            kind: 'code' as const,
            id: 'gmail:unknown:' + now,
            providerId: 'gmail' as const,
            source: 'cold@example.com',
            receivedAt: now,
            score: 0.65,
            code: '999999',
            len: 6,
          },
        ],
        lastSync: now,
        mailboxCount: 1,
        ts: now,
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
          code: 'magic-link:https://example.com/login?token=xyz789',
          timestamp: Date.now() - 1000,
          source: 'test@example.com - Login Link',
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
        'https://example.com/login?token=xyz789'
      )
      expect(cache.magicLinks[1].type).toBe('login')
    })

    it('should keep only MAX_ITEMS magic links in unified cache', async () => {
      await cacheManager.initialize()

      const storedCodes: StoredCode[] = Array.from({ length: 5 }, (_, i) => ({
        code: `magic-link:https://example.com/link${i}`,
        timestamp: Date.now() - i * 1000,
        source: `source${i}`,
        used: false,
      }))

      await cacheManager.updateWithNewCodes(storedCodes, 1)

      const cache = await cacheManager.getCache()

      // V2 uses MAX_ITEMS=5 for unified list (codes + links combined)
      expect(cache.magicLinks).toHaveLength(5)
      expect(cache.magicLinks[0].url).toContain('link0')
      expect(cache.magicLinks[4].url).toContain('link4')
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
          code: 'magic-link:https://example.com/confirm?token=4',
          timestamp: Date.now(),
          source: 'confirm',
          used: false,
        },
      ]

      await cacheManager.updateWithNewCodes(storedCodes, 1)

      const cache = await cacheManager.getCache()

      // V2 filters out 'reset' type links (HIDDEN_LINK_TYPES)
      // /confirm maps to 'verify' type
      expect(cache.magicLinks).toHaveLength(3)
      expect(cache.magicLinks[0].type).toBe('login')
      expect(cache.magicLinks[1].type).toBe('verify')
      expect(cache.magicLinks[2].type).toBe('verify') // /confirm -> verify
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

      // Verify it was saved to storage (internal format: items[], not codes[])
      const savedCache = mockStorage.get('inboxkey.popup_cache')
      expect(savedCache.items[0].usedAt).toBeGreaterThan(0)
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

      // Verify it was saved to storage (internal format: items[], not magicLinks[])
      const savedCache = mockStorage.get('inboxkey.popup_cache')
      const linkItem = savedCache.items.find((i: any) => i.kind === 'link')
      expect(linkItem.openedAt).toBeGreaterThan(0)
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

      // Internal storage uses items-first format
      const savedCache = mockStorage.get('inboxkey.popup_cache')

      expect(savedCache).toBeDefined()
      expect(savedCache.items).toHaveLength(1)
      expect(savedCache.items[0].code).toBe('123456')
      // Legacy arrays not stored in internal format
      expect(savedCache.codes).toBeUndefined()
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

      // V2 pipeline replaces the cache on each call (processes the full
      // stored codes list from storage, not incremental batches).
      // Pass both codes in a single update to verify they are processed.
      // Place the most recent code first in input so priority sort
      // keeps it first (both codes have equal priority scores within
      // the same recency bracket).
      const allCodes: StoredCode[] = [
        {
          code: '789012',
          timestamp: Date.now(),
          source: 'gmail:user@gmail.com - Twitter login',
          used: false,
          siteMatch: 'twitter.com',
        },
        {
          code: '123456',
          timestamp: Date.now() - 1000,
          source: 'gmail:user@gmail.com - GitHub verification',
          used: false,
          siteMatch: 'github.com',
        },
      ]

      await cacheManager.updateWithNewCodes(allCodes, 1)

      const cache = await cacheManager.getCache()

      expect(cache.codes).toHaveLength(2)
      expect(cache.codes[0].code).toBe('789012') // Most recent first (input order preserved at equal priority)
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

  describe('items-first cache semantics', () => {
    it('getCache should derive legacy codes from items', async () => {
      const manager = new PopupCacheManager()
      await manager.updateWithNewCodes([
        {
          code: '123456',
          timestamp: Date.now(),
          source: 'test@example.com - Test',
          used: false,
          mailboxId: 'mbx-1',
        },
      ], 1)

      const cache = await manager.getCache()
      expect(cache.items.length).toBe(1)
      expect(cache.items[0].kind).toBe('code')
      expect(cache.codes.length).toBe(1)
      expect(cache.codes[0].code).toBe('123456')
    })

    it('markCodeUsed should update items, visible via getCache', async () => {
      const manager = new PopupCacheManager()
      await manager.updateWithNewCodes([
        {
          code: 'ABC123',
          timestamp: Date.now(),
          source: 'test@example.com - Test',
          used: false,
          mailboxId: 'mbx-1',
        },
      ], 1)

      await manager.markCodeUsed('ABC123')
      const cache = await manager.getCache()
      const item = cache.items.find(i => i.kind === 'code' && (i as any).code === 'ABC123')
      expect(item?.usedAt).toBeDefined()
      expect(cache.codes[0].usedAt).toBeDefined()
    })

    it('markLinkOpened should update items, visible via getCache', async () => {
      const manager = new PopupCacheManager()
      await manager.updateWithNewCodes([
        {
          code: 'magic-link:https://example.com/login/abc',
          timestamp: Date.now(),
          source: 'test@example.com - Login',
          used: false,
          mailboxId: 'mbx-1',
        },
      ], 1)

      await manager.markLinkOpened('https://example.com/login/abc')
      const cache = await manager.getCache()
      const item = cache.items.find(i => i.kind === 'link')
      expect(item?.openedAt).toBeDefined()
      expect(cache.magicLinks[0].openedAt).toBeDefined()
    })

    it('markCodesSeen should set seenAt on all items', async () => {
      const manager = new PopupCacheManager()
      await manager.updateWithNewCodes([
        { code: '111', timestamp: Date.now(), source: 'a', used: false, mailboxId: 'mbx-1' },
        { code: '222', timestamp: Date.now(), source: 'b', used: false, mailboxId: 'mbx-1' },
      ], 1)

      await manager.markCodesSeen()
      const cache = await manager.getCache()
      for (const item of cache.items) {
        expect(item.seenAt).toBeDefined()
      }
      for (const code of cache.codes) {
        expect(code.seenAt).toBeDefined()
      }
    })

    it('internal storage should not contain legacy codes/magicLinks arrays', async () => {
      const manager = new PopupCacheManager()
      await manager.updateWithNewCodes([
        {
          code: '123456',
          timestamp: Date.now(),
          source: 'test@example.com - Test',
          used: false,
          mailboxId: 'mbx-1',
        },
        {
          code: 'magic-link:https://example.com/verify?token=abc',
          timestamp: Date.now(),
          source: 'test@example.com - Verify',
          used: false,
          mailboxId: 'mbx-1',
        },
      ], 1)

      // Check what was persisted to storage
      const savedCache = mockStorage.get('inboxkey.popup_cache')
      expect(savedCache.items).toBeDefined()
      expect(savedCache.items.length).toBe(2)
      // Internal storage should NOT have legacy arrays
      expect(savedCache.codes).toBeUndefined()
      expect(savedCache.magicLinks).toBeUndefined()
    })

    it('markCodesSeen should not save if no items need updating', async () => {
      const manager = new PopupCacheManager()
      await manager.updateWithNewCodes([
        { code: '111', timestamp: Date.now(), source: 'a', used: false, mailboxId: 'mbx-1' },
      ], 1)

      // Mark seen once
      await manager.markCodesSeen()
      const setCallCount = (chrome.storage.session.set as any).mock.calls.length

      // Mark seen again (should be a no-op)
      await manager.markCodesSeen()
      const newSetCallCount = (chrome.storage.session.set as any).mock.calls.length
      expect(newSetCallCount).toBe(setCallCount) // No additional save
    })

    it('markCodeUsed should persist usedAt to storage on items', async () => {
      const manager = new PopupCacheManager()
      await manager.updateWithNewCodes([
        {
          code: 'PERSIST1',
          timestamp: Date.now(),
          source: 'test',
          used: false,
          mailboxId: 'mbx-1',
        },
      ], 1)

      await manager.markCodeUsed('PERSIST1')

      // Verify internal storage has usedAt on items
      const savedCache = mockStorage.get('inboxkey.popup_cache')
      expect(savedCache.items[0].usedAt).toBeGreaterThan(0)
      // No legacy codes array in storage
      expect(savedCache.codes).toBeUndefined()
    })
  })
})
