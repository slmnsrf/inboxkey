/**
 * Unit Tests for PopupMessageHandler
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PopupMessageHandler } from '../../src/background/popup-handler'
import { PopupCacheManager } from '../../src/background/popup-cache'
import { KeyManager } from '../../src/lib/crypto/key-manager'
import type { PopupRequest, PopupCache } from '../../src/shared/popup-messages'

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

describe('PopupMessageHandler', () => {
  let handler: PopupMessageHandler
  let cacheManager: PopupCacheManager
  let keyManager: KeyManager

  beforeEach(() => {
    mockStorage.clear()
    cacheManager = new PopupCacheManager()
    keyManager = KeyManager.getInstance()
    handler = new PopupMessageHandler(cacheManager, keyManager)
  })

  describe('GET_POPUP_DATA', () => {
    it('should return empty cache initially', async () => {
      await cacheManager.initialize()

      const request: PopupRequest = { type: 'GET_POPUP_DATA' }
      const response = await handler.handleMessage(request)

      expect(response.success).toBe(true)
      if (response.success && 'data' in response) {
        expect(response.data.codes).toEqual([])
        expect(response.data.magicLinks).toEqual([])
        expect(response.data.lastSync).toBe(0)
        expect(response.data.mailboxCount).toBe(0)
      }
    })

    it('should return cached data', async () => {
      await cacheManager.initialize()

      const mockCache: PopupCache = {
        codes: [
          {
            code: '123456',
            source: 'test@example.com',
            receivedAt: Date.now(),
          },
        ],
        magicLinks: [
          {
            url: 'https://example.com/verify',
            type: 'verify',
            source: 'test@example.com',
            receivedAt: Date.now(),
          },
        ],
        lastSync: Date.now(),
        mailboxCount: 1,
      }

      mockStorage.set('inboxkey.popup_cache', mockCache)
      await cacheManager.initialize()

      const request: PopupRequest = { type: 'GET_POPUP_DATA' }
      const response = await handler.handleMessage(request)

      expect(response.success).toBe(true)
      if (response.success && 'data' in response) {
        expect(response.data.codes).toHaveLength(1)
        expect(response.data.codes[0].code).toBe('123456')
        expect(response.data.magicLinks).toHaveLength(1)
        expect(response.data.magicLinks[0].url).toBe(
          'https://example.com/verify'
        )
      }
    })

    it('should respond quickly (<50ms)', async () => {
      await cacheManager.initialize()

      // Pre-warm cache
      const mockCache: PopupCache = {
        codes: Array.from({ length: 5 }, (_, i) => ({
          code: `CODE${i}`,
          source: `source${i}`,
          receivedAt: Date.now(),
        })),
        magicLinks: [],
        lastSync: Date.now(),
        mailboxCount: 1,
      }

      mockStorage.set('inboxkey.popup_cache', mockCache)
      await cacheManager.initialize()

      const request: PopupRequest = { type: 'GET_POPUP_DATA' }
      const start = Date.now()
      await handler.handleMessage(request)
      const elapsed = Date.now() - start

      // Should be very fast with warm cache
      expect(elapsed).toBeLessThan(50)
    })
  })

  describe('GET_LOCK_STATUS', () => {
    it('should return unlocked status when extension is not initialized', async () => {
      // Extension not initialized (no password set) - should be unlocked
      vi.spyOn(keyManager, 'isInitialized').mockResolvedValue(false)

      const request: PopupRequest = { type: 'GET_LOCK_STATUS' }
      const response = await handler.handleMessage(request)

      expect(response.success).toBe(true)
      if (response.success && 'locked' in response) {
        expect(response.locked).toBe(false)
      }
    })

    it('should return locked status when initialized but KeyManager is locked', async () => {
      // Extension initialized (password set) but locked
      vi.spyOn(keyManager, 'isInitialized').mockResolvedValue(true)
      vi.spyOn(keyManager, 'isUnlocked').mockReturnValue(false)

      const request: PopupRequest = { type: 'GET_LOCK_STATUS' }
      const response = await handler.handleMessage(request)

      expect(response.success).toBe(true)
      if (response.success && 'locked' in response) {
        expect(response.locked).toBe(true)
      }
    })

    it('should return unlocked status when initialized and KeyManager is unlocked', async () => {
      // Extension initialized and unlocked
      vi.spyOn(keyManager, 'isInitialized').mockResolvedValue(true)
      vi.spyOn(keyManager, 'isUnlocked').mockReturnValue(true)

      const request: PopupRequest = { type: 'GET_LOCK_STATUS' }
      const response = await handler.handleMessage(request)

      expect(response.success).toBe(true)
      if (response.success && 'locked' in response) {
        expect(response.locked).toBe(false)
      }
    })
  })

  describe('MARK_CODE_USED', () => {
    it('should mark code as used', async () => {
      await cacheManager.initialize()

      // Add a code to cache
      await cacheManager.updateWithNewCodes(
        [
          {
            code: '123456',
            timestamp: Date.now(),
            source: 'test',
            used: false,
          },
        ],
        1
      )

      const request: PopupRequest = { type: 'MARK_CODE_USED', code: '123456' }
      const response = await handler.handleMessage(request)

      expect(response.success).toBe(true)
      if (response.success && 'data' in response) {
        const code = response.data.codes.find((c) => c.code === '123456')
        expect(code?.usedAt).toBeDefined()
        expect(code?.usedAt).toBeGreaterThan(0)
      }
    })

    it('should handle marking non-existent code gracefully', async () => {
      await cacheManager.initialize()

      const request: PopupRequest = {
        type: 'MARK_CODE_USED',
        code: 'NONEXISTENT',
      }
      const response = await handler.handleMessage(request)

      expect(response.success).toBe(true)
    })

    it('should return updated cache after marking', async () => {
      await cacheManager.initialize()

      await cacheManager.updateWithNewCodes(
        [
          {
            code: '111111',
            timestamp: Date.now(),
            source: 'test1',
            used: false,
          },
          {
            code: '222222',
            timestamp: Date.now(),
            source: 'test2',
            used: false,
          },
        ],
        1
      )

      const request: PopupRequest = { type: 'MARK_CODE_USED', code: '111111' }
      const response = await handler.handleMessage(request)

      expect(response.success).toBe(true)
      if (response.success && 'data' in response) {
        expect(response.data.codes).toHaveLength(2)
        const marked = response.data.codes.find((c) => c.code === '111111')
        const unmarked = response.data.codes.find((c) => c.code === '222222')
        expect(marked?.usedAt).toBeDefined()
        expect(unmarked?.usedAt).toBeUndefined()
      }
    })
  })

  describe('MARK_LINK_OPENED', () => {
    it('should mark magic link as opened', async () => {
      await cacheManager.initialize()

      // Add a magic link to cache
      await cacheManager.updateWithNewCodes(
        [
          {
            code: 'magic-link:https://example.com/verify',
            timestamp: Date.now(),
            source: 'test',
            used: false,
          },
        ],
        1
      )

      const request: PopupRequest = {
        type: 'MARK_LINK_OPENED',
        url: 'https://example.com/verify',
      }
      const response = await handler.handleMessage(request)

      expect(response.success).toBe(true)
      if (response.success && 'data' in response) {
        const link = response.data.magicLinks.find(
          (l) => l.url === 'https://example.com/verify'
        )
        expect(link?.openedAt).toBeDefined()
        expect(link?.openedAt).toBeGreaterThan(0)
      }
    })

    it('should handle marking non-existent link gracefully', async () => {
      await cacheManager.initialize()

      const request: PopupRequest = {
        type: 'MARK_LINK_OPENED',
        url: 'https://nonexistent.com/verify',
      }
      const response = await handler.handleMessage(request)

      expect(response.success).toBe(true)
    })

    it('should return updated cache after marking', async () => {
      await cacheManager.initialize()

      await cacheManager.updateWithNewCodes(
        [
          {
            code: 'magic-link:https://example.com/link1',
            timestamp: Date.now(),
            source: 'test1',
            used: false,
          },
          {
            code: 'magic-link:https://example.com/link2',
            timestamp: Date.now(),
            source: 'test2',
            used: false,
          },
        ],
        1
      )

      const request: PopupRequest = {
        type: 'MARK_LINK_OPENED',
        url: 'https://example.com/link1',
      }
      const response = await handler.handleMessage(request)

      expect(response.success).toBe(true)
      if (response.success && 'data' in response) {
        expect(response.data.magicLinks).toHaveLength(2)
        const opened = response.data.magicLinks.find(
          (l) => l.url === 'https://example.com/link1'
        )
        const unopened = response.data.magicLinks.find(
          (l) => l.url === 'https://example.com/link2'
        )
        expect(opened?.openedAt).toBeDefined()
        expect(unopened?.openedAt).toBeUndefined()
      }
    })
  })

  describe('TRIGGER_SYNC', () => {
    it('should return error for unimplemented feature', async () => {
      const request: PopupRequest = { type: 'TRIGGER_SYNC' }
      const response = await handler.handleMessage(request)

      expect(response.success).toBe(false)
      if (!response.success) {
        expect(response.error).toContain('not yet implemented')
      }
    })
  })

  describe('Error Handling', () => {
    it('should handle errors gracefully', async () => {
      // Mock cacheManager.getCache to throw error
      vi.spyOn(cacheManager, 'getCache').mockRejectedValue(
        new Error('Storage error')
      )

      const request: PopupRequest = { type: 'GET_POPUP_DATA' }
      const response = await handler.handleMessage(request)

      expect(response.success).toBe(false)
      if (!response.success) {
        expect(response.error).toBe('Storage error')
      }
    })

    it('should handle non-Error exceptions', async () => {
      vi.spyOn(cacheManager, 'getCache').mockRejectedValue('String error')

      const request: PopupRequest = { type: 'GET_POPUP_DATA' }
      const response = await handler.handleMessage(request)

      expect(response.success).toBe(false)
      if (!response.success) {
        expect(response.error).toBe('String error')
      }
    })
  })

  describe('Real-world scenarios', () => {
    it('should handle popup opening and fetching data', async () => {
      await cacheManager.initialize()

      // Simulate populated cache
      await cacheManager.updateWithNewCodes(
        [
          {
            code: '123456',
            timestamp: Date.now() - 30000, // 30 seconds ago
            source: 'gmail:user@gmail.com - GitHub',
            used: false,
            siteMatch: 'github.com',
          },
          {
            code: '789012',
            timestamp: Date.now() - 60000, // 1 minute ago
            source: 'gmail:user@gmail.com - Twitter',
            used: false,
            siteMatch: 'twitter.com',
          },
        ],
        1
      )

      const request: PopupRequest = { type: 'GET_POPUP_DATA' }
      const response = await handler.handleMessage(request)

      expect(response.success).toBe(true)
      if (response.success && 'data' in response) {
        expect(response.data.codes).toHaveLength(2)
        expect(response.data.mailboxCount).toBe(1)
      }
    })

    it('should handle user clicking copy button in popup', async () => {
      await cacheManager.initialize()

      await cacheManager.updateWithNewCodes(
        [
          {
            code: '123456',
            timestamp: Date.now(),
            source: 'test',
            used: false,
          },
        ],
        1
      )

      // User clicks copy
      const markRequest: PopupRequest = {
        type: 'MARK_CODE_USED',
        code: '123456',
      }
      const markResponse = await handler.handleMessage(markRequest)

      expect(markResponse.success).toBe(true)

      // Popup refreshes data
      const getRequest: PopupRequest = { type: 'GET_POPUP_DATA' }
      const getResponse = await handler.handleMessage(getRequest)

      expect(getResponse.success).toBe(true)
      if (getResponse.success && 'data' in getResponse) {
        expect(getResponse.data.codes[0].usedAt).toBeDefined()
      }
    })

    it('should handle checking lock status before showing codes', async () => {
      // Mock as not initialized (no password set) - should be unlocked
      vi.spyOn(keyManager, 'isInitialized').mockResolvedValue(false)

      // Check lock status first
      const lockRequest: PopupRequest = { type: 'GET_LOCK_STATUS' }
      const lockResponse = await handler.handleMessage(lockRequest)

      expect(lockResponse.success).toBe(true)

      // If unlocked, fetch data
      if (lockResponse.success && 'locked' in lockResponse) {
        if (!lockResponse.locked) {
          const dataRequest: PopupRequest = { type: 'GET_POPUP_DATA' }
          const dataResponse = await handler.handleMessage(dataRequest)
          expect(dataResponse.success).toBe(true)
        }
      }
    })

    it('should handle multiple rapid requests', async () => {
      await cacheManager.initialize()

      await cacheManager.updateWithNewCodes(
        [
          {
            code: '123456',
            timestamp: Date.now(),
            source: 'test',
            used: false,
          },
        ],
        1
      )

      // Simulate multiple popup tabs or rapid clicks
      const requests = Array.from({ length: 10 }, () => ({
        type: 'GET_POPUP_DATA' as const,
      }))

      const responses = await Promise.all(
        requests.map((req) => handler.handleMessage(req))
      )

      responses.forEach((response) => {
        expect(response.success).toBe(true)
      })
    })
  })

  describe('Type Safety', () => {
    it('should handle all PopupRequest types', async () => {
      await cacheManager.initialize()

      const requests: PopupRequest[] = [
        { type: 'GET_POPUP_DATA' },
        { type: 'GET_LOCK_STATUS' },
        { type: 'TRIGGER_SYNC' },
        { type: 'MARK_CODE_USED', code: '123456' },
        { type: 'MARK_LINK_OPENED', url: 'https://example.com' },
      ]

      for (const request of requests) {
        const response = await handler.handleMessage(request)
        // Should not throw type errors
        expect(response).toBeDefined()
        expect(typeof response.success).toBe('boolean')
      }
    })
  })
})
