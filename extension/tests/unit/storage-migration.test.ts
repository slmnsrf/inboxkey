/**
 * Unit tests for Storage Migration
 *
 * Tests storage migration functionality including:
 * - Version upgrade scenarios
 * - Data preservation during migration
 * - Rollback on migration failure
 * - Schema validation before/after migration
 * - Corrupted data handling
 * - Password verification
 * - Backup and restore operations
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import {
  migrateToEncrypted,
  migrateToPlaintext,
} from "@/lib/storage/migration"
import { encrypt, decrypt, deriveKey } from "@/lib/crypto/encryption"
import { StorageError } from "@/lib/storage/errors"
import { STORAGE_KEYS } from "@/lib/storage/schema"
import type { Mailbox, StoredCode } from "@/lib/storage/schema"

// Mock encryption module
vi.mock("@/lib/crypto/encryption", () => ({
  encrypt: vi.fn(),
  decrypt: vi.fn(),
  deriveKey: vi.fn(),
}))

// Mock storage keys for plaintext mode (these need to be added to schema.ts)
const PLAINTEXT_KEYS = {
  MAILBOXES_PLAIN: "mailboxes_plain",
  RECENT_CODES_PLAIN: "recent_codes_plain",
}

// Add plaintext keys to STORAGE_KEYS for migration tests
Object.assign(STORAGE_KEYS, PLAINTEXT_KEYS)

// Test password
const TEST_PASSWORD = "test-password-123"

// Helper to create test mailbox with IMAP/SMTP config
function createTestMailbox(overrides?: Partial<any>): any {
  return {
    id: crypto.randomUUID(),
    providerId: "gmail",
    email: "test@example.com",
    imap: {
      host: "imap.gmail.com",
      port: 993,
      username: "test@example.com",
      password: "plain-password",
    },
    smtp: {
      host: "smtp.gmail.com",
      port: 587,
      username: "test@example.com",
      password: "plain-password",
    },
    ...overrides,
  }
}

// Helper to create test code
function createTestCode(overrides?: Partial<any>): any {
  return {
    code: "123456",
    timestamp: Date.now(),
    from: "test@example.com",
    subject: "Verification code",
    ...overrides,
  }
}

// Helper to create encrypted data
function createEncryptedData(value: string): any {
  return {
    ciphertext: btoa(value + "-encrypted"),
    iv: btoa("test-iv"),
    salt: btoa("test-salt"),
  }
}

describe("Storage Migration", () => {
  let mockLocalStorage: Record<string, any>

  beforeEach(() => {
    // Reset storage
    mockLocalStorage = {}

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
      }
      return Promise.resolve(result)
    })

    vi.mocked(chrome.storage.local.set).mockImplementation((items) => {
      Object.assign(mockLocalStorage, items)
      return Promise.resolve()
    })

    vi.mocked(chrome.storage.local.remove).mockImplementation((keys) => {
      const keyArray = Array.isArray(keys) ? keys : [keys]
      keyArray.forEach((key) => delete mockLocalStorage[key])
      return Promise.resolve()
    })

    // Setup encryption mocks
    vi.mocked(encrypt).mockImplementation(async (data: string) => {
      return createEncryptedData(data)
    })

    vi.mocked(decrypt).mockImplementation(async (encryptedData: any) => {
      const encrypted = encryptedData.ciphertext || encryptedData
      if (typeof encrypted === "string") {
        const decoded = atob(encrypted)
        return decoded.replace("-encrypted", "")
      }
      return encrypted
    })

    vi.mocked(deriveKey).mockImplementation(async (password: string) => {
      return {
        key: {} as CryptoKey,
        salt: new Uint8Array(32),
      }
    })
  })

  // ============================================================================
  // migrateToEncrypted
  // ============================================================================

  describe("migrateToEncrypted", () => {
    it("should migrate plaintext data to encrypted", async () => {
      const mailbox = createTestMailbox()
      const code = createTestCode()

      mockLocalStorage[PLAINTEXT_KEYS.MAILBOXES_PLAIN] = [mailbox]
      mockLocalStorage[PLAINTEXT_KEYS.RECENT_CODES_PLAIN] = [code]

      const result = await migrateToEncrypted(TEST_PASSWORD)

      expect(result.success).toBe(true)
      expect(result.mailboxesMigrated).toBe(1)
      expect(result.codesMigrated).toBe(1)
    })

    it("should encrypt sensitive fields during migration", async () => {
      const mailbox = createTestMailbox({
        imap: { password: "secret-imap" },
        smtp: { password: "secret-smtp" },
      })

      mockLocalStorage[PLAINTEXT_KEYS.MAILBOXES_PLAIN] = [mailbox]
      mockLocalStorage[PLAINTEXT_KEYS.RECENT_CODES_PLAIN] = []

      await migrateToEncrypted(TEST_PASSWORD)

      expect(encrypt).toHaveBeenCalledWith("secret-imap", expect.any(Object))
      expect(encrypt).toHaveBeenCalledWith("secret-smtp", expect.any(Object))
    })

    it("should delete plaintext keys after successful migration", async () => {
      mockLocalStorage[PLAINTEXT_KEYS.MAILBOXES_PLAIN] = [createTestMailbox()]
      mockLocalStorage[PLAINTEXT_KEYS.RECENT_CODES_PLAIN] = [createTestCode()]

      await migrateToEncrypted(TEST_PASSWORD)

      expect(mockLocalStorage[PLAINTEXT_KEYS.MAILBOXES_PLAIN]).toBeUndefined()
      expect(mockLocalStorage[PLAINTEXT_KEYS.RECENT_CODES_PLAIN]).toBeUndefined()
    })

    it("should write encrypted data to correct keys", async () => {
      mockLocalStorage[PLAINTEXT_KEYS.MAILBOXES_PLAIN] = [createTestMailbox()]
      mockLocalStorage[PLAINTEXT_KEYS.RECENT_CODES_PLAIN] = [createTestCode()]

      await migrateToEncrypted(TEST_PASSWORD)

      expect(mockLocalStorage[STORAGE_KEYS.MAILBOXES]).toBeDefined()
      expect(mockLocalStorage[STORAGE_KEYS.RECENT_CODES]).toBeDefined()
    })

    it("should preserve data count during migration", async () => {
      const mailboxes = [
        createTestMailbox({ email: "test1@example.com" }),
        createTestMailbox({ email: "test2@example.com" }),
        createTestMailbox({ email: "test3@example.com" }),
      ]

      mockLocalStorage[PLAINTEXT_KEYS.MAILBOXES_PLAIN] = mailboxes
      mockLocalStorage[PLAINTEXT_KEYS.RECENT_CODES_PLAIN] = []

      const result = await migrateToEncrypted(TEST_PASSWORD)

      expect(result.mailboxesMigrated).toBe(3)
      expect(mockLocalStorage[STORAGE_KEYS.MAILBOXES]).toHaveLength(3)
    })

    it("should validate password before migration", async () => {
      mockLocalStorage[PLAINTEXT_KEYS.MAILBOXES_PLAIN] = []
      mockLocalStorage[PLAINTEXT_KEYS.RECENT_CODES_PLAIN] = []

      const result = await migrateToEncrypted("")

      expect(result.success).toBe(false)
      expect(result.error).toContain("Password cannot be empty")
    })

    it("should create backup before migration", async () => {
      const mailbox = createTestMailbox()
      mockLocalStorage[PLAINTEXT_KEYS.MAILBOXES_PLAIN] = [mailbox]
      mockLocalStorage[PLAINTEXT_KEYS.RECENT_CODES_PLAIN] = []

      // Mock encrypt to fail
      vi.mocked(encrypt).mockRejectedValueOnce(new Error("Encryption failed"))

      const result = await migrateToEncrypted(TEST_PASSWORD)

      // Should fail but restore backup
      expect(result.success).toBe(false)
      expect(mockLocalStorage[PLAINTEXT_KEYS.MAILBOXES_PLAIN]).toEqual([mailbox])
    })

    it("should rollback on encryption failure", async () => {
      const originalMailbox = createTestMailbox()
      mockLocalStorage[PLAINTEXT_KEYS.MAILBOXES_PLAIN] = [originalMailbox]
      mockLocalStorage[PLAINTEXT_KEYS.RECENT_CODES_PLAIN] = []

      vi.mocked(encrypt).mockRejectedValueOnce(new Error("Encryption failed"))

      const result = await migrateToEncrypted(TEST_PASSWORD)

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(mockLocalStorage[PLAINTEXT_KEYS.MAILBOXES_PLAIN]).toBeDefined()
    })

    it("should rollback on validation failure", async () => {
      const mailbox = createTestMailbox()
      mockLocalStorage[PLAINTEXT_KEYS.MAILBOXES_PLAIN] = [mailbox]
      mockLocalStorage[PLAINTEXT_KEYS.RECENT_CODES_PLAIN] = []

      // Mock encrypt to return invalid structure
      vi.mocked(encrypt).mockImplementation(async () => {
        return null as any // Invalid encrypted data
      })

      const result = await migrateToEncrypted(TEST_PASSWORD)

      expect(result.success).toBe(false)
      expect(mockLocalStorage[PLAINTEXT_KEYS.MAILBOXES_PLAIN]).toBeDefined()
    })

    it("should handle empty mailboxes array", async () => {
      mockLocalStorage[PLAINTEXT_KEYS.MAILBOXES_PLAIN] = []
      mockLocalStorage[PLAINTEXT_KEYS.RECENT_CODES_PLAIN] = []

      const result = await migrateToEncrypted(TEST_PASSWORD)

      expect(result.success).toBe(true)
      expect(result.mailboxesMigrated).toBe(0)
      expect(result.codesMigrated).toBe(0)
    })

    it("should handle missing plaintext data", async () => {
      // No plaintext data exists
      const result = await migrateToEncrypted(TEST_PASSWORD)

      expect(result.success).toBe(true)
      expect(result.mailboxesMigrated).toBe(0)
      expect(result.codesMigrated).toBe(0)
    })

    it("should validate data structure before migration", async () => {
      mockLocalStorage[PLAINTEXT_KEYS.MAILBOXES_PLAIN] = "invalid-structure"
      mockLocalStorage[PLAINTEXT_KEYS.RECENT_CODES_PLAIN] = []

      const result = await migrateToEncrypted(TEST_PASSWORD)

      expect(result.success).toBe(false)
      expect(result.error).toContain("Invalid mailboxes data structure")
    })

    it("should throw on rollback failure", async () => {
      mockLocalStorage[PLAINTEXT_KEYS.MAILBOXES_PLAIN] = [createTestMailbox()]
      mockLocalStorage[PLAINTEXT_KEYS.RECENT_CODES_PLAIN] = []

      // Mock encrypt to fail
      vi.mocked(encrypt).mockRejectedValue(new Error("Encryption failed"))

      // Mock storage.set to fail on rollback
      vi.mocked(chrome.storage.local.set).mockRejectedValueOnce(
        new Error("Storage error")
      )

      await expect(migrateToEncrypted(TEST_PASSWORD)).rejects.toThrow(
        StorageError
      )
    })
  })

  // ============================================================================
  // migrateToPlaintext
  // ============================================================================

  describe("migrateToPlaintext", () => {
    it("should migrate encrypted data to plaintext", async () => {
      const mailbox = createTestMailbox({
        imap: { password: createEncryptedData("secret-imap") },
        smtp: { password: createEncryptedData("secret-smtp") },
      })
      const code = createTestCode({ code: createEncryptedData("123456") })

      mockLocalStorage[STORAGE_KEYS.MAILBOXES] = [mailbox]
      mockLocalStorage[STORAGE_KEYS.RECENT_CODES] = [code]

      const result = await migrateToPlaintext(TEST_PASSWORD)

      expect(result.success).toBe(true)
      expect(result.mailboxesMigrated).toBe(1)
      expect(result.codesMigrated).toBe(1)
    })

    it("should decrypt sensitive fields during migration", async () => {
      const mailbox = createTestMailbox({
        imap: { password: createEncryptedData("secret-imap") },
        smtp: { password: createEncryptedData("secret-smtp") },
      })

      mockLocalStorage[STORAGE_KEYS.MAILBOXES] = [mailbox]
      mockLocalStorage[STORAGE_KEYS.RECENT_CODES] = []

      await migrateToPlaintext(TEST_PASSWORD)

      expect(decrypt).toHaveBeenCalled()
    })

    it("should verify password before migration", async () => {
      const mailbox = createTestMailbox({
        imap: { password: createEncryptedData("secret") },
      })

      mockLocalStorage[STORAGE_KEYS.MAILBOXES] = [mailbox]
      mockLocalStorage[STORAGE_KEYS.RECENT_CODES] = []

      // Mock decrypt to fail (wrong password)
      vi.mocked(decrypt).mockRejectedValueOnce(new Error("Wrong password"))

      const result = await migrateToPlaintext(TEST_PASSWORD)

      expect(result.success).toBe(false)
      expect(result.error).toContain("Incorrect password or corrupted data")
    })

    it("should delete encrypted keys after successful migration", async () => {
      mockLocalStorage[STORAGE_KEYS.MAILBOXES] = [createTestMailbox()]
      mockLocalStorage[STORAGE_KEYS.RECENT_CODES] = [createTestCode()]

      await migrateToPlaintext(TEST_PASSWORD)

      expect(mockLocalStorage[STORAGE_KEYS.MAILBOXES]).toBeUndefined()
      expect(mockLocalStorage[STORAGE_KEYS.RECENT_CODES]).toBeUndefined()
    })

    it("should write plaintext data to correct keys", async () => {
      mockLocalStorage[STORAGE_KEYS.MAILBOXES] = [createTestMailbox()]
      mockLocalStorage[STORAGE_KEYS.RECENT_CODES] = [createTestCode()]

      await migrateToPlaintext(TEST_PASSWORD)

      expect(mockLocalStorage[PLAINTEXT_KEYS.MAILBOXES_PLAIN]).toBeDefined()
      expect(mockLocalStorage[PLAINTEXT_KEYS.RECENT_CODES_PLAIN]).toBeDefined()
    })

    it("should rollback on decryption failure", async () => {
      const originalMailbox = createTestMailbox()
      mockLocalStorage[STORAGE_KEYS.MAILBOXES] = [originalMailbox]
      mockLocalStorage[STORAGE_KEYS.RECENT_CODES] = []

      vi.mocked(decrypt).mockRejectedValue(new Error("Decryption failed"))

      const result = await migrateToPlaintext(TEST_PASSWORD)

      expect(result.success).toBe(false)
      expect(mockLocalStorage[STORAGE_KEYS.MAILBOXES]).toBeDefined()
    })

    it("should preserve data count during migration", async () => {
      const mailboxes = [
        createTestMailbox({ email: "test1@example.com" }),
        createTestMailbox({ email: "test2@example.com" }),
      ]

      mockLocalStorage[STORAGE_KEYS.MAILBOXES] = mailboxes
      mockLocalStorage[STORAGE_KEYS.RECENT_CODES] = []

      const result = await migrateToPlaintext(TEST_PASSWORD)

      expect(result.mailboxesMigrated).toBe(2)
      expect(mockLocalStorage[PLAINTEXT_KEYS.MAILBOXES_PLAIN]).toHaveLength(2)
    })

    it("should validate password is not empty", async () => {
      const result = await migrateToPlaintext("")

      expect(result.success).toBe(false)
      expect(result.error).toContain("Password cannot be empty")
    })

    it("should handle empty encrypted data", async () => {
      mockLocalStorage[STORAGE_KEYS.MAILBOXES] = []
      mockLocalStorage[STORAGE_KEYS.RECENT_CODES] = []

      const result = await migrateToPlaintext(TEST_PASSWORD)

      expect(result.success).toBe(true)
      expect(result.mailboxesMigrated).toBe(0)
      expect(result.codesMigrated).toBe(0)
    })

    it("should validate data structure before migration", async () => {
      mockLocalStorage[STORAGE_KEYS.MAILBOXES] = "invalid-structure"
      mockLocalStorage[STORAGE_KEYS.RECENT_CODES] = []

      const result = await migrateToPlaintext(TEST_PASSWORD)

      expect(result.success).toBe(false)
      expect(result.error).toContain("Invalid mailboxes data structure")
    })
  })

  // ============================================================================
  // Migration Validation
  // ============================================================================

  describe("Migration Validation", () => {
    it("should validate mailbox count matches after migration", async () => {
      const mailboxes = [
        createTestMailbox({ email: "test1@example.com" }),
        createTestMailbox({ email: "test2@example.com" }),
        createTestMailbox({ email: "test3@example.com" }),
      ]

      mockLocalStorage[PLAINTEXT_KEYS.MAILBOXES_PLAIN] = mailboxes
      mockLocalStorage[PLAINTEXT_KEYS.RECENT_CODES_PLAIN] = []

      const result = await migrateToEncrypted(TEST_PASSWORD)

      expect(result.mailboxesMigrated).toBe(3)
      expect(mockLocalStorage[STORAGE_KEYS.MAILBOXES]).toHaveLength(3)
    })

    it("should validate code count matches after migration", async () => {
      const codes = [
        createTestCode({ code: "111111" }),
        createTestCode({ code: "222222" }),
      ]

      mockLocalStorage[PLAINTEXT_KEYS.MAILBOXES_PLAIN] = []
      mockLocalStorage[PLAINTEXT_KEYS.RECENT_CODES_PLAIN] = codes

      const result = await migrateToEncrypted(TEST_PASSWORD)

      expect(result.codesMigrated).toBe(2)
      expect(mockLocalStorage[STORAGE_KEYS.RECENT_CODES]).toHaveLength(2)
    })

    it("should preserve email addresses during migration", async () => {
      const email = "preserve@example.com"
      const mailbox = createTestMailbox({ email })

      mockLocalStorage[PLAINTEXT_KEYS.MAILBOXES_PLAIN] = [mailbox]
      mockLocalStorage[PLAINTEXT_KEYS.RECENT_CODES_PLAIN] = []

      await migrateToEncrypted(TEST_PASSWORD)

      const migrated = mockLocalStorage[STORAGE_KEYS.MAILBOXES][0]
      expect(migrated.email).toBe(email)
    })

    it("should preserve timestamps during migration", async () => {
      const timestamp = Date.now()
      const code = createTestCode({ timestamp })

      mockLocalStorage[PLAINTEXT_KEYS.MAILBOXES_PLAIN] = []
      mockLocalStorage[PLAINTEXT_KEYS.RECENT_CODES_PLAIN] = [code]

      await migrateToEncrypted(TEST_PASSWORD)

      const migrated = mockLocalStorage[STORAGE_KEYS.RECENT_CODES][0]
      expect(migrated.timestamp).toBe(timestamp)
    })
  })

  // ============================================================================
  // Corrupted Data Handling
  // ============================================================================

  describe("Corrupted Data Handling", () => {
    it("should handle corrupted mailbox data gracefully", async () => {
      mockLocalStorage[PLAINTEXT_KEYS.MAILBOXES_PLAIN] = [
        { invalid: "mailbox" },
      ]
      mockLocalStorage[PLAINTEXT_KEYS.RECENT_CODES_PLAIN] = []

      const result = await migrateToEncrypted(TEST_PASSWORD)

      // Should attempt migration but may fail validation
      expect(result.success).toBeDefined()
    })

    it("should handle corrupted code data gracefully", async () => {
      mockLocalStorage[PLAINTEXT_KEYS.MAILBOXES_PLAIN] = []
      mockLocalStorage[PLAINTEXT_KEYS.RECENT_CODES_PLAIN] = [{ invalid: "code" }]

      const result = await migrateToEncrypted(TEST_PASSWORD)

      expect(result.success).toBeDefined()
    })

    it("should handle null data gracefully", async () => {
      mockLocalStorage[PLAINTEXT_KEYS.MAILBOXES_PLAIN] = null
      mockLocalStorage[PLAINTEXT_KEYS.RECENT_CODES_PLAIN] = null

      const result = await migrateToEncrypted(TEST_PASSWORD)

      expect(result.success).toBe(false)
      expect(result.error).toContain("Invalid")
    })

    it("should handle undefined data gracefully", async () => {
      // No data set - keys don't exist
      const result = await migrateToEncrypted(TEST_PASSWORD)

      expect(result.success).toBe(true)
      expect(result.mailboxesMigrated).toBe(0)
    })
  })

  // ============================================================================
  // Backward Compatibility - StoredCode Migration
  // ============================================================================

  describe("Backward Compatibility - StoredCode Migration", () => {
    it("should migrate old format codes without new fields", async () => {
      const oldCode = {
        code: "123456",
        timestamp: Date.now(),
        from: "test@example.com",
        subject: "Verification code",
      }

      mockLocalStorage[PLAINTEXT_KEYS.MAILBOXES_PLAIN] = []
      mockLocalStorage[PLAINTEXT_KEYS.RECENT_CODES_PLAIN] = [oldCode]

      const result = await migrateToEncrypted(TEST_PASSWORD)

      expect(result.success).toBe(true)
      expect(result.codesMigrated).toBe(1)

      const migratedCode = mockLocalStorage[STORAGE_KEYS.RECENT_CODES][0]
      expect(migratedCode).toBeDefined()
      expect(migratedCode.senderETLD).toBeUndefined()
      expect(migratedCode.receivedAt).toBeUndefined()
      expect(migratedCode.domainAffinity).toBeUndefined()
    })

    it("should migrate new format codes with all fields", async () => {
      const newCode = {
        code: "654321",
        timestamp: Date.now(),
        from: "noreply@example.com",
        subject: "Your code",
        senderETLD: "example.com",
        receivedAt: Date.now() - 1000,
        domainAffinity: 0.85,
      }

      mockLocalStorage[PLAINTEXT_KEYS.MAILBOXES_PLAIN] = []
      mockLocalStorage[PLAINTEXT_KEYS.RECENT_CODES_PLAIN] = [newCode]

      const result = await migrateToEncrypted(TEST_PASSWORD)

      expect(result.success).toBe(true)

      const migratedCode = mockLocalStorage[STORAGE_KEYS.RECENT_CODES][0]
      expect(migratedCode.senderETLD).toBe("example.com")
      expect(migratedCode.receivedAt).toBeDefined()
      expect(migratedCode.domainAffinity).toBe(0.85)
    })

    it("should migrate mixed format codes preserving all data", async () => {
      const oldCode = {
        code: "111111",
        timestamp: Date.now() - 2000,
        from: "old@example.com",
        subject: "Old format",
      }

      const newCode = {
        code: "222222",
        timestamp: Date.now(),
        from: "new@example.com",
        subject: "New format",
        senderETLD: "example.com",
        receivedAt: Date.now() - 500,
        domainAffinity: 0.9,
      }

      mockLocalStorage[PLAINTEXT_KEYS.MAILBOXES_PLAIN] = []
      mockLocalStorage[PLAINTEXT_KEYS.RECENT_CODES_PLAIN] = [oldCode, newCode]

      const result = await migrateToEncrypted(TEST_PASSWORD)

      expect(result.success).toBe(true)
      expect(result.codesMigrated).toBe(2)

      const migratedCodes = mockLocalStorage[STORAGE_KEYS.RECENT_CODES]
      expect(migratedCodes).toHaveLength(2)

      const migratedOld = migratedCodes.find((c: any) => c.timestamp === oldCode.timestamp)
      const migratedNew = migratedCodes.find((c: any) => c.timestamp === newCode.timestamp)

      expect(migratedOld?.senderETLD).toBeUndefined()
      expect(migratedNew?.senderETLD).toBe("example.com")
      expect(migratedNew?.domainAffinity).toBe(0.9)
    })

    it("should decrypt and preserve new fields when migrating to plaintext", async () => {
      const encryptedCode = {
        code: createEncryptedData("123456"),
        timestamp: Date.now(),
        from: "test@example.com",
        subject: "Code",
        senderETLD: "example.com",
        receivedAt: Date.now() - 1000,
        domainAffinity: 0.75,
      }

      mockLocalStorage[STORAGE_KEYS.MAILBOXES] = []
      mockLocalStorage[STORAGE_KEYS.RECENT_CODES] = [encryptedCode]

      const result = await migrateToPlaintext(TEST_PASSWORD)

      expect(result.success).toBe(true)

      const decryptedCode = mockLocalStorage[PLAINTEXT_KEYS.RECENT_CODES_PLAIN][0]
      expect(decryptedCode.senderETLD).toBe("example.com")
      expect(decryptedCode.receivedAt).toBeDefined()
      expect(decryptedCode.domainAffinity).toBe(0.75)
    })
  })

  // ============================================================================
  // Rollback Scenarios
  // ============================================================================

  describe("Rollback Scenarios", () => {
    it("should restore original data on encryption failure", async () => {
      const originalMailbox = createTestMailbox({ email: "original@example.com" })
      mockLocalStorage[PLAINTEXT_KEYS.MAILBOXES_PLAIN] = [originalMailbox]
      mockLocalStorage[PLAINTEXT_KEYS.RECENT_CODES_PLAIN] = []

      vi.mocked(encrypt).mockRejectedValueOnce(new Error("Encryption failed"))

      const result = await migrateToEncrypted(TEST_PASSWORD)

      expect(result.success).toBe(false)
      expect(mockLocalStorage[PLAINTEXT_KEYS.MAILBOXES_PLAIN]).toEqual([
        originalMailbox,
      ])
    })

    it("should restore original data on storage write failure", async () => {
      const originalMailbox = createTestMailbox()
      mockLocalStorage[PLAINTEXT_KEYS.MAILBOXES_PLAIN] = [originalMailbox]
      mockLocalStorage[PLAINTEXT_KEYS.RECENT_CODES_PLAIN] = []

      // Mock set to fail when writing encrypted data
      let setCallCount = 0
      vi.mocked(chrome.storage.local.set).mockImplementation((items) => {
        setCallCount++
        if (
          setCallCount === 1 &&
          (items[STORAGE_KEYS.MAILBOXES] || items[STORAGE_KEYS.RECENT_CODES])
        ) {
          return Promise.reject(new Error("Storage write failed"))
        }
        Object.assign(mockLocalStorage, items)
        return Promise.resolve()
      })

      const result = await migrateToEncrypted(TEST_PASSWORD)

      expect(result.success).toBe(false)
      expect(mockLocalStorage[PLAINTEXT_KEYS.MAILBOXES_PLAIN]).toBeDefined()
    })

    it("should not corrupt data on partial migration failure", async () => {
      const mailboxes = [
        createTestMailbox({ email: "test1@example.com" }),
        createTestMailbox({ email: "test2@example.com" }),
      ]

      mockLocalStorage[PLAINTEXT_KEYS.MAILBOXES_PLAIN] = mailboxes
      mockLocalStorage[PLAINTEXT_KEYS.RECENT_CODES_PLAIN] = []

      // Fail on second mailbox encryption
      let encryptCallCount = 0
      vi.mocked(encrypt).mockImplementation(async (data: string) => {
        encryptCallCount++
        if (encryptCallCount === 3) {
          // Fail on second mailbox (IMAP password)
          throw new Error("Encryption failed")
        }
        return createEncryptedData(data)
      })

      const result = await migrateToEncrypted(TEST_PASSWORD)

      expect(result.success).toBe(false)
      // Original data should still be intact
      expect(mockLocalStorage[PLAINTEXT_KEYS.MAILBOXES_PLAIN]).toHaveLength(2)
    })
  })
})
