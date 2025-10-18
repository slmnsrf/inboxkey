/**
 * Unit tests for lock-state module
 *
 * Tests all lock state management functionality including:
 * - Lock/unlock state persistence
 * - Salt storage and retrieval
 * - Timestamp tracking
 * - Data clearing and reset
 * - Edge cases and error handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  isLocked,
  setLocked,
  getLastUnlockedAt,
  setLastUnlockedAt,
  getSavedSalt,
  saveSalt,
  clearLockData,
} from '@/lib/crypto/lock-state'

describe('lock-state', () => {
  beforeEach(async () => {
    // Clear all storage before each test
    await chrome.storage.local.clear()
  })

  describe('isLocked()', () => {
    it('should return false when lock state is not set', async () => {
      const locked = await isLocked()
      expect(locked).toBe(false)
    })

    it('should return true when locked', async () => {
      await setLocked(true)
      const locked = await isLocked()
      expect(locked).toBe(true)
    })

    it('should return false when unlocked', async () => {
      await setLocked(false)
      const locked = await isLocked()
      expect(locked).toBe(false)
    })

    it('should return false for undefined state', async () => {
      await chrome.storage.local.set({ lockState: undefined })
      const locked = await isLocked()
      expect(locked).toBe(false)
    })

    it('should return false for null state', async () => {
      await chrome.storage.local.set({ lockState: null })
      const locked = await isLocked()
      expect(locked).toBe(false)
    })

    it('should handle storage errors gracefully', async () => {
      const spy = vi.spyOn(chrome.storage.local, 'get').mockRejectedValue(
        new Error('Storage error')
      )

      await expect(isLocked()).rejects.toThrow('Storage error')

      spy.mockRestore()
    })
  })

  describe('setLocked()', () => {
    it('should set locked state to true', async () => {
      await setLocked(true)

      const result = await chrome.storage.local.get('lockState')
      expect(result.lockState).toBe(true)
    })

    it('should set locked state to false', async () => {
      await setLocked(false)

      const result = await chrome.storage.local.get('lockState')
      expect(result.lockState).toBe(false)
    })

    it('should overwrite existing lock state', async () => {
      await setLocked(true)
      expect(await isLocked()).toBe(true)

      await setLocked(false)
      expect(await isLocked()).toBe(false)

      await setLocked(true)
      expect(await isLocked()).toBe(true)
    })

    it('should persist state across multiple calls', async () => {
      await setLocked(true)
      const locked1 = await isLocked()

      await setLocked(true)
      const locked2 = await isLocked()

      expect(locked1).toBe(true)
      expect(locked2).toBe(true)
    })

    it('should handle storage errors', async () => {
      const spy = vi.spyOn(chrome.storage.local, 'set').mockRejectedValue(
        new Error('Storage error')
      )

      await expect(setLocked(true)).rejects.toThrow('Storage error')

      spy.mockRestore()
    })
  })

  describe('getLastUnlockedAt()', () => {
    it('should return null when timestamp is not set', async () => {
      const timestamp = await getLastUnlockedAt()
      expect(timestamp).toBeNull()
    })

    it('should return saved timestamp', async () => {
      const now = Date.now()
      await setLastUnlockedAt(now)

      const timestamp = await getLastUnlockedAt()
      expect(timestamp).toBe(now)
    })

    it('should return null for undefined timestamp', async () => {
      await chrome.storage.local.set({ lastUnlockedAt: undefined })
      const timestamp = await getLastUnlockedAt()
      expect(timestamp).toBeNull()
    })

    it('should return null for null timestamp', async () => {
      await chrome.storage.local.set({ lastUnlockedAt: null })
      const timestamp = await getLastUnlockedAt()
      expect(timestamp).toBeNull()
    })

    it('should handle storage errors gracefully', async () => {
      const spy = vi.spyOn(chrome.storage.local, 'get').mockRejectedValue(
        new Error('Storage error')
      )

      await expect(getLastUnlockedAt()).rejects.toThrow('Storage error')

      spy.mockRestore()
    })
  })

  describe('setLastUnlockedAt()', () => {
    it('should save timestamp', async () => {
      const now = Date.now()
      await setLastUnlockedAt(now)

      const result = await chrome.storage.local.get('lastUnlockedAt')
      expect(result.lastUnlockedAt).toBe(now)
    })

    it('should update existing timestamp', async () => {
      const time1 = 1000000
      const time2 = 2000000

      await setLastUnlockedAt(time1)
      expect(await getLastUnlockedAt()).toBe(time1)

      await setLastUnlockedAt(time2)
      expect(await getLastUnlockedAt()).toBe(time2)
    })

    it('should handle zero timestamp', async () => {
      await setLastUnlockedAt(0)
      const timestamp = await getLastUnlockedAt()
      expect(timestamp).toBe(0)
    })

    it('should handle very large timestamps', async () => {
      const futureTime = Date.now() + 1000000000 // Far future
      await setLastUnlockedAt(futureTime)
      const timestamp = await getLastUnlockedAt()
      expect(timestamp).toBe(futureTime)
    })

    it('should handle storage errors', async () => {
      const spy = vi.spyOn(chrome.storage.local, 'set').mockRejectedValue(
        new Error('Storage error')
      )

      await expect(setLastUnlockedAt(Date.now())).rejects.toThrow('Storage error')

      spy.mockRestore()
    })
  })

  describe('getSavedSalt()', () => {
    it('should return null when salt is not saved', async () => {
      const salt = await getSavedSalt()
      expect(salt).toBeNull()
    })

    it('should return saved salt as Uint8Array', async () => {
      const originalSalt = new Uint8Array(32)
      for (let i = 0; i < 32; i++) {
        originalSalt[i] = i
      }

      await saveSalt(originalSalt)
      const retrievedSalt = await getSavedSalt()

      expect(retrievedSalt).not.toBeNull()
      expect(retrievedSalt).toBeInstanceOf(Uint8Array)
      expect(retrievedSalt).toEqual(originalSalt)
    })

    it('should handle salt stored as array', async () => {
      const saltArray = Array.from({ length: 32 }, (_, i) => i)
      await chrome.storage.local.set({ masterKeySalt: saltArray })

      const retrievedSalt = await getSavedSalt()

      expect(retrievedSalt).not.toBeNull()
      expect(retrievedSalt).toBeInstanceOf(Uint8Array)
      expect(Array.from(retrievedSalt!)).toEqual(saltArray)
    })

    it('should handle salt already as Uint8Array', async () => {
      const originalSalt = new Uint8Array(32)
      originalSalt.fill(42)

      await chrome.storage.local.set({ masterKeySalt: originalSalt })
      const retrievedSalt = await getSavedSalt()

      expect(retrievedSalt).not.toBeNull()
      expect(retrievedSalt).toBeInstanceOf(Uint8Array)
    })

    it('should return null for invalid salt data', async () => {
      await chrome.storage.local.set({ masterKeySalt: 'invalid-string' })
      const salt = await getSavedSalt()
      expect(salt).toBeNull()
    })

    it('should return null for empty object', async () => {
      await chrome.storage.local.set({ masterKeySalt: {} })
      const salt = await getSavedSalt()
      expect(salt).toBeNull()
    })

    it('should return null for number', async () => {
      await chrome.storage.local.set({ masterKeySalt: 12345 })
      const salt = await getSavedSalt()
      expect(salt).toBeNull()
    })

    it('should handle storage errors gracefully', async () => {
      const spy = vi.spyOn(chrome.storage.local, 'get').mockRejectedValue(
        new Error('Storage error')
      )

      await expect(getSavedSalt()).rejects.toThrow('Storage error')

      spy.mockRestore()
    })
  })

  describe('saveSalt()', () => {
    it('should save salt to storage', async () => {
      const salt = new Uint8Array(32)
      salt.fill(123)

      await saveSalt(salt)

      const result = await chrome.storage.local.get('masterKeySalt')
      expect(result.masterKeySalt).toBeDefined()
      expect(Array.isArray(result.masterKeySalt)).toBe(true)
      expect(result.masterKeySalt.length).toBe(32)
    })

    it('should convert Uint8Array to regular array for storage', async () => {
      const salt = new Uint8Array([1, 2, 3, 4, 5])
      await saveSalt(salt)

      const result = await chrome.storage.local.get('masterKeySalt')
      expect(result.masterKeySalt).toEqual([1, 2, 3, 4, 5])
    })

    it('should round-trip correctly', async () => {
      const originalSalt = new Uint8Array(32)
      for (let i = 0; i < 32; i++) {
        originalSalt[i] = (i * 7) % 256
      }

      await saveSalt(originalSalt)
      const retrievedSalt = await getSavedSalt()

      expect(retrievedSalt).toEqual(originalSalt)
    })

    it('should overwrite existing salt', async () => {
      const salt1 = new Uint8Array(32)
      salt1.fill(1)

      const salt2 = new Uint8Array(32)
      salt2.fill(2)

      await saveSalt(salt1)
      const retrieved1 = await getSavedSalt()
      expect(retrieved1![0]).toBe(1)

      await saveSalt(salt2)
      const retrieved2 = await getSavedSalt()
      expect(retrieved2![0]).toBe(2)
    })

    it('should handle empty Uint8Array', async () => {
      const emptySalt = new Uint8Array(0)
      await saveSalt(emptySalt)

      const retrieved = await getSavedSalt()
      expect(retrieved).toEqual(emptySalt)
    })

    it('should handle storage errors', async () => {
      const spy = vi.spyOn(chrome.storage.local, 'set').mockRejectedValue(
        new Error('Storage error')
      )

      const salt = new Uint8Array(32)
      await expect(saveSalt(salt)).rejects.toThrow('Storage error')

      spy.mockRestore()
    })
  })

  describe('clearLockData()', () => {
    it('should clear all lock-related data', async () => {
      // Set up lock data
      await setLocked(true)
      await setLastUnlockedAt(Date.now())
      await saveSalt(new Uint8Array(32))

      // Clear it all
      await clearLockData()

      // Verify everything is cleared
      const locked = await isLocked()
      const timestamp = await getLastUnlockedAt()
      const salt = await getSavedSalt()

      expect(locked).toBe(false)
      expect(timestamp).toBeNull()
      expect(salt).toBeNull()
    })

    it('should not affect other storage keys', async () => {
      // Set lock data
      await setLocked(true)
      await saveSalt(new Uint8Array(32))

      // Set unrelated data
      await chrome.storage.local.set({ otherKey: 'other-value' })

      // Clear lock data
      await clearLockData()

      // Verify lock data is cleared
      expect(await isLocked()).toBe(false)
      expect(await getSavedSalt()).toBeNull()

      // Verify other data is preserved
      const result = await chrome.storage.local.get('otherKey')
      expect(result.otherKey).toBe('other-value')
    })

    it('should be idempotent', async () => {
      await setLocked(true)
      await saveSalt(new Uint8Array(32))

      await clearLockData()
      await clearLockData() // Call again

      expect(await isLocked()).toBe(false)
      expect(await getSavedSalt()).toBeNull()
    })

    it('should handle already-cleared data', async () => {
      // Don't set any data, just try to clear
      await clearLockData()

      expect(await isLocked()).toBe(false)
      expect(await getSavedSalt()).toBeNull()
      expect(await getLastUnlockedAt()).toBeNull()
    })

    it('should handle storage errors', async () => {
      const spy = vi.spyOn(chrome.storage.local, 'remove').mockRejectedValue(
        new Error('Storage error')
      )

      await expect(clearLockData()).rejects.toThrow('Storage error')

      spy.mockRestore()
    })
  })

  describe('State Transitions', () => {
    it('should handle lock -> unlock transition', async () => {
      await setLocked(true)
      expect(await isLocked()).toBe(true)

      await setLocked(false)
      expect(await isLocked()).toBe(false)
    })

    it('should handle unlock -> lock transition', async () => {
      await setLocked(false)
      expect(await isLocked()).toBe(false)

      await setLocked(true)
      expect(await isLocked()).toBe(true)
    })

    it('should handle multiple transitions', async () => {
      const states = [true, false, true, false, true]

      for (const state of states) {
        await setLocked(state)
        expect(await isLocked()).toBe(state)
      }
    })
  })

  describe('State Persistence', () => {
    it('should persist lock state across operations', async () => {
      await setLocked(true)

      // Perform other operations
      await setLastUnlockedAt(Date.now())
      await saveSalt(new Uint8Array(32))

      // Lock state should still be true
      expect(await isLocked()).toBe(true)
    })

    it('should persist salt across operations', async () => {
      const originalSalt = new Uint8Array(32)
      originalSalt.fill(42)
      await saveSalt(originalSalt)

      // Perform other operations
      await setLocked(true)
      await setLastUnlockedAt(Date.now())

      // Salt should still be retrievable
      const retrievedSalt = await getSavedSalt()
      expect(retrievedSalt).toEqual(originalSalt)
    })

    it('should persist timestamp across operations', async () => {
      const timestamp = Date.now()
      await setLastUnlockedAt(timestamp)

      // Perform other operations
      await setLocked(false)
      await saveSalt(new Uint8Array(32))

      // Timestamp should still be retrievable
      expect(await getLastUnlockedAt()).toBe(timestamp)
    })
  })

  describe('Edge Cases', () => {
    it('should handle rapid state changes', async () => {
      for (let i = 0; i < 100; i++) {
        await setLocked(i % 2 === 0)
      }

      // Final state should be unlocked (99 % 2 === 1 is false, so last call was setLocked(false))
      expect(await isLocked()).toBe(false)
    })

    it('should handle concurrent operations', async () => {
      const operations = [
        setLocked(true),
        setLastUnlockedAt(Date.now()),
        saveSalt(new Uint8Array(32)),
      ]

      await Promise.all(operations)

      expect(await isLocked()).toBe(true)
      expect(await getLastUnlockedAt()).not.toBeNull()
      expect(await getSavedSalt()).not.toBeNull()
    })

    it('should handle very large salt arrays', async () => {
      const largeSalt = new Uint8Array(1024) // Much larger than needed
      for (let i = 0; i < 1024; i++) {
        largeSalt[i] = i % 256
      }

      await saveSalt(largeSalt)
      const retrieved = await getSavedSalt()

      expect(retrieved).toEqual(largeSalt)
    })

    it('should handle salt with all zeros', async () => {
      const zeroSalt = new Uint8Array(32)
      // Already filled with zeros by default

      await saveSalt(zeroSalt)
      const retrieved = await getSavedSalt()

      expect(retrieved).toEqual(zeroSalt)
    })

    it('should handle salt with all max values', async () => {
      const maxSalt = new Uint8Array(32)
      maxSalt.fill(255)

      await saveSalt(maxSalt)
      const retrieved = await getSavedSalt()

      expect(retrieved).toEqual(maxSalt)
    })
  })

  describe('Data Isolation', () => {
    it('should not interfere with other storage keys', async () => {
      // Set multiple unrelated keys
      await chrome.storage.local.set({
        userSettings: { theme: 'dark' },
        credentials: { email: 'test@example.com' },
        cache: { lastSync: Date.now() },
      })

      // Set lock data
      await setLocked(true)
      await saveSalt(new Uint8Array(32))
      await setLastUnlockedAt(Date.now())

      // Verify unrelated keys are still there
      const result = await chrome.storage.local.get([
        'userSettings',
        'credentials',
        'cache',
      ])

      expect(result.userSettings).toEqual({ theme: 'dark' })
      expect(result.credentials).toEqual({ email: 'test@example.com' })
      expect(result.cache.lastSync).toBeDefined()
    })

    it('should clear only lock data, not other data', async () => {
      // Set lock and non-lock data
      await setLocked(true)
      await saveSalt(new Uint8Array(32))
      await chrome.storage.local.set({ customData: 'preserve-me' })

      // Clear lock data
      await clearLockData()

      // Verify lock data is cleared
      expect(await isLocked()).toBe(false)
      expect(await getSavedSalt()).toBeNull()

      // Verify custom data is preserved
      const result = await chrome.storage.local.get('customData')
      expect(result.customData).toBe('preserve-me')
    })
  })
})
