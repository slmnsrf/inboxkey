/**
 * Unit tests for EncryptedStorage
 *
 * Comprehensive test coverage for encrypted storage operations including:
 * - Mailbox CRUD with encryption
 * - Code storage and retrieval
 * - Validation logic
 * - Mutex behavior and concurrent operations
 * - Error handling and edge cases
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import { EncryptedStorage } from "@/lib/storage/encrypted-storage"
import { encrypt, decrypt } from "@/lib/crypto/encryption"
import { DecryptionError, ValidationError, StorageError } from "@/lib/storage/errors"
import type { Mailbox, StoredCode } from "@/lib/storage/schema"
import { STORAGE_KEYS } from "@/lib/storage/schema"

// Mock the encryption module
vi.mock("@/lib/crypto/encryption", () => ({
  encrypt: vi.fn(),
  decrypt: vi.fn(),
}))

// Test constants
const TEST_MASTER_KEY = {} as CryptoKey // Mock key
const TEST_SALT = new Uint8Array(32)

// Helper to create test mailbox
function createTestMailbox(overrides?: Partial<Mailbox>): Mailbox {
  return {
    id: crypto.randomUUID(),
    providerId: "gmail",
    email: "test@example.com",
    accessToken: "test-access-token",
    refreshToken: "test-refresh-token",
    tokenExpiresAt: Date.now() + 3600000,
    addedAt: Date.now(),
    lastSyncedAt: Date.now(),
    ...overrides,
  }
}

// Helper to create test code
function createTestCode(overrides?: Partial<StoredCode>): StoredCode {
  return {
    code: "123456",
    timestamp: Date.now(),
    source: "test@example.com",
    used: false,
    ...overrides,
  }
}

// Helper to create encrypted data structure
function createEncryptedData(value: string): any {
  return {
    ciphertext: btoa(value + "-encrypted"),
    iv: btoa("test-iv"),
    salt: btoa("test-salt"),
  }
}

describe("EncryptedStorage", () => {
  let storage: EncryptedStorage
  let mockLocalStorage: Record<string, any>
  let mockSessionStorage: Record<string, any>

  beforeEach(() => {
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

    // Setup chrome.runtime.sendMessage mock (for change notifications)
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue(undefined)

    // Setup encryption mocks
    vi.mocked(encrypt).mockImplementation(async (data: string) => {
      return createEncryptedData(data)
    })

    vi.mocked(decrypt).mockImplementation(async (encryptedData: any) => {
      // Simulate decryption by extracting original value from ciphertext
      const encrypted = encryptedData.ciphertext
      const decoded = atob(encrypted)
      return decoded.replace("-encrypted", "")
    })

    // Create storage instance
    storage = new EncryptedStorage(TEST_MASTER_KEY, TEST_SALT)
  })

  // ============================================================================
  // Mailbox Operations
  // ============================================================================

  describe("addMailbox", () => {
    it("should add a valid mailbox", async () => {
      const mailbox = createTestMailbox()
      await storage.addMailbox(mailbox)

      const mailboxes = await storage.getMailboxes()
      expect(mailboxes).toHaveLength(1)
      expect(mailboxes[0].email).toBe("test@example.com")
      expect(mailboxes[0].id).toBe(mailbox.id)
    })

    it("should encrypt tokens when storing", async () => {
      const mailbox = createTestMailbox()
      await storage.addMailbox(mailbox)

      // Check that encrypt was called for both tokens
      expect(encrypt).toHaveBeenCalledWith(
        mailbox.accessToken,
        TEST_MASTER_KEY,
        TEST_SALT
      )
      expect(encrypt).toHaveBeenCalledWith(
        mailbox.refreshToken,
        TEST_MASTER_KEY,
        TEST_SALT
      )

      // Verify stored data is encrypted
      const stored = mockLocalStorage[STORAGE_KEYS.MAILBOXES][0]
      expect(stored.accessToken).toHaveProperty("ciphertext")
      expect(stored.refreshToken).toHaveProperty("ciphertext")
    })

    it("should prevent duplicate IDs", async () => {
      const mailbox = createTestMailbox()
      await storage.addMailbox(mailbox)

      await expect(storage.addMailbox(mailbox)).rejects.toThrow(ValidationError)
      await expect(storage.addMailbox(mailbox)).rejects.toThrow("already exists")
    })

    it("should prevent duplicate emails for same provider", async () => {
      const mailbox1 = createTestMailbox({ email: "test@example.com" })
      const mailbox2 = createTestMailbox({ email: "test@example.com" })

      await storage.addMailbox(mailbox1)
      await expect(storage.addMailbox(mailbox2)).rejects.toThrow(ValidationError)
      await expect(storage.addMailbox(mailbox2)).rejects.toThrow("already exists")
    })

    it("should validate UUID format", async () => {
      const invalidMailbox = createTestMailbox({ id: "not-a-uuid" })
      await expect(storage.addMailbox(invalidMailbox)).rejects.toThrow(
        ValidationError
      )
      await expect(storage.addMailbox(invalidMailbox)).rejects.toThrow(
        "Invalid mailbox ID format"
      )
    })

    it("should validate provider ID", async () => {
      const invalidMailbox = createTestMailbox({
        providerId: "invalid-provider" as any,
      })
      await expect(storage.addMailbox(invalidMailbox)).rejects.toThrow(
        ValidationError
      )
      await expect(storage.addMailbox(invalidMailbox)).rejects.toThrow(
        "Invalid provider ID"
      )
    })

    it("should validate email format", async () => {
      const invalidMailbox = createTestMailbox({ email: "not-an-email" })
      await expect(storage.addMailbox(invalidMailbox)).rejects.toThrow(
        ValidationError
      )
      await expect(storage.addMailbox(invalidMailbox)).rejects.toThrow(
        "Invalid email format"
      )
    })

    it("should set correct timestamps", async () => {
      const beforeAdd = Date.now()
      const mailbox = createTestMailbox()
      await storage.addMailbox(mailbox)
      const afterAdd = Date.now()

      const retrieved = await storage.getMailbox(mailbox.id)
      expect(retrieved).not.toBeNull()
      expect(retrieved!.addedAt).toBeGreaterThanOrEqual(beforeAdd)
      expect(retrieved!.addedAt).toBeLessThanOrEqual(afterAdd)
    })

    it("should throw ValidationError on empty access token", async () => {
      const invalidMailbox = createTestMailbox({ accessToken: "" })
      await expect(storage.addMailbox(invalidMailbox)).rejects.toThrow(
        ValidationError
      )
      await expect(storage.addMailbox(invalidMailbox)).rejects.toThrow(
        "Access token cannot be empty"
      )
    })

    it("should allow Gmail mailbox without refresh token", async () => {
      const gmailMailbox = createTestMailbox({
        providerId: "gmail",
        refreshToken: undefined,
      })
      await storage.addMailbox(gmailMailbox)

      const retrieved = await storage.getMailboxes()
      expect(retrieved).toHaveLength(1)
      expect(retrieved[0].providerId).toBe("gmail")
    })

    it("should require refresh token for non-Gmail providers", async () => {
      const outlookMailbox = createTestMailbox({
        providerId: "outlook",
        refreshToken: "",
      })
      await expect(storage.addMailbox(outlookMailbox)).rejects.toThrow(
        ValidationError
      )
      await expect(storage.addMailbox(outlookMailbox)).rejects.toThrow(
        "Refresh token cannot be empty"
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
    it("should return all mailboxes", async () => {
      const mailbox1 = createTestMailbox({ email: "test1@example.com" })
      const mailbox2 = createTestMailbox({ email: "test2@example.com" })

      await storage.addMailbox(mailbox1)
      await storage.addMailbox(mailbox2)

      const mailboxes = await storage.getMailboxes()
      expect(mailboxes).toHaveLength(2)
    })

    it("should decrypt tokens correctly", async () => {
      const mailbox = createTestMailbox({
        accessToken: "secret-access",
        refreshToken: "secret-refresh",
      })
      await storage.addMailbox(mailbox)

      const mailboxes = await storage.getMailboxes()
      expect(mailboxes[0].accessToken).toBe("secret-access")
      expect(mailboxes[0].refreshToken).toBe("secret-refresh")
      expect(decrypt).toHaveBeenCalled()
    })

    it("should handle empty storage", async () => {
      const mailboxes = await storage.getMailboxes()
      expect(mailboxes).toEqual([])
    })

    it("should handle decryption errors gracefully", async () => {
      // Add a mailbox first
      const mailbox = createTestMailbox()
      await storage.addMailbox(mailbox)

      // Reset decrypt mock to throw error on next call
      vi.mocked(decrypt).mockReset()
      vi.mocked(decrypt).mockRejectedValue(new Error("Decryption failed"))

      await expect(storage.getMailboxes()).rejects.toThrow(DecryptionError)
    })

    it("should throw StorageError on storage failure", async () => {
      vi.mocked(chrome.storage.local.get).mockReset()
      vi.mocked(chrome.storage.local.get).mockRejectedValue(
        new Error("Storage quota exceeded")
      )

      await expect(storage.getMailboxes()).rejects.toThrow(StorageError)
    })
  })

  describe("getMailbox", () => {
    it("should return specific mailbox by ID", async () => {
      const mailbox = createTestMailbox()
      await storage.addMailbox(mailbox)

      const retrieved = await storage.getMailbox(mailbox.id)
      expect(retrieved).not.toBeNull()
      expect(retrieved!.id).toBe(mailbox.id)
      expect(retrieved!.email).toBe(mailbox.email)
    })

    it("should return null for non-existent ID", async () => {
      const result = await storage.getMailbox(crypto.randomUUID())
      expect(result).toBeNull()
    })

    it("should validate UUID format", async () => {
      await expect(storage.getMailbox("invalid-uuid")).rejects.toThrow(
        ValidationError
      )
      await expect(storage.getMailbox("invalid-uuid")).rejects.toThrow(
        "Invalid mailbox ID format"
      )
    })
  })

  describe("updateMailbox", () => {
    it("should update existing mailbox", async () => {
      const mailbox = createTestMailbox()
      await storage.addMailbox(mailbox)

      const newToken = "updated-access-token"
      await storage.updateMailbox(mailbox.id, { accessToken: newToken })

      const updated = await storage.getMailbox(mailbox.id)
      expect(updated?.accessToken).toBe(newToken)
    })

    it("should re-encrypt tokens on update", async () => {
      const mailbox = createTestMailbox()
      await storage.addMailbox(mailbox)

      vi.mocked(encrypt).mockClear()

      const newToken = "new-token"
      await storage.updateMailbox(mailbox.id, { accessToken: newToken })

      // Should encrypt both tokens (full mailbox is re-saved)
      expect(encrypt).toHaveBeenCalled()
    })

    it("should preserve other mailboxes", async () => {
      const mailbox1 = createTestMailbox({ email: "test1@example.com" })
      const mailbox2 = createTestMailbox({ email: "test2@example.com" })

      await storage.addMailbox(mailbox1)
      await storage.addMailbox(mailbox2)

      await storage.updateMailbox(mailbox1.id, { accessToken: "new-token" })

      const mailboxes = await storage.getMailboxes()
      expect(mailboxes).toHaveLength(2)
      expect(mailboxes.find((m) => m.id === mailbox2.id)).toBeDefined()
    })

    it("should throw if mailbox not found", async () => {
      await expect(
        storage.updateMailbox(crypto.randomUUID(), { accessToken: "new" })
      ).rejects.toThrow(ValidationError)
      await expect(
        storage.updateMailbox(crypto.randomUUID(), { accessToken: "new" })
      ).rejects.toThrow("not found")
    })

    it("should validate updated mailbox", async () => {
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
    it("should remove specified mailbox", async () => {
      const mailbox = createTestMailbox()
      await storage.addMailbox(mailbox)

      await storage.removeMailbox(mailbox.id)

      const mailboxes = await storage.getMailboxes()
      expect(mailboxes).toHaveLength(0)
    })

    it("should preserve other mailboxes", async () => {
      const mailbox1 = createTestMailbox({ email: "test1@example.com" })
      const mailbox2 = createTestMailbox({ email: "test2@example.com" })

      await storage.addMailbox(mailbox1)
      await storage.addMailbox(mailbox2)

      await storage.removeMailbox(mailbox1.id)

      const mailboxes = await storage.getMailboxes()
      expect(mailboxes).toHaveLength(1)
      expect(mailboxes[0].id).toBe(mailbox2.id)
    })

    it("should throw if mailbox not found", async () => {
      await expect(storage.removeMailbox(crypto.randomUUID())).rejects.toThrow(
        ValidationError
      )
      await expect(storage.removeMailbox(crypto.randomUUID())).rejects.toThrow(
        "not found"
      )
    })

    it("should validate UUID format", async () => {
      await expect(storage.removeMailbox("invalid-uuid")).rejects.toThrow(
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

  // ============================================================================
  // Code Operations
  // ============================================================================

  describe("addCode", () => {
    it("should add verification code", async () => {
      const code = createTestCode()
      await storage.addCode(code)

      const codes = await storage.getRecentCodes()
      expect(codes).toHaveLength(1)
      expect(codes[0].code).toBe(code.code)
    })

    it("should set correct timestamp", async () => {
      const beforeAdd = Date.now()
      const code = createTestCode()
      await storage.addCode(code)
      const afterAdd = Date.now()

      const codes = await storage.getRecentCodes()
      expect(codes[0].timestamp).toBeGreaterThanOrEqual(beforeAdd)
      expect(codes[0].timestamp).toBeLessThanOrEqual(afterAdd)
    })

    it("should validate code format", async () => {
      const invalidCode = createTestCode({ code: "" })
      await expect(storage.addCode(invalidCode)).rejects.toThrow(ValidationError)
      await expect(storage.addCode(invalidCode)).rejects.toThrow(
        "Code cannot be empty"
      )
    })

    it("should validate timestamp", async () => {
      const invalidCode = createTestCode({ timestamp: -1 })
      await expect(storage.addCode(invalidCode)).rejects.toThrow(ValidationError)
      await expect(storage.addCode(invalidCode)).rejects.toThrow(
        "Invalid timestamp"
      )
    })

    it("should validate source", async () => {
      const invalidCode = createTestCode({ source: "" })
      await expect(storage.addCode(invalidCode)).rejects.toThrow(ValidationError)
      await expect(storage.addCode(invalidCode)).rejects.toThrow(
        "Source cannot be empty"
      )
    })

    it("should validate used field", async () => {
      const invalidCode = createTestCode({ used: "true" as any })
      await expect(storage.addCode(invalidCode)).rejects.toThrow(ValidationError)
      await expect(storage.addCode(invalidCode)).rejects.toThrow(
        "Used must be a boolean"
      )
    })

    it("should encrypt code value when storing", async () => {
      const code = createTestCode({ code: "123456" })
      await storage.addCode(code)

      expect(encrypt).toHaveBeenCalledWith("123456", TEST_MASTER_KEY, TEST_SALT)

      const stored = mockLocalStorage[STORAGE_KEYS.RECENT_CODES][0]
      expect(stored.code).toHaveProperty("ciphertext")
    })

    it("should add codes at beginning (newest first)", async () => {
      const code1 = createTestCode({ code: "111111" })
      const code2 = createTestCode({ code: "222222" })

      await storage.addCode(code1)
      await storage.addCode(code2)

      const codes = await storage.getRecentCodes()
      expect(codes[0].code).toBe("222222")
      expect(codes[1].code).toBe("111111")
    })

    it("should handle mutex for concurrent operations", async () => {
      const codes = Array.from({ length: 5 }, (_, i) =>
        createTestCode({ code: `${i}` })
      )

      await Promise.all(codes.map((c) => storage.addCode(c)))

      const retrieved = await storage.getRecentCodes()
      expect(retrieved).toHaveLength(5)
    })

    it("should send change notification", async () => {
      const code = createTestCode()
      await storage.addCode(code)

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: "storage-changed",
        changeType: "codes",
        timestamp: expect.any(Number),
      })
    })
  })

  describe("getRecentCodes", () => {
    it("should return codes in reverse chronological order", async () => {
      const code1 = createTestCode({ timestamp: Date.now() - 2000, code: "1" })
      const code2 = createTestCode({ timestamp: Date.now() - 1000, code: "2" })
      const code3 = createTestCode({ timestamp: Date.now(), code: "3" })

      await storage.addCode(code1)
      await storage.addCode(code2)
      await storage.addCode(code3)

      const codes = await storage.getRecentCodes()
      expect(codes[0].timestamp).toBeGreaterThan(codes[1].timestamp)
      expect(codes[1].timestamp).toBeGreaterThan(codes[2].timestamp)
    })

    it("should handle empty list", async () => {
      const codes = await storage.getRecentCodes()
      expect(codes).toEqual([])
    })

    it("should return correct structure", async () => {
      const code = createTestCode({
        code: "123456",
        source: "test@example.com",
        siteMatch: "example.com",
        used: false,
      })
      await storage.addCode(code)

      const codes = await storage.getRecentCodes()
      expect(codes[0]).toMatchObject({
        code: "123456",
        source: "test@example.com",
        siteMatch: "example.com",
        used: false,
        timestamp: expect.any(Number),
      })
    })

    it("should limit results when limit parameter provided", async () => {
      for (let i = 0; i < 10; i++) {
        await storage.addCode(createTestCode({ code: `${i}` }))
      }

      const codes = await storage.getRecentCodes(5)
      expect(codes).toHaveLength(5)
    })

    it("should decrypt codes correctly", async () => {
      const code = createTestCode({ code: "secret-code" })
      await storage.addCode(code)

      const codes = await storage.getRecentCodes()
      expect(codes[0].code).toBe("secret-code")
      expect(decrypt).toHaveBeenCalled()
    })

    it("should handle decryption errors", async () => {
      await storage.addCode(createTestCode())

      vi.mocked(decrypt).mockReset()
      vi.mocked(decrypt).mockRejectedValue(new Error("Decryption failed"))

      await expect(storage.getRecentCodes()).rejects.toThrow(DecryptionError)
    })
  })

  describe("clearOldCodes", () => {
    it("should remove codes older than threshold", async () => {
      const oldCode = createTestCode({ timestamp: Date.now() - 10000 })
      const recentCode = createTestCode({ timestamp: Date.now() })

      await storage.addCode(oldCode)
      await storage.addCode(recentCode)

      await storage.clearOldCodes(5000) // Clear older than 5 seconds

      const codes = await storage.getRecentCodes()
      expect(codes).toHaveLength(1)
      expect(codes[0].timestamp).toBe(recentCode.timestamp)
    })

    it("should preserve recent codes", async () => {
      const code1 = createTestCode({ timestamp: Date.now() - 1000 })
      const code2 = createTestCode({ timestamp: Date.now() - 500 })

      await storage.addCode(code1)
      await storage.addCode(code2)

      await storage.clearOldCodes(2000)

      const codes = await storage.getRecentCodes()
      expect(codes).toHaveLength(2)
    })

    it("should handle boundary conditions", async () => {
      const exactlyOld = createTestCode({ timestamp: Date.now() - 5000 })
      await storage.addCode(exactlyOld)

      await storage.clearOldCodes(5000)

      const codes = await storage.getRecentCodes()
      expect(codes).toHaveLength(1) // Should keep codes exactly at boundary
    })

    it("should validate olderThanMs parameter", async () => {
      await expect(storage.clearOldCodes(0)).rejects.toThrow(ValidationError)
      await expect(storage.clearOldCodes(-1000)).rejects.toThrow(ValidationError)
    })

    it("should send change notification", async () => {
      await storage.addCode(createTestCode({ timestamp: Date.now() - 10000 }))

      vi.mocked(chrome.runtime.sendMessage).mockClear()

      await storage.clearOldCodes(5000)

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: "storage-changed",
        changeType: "codes",
        timestamp: expect.any(Number),
      })
    })
  })

  // ============================================================================
  // Mutex Behavior
  // ============================================================================

  describe("Mutex Behavior", () => {
    it("should serialize concurrent addMailbox calls", async () => {
      const mailboxes = Array.from({ length: 10 }, (_, i) =>
        createTestMailbox({ email: `test${i}@example.com` })
      )

      await Promise.all(mailboxes.map((m) => storage.addMailbox(m)))

      const retrieved = await storage.getMailboxes()
      expect(retrieved).toHaveLength(10)
    })

    it("should release lock after exception", async () => {
      const validMailbox = createTestMailbox()
      const invalidMailbox = createTestMailbox({ email: "invalid" })

      // First operation will fail
      await expect(storage.addMailbox(invalidMailbox)).rejects.toThrow()

      // Second operation should succeed (lock was released)
      await storage.addMailbox(validMailbox)

      const mailboxes = await storage.getMailboxes()
      expect(mailboxes).toHaveLength(1)
    })

    it("should prevent deadlocks on error", async () => {
      // Mock encrypt to fail for first call
      vi.mocked(encrypt)
        .mockRejectedValueOnce(new Error("Encryption failed"))
        .mockImplementation(async (data: string) => createEncryptedData(data))

      const mailbox1 = createTestMailbox({ email: "test1@example.com" })
      const mailbox2 = createTestMailbox({ email: "test2@example.com" })

      await expect(storage.addMailbox(mailbox1)).rejects.toThrow()
      await storage.addMailbox(mailbox2) // Should not deadlock

      const mailboxes = await storage.getMailboxes()
      expect(mailboxes).toHaveLength(1)
    })

    it("should handle concurrent code operations", async () => {
      const codes = Array.from({ length: 10 }, (_, i) =>
        createTestCode({ code: `${i}` })
      )

      await Promise.all(codes.map((c) => storage.addCode(c)))

      const retrieved = await storage.getRecentCodes()
      expect(retrieved).toHaveLength(10)
    })
  })

  // ============================================================================
  // Validation
  // ============================================================================

  describe("Validation", () => {
    describe("validateMailbox", () => {
      it("should accept valid mailbox", async () => {
        const validMailbox = createTestMailbox()
        await expect(storage.addMailbox(validMailbox)).resolves.not.toThrow()
      })

      it("should reject invalid UUID", async () => {
        const mailbox = createTestMailbox({ id: "invalid" })
        await expect(storage.addMailbox(mailbox)).rejects.toThrow("Invalid mailbox ID format")
      })

      it("should reject invalid email", async () => {
        const invalidEmails = [
          "not-an-email",
          "@example.com",
          "user@",
          "user",
          "",
        ]

        for (const email of invalidEmails) {
          const mailbox = createTestMailbox({ email })
          await expect(storage.addMailbox(mailbox)).rejects.toThrow(
            "Invalid email format"
          )
        }
      })

      it("should accept valid email formats", async () => {
        const validEmails = [
          "user@example.com",
          "user.name@example.com",
          "user+tag@example.co.uk",
          "user_name@example-domain.com",
        ]

        for (const email of validEmails) {
          const mailbox = createTestMailbox({ email, id: crypto.randomUUID() })
          await expect(storage.addMailbox(mailbox)).resolves.not.toThrow()
        }
      })

      it("should validate all provider IDs", async () => {
        const validProviders: Array<Mailbox["providerId"]> = [
          "gmail",
          "outlook",
          "imap-bridge",
        ]

        for (const providerId of validProviders) {
          const mailbox = createTestMailbox({
            providerId,
            email: `${providerId}@example.com`,
            id: crypto.randomUUID(),
          })
          await expect(storage.addMailbox(mailbox)).resolves.not.toThrow()
        }
      })

      it("should validate timestamps", async () => {
        const invalidTimestamps = [-1, 1000, Date.now() + 100 * 365 * 24 * 60 * 60 * 1000]

        for (const timestamp of invalidTimestamps) {
          const mailbox = createTestMailbox({ tokenExpiresAt: timestamp })
          await expect(storage.addMailbox(mailbox)).rejects.toThrow(
            "Invalid token expiration timestamp"
          )
        }
      })
    })

    describe("Email validation", () => {
      it("should reject emails without @", async () => {
        const mailbox = createTestMailbox({ email: "userexample.com" })
        await expect(storage.addMailbox(mailbox)).rejects.toThrow()
      })

      it("should reject emails without domain", async () => {
        const mailbox = createTestMailbox({ email: "user@" })
        await expect(storage.addMailbox(mailbox)).rejects.toThrow()
      })

      it("should reject emails without user", async () => {
        const mailbox = createTestMailbox({ email: "@example.com" })
        await expect(storage.addMailbox(mailbox)).rejects.toThrow()
      })

      it("should reject emails with spaces", async () => {
        const mailbox = createTestMailbox({ email: "user name@example.com" })
        await expect(storage.addMailbox(mailbox)).rejects.toThrow()
      })
    })

    describe("UUID validation", () => {
      it("should accept valid UUID v4", async () => {
        const uuid = crypto.randomUUID()
        const mailbox = createTestMailbox({ id: uuid })
        await expect(storage.addMailbox(mailbox)).resolves.not.toThrow()
      })

      it("should reject non-UUID strings", async () => {
        const invalidUUIDs = [
          "123",
          "not-a-uuid",
          "12345678-1234-1234-1234-123456789012", // Not v4
          "",
        ]

        for (const id of invalidUUIDs) {
          const mailbox = createTestMailbox({ id })
          await expect(storage.addMailbox(mailbox)).rejects.toThrow()
        }
      })
    })
  })

  // ============================================================================
  // Encryption Integration
  // ============================================================================

  describe("Encryption Integration", () => {
    it("should encrypt tokens when stored", async () => {
      const mailbox = createTestMailbox()
      await storage.addMailbox(mailbox)

      const stored = mockLocalStorage[STORAGE_KEYS.MAILBOXES][0]
      expect(stored.accessToken).not.toBe(mailbox.accessToken)
      expect(stored.refreshToken).not.toBe(mailbox.refreshToken)
    })

    it("should decrypt tokens when retrieved", async () => {
      const mailbox = createTestMailbox({
        accessToken: "secret-access",
        refreshToken: "secret-refresh",
      })
      await storage.addMailbox(mailbox)

      const retrieved = await storage.getMailboxes()
      expect(retrieved[0].accessToken).toBe("secret-access")
      expect(retrieved[0].refreshToken).toBe("secret-refresh")
    })

    it("should handle decryption errors", async () => {
      await storage.addMailbox(createTestMailbox())

      vi.mocked(decrypt).mockRejectedValueOnce(new Error("Bad key"))

      await expect(storage.getMailboxes()).rejects.toThrow(DecryptionError)
    })

    it("should pass correct parameters to encrypt", async () => {
      const mailbox = createTestMailbox()
      await storage.addMailbox(mailbox)

      expect(encrypt).toHaveBeenCalledWith(
        mailbox.accessToken,
        TEST_MASTER_KEY,
        TEST_SALT
      )
      expect(encrypt).toHaveBeenCalledWith(
        mailbox.refreshToken,
        TEST_MASTER_KEY,
        TEST_SALT
      )
    })

    it("should pass correct parameters to decrypt", async () => {
      const mailbox = createTestMailbox()
      await storage.addMailbox(mailbox)

      await storage.getMailboxes()

      expect(decrypt).toHaveBeenCalledWith(
        expect.objectContaining({ ciphertext: expect.any(String) }),
        TEST_MASTER_KEY
      )
    })
  })

  // ============================================================================
  // Settings and Session Operations
  // ============================================================================

  describe("Settings Operations", () => {
    it("should return default settings if none exist", async () => {
      const settings = await storage.getSettings()
      expect(settings.autoFillEnabled).toBe(true)
      expect(settings.lockEnabled).toBe(false)
      expect(settings.lockTimeoutMinutes).toBe(15)
    })

    it("should update settings", async () => {
      await storage.updateSettings({ autoFillEnabled: false })
      const settings = await storage.getSettings()
      expect(settings.autoFillEnabled).toBe(false)
    })
  })

  describe("Session State Operations", () => {
    it("should return default session state if none exists", async () => {
      const state = await storage.getSessionState()
      expect(state.isLocked).toBe(false)
      expect(state.activeWatchSessions).toEqual([])
    })

    it("should update session state", async () => {
      await storage.updateSessionState({ isLocked: true })
      const state = await storage.getSessionState()
      expect(state.isLocked).toBe(true)
    })
  })

  // ============================================================================
  // Utility Operations
  // ============================================================================

  describe("Utility Operations", () => {
    it("should clear all storage", async () => {
      await storage.addMailbox(createTestMailbox())
      await storage.addCode(createTestCode())

      await storage.clear()

      expect(mockLocalStorage).toEqual({})
      expect(mockSessionStorage).toEqual({})
    })
  })
})
