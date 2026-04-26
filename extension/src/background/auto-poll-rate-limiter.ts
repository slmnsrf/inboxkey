/**
 * Auto-Poll Rate Limiter
 *
 * Enforces a 30-second minimum interval between auto-triggered inbox polls
 * initiated by the passwordless page detector. Uses a separate storage key
 * from SyncRateLimiter so the two never interfere with each other.
 */

const STORAGE_KEY = 'last_auto_poll_time'
const AUTO_POLL_COOLDOWN_MS = 30 * 1000 // 30 seconds

export class AutoPollRateLimiter {
  /**
   * Check if an auto-poll is allowed (not rate limited).
   */
  async canPoll(): Promise<boolean> {
    const lastPoll = await this.getLastPollTime()
    if (!lastPoll) return true

    const elapsed = Date.now() - lastPoll
    return elapsed >= AUTO_POLL_COOLDOWN_MS
  }

  /**
   * Record that an auto-poll has started. Call this when the poll begins.
   */
  async recordPoll(): Promise<void> {
    await chrome.storage.session.set({
      [STORAGE_KEY]: Date.now(),
    })
  }

  /**
   * Get milliseconds remaining until the next poll is allowed.
   * Returns 0 if a poll is allowed now.
   */
  async getTimeRemaining(): Promise<number> {
    const lastPoll = await this.getLastPollTime()
    if (!lastPoll) return 0

    const elapsed = Date.now() - lastPoll
    const remaining = AUTO_POLL_COOLDOWN_MS - elapsed
    return Math.max(0, remaining)
  }

  private async getLastPollTime(): Promise<number | null> {
    const result = await chrome.storage.session.get(STORAGE_KEY)
    return result[STORAGE_KEY] || null
  }
}
