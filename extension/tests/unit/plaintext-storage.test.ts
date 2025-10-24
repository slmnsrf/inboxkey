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
  DOMAIN_PREFERENCES: "domain_preferences",
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
  // Code Operations (REMOVED - code storage functionality removed)
  // ============================================================================
  // Note: Code storage operations (addCode, getRecentCodes, markCodeUsed,
  // clearOldCodes, clearAllCodes) have been removed as per architectural changes.

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
      await storage.updateSettings({ autoFillEnabled: false })

      // Add some encrypted storage data (should not be cleared)
      mockLocalStorage["mailboxes"] = [{ encrypted: "data" }]

      await storage.clear()

      expect(mockLocalStorage[PLAINTEXT_STORAGE_KEYS.MAILBOXES]).toBeUndefined()
      expect(mockLocalStorage[PLAINTEXT_STORAGE_KEYS.SETTINGS]).toBeUndefined()
      expect(mockSessionStorage).toEqual({})

      // Encrypted data should still exist
      expect(mockLocalStorage["mailboxes"]).toBeDefined()
    })

    it("should get storage size for plaintext keys only", async () => {
      await storage.addMailbox(createTestMailbox())

      vi.mocked(chrome.storage.local as any).getBytesInUse = vi
        .fn()
        .mockResolvedValue(1024)

      const size = await storage.getStorageSize()
      expect(size).toBe(1024)
      expect(chrome.storage.local.getBytesInUse).toHaveBeenCalledWith([
        PLAINTEXT_STORAGE_KEYS.MAILBOXES,
        PLAINTEXT_STORAGE_KEYS.SETTINGS,
        PLAINTEXT_STORAGE_KEYS.DOMAIN_PREFERENCES,
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
