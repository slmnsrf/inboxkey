/**
 * Sync Rate Limiter
 *
 * Enforces minimum 3-second interval between sync operations
 * to prevent API abuse and provide visual feedback.
 */

const STORAGE_KEY = 'last_sync_time'
const MIN_INTERVAL_MS = 3000 // 3 seconds

export class SyncRateLimiter {
  /**
   * Check if sync is allowed (not rate limited)
   */
  async canSync(): Promise<boolean> {
    const lastSync = await this.getLastSyncTime()
    if (!lastSync) return true

    const elapsed = Date.now() - lastSync
    return elapsed >= MIN_INTERVAL_MS
  }

  /**
   * Get time remaining until next sync allowed (ms)
   */
  async getTimeRemaining(): Promise<number> {
    const lastSync = await this.getLastSyncTime()
    if (!lastSync) return 0

    const elapsed = Date.now() - lastSync
    const remaining = MIN_INTERVAL_MS - elapsed
    return Math.max(0, remaining)
  }

  /**
   * Record sync started (call this when sync begins)
   */
  async recordSync(): Promise<void> {
    await chrome.storage.session.set({
      [STORAGE_KEY]: Date.now()
    })
  }

  private async getLastSyncTime(): Promise<number | null> {
    const result = await chrome.storage.session.get(STORAGE_KEY)
    return result[STORAGE_KEY] || null
  }
}
