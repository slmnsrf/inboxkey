/**
 * Unit tests for KeyManager
 *
 * Tests all key manager functionality including:
 * - Initialization and unlock flows
 * - Lock/unlock state management
 * - Auto-lock timer functionality
 * - Password verification
 * - Error handling
 * - Singleton pattern
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { KeyManager, MIN_PASSWORD_LENGTH } from "@/lib/crypto/key-manager"
import { KeyDerivationError, LockError } from "@/lib/crypto/errors"
import { getSavedSalt, clearLockData } from "@/lib/crypto/lock-state"

describe("KeyManager", () => {
  let keyManager: KeyManager

  beforeEach(async () => {
    // Reset singleton instance before each test
    KeyManager.resetInstance()
    keyManager = KeyManager.getInstance()

    // Clear all storage
    await chrome.storage.local.clear()
    await chrome.storage.session.clear()

    // Clear lock data
    await clearLockData()

    // Clear all timers
    vi.clearAllTimers()
  })

  afterEach(() => {
    // Clean up any remaining timers
    vi.clearAllTimers()
  })

  describe("Singleton Pattern", () => {
    it("should return the same instance on multiple calls", () => {
      const instance1 = KeyManager.getInstance()
      const instance2 = KeyManager.getInstance()

      expect(instance1).toBe(instance2)
    })

    it("should create new instance after reset", () => {
      const instance1 = KeyManager.getInstance()
      KeyManager.resetInstance()
      const instance2 = KeyManager.getInstance()

      expect(instance1).not.toBe(instance2)
    })
  })

  describe("initialize()", () => {
    it("should initialize with valid password", async () => {
      const password = "test-password-123"
      const result = await keyManager.initialize(password)

      expect(result.salt).toBeInstanceOf(Uint8Array)
      expect(result.salt.length).toBe(32) // 256 bits
      expect(keyManager.isUnlocked()).toBe(true)
      expect(keyManager.getMasterKey()).not.toBeNull()
      expect(keyManager.getSalt()).not.toBeNull()
    })

    it("should save salt to storage", async () => {
      const password = "test-password-123"
      await keyManager.initialize(password)

      const savedSalt = await getSavedSalt()
      expect(savedSalt).not.toBeNull()
      expect(savedSalt).toBeInstanceOf(Uint8Array)
      expect(savedSalt!.length).toBe(32)
    })

    it("should set unlocked timestamp", async () => {
      const before = Date.now()
      await keyManager.initialize("test-password-123")
      const after = Date.now()

      const unlockedAt = keyManager.getUnlockedAt()
      expect(unlockedAt).not.toBeNull()
      expect(unlockedAt!).toBeGreaterThanOrEqual(before)
      expect(unlockedAt!).toBeLessThanOrEqual(after)
    })

    it("should reject password shorter than minimum length", async () => {
      const shortPassword = "a".repeat(MIN_PASSWORD_LENGTH - 1)

      await expect(keyManager.initialize(shortPassword)).rejects.toThrow(
        KeyDerivationError
      )
      await expect(keyManager.initialize(shortPassword)).rejects.toThrow(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
      )
    })

    it("should reject empty password", async () => {
      await expect(keyManager.initialize("")).rejects.toThrow(
        KeyDerivationError
      )
    })

    it("should accept password exactly at minimum length", async () => {
      const minPassword = "a".repeat(MIN_PASSWORD_LENGTH)
      const result = await keyManager.initialize(minPassword)

      expect(result.salt).toBeInstanceOf(Uint8Array)
      expect(keyManager.isUnlocked()).toBe(true)
    })

    it("should accept very long password", async () => {
      const longPassword = "a".repeat(1000)
      const result = await keyManager.initialize(longPassword)

      expect(result.salt).toBeInstanceOf(Uint8Array)
      expect(keyManager.isUnlocked()).toBe(true)
    })

    it("should create verification data", async () => {
      await keyManager.initialize("test-password-123")

      const result = await chrome.storage.local.get("keyVerification")
      expect(result.keyVerification).toBeDefined()
      expect(result.keyVerification.ciphertext).toBeDefined()
      expect(result.keyVerification.iv).toBeDefined()
    })
  })

  describe("unlock()", () => {
    it("should unlock with correct password", async () => {
      const password = "test-password-123"

      // Initialize first
      const { salt } = await keyManager.initialize(password)

      // Lock
      keyManager.lock()
      expect(keyManager.isUnlocked()).toBe(false)

      // Unlock with correct password
      const unlocked = await keyManager.unlock(password, salt)
      expect(unlocked).toBe(true)
      expect(keyManager.isUnlocked()).toBe(true)
      expect(keyManager.getMasterKey()).not.toBeNull()
    })

    it("should fail with wrong password", async () => {
      const password = "test-password-123"
      const wrongPassword = "wrong-password-456"

      // Initialize
      const { salt } = await keyManager.initialize(password)

      // Lock
      keyManager.lock()

      // Try to unlock with wrong password
      const unlocked = await keyManager.unlock(wrongPassword, salt)
      expect(unlocked).toBe(false)
      expect(keyManager.isUnlocked()).toBe(false)
      expect(keyManager.getMasterKey()).toBeNull()
    })

    it("should return true if already unlocked", async () => {
      const password = "test-password-123"
      const { salt } = await keyManager.initialize(password)

      // Already unlocked, should return true
      const unlocked = await keyManager.unlock(password, salt)
      expect(unlocked).toBe(true)
    })

    it("should reject invalid salt", async () => {
      const password = "test-password-123"
      await keyManager.initialize(password)

      keyManager.lock()

      const emptySalt = new Uint8Array(0)
      await expect(keyManager.unlock(password, emptySalt)).rejects.toThrow(
        LockError
      )
    })

    it("should reject password shorter than minimum", async () => {
      const password = "test-password-123"
      const { salt } = await keyManager.initialize(password)

      keyManager.lock()

      const shortPassword = "a".repeat(MIN_PASSWORD_LENGTH - 1)
      const unlocked = await keyManager.unlock(shortPassword, salt)
      expect(unlocked).toBe(false)
    })

    it("should prevent concurrent unlock attempts", async () => {
      const password = "test-password-123"
      const { salt } = await keyManager.initialize(password)

      keyManager.lock()

      // Start two unlock operations concurrently
      const unlock1 = keyManager.unlock(password, salt)
      const unlock2 = keyManager.unlock(password, salt)

      // One should succeed, one should throw
      const results = await Promise.allSettled([unlock1, unlock2])

      const succeeded = results.filter((r) => r.status === "fulfilled").length
      const failed = results.filter((r) => r.status === "rejected").length

      expect(succeeded).toBe(1)
      expect(failed).toBe(1)

      // The failed one should have LockError
      const failedResult = results.find((r) => r.status === "rejected") as any
      expect(failedResult.reason).toBeInstanceOf(LockError)
      expect(failedResult.reason.message).toContain("Unlock already in progress")
    })

    it("should restore salt in memory after unlock", async () => {
      const password = "test-password-123"
      const { salt } = await keyManager.initialize(password)

      keyManager.lock()
      expect(keyManager.getSalt()).toBeNull()

      await keyManager.unlock(password, salt)
      expect(keyManager.getSalt()).not.toBeNull()
      expect(keyManager.getSalt()).toEqual(salt)
    })
  })

  describe("lock()", () => {
    it("should clear master key from memory", async () => {
      await keyManager.initialize("test-password-123")
      expect(keyManager.getMasterKey()).not.toBeNull()

      keyManager.lock()
      expect(keyManager.getMasterKey()).toBeNull()
    })

    it("should clear salt from memory", async () => {
      await keyManager.initialize("test-password-123")
      expect(keyManager.getSalt()).not.toBeNull()

      keyManager.lock()
      expect(keyManager.getSalt()).toBeNull()
    })

    it("should clear unlocked timestamp", async () => {
      await keyManager.initialize("test-password-123")
      expect(keyManager.getUnlockedAt()).not.toBeNull()

      keyManager.lock()
      expect(keyManager.getUnlockedAt()).toBeNull()
    })

    it("should update isUnlocked status", async () => {
      await keyManager.initialize("test-password-123")
      expect(keyManager.isUnlocked()).toBe(true)

      keyManager.lock()
      expect(keyManager.isUnlocked()).toBe(false)
    })

    it("should clear auto-lock timer", async () => {
      vi.useFakeTimers()

      await keyManager.initialize("test-password-123")
      keyManager.setAutoLockTimeout(5) // 5 minutes

      // Lock manually before timer expires
      keyManager.lock()

      // Fast-forward past the auto-lock timeout
      vi.advanceTimersByTime(6 * 60 * 1000) // 6 minutes

      // Should not auto-lock again (timer was cleared)
      expect(keyManager.isUnlocked()).toBe(false)

      vi.useRealTimers()
    })

    it("should be idempotent", async () => {
      await keyManager.initialize("test-password-123")

      keyManager.lock()
      keyManager.lock() // Lock again

      expect(keyManager.isUnlocked()).toBe(false)
    })
  })

  describe("Auto-lock", () => {
    it("should auto-lock after timeout", async () => {
      vi.useFakeTimers()

      await keyManager.initialize("test-password-123")
      keyManager.setAutoLockTimeout(15) // 15 minutes

      expect(keyManager.isUnlocked()).toBe(true)

      // Fast-forward 14 minutes - should still be unlocked
      vi.advanceTimersByTime(14 * 60 * 1000)
      expect(keyManager.isUnlocked()).toBe(true)

      // Fast-forward 1 more minute - should be locked
      vi.advanceTimersByTime(1 * 60 * 1000)
      expect(keyManager.isUnlocked()).toBe(false)

      vi.useRealTimers()
    })

    it("should not auto-lock when timeout is 0", async () => {
      vi.useFakeTimers()

      await keyManager.initialize("test-password-123")
      keyManager.setAutoLockTimeout(0) // Disabled

      expect(keyManager.isUnlocked()).toBe(true)

      // Fast-forward a long time
      vi.advanceTimersByTime(24 * 60 * 60 * 1000) // 24 hours

      // Should still be unlocked
      expect(keyManager.isUnlocked()).toBe(true)

      vi.useRealTimers()
    })

    it("should reset timer on resetAutoLockTimer()", async () => {
      vi.useFakeTimers()

      await keyManager.initialize("test-password-123")
      keyManager.setAutoLockTimeout(10) // 10 minutes

      // Wait 8 minutes
      vi.advanceTimersByTime(8 * 60 * 1000)
      expect(keyManager.isUnlocked()).toBe(true)

      // Reset timer (simulating user activity)
      keyManager.resetAutoLockTimer()

      // Wait another 8 minutes (16 minutes total, but timer was reset)
      vi.advanceTimersByTime(8 * 60 * 1000)
      expect(keyManager.isUnlocked()).toBe(true)

      // Wait 2 more minutes (10 minutes after reset)
      vi.advanceTimersByTime(2 * 60 * 1000)
      expect(keyManager.isUnlocked()).toBe(false)

      vi.useRealTimers()
    })

    it("should apply new timeout immediately when changed", async () => {
      vi.useFakeTimers()

      await keyManager.initialize("test-password-123")
      keyManager.setAutoLockTimeout(30) // 30 minutes

      // Wait 20 minutes
      vi.advanceTimersByTime(20 * 60 * 1000)
      expect(keyManager.isUnlocked()).toBe(true)

      // Change timeout to 5 minutes
      keyManager.setAutoLockTimeout(5)

      // Wait 5 minutes
      vi.advanceTimersByTime(5 * 60 * 1000)

      // Should be locked (new timer started)
      expect(keyManager.isUnlocked()).toBe(false)

      vi.useRealTimers()
    })

    it("should start auto-lock timer on unlock", async () => {
      vi.useFakeTimers()

      const password = "test-password-123"
      const { salt } = await keyManager.initialize(password)
      keyManager.setAutoLockTimeout(10) // 10 minutes

      // Lock
      keyManager.lock()

      // Unlock (should start new timer)
      await keyManager.unlock(password, salt)
      expect(keyManager.isUnlocked()).toBe(true)

      // Wait 10 minutes
      vi.advanceTimersByTime(10 * 60 * 1000)

      // Should be locked
      expect(keyManager.isUnlocked()).toBe(false)

      vi.useRealTimers()
    })
  })

  describe("isInitialized()", () => {
    it("should return false when no password has been set", async () => {
      const isInitialized = await keyManager.isInitialized()
      expect(isInitialized).toBe(false)
    })

    it("should return true after password initialization", async () => {
      await keyManager.initialize("test-password-123")

      const isInitialized = await keyManager.isInitialized()
      expect(isInitialized).toBe(true)
    })

    it("should return true even when locked if password exists", async () => {
      await keyManager.initialize("test-password-123")
      keyManager.lock()

      const isInitialized = await keyManager.isInitialized()
      expect(isInitialized).toBe(true)
    })

    it("should handle storage errors gracefully", async () => {
      // Mock storage.get to throw error
      const spy = vi.spyOn(chrome.storage.local, "get").mockRejectedValue(
        new Error("Storage error")
      )

      const isInitialized = await keyManager.isInitialized()
      expect(isInitialized).toBe(false)

      // Restore the original implementation
      spy.mockRestore()
    })
  })

  describe("verifyPassword()", () => {
    it("should verify correct password", async () => {
      const password = "test-password-123"
      const { salt } = await keyManager.initialize(password)

      const isValid = await keyManager.verifyPassword(password, salt)
      expect(isValid).toBe(true)
    })

    it("should reject incorrect password", async () => {
      const password = "test-password-123"
      const { salt } = await keyManager.initialize(password)

      const isValid = await keyManager.verifyPassword("wrong-password", salt)
      expect(isValid).toBe(false)
    })

    it("should work when locked", async () => {
      const password = "test-password-123"
      const { salt } = await keyManager.initialize(password)

      keyManager.lock()

      const isValid = await keyManager.verifyPassword(password, salt)
      expect(isValid).toBe(true)
    })

    it("should handle invalid salt gracefully", async () => {
      const password = "test-password-123"
      await keyManager.initialize(password)

      const invalidSalt = new Uint8Array(32)
      const isValid = await keyManager.verifyPassword(password, invalidSalt)
      expect(isValid).toBe(false)
    })
  })

  describe("Edge Cases", () => {
    it("should handle empty password gracefully", async () => {
      await expect(keyManager.initialize("")).rejects.toThrow()
    })

    it("should handle special characters in password", async () => {
      const password = "p@ssw0rd!#$%^&*()_+-=[]{}|;:',.<>?/~`"
      const result = await keyManager.initialize(password)

      expect(result.salt).toBeInstanceOf(Uint8Array)
      expect(keyManager.isUnlocked()).toBe(true)
    })

    it("should handle unicode characters in password", async () => {
      const password = "пароль密码🔐パスワード"
      const result = await keyManager.initialize(password)

      expect(result.salt).toBeInstanceOf(Uint8Array)
      expect(keyManager.isUnlocked()).toBe(true)

      // Verify can unlock with same unicode password
      keyManager.lock()
      const unlocked = await keyManager.unlock(password, result.salt)
      expect(unlocked).toBe(true)
    })

    it("should handle multiple initialize calls", async () => {
      // First initialize
      const password1 = "test-password-123"
      const result1 = await keyManager.initialize(password1)

      // Second initialize (simulating password change)
      const password2 = "new-password-456"
      const result2 = await keyManager.initialize(password2)

      // Salts should be different
      expect(result2.salt).not.toEqual(result1.salt)

      // Should be unlocked with new password
      expect(keyManager.isUnlocked()).toBe(true)

      // Old password should not work
      keyManager.lock()
      const unlocked1 = await keyManager.unlock(password1, result2.salt)
      expect(unlocked1).toBe(false)

      // New password should work
      const unlocked2 = await keyManager.unlock(password2, result2.salt)
      expect(unlocked2).toBe(true)
    })

    it("should handle rapid lock/unlock cycles", async () => {
      const password = "test-password-123"
      const { salt } = await keyManager.initialize(password)

      // Rapid lock/unlock cycles
      for (let i = 0; i < 10; i++) {
        keyManager.lock()
        expect(keyManager.isUnlocked()).toBe(false)

        const unlocked = await keyManager.unlock(password, salt)
        expect(unlocked).toBe(true)
        expect(keyManager.isUnlocked()).toBe(true)
      }
    })
  })

  describe("Memory Management", () => {
    it("should not persist key to storage", async () => {
      await keyManager.initialize("test-password-123")

      const localData = await chrome.storage.local.get(null)
      const sessionData = await chrome.storage.session.get(null)

      // Check that no field contains a CryptoKey or key-like data
      const allData = { ...localData, ...sessionData }

      // Should not find any CryptoKey objects
      // CryptoKey has type, algorithm, extractable, usages properties
      Object.values(allData).forEach((value) => {
        if (typeof value === "object" && value !== null && !Array.isArray(value)) {
          // Check it's not a CryptoKey object
          const hasCryptoKeyProperties =
            "type" in value &&
            "algorithm" in value &&
            "extractable" in value &&
            "usages" in value

          expect(hasCryptoKeyProperties).toBe(false)
        }
      })
    })

    it("should only store salt and verification data", async () => {
      await keyManager.initialize("test-password-123")

      const localData = await chrome.storage.local.get(null)

      // Should have salt and verification data
      expect(localData).toHaveProperty("masterKeySalt")
      expect(localData).toHaveProperty("keyVerification")

      // Salt should be an array of numbers
      expect(Array.isArray(localData.masterKeySalt)).toBe(true)
      expect(localData.masterKeySalt.length).toBe(32)

      // Verification should have encrypted data structure
      expect(localData.keyVerification).toHaveProperty("ciphertext")
      expect(localData.keyVerification).toHaveProperty("iv")
      expect(localData.keyVerification).toHaveProperty("salt")
    })
  })
})
