/**
 * Error State Manager
 *
 * Manages persistent sync error state across service worker restarts.
 * Supports multiple concurrent errors (one per mailbox, deduped by mailboxId).
 *
 * Backward compatibility:
 * Old storage with singular `currentError` is migrated to `currentErrors[]`
 * on load via migrateState().
 */

import type { SyncErrorInfo, SyncErrorState } from '@/lib/storage/schema'
import { STORAGE_KEYS } from '@/lib/storage/schema'

const STORAGE_KEY = STORAGE_KEYS.SYNC_ERROR_STATE
const ERROR_EXPIRY_MS = 15 * 60 * 1000 // 15 minutes
const FAILURE_THRESHOLD = 3

export class ErrorStateManager {
  /**
   * Load error state from storage, migrating from legacy format if needed.
   */
  async load(): Promise<SyncErrorState> {
    const result = await chrome.storage.local.get(STORAGE_KEY)
    const raw = result[STORAGE_KEY]
    if (!raw) return this.getDefaultState()
    return this.migrateState(raw)
  }

  /**
   * Record sync failure for a specific mailbox.
   * Deduplicates by mailboxId: replaces existing error for the same mailbox.
   */
  async recordFailure(error: Error, mailboxId?: string, email?: string): Promise<void> {
    const state = await this.load()

    state.consecutiveFailures++
    state.lastErrorTime = Date.now()

    const classified = this.classifyError(error, mailboxId, email)

    // Deduplicate by mailboxId: replace existing entry for same mailbox
    if (mailboxId) {
      state.currentErrors = state.currentErrors.filter(e => e.mailboxId !== mailboxId)
    }
    state.currentErrors.push(classified)

    state.errorHistory.push({
      timestamp: Date.now(),
      error: error.message,
      mailboxId,
      errorType: classified.type
    })

    // Keep last 20 errors
    if (state.errorHistory.length > 20) {
      state.errorHistory = state.errorHistory.slice(-20)
    }

    await this.save(state)
  }

  /**
   * Record sync success for a specific mailbox.
   * Removes that mailbox's error from the array.
   * If the array becomes empty, resets consecutive failure count.
   *
   * When called without mailboxId (legacy), clears all errors.
   */
  async recordSuccess(mailboxId?: string): Promise<void> {
    const state = await this.load()

    if (mailboxId) {
      // Remove only this mailbox's error
      state.currentErrors = state.currentErrors.filter(e => e.mailboxId !== mailboxId)

      // If no errors remain, reset failure tracking
      if (state.currentErrors.length === 0) {
        state.consecutiveFailures = 0
        state.lastErrorTime = null
      }
    } else {
      // Legacy path: clear everything
      state.consecutiveFailures = 0
      state.lastErrorTime = null
      state.currentErrors = []
    }
    // Keep error history for debugging

    await this.save(state)
  }

  /**
   * Check if should show error badge
   */
  async shouldShowBadge(): Promise<boolean> {
    const state = await this.load()

    if (state.currentErrors.length === 0) return false

    // Show if 3+ consecutive failures
    if (state.consecutiveFailures >= FAILURE_THRESHOLD) return true

    // Show if error persisted >15min
    if (state.lastErrorTime) {
      const errorAge = Date.now() - state.lastErrorTime
      if (errorAge < ERROR_EXPIRY_MS) return true
    }

    return false
  }

  /**
   * Get current errors for popup banner.
   * Filters out expired errors (older than ERROR_EXPIRY_MS).
   * Returns the full array so the popup can decide single vs grouped display.
   */
  async getCurrentErrors(): Promise<SyncErrorInfo[]> {
    const state = await this.load()

    if (state.currentErrors.length === 0 || !state.lastErrorTime) {
      return []
    }

    const errorAge = Date.now() - state.lastErrorTime
    if (errorAge >= ERROR_EXPIRY_MS) {
      return []
    }

    return state.currentErrors
  }

  /**
   * Get current error for popup banner (legacy single-error API).
   * Returns first error or null. Used for backward compatibility.
   */
  async getCurrentError(): Promise<SyncErrorInfo | null> {
    const errors = await this.getCurrentErrors()
    return errors.length > 0 ? errors[0] : null
  }

  /**
   * Remove errors for a specific mailbox (e.g., when mailbox is disconnected).
   * Prevents stale error entries from inflating the banner count.
   */
  async removeMailboxErrors(mailboxId: string): Promise<void> {
    const state = await this.load()
    const before = state.currentErrors.length
    state.currentErrors = state.currentErrors.filter(e => e.mailboxId !== mailboxId)

    if (state.currentErrors.length < before) {
      if (state.currentErrors.length === 0) {
        state.consecutiveFailures = 0
        state.lastErrorTime = null
      }
      await this.save(state)
    }
  }

  /**
   * Clear error state
   */
  async clear(): Promise<void> {
    await this.save(this.getDefaultState())
  }

  private async save(state: SyncErrorState): Promise<void> {
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: state })
    } catch (err) {
      console.warn('[ErrorStateManager] Failed to persist error state:', err)
    }
  }

  private getDefaultState(): SyncErrorState {
    return {
      consecutiveFailures: 0,
      lastErrorTime: null,
      currentErrors: [],
      errorHistory: []
    }
  }

  /**
   * Migrate legacy storage format (singular `currentError`) to new array format.
   */
  private migrateState(raw: Record<string, unknown>): SyncErrorState {
    // Already migrated: has currentErrors array
    if (Array.isArray(raw.currentErrors)) {
      return raw as unknown as SyncErrorState
    }

    // Legacy format: has singular currentError
    const legacyError = (raw as Record<string, unknown>).currentError as SyncErrorInfo | null | undefined
    return {
      consecutiveFailures: (raw.consecutiveFailures as number) || 0,
      lastErrorTime: (raw.lastErrorTime as number | null) ?? null,
      currentErrors: legacyError ? [legacyError] : [],
      errorHistory: (raw.errorHistory as SyncErrorState['errorHistory']) || []
    }
  }

  private classifyError(error: Error, mailboxId?: string, email?: string): SyncErrorInfo {
    const errorMsg = error.message.toLowerCase()
    const accountLabel = email ? ` (${email})` : ''

    // Detect auth errors
    if (errorMsg.includes('401') || errorMsg.includes('auth') ||
        errorMsg.includes('token') || errorMsg.includes('unauthorized')) {
      return {
        type: 'auth-expired',
        variant: 'warning',
        message: `Account access expired${accountLabel}. Reconnect to resume sync.`,
        timestamp: Date.now(),
        mailboxId
      }
    }

    // Detect InboxBridge / native messaging errors
    if (errorMsg.includes('inboxbridge') || errorMsg.includes('native')) {
      return {
        type: 'sync-failed',
        variant: 'warning',
        message: 'InboxBridge connection failed. Check that InboxBridge is running.',
        timestamp: Date.now(),
        mailboxId
      }
    }

    // Detect network errors (includes 'connection' for IMAP connectivity errors)
    if (errorMsg.includes('network') || errorMsg.includes('fetch') ||
        errorMsg.includes('connection')) {
      return {
        type: 'network-offline',
        variant: 'error',
        message: 'Network error. Check your connection.',
        timestamp: Date.now(),
        mailboxId
      }
    }

    // Default: sync failed
    return {
      type: 'sync-failed',
      variant: 'error',
      message: 'Sync failed. Try again later.',
      timestamp: Date.now(),
      mailboxId
    }
  }
}
