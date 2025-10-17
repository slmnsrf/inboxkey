/**
 * Integration tests for KeyManager
 *
 * Tests complete workflows including:
 * - Full initialize → lock → unlock flow
 * - Auto-lock timeout in real scenarios
 * - Activity-based timer resets
 * - Password change flow
 * - Extension reset
 * - Storage persistence across sessions
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { KeyManager } from "@/lib/crypto/key-manager"
import {
  getSavedSalt,
  clearLockData,
  isLocked,
  getLastUnlockedAt,
} from "@/lib/crypto/lock-state"
import { encrypt, decrypt } from "@/lib/crypto/encryption"

describe("KeyManager Integration", () => {
  beforeEach(async () => {
    // Reset singleton instance
    KeyManager.resetInstance()

    // Clear all storage
    await chrome.storage.local.clear()
    await chrome.storage.session.clear()
    await clearLockData()

    // Clear timers
    vi.clearAllTimers()
  })

  afterEach(() => {
    vi.clearAllTimers()
  })

  describe("Complete Flow: Initialize → Lock → Unlock", () => {
    it("should complete full lock/unlock cycle", async () => {
      const keyManager = KeyManager.getInstance()
      const password = "secure-password-123"

      // Step 1: Initialize
      console.log("[Test] Step 1: Initialize")
      const { salt } = await keyManager.initialize(password)

      expect(keyManager.isUnlocked()).toBe(true)
      expect(await isLocked()).toBe(false)

      const unlockedAt1 = await getLastUnlockedAt()
      expect(unlockedAt1).not.toBeNull()

      // Step 2: Lock
      console.log("[Test] Step 2: Lock")
      keyManager.lock()

      expect(keyManager.isUnlocked()).toBe(false)
      expect(await isLocked()).toBe(true)
      expect(keyManager.getMasterKey()).toBeNull()
      expect(keyManager.getSalt()).toBeNull()

      // Salt should still be in storage
      const savedSalt = await getSavedSalt()
      expect(savedSalt).not.toBeNull()
      expect(savedSalt).toEqual(salt)

      // Step 3: Unlock
      console.log("[Test] Step 3: Unlock")
      const unlocked = await keyManager.unlock(password, salt)

      expect(unlocked).toBe(true)
      expect(keyManager.isUnlocked()).toBe(true)
      expect(await isLocked()).toBe(false)
      expect(keyManager.getMasterKey()).not.toBeNull()
      expect(keyManager.getSalt()).not.toBeNull()

      const unlockedAt2 = await getLastUnlockedAt()
      expect(unlockedAt2).not.toBeNull()
      expect(unlockedAt2).toBeGreaterThan(unlockedAt1!)
    })

    it("should persist salt across sessions", async () => {
      const password = "secure-password-123"

      // Session 1: Initialize
      const keyManager1 = KeyManager.getInstance()
      const { salt } = await keyManager1.initialize(password)
      keyManager1.lock()

      // Simulate new session (new KeyManager instance)
      KeyManager.resetInstance()
      const keyManager2 = KeyManager.getInstance()

      // Load salt from storage
      const savedSalt = await getSavedSalt()
      expect(savedSalt).not.toBeNull()
      expect(savedSalt).toEqual(salt)

      // Should be able to unlock with saved salt
      const unlocked = await keyManager2.unlock(password, savedSalt!)
      expect(unlocked).toBe(true)
    })

    it("should fail to unlock with wrong password", async () => {
      const correctPassword = "secure-password-123"
      const wrongPassword = "wrong-password-456"

      const keyManager = KeyManager.getInstance()
      const { salt } = await keyManager.initialize(correctPassword)

      keyManager.lock()

      const unlocked = await keyManager.unlock(wrongPassword, salt)
      expect(unlocked).toBe(false)
      expect(keyManager.isUnlocked()).toBe(false)
    })
  })

  describe("Data Encryption Integration", () => {
    it("should encrypt and decrypt data with master key", async () => {
      const keyManager = KeyManager.getInstance()
      const password = "secure-password-123"

      await keyManager.initialize(password)

      const masterKey = keyManager.getMasterKey()
      const salt = keyManager.getSalt()

      expect(masterKey).not.toBeNull()
      expect(salt).not.toBeNull()

      // Encrypt some data
      const plaintext = JSON.stringify({
        emails: ["user@example.com"],
        tokens: { access: "secret123" },
      })

      const encrypted = await encrypt(plaintext, masterKey!, salt!)

      // Decrypt data
      const decrypted = await decrypt(encrypted, masterKey!)

      expect(decrypted).toBe(plaintext)
    })

    it("should not be able to decrypt after lock", async () => {
      const keyManager = KeyManager.getInstance()
      const password = "secure-password-123"

      await keyManager.initialize(password)

      const masterKey = keyManager.getMasterKey()
      const salt = keyManager.getSalt()

      // Encrypt data
      const plaintext = "sensitive data"
      const encrypted = await encrypt(plaintext, masterKey!, salt!)

      // Lock (clears key from memory)
      keyManager.lock()

      // Cannot decrypt without key
      expect(keyManager.getMasterKey()).toBeNull()

      // Would need to unlock first to decrypt
      await keyManager.unlock(password, salt!)
      const newKey = keyManager.getMasterKey()

      const decrypted = await decrypt(encrypted, newKey!)
      expect(decrypted).toBe(plaintext)
    })

    it("should maintain data integrity across lock/unlock cycles", async () => {
      const keyManager = KeyManager.getInstance()
      const password = "secure-password-123"

      const { salt } = await keyManager.initialize(password)

      // Encrypt multiple pieces of data
      const data = [
        "sensitive-data-1",
        "sensitive-data-2",
        "sensitive-data-3",
      ]

      const masterKey1 = keyManager.getMasterKey()!
      const encrypted = await Promise.all(
        data.map((d) => encrypt(d, masterKey1, salt))
      )

      // Lock and unlock multiple times
      for (let i = 0; i < 5; i++) {
        keyManager.lock()
        await keyManager.unlock(password, salt)
      }

      // Decrypt and verify all data
      const masterKey2 = keyManager.getMasterKey()!
      const decrypted = await Promise.all(
        encrypted.map((e) => decrypt(e, masterKey2))
      )

      expect(decrypted).toEqual(data)
    })
  })

  describe("Auto-Lock with Real Timers", () => {
    it("should auto-lock after timeout expires", async () => {
      vi.useFakeTimers()

      const keyManager = KeyManager.getInstance()
      await keyManager.initialize("test-password-123")

      keyManager.setAutoLockTimeout(5) // 5 minutes

      expect(keyManager.isUnlocked()).toBe(true)

      // Advance time by 4 minutes and 59 seconds
      vi.advanceTimersByTime(4 * 60 * 1000 + 59 * 1000)
      expect(keyManager.isUnlocked()).toBe(true)

      // Advance time by 1 more second
      vi.advanceTimersByTime(1000)
      expect(keyManager.isUnlocked()).toBe(false)

      vi.useRealTimers()
    })

    it("should reset timer on activity", async () => {
      vi.useFakeTimers()

      const keyManager = KeyManager.getInstance()
      await keyManager.initialize("test-password-123")

      keyManager.setAutoLockTimeout(10) // 10 minutes

      // Wait 7 minutes
      vi.advanceTimersByTime(7 * 60 * 1000)
      expect(keyManager.isUnlocked()).toBe(true)

      // Simulate user activity (reset timer)
      keyManager.resetAutoLockTimer()

      // Wait another 7 minutes (14 minutes total, but timer was reset at 7)
      vi.advanceTimersByTime(7 * 60 * 1000)
      expect(keyManager.isUnlocked()).toBe(true)

      // Wait 3 more minutes (10 minutes after reset)
      vi.advanceTimersByTime(3 * 60 * 1000)
      expect(keyManager.isUnlocked()).toBe(false)

      vi.useRealTimers()
    })

    it("should handle multiple activity resets", async () => {
      vi.useFakeTimers()

      const keyManager = KeyManager.getInstance()
      await keyManager.initialize("test-password-123")

      keyManager.setAutoLockTimeout(5) // 5 minutes

      // Simulate activity every 3 minutes
      for (let i = 0; i < 10; i++) {
        vi.advanceTimersByTime(3 * 60 * 1000)
        expect(keyManager.isUnlocked()).toBe(true)
        keyManager.resetAutoLockTimer()
      }

      // Total time passed: 30 minutes, but should still be unlocked
      expect(keyManager.isUnlocked()).toBe(true)

      // Now wait without activity
      vi.advanceTimersByTime(5 * 60 * 1000)
      expect(keyManager.isUnlocked()).toBe(false)

      vi.useRealTimers()
    })
  })

  describe("Password Change Flow", () => {
    it("should handle password change correctly", async () => {
      const keyManager = KeyManager.getInstance()
      const oldPassword = "old-password-123"
      const newPassword = "new-password-456"

      // Initialize with old password
      const { salt: oldSalt } = await keyManager.initialize(oldPassword)

      // Encrypt some data with old password
      const oldKey = keyManager.getMasterKey()!
      const plaintext = "important data"
      // Note: encrypted variable is intentionally unused - demonstrates data loss on password change
      // In production, you would decrypt with old key and re-encrypt with new key
      await encrypt(plaintext, oldKey, oldSalt)

      // Change password (re-initialize)
      const { salt: newSalt } = await keyManager.initialize(newPassword)

      expect(newSalt).not.toEqual(oldSalt)

      // Old password should not work
      keyManager.lock()
      const unlockedWithOld = await keyManager.unlock(oldPassword, newSalt)
      expect(unlockedWithOld).toBe(false)

      // New password should work
      const unlockedWithNew = await keyManager.unlock(newPassword, newSalt)
      expect(unlockedWithNew).toBe(true)

      // Note: Old encrypted data cannot be decrypted with new key
      // In practice, app would need to decrypt all data with old key
      // and re-encrypt with new key during password change
    })
  })

  describe("Extension Reset", () => {
    it("should clear all data on reset", async () => {
      const keyManager = KeyManager.getInstance()
      await keyManager.initialize("test-password-123")

      // Verify data exists
      expect(await getSavedSalt()).not.toBeNull()
      expect(keyManager.isUnlocked()).toBe(true)

      // Reset (clear all data)
      keyManager.lock()
      await clearLockData()

      // Verify data cleared
      expect(await getSavedSalt()).toBeNull()
      expect(await isLocked()).toBe(false)

      // Should be able to initialize again
      const { salt } = await keyManager.initialize("new-password-456")
      expect(salt).toBeInstanceOf(Uint8Array)
    })
  })

  describe("Storage Persistence", () => {
    it("should maintain salt across KeyManager instances", async () => {
      const password = "test-password-123"

      // Create first instance and initialize
      const km1 = KeyManager.getInstance()
      const { salt } = await km1.initialize(password)

      // Get saved salt
      const savedSalt = await getSavedSalt()
      expect(savedSalt).toEqual(salt)

      // Lock and reset instance
      km1.lock()
      KeyManager.resetInstance()

      // Create new instance
      const km2 = KeyManager.getInstance()

      // Should be able to unlock with saved salt
      const unlocked = await km2.unlock(password, savedSalt!)
      expect(unlocked).toBe(true)
    })

    it("should update lastUnlockedAt timestamp", async () => {
      const keyManager = KeyManager.getInstance()
      const password = "test-password-123"

      // Initialize
      const { salt } = await keyManager.initialize(password)
      const timestamp1 = await getLastUnlockedAt()

      expect(timestamp1).not.toBeNull()

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 10))

      // Lock and unlock
      keyManager.lock()
      await keyManager.unlock(password, salt)

      const timestamp2 = await getLastUnlockedAt()
      expect(timestamp2).not.toBeNull()
      expect(timestamp2!).toBeGreaterThan(timestamp1!)
    })
  })

  describe("Concurrent Operations", () => {
    it("should handle concurrent lock/unlock from different contexts", async () => {
      const password = "test-password-123"

      // Initialize
      const km1 = KeyManager.getInstance()
      const { salt } = await km1.initialize(password)

      // Lock
      km1.lock()

      // Simulate two contexts trying to unlock simultaneously
      const unlock1 = km1.unlock(password, salt)
      const unlock2 = km1.unlock(password, salt)

      const results = await Promise.allSettled([unlock1, unlock2])

      // One should succeed, one should fail with "already in progress"
      const succeeded = results.filter((r) => r.status === "fulfilled")
      const failed = results.filter((r) => r.status === "rejected")

      expect(succeeded.length).toBe(1)
      expect(failed.length).toBe(1)
    })

    it("should handle lock called during unlock", async () => {
      const password = "test-password-123"

      const keyManager = KeyManager.getInstance()
      const { salt } = await keyManager.initialize(password)

      keyManager.lock()

      // Start unlock
      const unlockPromise = keyManager.unlock(password, salt)

      // Lock immediately (before unlock completes)
      keyManager.lock()

      // Unlock should still complete
      const unlocked = await unlockPromise
      expect(unlocked).toBe(true)

      // But state might be locked if lock() was called after unlock completed
      // This is a race condition, but lock() should win
    })
  })

  describe("Error Recovery", () => {
    it("should recover from failed unlock attempt", async () => {
      const correctPassword = "correct-password-123"
      const wrongPassword = "wrong-password-456"

      const keyManager = KeyManager.getInstance()
      const { salt } = await keyManager.initialize(correctPassword)

      keyManager.lock()

      // Try with wrong password
      const unlocked1 = await keyManager.unlock(wrongPassword, salt)
      expect(unlocked1).toBe(false)
      expect(keyManager.isUnlocked()).toBe(false)

      // Try with correct password
      const unlocked2 = await keyManager.unlock(correctPassword, salt)
      expect(unlocked2).toBe(true)
      expect(keyManager.isUnlocked()).toBe(true)
    })

    it("should handle corrupted verification data", async () => {
      const keyManager = KeyManager.getInstance()
      await keyManager.initialize("test-password-123")

      // Corrupt verification data
      await chrome.storage.local.set({
        keyVerification: {
          ciphertext: "corrupted",
          iv: "corrupted",
          salt: "corrupted",
        },
      })

      const salt = keyManager.getSalt()!
      keyManager.lock()

      // Should fail to unlock (verification will fail)
      const unlocked = await keyManager.unlock("test-password-123", salt)
      expect(unlocked).toBe(false)
    })
  })

  describe("Real-World Scenarios", () => {
    it("should handle typical user session", async () => {
      vi.useFakeTimers()

      const keyManager = KeyManager.getInstance()
      const password = "user-password-123"

      // User sets up lock
      const { salt } = await keyManager.initialize(password)
      keyManager.setAutoLockTimeout(15) // 15 minutes

      // User performs activities over 30 minutes (6 activity periods)
      for (let i = 0; i < 6; i++) {
        vi.advanceTimersByTime(5 * 60 * 1000) // 5 minutes
        expect(keyManager.isUnlocked()).toBe(true)

        // User activity resets timer
        keyManager.resetAutoLockTimer()
      }

      // User goes idle for 15 minutes
      vi.advanceTimersByTime(15 * 60 * 1000)

      // Should auto-lock
      expect(keyManager.isUnlocked()).toBe(false)

      // User comes back and unlocks
      const unlocked = await keyManager.unlock(password, salt)
      expect(unlocked).toBe(true)

      vi.useRealTimers()
    })

    it("should handle browser restart", async () => {
      const password = "test-password-123"

      // Session 1: Initialize and use extension
      const km1 = KeyManager.getInstance()
      const { salt } = await km1.initialize(password)

      // Encrypt some data
      const key1 = km1.getMasterKey()!
      const encrypted = await encrypt("my data", key1, salt)

      // Browser closes (simulate by locking and resetting instance)
      km1.lock()
      KeyManager.resetInstance()

      // Browser reopens (new session)
      const km2 = KeyManager.getInstance()

      // Extension is locked (key not in memory)
      expect(km2.isUnlocked()).toBe(false)

      // Load salt from storage
      const savedSalt = await getSavedSalt()
      expect(savedSalt).not.toBeNull()

      // User unlocks
      const unlocked = await km2.unlock(password, savedSalt!)
      expect(unlocked).toBe(true)

      // Can decrypt old data
      const key2 = km2.getMasterKey()!
      const decrypted = await decrypt(encrypted, key2)
      expect(decrypted).toBe("my data")
    })
  })
})
