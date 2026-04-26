/**
 * Unit tests for AutoPollRateLimiter.
 *
 * Test coverage:
 * 1. Initial state: tryAcquirePoll() returns true
 * 2. Second call within 30s: returns false
 * 3. After 30s: returns true again (fake timers)
 * 4. Concurrency: 3 simultaneous tryAcquirePoll() — exactly 1 returns true, 2 false
 * 5. getTimeRemaining() returns correct ms
 * 6. Separation: AutoPollRateLimiter and SyncRateLimiter are independent
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { AutoPollRateLimiter } from '../auto-poll-rate-limiter'
import { SyncRateLimiter } from '../sync-rate-limiter'

// The global chrome mock (from tests/setup.ts) exposes chrome.storage.session
// backed by an in-memory Map. Calling .clear() between tests keeps them isolated.

describe('AutoPollRateLimiter', () => {
  let limiter: AutoPollRateLimiter

  beforeEach(async () => {
    limiter = new AutoPollRateLimiter()
    // Clear session storage so each test starts from a clean slate.
    await chrome.storage.session.clear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // -----------------------------------------------------------------------
  // Test 1: Initial state
  // -----------------------------------------------------------------------
  it('allows polling when no poll has been recorded yet', async () => {
    expect(await limiter.tryAcquirePoll()).toBe(true)
  })

  // -----------------------------------------------------------------------
  // Test 2: Second call within 30s returns false
  // -----------------------------------------------------------------------
  it('blocks polling immediately after a successful tryAcquirePoll()', async () => {
    await limiter.tryAcquirePoll()
    expect(await limiter.tryAcquirePoll()).toBe(false)
  })

  it('blocks polling when only 29 seconds have elapsed', async () => {
    await limiter.tryAcquirePoll()
    vi.advanceTimersByTime(29_000)
    expect(await limiter.tryAcquirePoll()).toBe(false)
  })

  // -----------------------------------------------------------------------
  // Test 3: After 30s elapses, tryAcquirePoll() returns true again
  // -----------------------------------------------------------------------
  it('allows polling after 30 seconds have elapsed', async () => {
    await limiter.tryAcquirePoll()
    vi.advanceTimersByTime(30_000)
    expect(await limiter.tryAcquirePoll()).toBe(true)
  })

  // -----------------------------------------------------------------------
  // Test 4: Concurrency — exactly 1 of 3 simultaneous calls returns true
  // -----------------------------------------------------------------------
  it('concurrent tryAcquirePoll() calls: exactly 1 returns true, 2 return false', async () => {
    // Fire 3 calls without awaiting in between so they all start concurrently.
    const [r1, r2, r3] = await Promise.all([
      limiter.tryAcquirePoll(),
      limiter.tryAcquirePoll(),
      limiter.tryAcquirePoll(),
    ])

    const results = [r1, r2, r3]
    expect(results.filter(r => r === true)).toHaveLength(1)
    expect(results.filter(r => r === false)).toHaveLength(2)
  })

  // -----------------------------------------------------------------------
  // Test 5: getTimeRemaining()
  // -----------------------------------------------------------------------
  it('getTimeRemaining() returns 0 when no poll recorded', async () => {
    expect(await limiter.getTimeRemaining()).toBe(0)
  })

  it('getTimeRemaining() returns approximately 30 000 ms immediately after tryAcquirePoll()', async () => {
    await limiter.tryAcquirePoll()
    const remaining = await limiter.getTimeRemaining()
    // Allow a small tolerance window; fake timers mean Date.now() hasn't advanced.
    expect(remaining).toBeGreaterThan(29_900)
    expect(remaining).toBeLessThanOrEqual(30_000)
  })

  it('getTimeRemaining() decreases as time passes', async () => {
    await limiter.tryAcquirePoll()
    vi.advanceTimersByTime(10_000)
    const remaining = await limiter.getTimeRemaining()
    expect(remaining).toBeGreaterThan(19_900)
    expect(remaining).toBeLessThanOrEqual(20_000)
  })

  it('getTimeRemaining() returns 0 after cooldown expires', async () => {
    await limiter.tryAcquirePoll()
    vi.advanceTimersByTime(30_000)
    expect(await limiter.getTimeRemaining()).toBe(0)
  })

  // -----------------------------------------------------------------------
  // Test 6: Separation — AutoPollRateLimiter and SyncRateLimiter are independent
  // -----------------------------------------------------------------------
  it('recording an auto-poll does NOT block manual sync', async () => {
    const syncLimiter = new SyncRateLimiter()

    await limiter.tryAcquirePoll()
    // Auto-poll is now rate-limited.
    expect(await limiter.tryAcquirePoll()).toBe(false)
    // Manual sync should still be allowed — different storage key.
    expect(await syncLimiter.canSync()).toBe(true)
  })

  it('recording a manual sync does NOT block auto-poll', async () => {
    const syncLimiter = new SyncRateLimiter()

    await syncLimiter.recordSync()
    // Manual sync is now rate-limited.
    expect(await syncLimiter.canSync()).toBe(false)
    // Auto-poll should still be allowed — different storage key.
    expect(await limiter.tryAcquirePoll()).toBe(true)
  })

  it('interleaved operations remain independent', async () => {
    const syncLimiter = new SyncRateLimiter()

    // Record both.
    await limiter.tryAcquirePoll()
    await syncLimiter.recordSync()

    // Both are rate-limited.
    expect(await limiter.tryAcquirePoll()).toBe(false)
    expect(await syncLimiter.canSync()).toBe(false)

    // Advance past the SyncRateLimiter cooldown (3s) but not AutoPollRateLimiter (30s).
    vi.advanceTimersByTime(3_000)

    expect(await syncLimiter.canSync()).toBe(true)
    expect(await limiter.tryAcquirePoll()).toBe(false)

    // Advance past the AutoPollRateLimiter cooldown.
    vi.advanceTimersByTime(27_000)

    expect(await limiter.tryAcquirePoll()).toBe(true)
    expect(await syncLimiter.canSync()).toBe(true)
  })
})
