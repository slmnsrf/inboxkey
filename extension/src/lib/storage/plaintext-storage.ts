/**
 * Plaintext storage layer for InboxKey
 *
 * Provides type-safe storage operations using Chrome Storage API.
 * All data is stored in plaintext (the lock/unlock feature has been removed).
 *
 * Architecture:
 * - chrome.storage.local: plaintext persistent data
 * - chrome.storage.session: ephemeral session state
 * - Change notifications for cross-context synchronization
 */

import { StorageError, ValidationError } from "./errors"
import type {
  Mailbox,
  SessionState,
  Settings,
  StorageSchema,
  StoredCode,
} from "./schema"
import {
  isMailbox,
  isSessionState,
  isSettings,
  isStoredCode,
  isValidEmail,
  isValidProviderId,
  isValidTimestamp,
  isValidUUID,
} from "./schema"

/**
 * Storage keys for plaintext mode
 */
const PLAINTEXT_STORAGE_KEYS = {
  MAILBOXES: "mailboxes_plain",
  RECENT_CODES: "recent_codes_plain",
  SETTINGS: "settings",
  SESSION_STATE: "session_state",
} as const

/**
 * Mutex for preventing concurrent storage operations
 */
class AsyncMutex {
  private locked = false
  private queue: Array<() => void> = []

  async lock(): Promise<void> {
    if (!this.locked) {
      this.locked = true
      return
    }

    return new Promise<void>((resolve) => {
      this.queue.push(resolve)
    })
  }

  unlock(): void {
    const next = this.queue.shift()
    if (next) {
      next()
    } else {
      this.locked = false
    }
  }

  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    await this.lock()
    try {
      return await fn()
    } finally {
      this.unlock()
    }
  }
}

/**
 * Main plaintext storage class
 */
export class PlaintextStorage {
  private mutex = new AsyncMutex()

  // ============================================================================
  // Mailbox Operations
  // ============================================================================

  async addMailbox(mailbox: Mailbox): Promise<void> {
    this.validateMailbox(mailbox)

    await this.mutex.runExclusive(async () => {
      const mailboxes = await this.getMailboxes()

      // Check for duplicates
      if (mailboxes.some((m) => m.id === mailbox.id)) {
        throw new ValidationError(`Mailbox with ID ${mailbox.id} already exists`)
      }

      if (mailboxes.some((m) => m.email === mailbox.email)) {
        throw new ValidationError(
          `Mailbox with email ${mailbox.email} already exists`
        )
      }

      mailboxes.push(mailbox)
      await this.saveMailboxes(mailboxes)
      await this.notifyChange("mailboxes")
    })
  }

  async getMailboxes(): Promise<Mailbox[]> {
    try {
      const result = await chrome.storage.local.get(
        PLAINTEXT_STORAGE_KEYS.MAILBOXES
      )
      const mailboxes = (result[PLAINTEXT_STORAGE_KEYS.MAILBOXES] ||
        []) as Mailbox[]

      // Validate each mailbox
      for (const mailbox of mailboxes) {
        if (!isMailbox(mailbox)) {
          throw new ValidationError(
            `Invalid mailbox structure for ID ${(mailbox as any).id || "unknown"}`
          )
        }
      }

      return mailboxes
    } catch (error) {
      if (error instanceof ValidationError) throw error
      throw new StorageError("Failed to retrieve mailboxes", error)
    }
  }

  async getMailbox(id: string): Promise<Mailbox | null> {
    if (!isValidUUID(id)) {
      throw new ValidationError("Invalid mailbox ID format", "id")
    }

    const mailboxes = await this.getMailboxes()
    return mailboxes.find((m) => m.id === id) || null
  }

  async updateMailbox(id: string, updates: Partial<Mailbox>): Promise<void> {
    if (!isValidUUID(id)) {
      throw new ValidationError("Invalid mailbox ID format", "id")
    }

    await this.mutex.runExclusive(async () => {
      const mailboxes = await this.getMailboxes()
      const index = mailboxes.findIndex((m) => m.id === id)

      if (index === -1) {
        throw new ValidationError(`Mailbox with ID ${id} not found`)
      }

      const updated = { ...mailboxes[index], ...updates }
      this.validateMailbox(updated)
      mailboxes[index] = updated

      await this.saveMailboxes(mailboxes)
      await this.notifyChange("mailboxes")
    })
  }

  async removeMailbox(id: string): Promise<void> {
    if (!isValidUUID(id)) {
      throw new ValidationError("Invalid mailbox ID format", "id")
    }

    await this.mutex.runExclusive(async () => {
      const mailboxes = await this.getMailboxes()
      const filtered = mailboxes.filter((m) => m.id !== id)

      if (filtered.length === mailboxes.length) {
        throw new ValidationError(`Mailbox with ID ${id} not found`)
      }

      await this.saveMailboxes(filtered)
      await this.notifyChange("mailboxes")
    })
  }

