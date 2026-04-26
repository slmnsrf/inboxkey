/**
 * Unit tests for AutoPollRateLimiter.
 *
 * Test coverage:
 * 1. Initial state: canPoll() returns true
 * 2. After recordPoll(): canPoll() returns false within 30s
 * 3. After 30s elapses: canPoll() returns true again (fake timers)
 * 4. getTimeRemaining() returns correct remaining ms
 * 5. Separation: AutoPollRateLimiter and SyncRateLimiter do not interfere
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
    expect(await limiter.canPoll()).toBe(true)
  })

  // -----------------------------------------------------------------------
  // Test 2: After recordPoll(), canPoll() returns false within 30s
  // -----------------------------------------------------------------------
  it('blocks polling immediately after recordPoll()', async () => {
    await limiter.recordPoll()
    expect(await limiter.canPoll()).toBe(false)
  })

  it('blocks polling when only 29 seconds have elapsed', async () => {
    await limiter.recordPoll()
    vi.advanceTimersByTime(29_000)
    expect(await limiter.canPoll()).toBe(false)
  })

  // -----------------------------------------------------------------------
  // Test 3: After 30s elapses, canPoll() returns true again
  // -----------------------------------------------------------------------
  it('allows polling after 30 seconds have elapsed', async () => {
    await limiter.recordPoll()
    vi.advanceTimersByTime(30_000)
    expect(await limiter.canPoll()).toBe(true)
  })

  // -----------------------------------------------------------------------
  // Test 4: getTimeRemaining()
  // -----------------------------------------------------------------------
  it('getTimeRemaining() returns 0 when no poll recorded', async () => {
    expect(await limiter.getTimeRemaining()).toBe(0)
  })

  it('getTimeRemaining() returns approximately 30 000 ms immediately after recordPoll()', async () => {
    await limiter.recordPoll()
    const remaining = await limiter.getTimeRemaining()
    // Allow a small tolerance window; fake timers mean Date.now() hasn't advanced.
    expect(remaining).toBeGreaterThan(29_900)
    expect(remaining).toBeLessThanOrEqual(30_000)
  })

  it('getTimeRemaining() decreases as time passes', async () => {
    await limiter.recordPoll()
    vi.advanceTimersByTime(10_000)
    const remaining = await limiter.getTimeRemaining()
    expect(remaining).toBeGreaterThan(19_900)
    expect(remaining).toBeLessThanOrEqual(20_000)
  })

  it('getTimeRemaining() returns 0 after cooldown expires', async () => {
    await limiter.recordPoll()
    vi.advanceTimersByTime(30_000)
    expect(await limiter.getTimeRemaining()).toBe(0)
  })

  // -----------------------------------------------------------------------
  // Test 5: Separation — AutoPollRateLimiter and SyncRateLimiter are independent
  // -----------------------------------------------------------------------
  it('recording an auto-poll does NOT block manual sync', async () => {
    const syncLimiter = new SyncRateLimiter()

    await limiter.recordPoll()
    // Auto-poll is now rate-limited.
    expect(await limiter.canPoll()).toBe(false)
    // Manual sync should still be allowed — different storage key.
    expect(await syncLimiter.canSync()).toBe(true)
  })

  it('recording a manual sync does NOT block auto-poll', async () => {
    const syncLimiter = new SyncRateLimiter()

    await syncLimiter.recordSync()
    // Manual sync is now rate-limited.
    expect(await syncLimiter.canSync()).toBe(false)
    // Auto-poll should still be allowed — different storage key.
    expect(await limiter.canPoll()).toBe(true)
  })

  it('interleaved operations remain independent', async () => {
    const syncLimiter = new SyncRateLimiter()

    // Record both.
    await limiter.recordPoll()
    await syncLimiter.recordSync()

    // Both are rate-limited.
    expect(await limiter.canPoll()).toBe(false)
    expect(await syncLimiter.canSync()).toBe(false)

    // Advance past the SyncRateLimiter cooldown (3s) but not AutoPollRateLimiter (30s).
    vi.advanceTimersByTime(3_000)

    expect(await syncLimiter.canSync()).toBe(true)
    expect(await limiter.canPoll()).toBe(false)

    // Advance past the AutoPollRateLimiter cooldown.
    vi.advanceTimersByTime(27_000)

    expect(await limiter.canPoll()).toBe(true)
    expect(await syncLimiter.canSync()).toBe(true)
  })
})
