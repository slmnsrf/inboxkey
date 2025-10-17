/**
 * Integration tests for EncryptedStorage
 *
 * Comprehensive test coverage for all storage operations including:
 * - Mailbox CRUD operations
 * - Code storage and retrieval
 * - Settings management
 * - Session state management
 * - Storage migration
 * - Concurrent operations
 * - Error handling
 * - Cross-context notifications
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import { deriveKey } from "../../src/lib/crypto/encryption"
import { EncryptedStorage } from "../../src/lib/storage/encrypted-storage"
import { DecryptionError, ValidationError, StorageError } from "../../src/lib/storage/errors"
import {
  initializeStorage,
  resetStorage,
  exportStorage,
  importStorage,
  migrateStorage,
} from "../../src/lib/storage/init"
import type { Mailbox, StoredCode, Settings } from "../../src/lib/storage/schema"
import { STORAGE_KEYS } from "../../src/lib/storage/schema"

// Test constants
const TEST_PASSPHRASE = "test-passphrase-for-integration-tests"

// Helper to generate test mailbox
function createTestMailbox(overrides?: Partial<Mailbox>): Mailbox {
  return {
    id: crypto.randomUUID(),
    providerId: "gmail",
    email: "test@example.com",
    accessToken: "test-access-token-" + Math.random(),
    refreshToken: "test-refresh-token-" + Math.random(),
    tokenExpiresAt: Date.now() + 3600000, // 1 hour from now
    addedAt: Date.now(),
    lastSyncedAt: Date.now(),
    ...overrides,
  }
}

// Helper to generate test code
function createTestCode(overrides?: Partial<StoredCode>): StoredCode {
  return {
    code: Math.floor(100000 + Math.random() * 900000).toString(),
    timestamp: Date.now(),
    source: "test@example.com",
    used: false,
    ...overrides,
  }
}

describe("EncryptedStorage Integration Tests", () => {
  let storage: EncryptedStorage
  let masterKey: CryptoKey
  let salt: Uint8Array

  // Mock chrome.storage implementation
  let mockLocalStorage: Record<string, any> = {}
  let mockSessionStorage: Record<string, any> = {}

  beforeEach(async () => {
    // Reset storage mocks
    mockLocalStorage = {}
    mockSessionStorage = {}

    // Setup chrome.storage.local mock
    vi.mocked(chrome.storage.local.get).mockImplementation((keys) => {
      const result: Record<string, any> = {}
      if (typeof keys === "string") {
        result[keys] = mockLocalStorage[keys]
      } else if (Array.isArray(keys)) {
        keys.forEach((key) => {
          result[key] = mockLocalStorage[key]
        })
      } else if (keys === null || keys === undefined) {
        Object.assign(result, mockLocalStorage)
      } else {
        Object.keys(keys).forEach((key) => {
          result[key] = mockLocalStorage[key] ?? keys[key]
        })
      }
      return Promise.resolve(result)
    })

    vi.mocked(chrome.storage.local.set).mockImplementation((items) => {
      Object.assign(mockLocalStorage, items)
      return Promise.resolve()
    })

    vi.mocked(chrome.storage.local.clear).mockImplementation(() => {
      mockLocalStorage = {}
      return Promise.resolve()
    })

    // Setup chrome.storage.session mock
    vi.mocked(chrome.storage.session.get).mockImplementation((keys) => {
      const result: Record<string, any> = {}
      if (typeof keys === "string") {
        result[keys] = mockSessionStorage[keys]
      } else if (Array.isArray(keys)) {
        keys.forEach((key) => {
          result[key] = mockSessionStorage[key]
        })
      } else if (keys === null || keys === undefined) {
        Object.assign(result, mockSessionStorage)
      } else {
        Object.keys(keys).forEach((key) => {
          result[key] = mockSessionStorage[key] ?? keys[key]
        })
      }
      return Promise.resolve(result)
    })

    vi.mocked(chrome.storage.session.set).mockImplementation((items) => {
      Object.assign(mockSessionStorage, items)
      return Promise.resolve()
    })

    vi.mocked(chrome.storage.session.clear).mockImplementation(() => {
      mockSessionStorage = {}
      return Promise.resolve()
    })

    // Setup chrome.runtime.sendMessage mock
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue(undefined)

    // Derive key for tests
    const derived = await deriveKey(TEST_PASSPHRASE)
    masterKey = derived.key
    salt = derived.salt

    // Create storage instance
    storage = new EncryptedStorage(masterKey, salt)
  })

  describe("Initialization", () => {
    it("should initialize storage with defaults", async () => {
      const storage = await initializeStorage(masterKey, salt)
      expect(storage).toBeInstanceOf(EncryptedStorage)

      // Check defaults are set
      const settings = await storage.getSettings()
      expect(settings.autoFillEnabled).toBe(true)
      expect(settings.lockEnabled).toBe(false)

      const mailboxes = await storage.getMailboxes()
      expect(mailboxes).toEqual([])

      const codes = await storage.getRecentCodes()
      expect(codes).toEqual([])
    })

    it("should preserve existing data on re-initialization", async () => {
      const mailbox = createTestMailbox()
      await storage.addMailbox(mailbox)

      // Re-initialize
      const newStorage = await initializeStorage(masterKey, salt)
      const mailboxes = await newStorage.getMailboxes()

      expect(mailboxes).toHaveLength(1)
      expect(mailboxes[0].id).toBe(mailbox.id)
      expect(mailboxes[0].email).toBe(mailbox.email)
    })
  })

  describe("Mailbox Operations", () => {
    describe("addMailbox", () => {
      it("should add a mailbox successfully", async () => {
        const mailbox = createTestMailbox()
        await storage.addMailbox(mailbox)

        const mailboxes = await storage.getMailboxes()
        expect(mailboxes).toHaveLength(1)
        expect(mailboxes[0]).toEqual(mailbox)
      })

      it("should encrypt sensitive fields", async () => {
        const mailbox = createTestMailbox()
        await storage.addMailbox(mailbox)

        // Check that tokens are not stored in plaintext
        const stored = mockLocalStorage[STORAGE_KEYS.MAILBOXES][0]
        expect(stored.accessToken).not.toBe(mailbox.accessToken)
        expect(stored.refreshToken).not.toBe(mailbox.refreshToken)
        expect(stored.accessToken).toHaveProperty("ciphertext")
        expect(stored.accessToken).toHaveProperty("iv")
        expect(stored.accessToken).toHaveProperty("salt")
      })

      it("should prevent duplicate IDs", async () => {
        const mailbox = createTestMailbox()
        await storage.addMailbox(mailbox)

        await expect(storage.addMailbox(mailbox)).rejects.toThrow(ValidationError)
        await expect(storage.addMailbox(mailbox)).rejects.toThrow(
          "already exists"
        )
      })

      it("should prevent duplicate emails", async () => {
        const mailbox1 = createTestMailbox({ email: "duplicate@example.com" })
        const mailbox2 = createTestMailbox({ email: "duplicate@example.com" })

        await storage.addMailbox(mailbox1)
        await expect(storage.addMailbox(mailbox2)).rejects.toThrow(ValidationError)
      })

      it("should validate email format", async () => {
        const invalidMailbox = createTestMailbox({ email: "invalid-email" })
        await expect(storage.addMailbox(invalidMailbox)).rejects.toThrow(
          ValidationError
        )
      })

      it("should validate UUID format", async () => {
        const invalidMailbox = createTestMailbox({ id: "not-a-uuid" })
        await expect(storage.addMailbox(invalidMailbox)).rejects.toThrow(
          ValidationError
        )
      })

      it("should validate provider ID", async () => {
        const invalidMailbox = createTestMailbox({
          providerId: "invalid" as any,
        })
        await expect(storage.addMailbox(invalidMailbox)).rejects.toThrow(
          ValidationError
        )
      })

      it("should send change notification", async () => {
        const mailbox = createTestMailbox()
        await storage.addMailbox(mailbox)

        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
          type: "storage-changed",
          changeType: "mailboxes",
          timestamp: expect.any(Number),
        })
      })
    })

    describe("getMailboxes", () => {
      it("should return empty array when no mailboxes exist", async () => {
        const mailboxes = await storage.getMailboxes()
        expect(mailboxes).toEqual([])
      })

      it("should decrypt and return all mailboxes", async () => {
        const mailbox1 = createTestMailbox({ email: "test1@example.com" })
        const mailbox2 = createTestMailbox({ email: "test2@example.com" })

        await storage.addMailbox(mailbox1)
        await storage.addMailbox(mailbox2)

        const mailboxes = await storage.getMailboxes()
        expect(mailboxes).toHaveLength(2)
        expect(mailboxes[0].accessToken).toBe(mailbox1.accessToken)
        expect(mailboxes[1].accessToken).toBe(mailbox2.accessToken)
      })

      it("should throw DecryptionError on invalid encrypted data", async () => {
        // Manually corrupt encrypted data
        mockLocalStorage[STORAGE_KEYS.MAILBOXES] = [
          {
            id: crypto.randomUUID(),
            providerId: "gmail",
            email: "test@example.com",
            accessToken: {
              ciphertext: "invalid-base64!@#$",
              iv: "invalid-base64!@#$",
              salt: "invalid-base64!@#$",
            },
            refreshToken: {
              ciphertext: "test",
              iv: "test",
              salt: "test",
            },
            tokenExpiresAt: Date.now(),
            addedAt: Date.now(),
            lastSyncedAt: Date.now(),
          },
        ]

        await expect(storage.getMailboxes()).rejects.toThrow(DecryptionError)
      })
    })

    describe("getMailbox", () => {
      it("should return specific mailbox by ID", async () => {
        const mailbox = createTestMailbox()
        await storage.addMailbox(mailbox)

        const retrieved = await storage.getMailbox(mailbox.id)
        expect(retrieved).toEqual(mailbox)
      })

      it("should return null for non-existent ID", async () => {
        const result = await storage.getMailbox(crypto.randomUUID())
        expect(result).toBeNull()
      })

      it("should validate UUID format", async () => {
        await expect(storage.getMailbox("invalid-uuid")).rejects.toThrow(
          ValidationError
        )
      })
    })

    describe("updateMailbox", () => {
      it("should update mailbox fields", async () => {
        const mailbox = createTestMailbox()
        await storage.addMailbox(mailbox)

        const newToken = "updated-access-token"
        await storage.updateMailbox(mailbox.id, { accessToken: newToken })

        const updated = await storage.getMailbox(mailbox.id)
        expect(updated?.accessToken).toBe(newToken)
        expect(updated?.email).toBe(mailbox.email) // Unchanged
      })

      it("should allow partial updates", async () => {
        const mailbox = createTestMailbox()
        await storage.addMailbox(mailbox)

        await storage.updateMailbox(mailbox.id, {
          lastSyncedAt: Date.now() + 1000,
        })

        const updated = await storage.getMailbox(mailbox.id)
        expect(updated?.lastSyncedAt).toBeGreaterThan(mailbox.lastSyncedAt)
        expect(updated?.accessToken).toBe(mailbox.accessToken)
      })

      it("should throw error for non-existent mailbox", async () => {
        await expect(
          storage.updateMailbox(crypto.randomUUID(), { accessToken: "new" })
        ).rejects.toThrow(ValidationError)
      })

      it("should validate updated data", async () => {
        const mailbox = createTestMailbox()
        await storage.addMailbox(mailbox)

        await expect(
          storage.updateMailbox(mailbox.id, { email: "invalid-email" })
        ).rejects.toThrow(ValidationError)
      })

      it("should send change notification", async () => {
        const mailbox = createTestMailbox()
        await storage.addMailbox(mailbox)

        vi.mocked(chrome.runtime.sendMessage).mockClear()
        await storage.updateMailbox(mailbox.id, { accessToken: "new" })

        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
          type: "storage-changed",
          changeType: "mailboxes",
          timestamp: expect.any(Number),
        })
      })
    })

    describe("removeMailbox", () => {
      it("should remove mailbox by ID", async () => {
        const mailbox = createTestMailbox()
        await storage.addMailbox(mailbox)

        await storage.removeMailbox(mailbox.id)

        const mailboxes = await storage.getMailboxes()
        expect(mailboxes).toHaveLength(0)
      })

      it("should throw error for non-existent ID", async () => {
        await expect(storage.removeMailbox(crypto.randomUUID())).rejects.toThrow(
          ValidationError
        )
      })

      it("should send change notification", async () => {
        const mailbox = createTestMailbox()
        await storage.addMailbox(mailbox)

        vi.mocked(chrome.runtime.sendMessage).mockClear()
        await storage.removeMailbox(mailbox.id)

        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
          type: "storage-changed",
          changeType: "mailboxes",
          timestamp: expect.any(Number),
        })
      })
    })
  })

  describe("Code Operations", () => {
    describe("addCode", () => {
      it("should add code successfully", async () => {
        const code = createTestCode()
        await storage.addCode(code)

        const codes = await storage.getRecentCodes()
        expect(codes).toHaveLength(1)
        expect(codes[0]).toEqual(code)
      })

      it("should encrypt code value", async () => {
        const code = createTestCode()
        await storage.addCode(code)

        const stored = mockLocalStorage[STORAGE_KEYS.RECENT_CODES][0]
        expect(stored.code).not.toBe(code.code)
        expect(stored.code).toHaveProperty("ciphertext")
        expect(stored.code).toHaveProperty("iv")
      })

      it("should add codes at the beginning (newest first)", async () => {
        const code1 = createTestCode({ code: "111111" })
        const code2 = createTestCode({ code: "222222" })

        await storage.addCode(code1)
        await storage.addCode(code2)

        const codes = await storage.getRecentCodes()
        expect(codes[0].code).toBe("222222")
        expect(codes[1].code).toBe("111111")
      })

      it("should validate code format", async () => {
        const invalidCode = createTestCode({ code: "" })
        await expect(storage.addCode(invalidCode)).rejects.toThrow(ValidationError)
      })
    })

    describe("getRecentCodes", () => {
      it("should return empty array when no codes exist", async () => {
        const codes = await storage.getRecentCodes()
        expect(codes).toEqual([])
      })

      it("should return codes sorted by timestamp (newest first)", async () => {
        const code1 = createTestCode({ timestamp: Date.now() - 1000 })
        const code2 = createTestCode({ timestamp: Date.now() - 2000 })
        const code3 = createTestCode({ timestamp: Date.now() })

        await storage.addCode(code1)
        await storage.addCode(code2)
        await storage.addCode(code3)

        const codes = await storage.getRecentCodes()
        expect(codes[0].timestamp).toBeGreaterThan(codes[1].timestamp)
        expect(codes[1].timestamp).toBeGreaterThan(codes[2].timestamp)
      })

      it("should limit results when limit parameter provided", async () => {
        for (let i = 0; i < 10; i++) {
          await storage.addCode(createTestCode())
        }

        const codes = await storage.getRecentCodes(5)
        expect(codes).toHaveLength(5)
      })

      it("should decrypt code values correctly", async () => {
        const code = createTestCode({ code: "123456" })
        await storage.addCode(code)

        const codes = await storage.getRecentCodes()
        expect(codes[0].code).toBe("123456")
      })
    })

    describe("markCodeUsed", () => {
      it("should mark code as used", async () => {
        const code = createTestCode({ code: "123456" })
        await storage.addCode(code)

        await storage.markCodeUsed("123456")

        const codes = await storage.getRecentCodes()
        expect(codes[0].used).toBe(true)
      })

      it("should throw error for non-existent code", async () => {
        await expect(storage.markCodeUsed("999999")).rejects.toThrow(
          ValidationError
        )
      })

      it("should validate code parameter", async () => {
        await expect(storage.markCodeUsed("")).rejects.toThrow(ValidationError)
      })
    })

    describe("clearOldCodes", () => {
      it("should remove codes older than specified time", async () => {
        const oldCode = createTestCode({ timestamp: Date.now() - 10000 })
        const newCode = createTestCode({ timestamp: Date.now() })

        await storage.addCode(oldCode)
        await storage.addCode(newCode)

        await storage.clearOldCodes(5000) // Clear codes older than 5 seconds

        const codes = await storage.getRecentCodes()
        expect(codes).toHaveLength(1)
        expect(codes[0].code).toBe(newCode.code)
      })

      it("should keep all codes if none are old enough", async () => {
        await storage.addCode(createTestCode())
        await storage.addCode(createTestCode())

        await storage.clearOldCodes(1000)

        const codes = await storage.getRecentCodes()
        expect(codes).toHaveLength(2)
      })

      it("should validate olderThanMs parameter", async () => {
        await expect(storage.clearOldCodes(0)).rejects.toThrow(ValidationError)
        await expect(storage.clearOldCodes(-1000)).rejects.toThrow(ValidationError)
      })
    })
  })

  describe("Settings Operations", () => {
    describe("getSettings", () => {
      it("should return default settings if none exist", async () => {
        const settings = await storage.getSettings()
        expect(settings.autoFillEnabled).toBe(true)
        expect(settings.lockEnabled).toBe(false)
        expect(settings.lockTimeoutMinutes).toBe(15)
      })

      it("should return saved settings", async () => {
        await storage.updateSettings({ autoFillEnabled: false })
        const settings = await storage.getSettings()
        expect(settings.autoFillEnabled).toBe(false)
      })
    })

    describe("updateSettings", () => {
      it("should update settings partially", async () => {
        await storage.updateSettings({ autoFillEnabled: false })
        const settings = await storage.getSettings()

        expect(settings.autoFillEnabled).toBe(false)
        expect(settings.lockEnabled).toBe(false) // Unchanged
      })

      it("should update multiple fields", async () => {
        await storage.updateSettings({
          autoFillEnabled: false,
          lockEnabled: true,
          lockTimeoutMinutes: 30,
        })

        const settings = await storage.getSettings()
        expect(settings.autoFillEnabled).toBe(false)
        expect(settings.lockEnabled).toBe(true)
        expect(settings.lockTimeoutMinutes).toBe(30)
      })

      it("should validate settings structure", async () => {
        await expect(
          storage.updateSettings({ lockTimeoutMinutes: -1 } as any)
        ).rejects.toThrow(ValidationError)
      })
    })
  })

  describe("Session State Operations", () => {
    describe("getSessionState", () => {
      it("should return default session state if none exists", async () => {
        const state = await storage.getSessionState()
        expect(state.isLocked).toBe(false)
        expect(state.activeWatchSessions).toEqual([])
      })

      it("should return saved session state", async () => {
        await storage.updateSessionState({ isLocked: true })
        const state = await storage.getSessionState()
        expect(state.isLocked).toBe(true)
      })
    })

    describe("updateSessionState", () => {
      it("should update session state", async () => {
        const now = Date.now()
        await storage.updateSessionState({
          isLocked: true,
          unlockedAt: now,
        })

        const state = await storage.getSessionState()
        expect(state.isLocked).toBe(true)
        expect(state.unlockedAt).toBe(now)
      })

      it("should update watch sessions", async () => {
        const watchSession = {
          id: crypto.randomUUID(),
          startedAt: Date.now(),
          tabId: 123,
          url: "https://example.com",
          pollsRemaining: 3,
        }

        await storage.updateSessionState({
          activeWatchSessions: [watchSession],
        })

        const state = await storage.getSessionState()
        expect(state.activeWatchSessions).toHaveLength(1)
        expect(state.activeWatchSessions[0].id).toBe(watchSession.id)
      })
    })
  })

  describe("Utility Operations", () => {
    describe("clear", () => {
      it("should clear all storage", async () => {
        await storage.addMailbox(createTestMailbox())
        await storage.addCode(createTestCode())
        await storage.updateSettings({ autoFillEnabled: false })

        await storage.clear()

        expect(mockLocalStorage).toEqual({})
        expect(mockSessionStorage).toEqual({})
      })
    })

    describe("getStorageSize", () => {
      it("should return storage size", async () => {
        // Mock getBytesInUse
        vi.mocked(chrome.storage.local as any).getBytesInUse = vi
          .fn()
          .mockResolvedValue(1024)

        const size = await storage.getStorageSize()
        expect(size).toBe(1024)
      })
    })
  })

  describe("Concurrent Operations", () => {
    it("should handle concurrent writes to mailboxes", async () => {
      const mailboxes = Array.from({ length: 10 }, (_, i) =>
        createTestMailbox({ email: `test${i}@example.com` })
      )

      await Promise.all(mailboxes.map((m) => storage.addMailbox(m)))

      const retrieved = await storage.getMailboxes()
      expect(retrieved).toHaveLength(10)
    })

    it("should handle concurrent writes to codes", async () => {
      const codes = Array.from({ length: 10 }, (_, i) =>
        createTestCode({ code: `10000${i}` })
      )

      await Promise.all(codes.map((c) => storage.addCode(c)))

      const retrieved = await storage.getRecentCodes()
      expect(retrieved).toHaveLength(10)
    })

    it("should prevent race conditions with mutex", async () => {
      const mailbox = createTestMailbox()
      await storage.addMailbox(mailbox)

      // Attempt concurrent updates with valid timestamps
      const now = Date.now()
      await Promise.all([
        storage.updateMailbox(mailbox.id, { lastSyncedAt: now + 1000 }),
        storage.updateMailbox(mailbox.id, { lastSyncedAt: now + 2000 }),
        storage.updateMailbox(mailbox.id, { lastSyncedAt: now + 3000 }),
      ])

      // All updates should have completed successfully
      const updated = await storage.getMailbox(mailbox.id)
      expect(updated).not.toBeNull()
      expect([now + 1000, now + 2000, now + 3000]).toContain(updated!.lastSyncedAt)
    })
  })

  describe("Import/Export", () => {
    it("should export storage data", async () => {
      await storage.addMailbox(createTestMailbox())
      await storage.addCode(createTestCode())

      const exported = await exportStorage()
      expect(exported.version).toBe(1)
      expect(exported.mailboxes).toHaveLength(1)
      expect(exported.recentCodes).toHaveLength(1)
    })

    it("should import storage data", async () => {
      const mailbox = createTestMailbox()
      await storage.addMailbox(mailbox)

      const exported = await exportStorage()
      await resetStorage()

      await importStorage(exported)

      const newStorage = new EncryptedStorage(masterKey, salt)
      const mailboxes = await newStorage.getMailboxes()
      expect(mailboxes).toHaveLength(1)
    })
  })

  describe("Migration", () => {
    it("should handle same-version migration (no-op)", async () => {
      await migrateStorage(1, 1)
      // Should not throw
    })

    it("should reject downgrade attempts", async () => {
      await expect(migrateStorage(2, 1)).rejects.toThrow(
        "Cannot downgrade storage version"
      )
    })
  })

  describe("Error Handling", () => {
    it("should handle chrome.storage errors gracefully", async () => {
      vi.mocked(chrome.storage.local.get).mockRejectedValue(
        new Error("Storage quota exceeded")
      )

      await expect(storage.getMailboxes()).rejects.toThrow(StorageError)
    })

    it("should handle invalid stored data", async () => {
      mockLocalStorage[STORAGE_KEYS.SETTINGS] = { invalid: "data" }

      await expect(storage.getSettings()).rejects.toThrow(ValidationError)
    })
  })
})