  private async saveMailboxes(mailboxes: Mailbox[]): Promise<void> {
    // Store directly as JSON
    await chrome.storage.local.set({
      [PLAINTEXT_STORAGE_KEYS.MAILBOXES]: mailboxes,
    })
  }

  private validateMailbox(mailbox: Mailbox): void {
    if (!isValidUUID(mailbox.id)) {
      throw new ValidationError("Invalid mailbox ID format", "id")
    }
    if (!isValidProviderId(mailbox.providerId)) {
      throw new ValidationError("Invalid provider ID", "providerId")
    }
    if (!isValidEmail(mailbox.email)) {
      throw new ValidationError("Invalid email format", "email")
    }
    if (!mailbox.accessToken || mailbox.accessToken.length === 0) {
      throw new ValidationError("Access token cannot be empty", "accessToken")
    }
    // Refresh token is only required for providers using PKCE (not Gmail with chrome.identity)
    if (mailbox.providerId !== 'gmail') {
      if (!mailbox.refreshToken || mailbox.refreshToken.length === 0) {
        throw new ValidationError("Refresh token cannot be empty", "refreshToken")
      }
    }
    if (!isValidTimestamp(mailbox.tokenExpiresAt)) {
      throw new ValidationError("Invalid token expiration timestamp", "tokenExpiresAt")
    }
    if (!isValidTimestamp(mailbox.addedAt)) {
      throw new ValidationError("Invalid addedAt timestamp", "addedAt")
    }
    if (!isValidTimestamp(mailbox.lastSyncedAt)) {
      throw new ValidationError("Invalid lastSyncedAt timestamp", "lastSyncedAt")
    }
  }

  // ============================================================================
  // Code Operations
  // ============================================================================

  async addCode(code: StoredCode): Promise<void> {
    this.validateStoredCode(code)

    await this.mutex.runExclusive(async () => {
      const codes = await this.getRecentCodes()
      codes.unshift(code) // Add to beginning (most recent first)
      await this.saveCodes(codes)
      await this.notifyChange("codes")
    })
  }

  async getRecentCodes(limit?: number): Promise<StoredCode[]> {
    try {
      const result = await chrome.storage.local.get(
        PLAINTEXT_STORAGE_KEYS.RECENT_CODES
      )
      const codes = (result[PLAINTEXT_STORAGE_KEYS.RECENT_CODES] ||
        []) as StoredCode[]

      // Validate each code
      for (const code of codes) {
        if (!isStoredCode(code)) {
          throw new ValidationError("Invalid stored code structure")
        }
      }

      // Sort by timestamp descending (newest first)
      codes.sort((a, b) => b.timestamp - a.timestamp)

      return limit ? codes.slice(0, limit) : codes
    } catch (error) {
      if (error instanceof ValidationError) throw error
      throw new StorageError("Failed to retrieve codes", error)
    }
  }

  async markCodeUsed(code: string): Promise<void> {
    if (!code || code.length === 0) {
      throw new ValidationError("Code cannot be empty", "code")
    }

    await this.mutex.runExclusive(async () => {
      const codes = await this.getRecentCodes()
      const found = codes.find((c) => c.code === code)

      if (!found) {
        throw new ValidationError(`Code "${code}" not found`)
      }

      found.used = true
      await this.saveCodes(codes)
      await this.notifyChange("codes")
    })
  }

  async clearOldCodes(olderThanMs: number): Promise<void> {
    if (olderThanMs <= 0) {
      throw new ValidationError("olderThanMs must be positive", "olderThanMs")
    }

    await this.mutex.runExclusive(async () => {
      const codes = await this.getRecentCodes()
      const cutoff = Date.now() - olderThanMs
      const filtered = codes.filter((c) => c.timestamp >= cutoff)

      await this.saveCodes(filtered)
      await this.notifyChange("codes")
    })
  }

  async clearAllCodes(): Promise<void> {
    await this.mutex.runExclusive(async () => {
      await this.saveCodes([])
      await this.notifyChange("codes")
    })
  }

  private async saveCodes(codes: StoredCode[]): Promise<void> {
    // Store directly as JSON
    await chrome.storage.local.set({
      [PLAINTEXT_STORAGE_KEYS.RECENT_CODES]: codes,
    })
  }

