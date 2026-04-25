import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  SeenMessageStore,
  HIT_TTL_MS,
  MISS_TTL_MS,
} from '@/lib/services/seen-message-store'

describe('SeenMessageStore', () => {
  beforeEach(() => {
    // Reset chrome.storage.session mock to empty state
    vi.mocked(chrome.storage.session.get).mockResolvedValue({})
    vi.mocked(chrome.storage.session.set).mockResolvedValue(undefined)
  })

  it('should report unseen message as not seen', async () => {
    const store = new SeenMessageStore()
    expect(await store.hasSeen('msg-1')).toBe(false)
  })

  it('should report seen message as seen after add', async () => {
    const store = new SeenMessageStore()
    await store.add('msg-1', HIT_TTL_MS)
    expect(await store.hasSeen('msg-1')).toBe(true)
  })

  it('should persist to chrome.storage.session', async () => {
    const store = new SeenMessageStore()
    await store.add('msg-1', HIT_TTL_MS)

    expect(chrome.storage.session.set).toHaveBeenCalledWith(
      expect.objectContaining({
        'inboxkey.seen_messages': expect.any(String),
      })
    )
  })

  it('should restore from legacy storage format (single timestamp value)', async () => {
    // Backward compatibility: pre-TTL-aware storage stored each entry as
    // just a timestamp number. Legacy entries are loaded as HIT_TTL_MS.
    const now = Date.now()
    const serialized = JSON.stringify([['msg-1', now]])
    vi.mocked(chrome.storage.session.get).mockResolvedValue({
      'inboxkey.seen_messages': serialized,
    })

    const store = new SeenMessageStore()
    await store.load()
    expect(await store.hasSeen('msg-1')).toBe(true)
  })

  it('should restore from new storage format (entry object)', async () => {
    const now = Date.now()
    const serialized = JSON.stringify([
      ['msg-1', { ts: now, ttl: HIT_TTL_MS }],
    ])
    vi.mocked(chrome.storage.session.get).mockResolvedValue({
      'inboxkey.seen_messages': serialized,
    })

    const store = new SeenMessageStore()
    await store.load()
    expect(await store.hasSeen('msg-1')).toBe(true)
  })

  it('should prune legacy entries older than 24 hours on load', async () => {
    const now = Date.now()
    const oldTs = now - 25 * 60 * 60 * 1000
    const recentTs = now - 1 * 60 * 60 * 1000
    const serialized = JSON.stringify([['old-msg', oldTs], ['recent-msg', recentTs]])
    vi.mocked(chrome.storage.session.get).mockResolvedValue({
      'inboxkey.seen_messages': serialized,
    })

    const store = new SeenMessageStore()
    await store.load()

    expect(await store.hasSeen('old-msg')).toBe(false)
    expect(await store.hasSeen('recent-msg')).toBe(true)
  })

  describe('outcome-aware TTL', () => {
    it('hit entries survive past the miss-TTL window', async () => {
      vi.useFakeTimers()
      const start = Date.now()
      vi.setSystemTime(start)

      const store = new SeenMessageStore()
      await store.add('hit', HIT_TTL_MS)

      // Advance past the miss TTL but still well within the hit TTL.
      vi.setSystemTime(start + MISS_TTL_MS + 60_000)

      expect(await store.hasSeen('hit')).toBe(true)

      vi.useRealTimers()
    })

    it('miss entries expire after the miss-TTL window', async () => {
      vi.useFakeTimers()
      const start = Date.now()
      vi.setSystemTime(start)

      const store = new SeenMessageStore()
      await store.add('miss', MISS_TTL_MS)

      // Just before MISS_TTL_MS — still seen.
      vi.setSystemTime(start + MISS_TTL_MS - 1)
      expect(await store.hasSeen('miss')).toBe(true)

      // Just after MISS_TTL_MS — expired.
      vi.setSystemTime(start + MISS_TTL_MS + 1)
      expect(await store.hasSeen('miss')).toBe(false)

      vi.useRealTimers()
    })

    it('hit entries expire after the hit-TTL window', async () => {
      vi.useFakeTimers()
      const start = Date.now()
      vi.setSystemTime(start)

      const store = new SeenMessageStore()
      await store.add('hit', HIT_TTL_MS)

      vi.setSystemTime(start + HIT_TTL_MS + 1)
      expect(await store.hasSeen('hit')).toBe(false)

      vi.useRealTimers()
    })
  })

  it('should add multiple entries in batch with shared TTL', async () => {
    const store = new SeenMessageStore()
    await store.addBatch(['msg-1', 'msg-2', 'msg-3'], HIT_TTL_MS)

    expect(await store.hasSeen('msg-1')).toBe(true)
    expect(await store.hasSeen('msg-2')).toBe(true)
    expect(await store.hasSeen('msg-3')).toBe(true)
  })
})
