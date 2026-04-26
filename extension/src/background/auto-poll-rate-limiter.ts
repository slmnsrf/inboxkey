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
  private acquirePromise: Promise<boolean> | null = null

  /**
   * Atomic check-and-record. Returns true if the poll is allowed
   * (and the cooldown timestamp has been written to storage); false if the
   * cooldown is still active.
   *
   * Concurrent callers within the same service-worker lifetime share the same
   * in-flight operation. The first caller to arrive initiates the check+write;
   * all subsequent callers that arrive while that is in flight await the result
   * and then receive false — so exactly one caller proceeds to poll per cooldown
   * window even under simultaneous calls.
   */
  async tryAcquirePoll(): Promise<boolean> {
    if (this.acquirePromise) {
      // Concurrent caller: wait for the leader's check-and-record to complete,
      // then return false (the leader either acquired the cooldown or hit the
      // active cooldown — either way, we should not poll). Swallow leader
      // errors so we don't re-log the same failure N times across waiters.
      await this.acquirePromise.catch(() => {})
      return false
    }

    this.acquirePromise = (async () => {
      try {
        const lastPoll = await this.getLastPollTime()
        if (lastPoll && Date.now() - lastPoll < AUTO_POLL_COOLDOWN_MS) {
          return false
        }
        await chrome.storage.session.set({ [STORAGE_KEY]: Date.now() })
        return true
      } finally {
        this.acquirePromise = null
      }
    })()

    return this.acquirePromise
  }

  /**
   * Get milliseconds remaining until next allowed poll (0 if allowed now).
   * Read-only; safe for concurrent calls. Useful for UX/debug.
   */
  async getTimeRemaining(): Promise<number> {
    const lastPoll = await this.getLastPollTime()
    if (!lastPoll) return 0
    const elapsed = Date.now() - lastPoll
    return Math.max(0, AUTO_POLL_COOLDOWN_MS - elapsed)
  }

  private async getLastPollTime(): Promise<number | null> {
    const result = await chrome.storage.session.get(STORAGE_KEY)
    return result[STORAGE_KEY] || null
  }
}