  private validateStoredCode(code: StoredCode): void {
    if (!code.code || code.code.length === 0) {
      throw new ValidationError("Code cannot be empty", "code")
    }
    if (!isValidTimestamp(code.timestamp)) {
      throw new ValidationError("Invalid timestamp", "timestamp")
    }
    if (!code.source || code.source.length === 0) {
      throw new ValidationError("Source cannot be empty", "source")
    }
    if (typeof code.used !== "boolean") {
      throw new ValidationError("Used must be a boolean", "used")
    }
  }

  // ============================================================================
  // Settings Operations
  // ============================================================================

  async getSettings(): Promise<Settings> {
    try {
      const result = await chrome.storage.local.get(
        PLAINTEXT_STORAGE_KEYS.SETTINGS
      )
      const settings = result[PLAINTEXT_STORAGE_KEYS.SETTINGS]

      if (!settings) {
        return this.getDefaultSettings()
      }

      if (!isSettings(settings)) {
        throw new ValidationError("Invalid settings structure")
      }

      return settings
    } catch (error) {
      if (error instanceof ValidationError) throw error
      throw new StorageError("Failed to retrieve settings", error)
    }
  }

  async updateSettings(updates: Partial<Settings>): Promise<void> {
    await this.mutex.runExclusive(async () => {
      const current = await this.getSettings()
      const updated = { ...current, ...updates }

      if (!isSettings(updated)) {
        throw new ValidationError("Invalid settings structure")
      }

      await chrome.storage.local.set({
        [PLAINTEXT_STORAGE_KEYS.SETTINGS]: updated,
      })
      await this.notifyChange("settings")
    })
  }

  private getDefaultSettings(): Settings {
    return {
      autoFillEnabled: true,
      lockEnabled: false,
      lockTimeoutMinutes: 15,
      allowedDomains: [],
      deniedDomains: [],
      notificationsEnabled: true,
    }
  }

  // ============================================================================
  // Session State Operations (chrome.storage.session, unencrypted)
  // ============================================================================

  async getSessionState(): Promise<SessionState> {
    try {
      const result = await chrome.storage.session.get(
        PLAINTEXT_STORAGE_KEYS.SESSION_STATE
      )
      const state = result[PLAINTEXT_STORAGE_KEYS.SESSION_STATE]

      if (!state) {
        return this.getDefaultSessionState()
      }

      if (!isSessionState(state)) {
        throw new ValidationError("Invalid session state structure")
      }

      return state
    } catch (error) {
      if (error instanceof ValidationError) throw error
      throw new StorageError("Failed to retrieve session state", error)
    }
  }

  async updateSessionState(updates: Partial<SessionState>): Promise<void> {
    await this.mutex.runExclusive(async () => {
      const current = await this.getSessionState()
      const updated = { ...current, ...updates }

      if (!isSessionState(updated)) {
        throw new ValidationError("Invalid session state structure")
      }

      await chrome.storage.session.set({
        [PLAINTEXT_STORAGE_KEYS.SESSION_STATE]: updated,
      })
      await this.notifyChange("session")
    })
  }

  private getDefaultSessionState(): SessionState {
    return {
      isLocked: false,
      unlockedAt: undefined,
      activeWatchSessions: [],
    }
  }

  // ============================================================================
  // Utility Operations
  // ============================================================================

  async clear(): Promise<void> {
    await this.mutex.runExclusive(async () => {
      // Clear all plaintext storage keys
      await chrome.storage.local.remove([
        PLAINTEXT_STORAGE_KEYS.MAILBOXES,
        PLAINTEXT_STORAGE_KEYS.RECENT_CODES,
        PLAINTEXT_STORAGE_KEYS.SETTINGS,
      ])
      await chrome.storage.session.clear()
      await this.notifyChange("clear")
    })
  }

  async getStorageSize(): Promise<number> {
    try {
      // Get size of plaintext storage keys only
      const result = await chrome.storage.local.getBytesInUse([
        PLAINTEXT_STORAGE_KEYS.MAILBOXES,
        PLAINTEXT_STORAGE_KEYS.RECENT_CODES,
        PLAINTEXT_STORAGE_KEYS.SETTINGS,
      ])
      return result
    } catch (error) {
      throw new StorageError("Failed to get storage size", error)
    }
  }

  // ============================================================================
  // Internal Helpers
  // ============================================================================

  private async notifyChange(type: string): Promise<void> {
    // Emit storage change event for cross-context synchronization
    // This allows service worker, popup, and content scripts to stay in sync
    try {
      await chrome.runtime.sendMessage({
        type: "storage-changed",
        changeType: type,
        timestamp: Date.now(),
      }).catch(() => {
        // Silently ignore - no listeners available (expected during startup/shutdown)
      })
    } catch (error) {
      // Ignore errors if no listeners are registered
      // This is expected during initial setup or when extension contexts are unavailable
    }
  }
}
