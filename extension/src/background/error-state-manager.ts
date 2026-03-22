/**
 * Error State Manager
 *
 * Manages persistent sync error state across service worker restarts.
 */

import type { SyncErrorInfo, SyncErrorState } from '@/lib/storage/schema'
import { STORAGE_KEYS } from '@/lib/storage/schema'

const STORAGE_KEY = STORAGE_KEYS.SYNC_ERROR_STATE
const ERROR_EXPIRY_MS = 15 * 60 * 1000 // 15 minutes
const FAILURE_THRESHOLD = 3

export class ErrorStateManager {
  /**
   * Load error state from storage
   */
  async load(): Promise<SyncErrorState> {
    const result = await chrome.storage.local.get(STORAGE_KEY)
    return result[STORAGE_KEY] || this.getDefaultState()
  }

  /**
   * Record sync failure
   */
  async recordFailure(error: Error, mailboxId?: string, email?: string): Promise<void> {
    const state = await this.load()

    state.consecutiveFailures++
    state.lastErrorTime = Date.now()
    state.currentError = this.classifyError(error, mailboxId, email)

    state.errorHistory.push({
      timestamp: Date.now(),
      error: error.message,
      mailboxId,
      errorType: state.currentError.type
    })

    // Keep last 20 errors
    if (state.errorHistory.length > 20) {
      state.errorHistory = state.errorHistory.slice(-20)
    }

    await this.save(state)
  }

  /**
   * Record sync success (reset counters)
   */
  async recordSuccess(): Promise<void> {
    const state = await this.load()

    state.consecutiveFailures = 0
    state.lastErrorTime = null
    state.currentError = null
    // Keep error history for debugging

    await this.save(state)
  }

  /**
   * Check if should show error badge
   */
  async shouldShowBadge(): Promise<boolean> {
    const state = await this.load()

    if (!state.currentError) return false

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
   * Get current error for popup banner
   */
  async getCurrentError(): Promise<SyncErrorInfo | null> {
    const state = await this.load()

    // Check if error is still recent
    if (state.currentError && state.lastErrorTime) {
      const errorAge = Date.now() - state.lastErrorTime
      if (errorAge < ERROR_EXPIRY_MS) {
        return state.currentError
      }
    }

    return null
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
      currentError: null,
      errorHistory: []
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
