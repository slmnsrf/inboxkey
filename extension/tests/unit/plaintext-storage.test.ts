/**
 * Unit tests for PlaintextStorage
 *
 * Tests plaintext storage operations including:
 * - Mailbox CRUD operations (without encryption)
 * - Code storage and retrieval
 * - Validation logic
 * - AsyncMutex behavior
 * - Concurrent operations
 * - Settings and session state management
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import { PlaintextStorage } from "@/lib/storage/plaintext-storage"
import { ValidationError, StorageError } from "@/lib/storage/errors"
import type { Mailbox, StoredCode } from "@/lib/storage/schema"

// Storage keys for plaintext mode
const PLAINTEXT_STORAGE_KEYS = {
  MAILBOXES: "mailboxes_plain",
  RECENT_CODES: "recent_codes_plain",
  SETTINGS: "settings",
  SESSION_STATE: "session_state",
}

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

describe("PlaintextStorage", () => {
  let storage: PlaintextStorage
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

    vi.mocked(chrome.storage.local.remove).mockImplementation((keys) => {
      const keyArray = Array.isArray(keys) ? keys : [keys]
      keyArray.forEach((key) => delete mockLocalStorage[key])
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

    // Create storage instance
    storage = new PlaintextStorage()
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

    it("should store tokens in plaintext", async () => {
      const mailbox = createTestMailbox({
        accessToken: "plain-access-token",
        refreshToken: "plain-refresh-token",
      })
      await storage.addMailbox(mailbox)

      // Verify tokens are stored as-is
      const stored = mockLocalStorage[PLAINTEXT_STORAGE_KEYS.MAILBOXES][0]
      expect(stored.accessToken).toBe("plain-access-token")
      expect(stored.refreshToken).toBe("plain-refresh-token")
    })

    it("should prevent duplicate IDs", async () => {
      const mailbox = createTestMailbox()
      await storage.addMailbox(mailbox)

      await expect(storage.addMailbox(mailbox)).rejects.toThrow(ValidationError)
      await expect(storage.addMailbox(mailbox)).rejects.toThrow("already exists")
    })

    it("should prevent duplicate emails", async () => {
      const mailbox1 = createTestMailbox({ email: "test@example.com" })
      const mailbox2 = createTestMailbox({ email: "test@example.com" })

      await storage.addMailbox(mailbox1)
      await expect(storage.addMailbox(mailbox2)).rejects.toThrow(ValidationError)
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

    it("should validate access token is not empty", async () => {
      const invalidMailbox = createTestMailbox({ accessToken: "" })
      await expect(storage.addMailbox(invalidMailbox)).rejects.toThrow(
        ValidationError
      )
      await expect(storage.addMailbox(invalidMailbox)).rejects.toThrow(
        "Access token cannot be empty"
      )
    })

    it("should allow Gmail without refresh token", async () => {
      const gmailMailbox = createTestMailbox({
        providerId: "gmail",
        refreshToken: undefined,
      })
      await storage.addMailbox(gmailMailbox)

      const retrieved = await storage.getMailboxes()
      expect(retrieved).toHaveLength(1)
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

    it("should validate timestamps", async () => {
      const invalidMailbox = createTestMailbox({ tokenExpiresAt: -1 })
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
    it("should return all mailboxes", async () => {
      const mailbox1 = createTestMailbox({ email: "test1@example.com" })
      const mailbox2 = createTestMailbox({ email: "test2@example.com" })

      await storage.addMailbox(mailbox1)
      await storage.addMailbox(mailbox2)

      const mailboxes = await storage.getMailboxes()
      expect(mailboxes).toHaveLength(2)
    })

    it("should return tokens in plaintext", async () => {
      const mailbox = createTestMailbox({
        accessToken: "plain-access",
        refreshToken: "plain-refresh",
      })
      await storage.addMailbox(mailbox)

      const mailboxes = await storage.getMailboxes()
      expect(mailboxes[0].accessToken).toBe("plain-access")
      expect(mailboxes[0].refreshToken).toBe("plain-refresh")
    })

    it("should handle empty storage", async () => {
      const mailboxes = await storage.getMailboxes()
      expect(mailboxes).toEqual([])
    })

    it("should validate stored mailboxes", async () => {
      // Manually corrupt storage
      mockLocalStorage[PLAINTEXT_STORAGE_KEYS.MAILBOXES] = [{ invalid: "data" }]

      await expect(storage.getMailboxes()).rejects.toThrow(ValidationError)
    })

    it("should throw StorageError on storage failure", async () => {
      vi.mocked(chrome.storage.local.get).mockRejectedValueOnce(
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
    it("should update existing mailbox", async () => {
      const mailbox = createTestMailbox()
      await storage.addMailbox(mailbox)

      const newToken = "updated-access-token"
      await storage.updateMailbox(mailbox.id, { accessToken: newToken })

      const updated = await storage.getMailbox(mailbox.id)
      expect(updated?.accessToken).toBe(newToken)
    })

    it("should preserve other mailboxes", async () => {
      const mailbox1 = createTestMailbox({ email: "test1@example.com" })
      const mailbox2 = createTestMailbox({ email: "test2@example.com" })

      await storage.addMailbox(mailbox1)
      await storage.addMailbox(mailbox2)

      await storage.updateMailbox(mailbox1.id, { accessToken: "new-token" })

      const mailboxes = await storage.getMailboxes()
      expect(mailboxes).toHaveLength(2)
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

    it("should store code in plaintext", async () => {
      const code = createTestCode({ code: "123456" })
      await storage.addCode(code)

      const stored = mockLocalStorage[PLAINTEXT_STORAGE_KEYS.RECENT_CODES][0]
      expect(stored.code).toBe("123456")
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

    it("should validate code is not empty", async () => {
      const invalidCode = createTestCode({ code: "" })
      await expect(storage.addCode(invalidCode)).rejects.toThrow(ValidationError)
    })

    it("should validate timestamp", async () => {
      const invalidCode = createTestCode({ timestamp: -1 })
      await expect(storage.addCode(invalidCode)).rejects.toThrow(ValidationError)
    })

    it("should validate source", async () => {
      const invalidCode = createTestCode({ source: "" })
      await expect(storage.addCode(invalidCode)).rejects.toThrow(ValidationError)
    })

    it("should validate used field is boolean", async () => {
      const invalidCode = createTestCode({ used: "true" as any })
      await expect(storage.addCode(invalidCode)).rejects.toThrow(ValidationError)
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

    it("should limit results when limit parameter provided", async () => {
      for (let i = 0; i < 10; i++) {
        await storage.addCode(createTestCode({ code: `${i}` }))
      }

      const codes = await storage.getRecentCodes(5)
      expect(codes).toHaveLength(5)
    })

    it("should validate stored codes", async () => {
      mockLocalStorage[PLAINTEXT_STORAGE_KEYS.RECENT_CODES] = [{ invalid: "data" }]

      await expect(storage.getRecentCodes()).rejects.toThrow(ValidationError)
    })

    it("should throw StorageError on storage failure", async () => {
      vi.mocked(chrome.storage.local.get).mockRejectedValueOnce(
        new Error("Storage error")
      )

      await expect(storage.getRecentCodes()).rejects.toThrow(StorageError)
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
    it("should remove codes older than threshold", async () => {
      const oldCode = createTestCode({ timestamp: Date.now() - 10000 })
      const recentCode = createTestCode({ timestamp: Date.now() })

      await storage.addCode(oldCode)
      await storage.addCode(recentCode)

      await storage.clearOldCodes(5000)

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

    it("should validate olderThanMs parameter", async () => {
      await expect(storage.clearOldCodes(0)).rejects.toThrow(ValidationError)
      await expect(storage.clearOldCodes(-1000)).rejects.toThrow(ValidationError)
    })
  })

  describe("clearAllCodes", () => {
    it("should clear all codes", async () => {
      await storage.addCode(createTestCode())
      await storage.addCode(createTestCode())

      await storage.clearAllCodes()

      const codes = await storage.getRecentCodes()
      expect(codes).toEqual([])
    })
  })

  // ============================================================================
  // AsyncMutex Behavior
  // ============================================================================

  describe("AsyncMutex Behavior", () => {
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

      await expect(storage.addMailbox(invalidMailbox)).rejects.toThrow()
      await storage.addMailbox(validMailbox)

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

    it("should prevent race conditions during updates", async () => {
      const mailbox = createTestMailbox()
      await storage.addMailbox(mailbox)

      const now = Date.now()
      await Promise.all([
        storage.updateMailbox(mailbox.id, { lastSyncedAt: now + 1000 }),
        storage.updateMailbox(mailbox.id, { lastSyncedAt: now + 2000 }),
        storage.updateMailbox(mailbox.id, { lastSyncedAt: now + 3000 }),
      ])

      const updated = await storage.getMailbox(mailbox.id)
      expect(updated).not.toBeNull()
      expect([now + 1000, now + 2000, now + 3000]).toContain(
        updated!.lastSyncedAt
      )
    })
  })

  // ============================================================================
  // Backward Compatibility Tests
  // ============================================================================

  describe("Backward Compatibility - StoredCode", () => {
    it("should accept old format codes without new optional fields", async () => {
      const oldFormatCode = createTestCode({
        code: "123456",
        timestamp: Date.now(),
        source: "test@example.com",
        used: false,
      })

      await storage.addCode(oldFormatCode)

      const codes = await storage.getRecentCodes()
      expect(codes).toHaveLength(1)
      expect(codes[0].code).toBe("123456")
      expect(codes[0].senderETLD).toBeUndefined()
      expect(codes[0].receivedAt).toBeUndefined()
      expect(codes[0].domainAffinity).toBeUndefined()
    })

    it("should accept new format codes with all optional fields", async () => {
      const newFormatCode = createTestCode({
        code: "654321",
        timestamp: Date.now(),
        source: "noreply@example.com",
        used: false,
        senderETLD: "example.com",
        receivedAt: Date.now() - 1000,
        domainAffinity: 0.95,
      })

      await storage.addCode(newFormatCode)

      const codes = await storage.getRecentCodes()
      expect(codes).toHaveLength(1)
      expect(codes[0].code).toBe("654321")
      expect(codes[0].senderETLD).toBe("example.com")
      expect(codes[0].receivedAt).toBeDefined()
      expect(codes[0].domainAffinity).toBe(0.95)
    })

    it("should handle mixed format codes in storage", async () => {
      const oldCode = createTestCode({
        code: "111111",
        timestamp: Date.now() - 2000,
        source: "old@example.com",
        used: false,
      })

      const newCode = createTestCode({
        code: "222222",
        timestamp: Date.now(),
        source: "new@example.com",
        used: false,
        senderETLD: "example.com",
        receivedAt: Date.now() - 500,
        domainAffinity: 0.8,
      })

      await storage.addCode(oldCode)
      await storage.addCode(newCode)

      const codes = await storage.getRecentCodes()
      expect(codes).toHaveLength(2)

      const retrievedNew = codes.find(c => c.code === "222222")
      const retrievedOld = codes.find(c => c.code === "111111")

      expect(retrievedNew?.senderETLD).toBe("example.com")
      expect(retrievedNew?.domainAffinity).toBe(0.8)

      expect(retrievedOld?.senderETLD).toBeUndefined()
      expect(retrievedOld?.receivedAt).toBeUndefined()
    })

    it("should preserve all fields during retrieval including optional ones", async () => {
      const codeWithAllFields = createTestCode({
        code: "999999",
        timestamp: Date.now(),
        source: "complete@example.com",
        siteMatch: "example.com",
        used: false,
        mailboxId: crypto.randomUUID(),
        senderETLD: "example.com",
        receivedAt: Date.now() - 2000,
        domainAffinity: 0.75,
      })

      await storage.addCode(codeWithAllFields)

      const codes = await storage.getRecentCodes()
      expect(codes[0]).toMatchObject({
        code: "999999",
        source: "complete@example.com",
        siteMatch: "example.com",
        used: false,
        mailboxId: codeWithAllFields.mailboxId,
        senderETLD: "example.com",
        receivedAt: codeWithAllFields.receivedAt,
        domainAffinity: 0.75,
      })
    })

    it("should store code with invalid receivedAt but fail on retrieval", async () => {
      const invalidCode = createTestCode({
        code: "123456",
        timestamp: Date.now(),
        source: "test@example.com",
        used: false,
        receivedAt: -1, // Invalid timestamp
      })

      // addCode only validates required fields, not optional ones
      await storage.addCode(invalidCode)

      // But retrieval validates with isStoredCode which checks receivedAt
      await expect(storage.getRecentCodes()).rejects.toThrow(ValidationError)
    })
  })

  // ============================================================================
  // Validation Logic
  // ============================================================================

  describe("Validation Logic", () => {
    it("should validate all required mailbox fields", async () => {
      const validMailbox = createTestMailbox()
      await expect(storage.addMailbox(validMailbox)).resolves.not.toThrow()
    })

    it("should validate provider IDs", async () => {
      const providers: Array<Mailbox["providerId"]> = [
        "gmail",
        "outlook",
        "imap-bridge",
      ]

      for (const providerId of providers) {
        const mailbox = createTestMailbox({
          providerId,
          email: `${providerId}@example.com`,
          id: crypto.randomUUID(),
        })
        await expect(storage.addMailbox(mailbox)).resolves.not.toThrow()
      }
    })

    it("should validate email formats", async () => {
      const validEmails = [
        "user@example.com",
        "user.name@example.com",
        "user+tag@example.co.uk",
      ]

      for (const email of validEmails) {
        const mailbox = createTestMailbox({ email, id: crypto.randomUUID() })
        await expect(storage.addMailbox(mailbox)).resolves.not.toThrow()
      }
    })

    it("should reject invalid email formats", async () => {
      const invalidEmails = ["not-an-email", "@example.com", "user@", ""]

      for (const email of invalidEmails) {
        const mailbox = createTestMailbox({ email })
        await expect(storage.addMailbox(mailbox)).rejects.toThrow(
          "Invalid email format"
        )
      }
    })

    it("should validate UUID formats", async () => {
      const uuid = crypto.randomUUID()
      const mailbox = createTestMailbox({ id: uuid })
      await expect(storage.addMailbox(mailbox)).resolves.not.toThrow()
    })

    it("should reject invalid UUID formats", async () => {
      const invalidUUIDs = ["123", "not-a-uuid", ""]

      for (const id of invalidUUIDs) {
        const mailbox = createTestMailbox({ id })
        await expect(storage.addMailbox(mailbox)).rejects.toThrow()
      }
    })

    it("should validate timestamps are within reasonable range", async () => {
      const validTimestamp = Date.now()
      const mailbox = createTestMailbox({ tokenExpiresAt: validTimestamp })
      await expect(storage.addMailbox(mailbox)).resolves.not.toThrow()
    })

    it("should reject invalid timestamps", async () => {
      const invalidTimestamps = [-1, 1000]

      for (const timestamp of invalidTimestamps) {
        const mailbox = createTestMailbox({ tokenExpiresAt: timestamp })
        await expect(storage.addMailbox(mailbox)).rejects.toThrow()
      }
    })
  })

  // ============================================================================
  // Settings Operations
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

    it("should partially update settings", async () => {
      await storage.updateSettings({ autoFillEnabled: false })
      await storage.updateSettings({ lockEnabled: true })

      const settings = await storage.getSettings()
      expect(settings.autoFillEnabled).toBe(false)
      expect(settings.lockEnabled).toBe(true)
    })

    it("should validate settings structure", async () => {
      await expect(
        storage.updateSettings({ lockTimeoutMinutes: -1 } as any)
      ).rejects.toThrow(ValidationError)
    })

    it("should send change notification", async () => {
      vi.mocked(chrome.runtime.sendMessage).mockClear()
      await storage.updateSettings({ autoFillEnabled: false })

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: "storage-changed",
        changeType: "settings",
        timestamp: expect.any(Number),
      })
    })
  })

  // ============================================================================
  // Session State Operations
  // ============================================================================

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

    it("should update watch sessions", async () => {
      const watchSession = {
        id: crypto.randomUUID(),
        startedAt: Date.now(),
        tabId: 123,
        url: "https://example.com",
        pollsRemaining: 3,
      }

      await storage.updateSessionState({ activeWatchSessions: [watchSession] })

      const state = await storage.getSessionState()
      expect(state.activeWatchSessions).toHaveLength(1)
      expect(state.activeWatchSessions[0].id).toBe(watchSession.id)
    })

    it("should validate session state structure", async () => {
      await expect(
        storage.updateSessionState({ isLocked: "true" } as any)
      ).rejects.toThrow(ValidationError)
    })

    it("should send change notification", async () => {
      vi.mocked(chrome.runtime.sendMessage).mockClear()
      await storage.updateSessionState({ isLocked: true })

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: "storage-changed",
        changeType: "session",
        timestamp: expect.any(Number),
      })
    })
  })

  // ============================================================================
  // Utility Operations
  // ============================================================================

  describe("Utility Operations", () => {
    it("should clear only plaintext storage keys", async () => {
      await storage.addMailbox(createTestMailbox())
      await storage.addCode(createTestCode())
      await storage.updateSettings({ autoFillEnabled: false })

      // Add some encrypted storage data (should not be cleared)
      mockLocalStorage["mailboxes"] = [{ encrypted: "data" }]

      await storage.clear()

      expect(mockLocalStorage[PLAINTEXT_STORAGE_KEYS.MAILBOXES]).toBeUndefined()
      expect(mockLocalStorage[PLAINTEXT_STORAGE_KEYS.RECENT_CODES]).toBeUndefined()
      expect(mockLocalStorage[PLAINTEXT_STORAGE_KEYS.SETTINGS]).toBeUndefined()
      expect(mockSessionStorage).toEqual({})

      // Encrypted data should still exist
      expect(mockLocalStorage["mailboxes"]).toBeDefined()
    })

    it("should get storage size for plaintext keys only", async () => {
      await storage.addMailbox(createTestMailbox())
      await storage.addCode(createTestCode())

      vi.mocked(chrome.storage.local as any).getBytesInUse = vi
        .fn()
        .mockResolvedValue(1024)

      const size = await storage.getStorageSize()
      expect(size).toBe(1024)
      expect(chrome.storage.local.getBytesInUse).toHaveBeenCalledWith([
        PLAINTEXT_STORAGE_KEYS.MAILBOXES,
        PLAINTEXT_STORAGE_KEYS.RECENT_CODES,
        PLAINTEXT_STORAGE_KEYS.SETTINGS,
      ])
    })
  })

  // ============================================================================
  // Error Handling
  // ============================================================================

  describe("Error Handling", () => {
    it("should handle chrome.storage errors gracefully", async () => {
      vi.mocked(chrome.storage.local.get).mockRejectedValue(
        new Error("Storage quota exceeded")
      )

      await expect(storage.getMailboxes()).rejects.toThrow(StorageError)
    })

    it("should handle invalid stored data", async () => {
      mockLocalStorage[PLAINTEXT_STORAGE_KEYS.SETTINGS] = { invalid: "data" }

      await expect(storage.getSettings()).rejects.toThrow(ValidationError)
    })

    it("should handle concurrent operation failures", async () => {
      const validMailbox = createTestMailbox()
      const invalidMailbox = createTestMailbox({ email: "invalid" })

      const results = await Promise.allSettled([
        storage.addMailbox(invalidMailbox),
        storage.addMailbox(validMailbox),
      ])

      const fulfilled = results.filter((r) => r.status === "fulfilled")
      const rejected = results.filter((r) => r.status === "rejected")

      expect(fulfilled.length).toBeGreaterThan(0)
      expect(rejected.length).toBeGreaterThan(0)
    })
  })
})
