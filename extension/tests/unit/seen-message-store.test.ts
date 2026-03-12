import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SeenMessageStore } from '@/lib/services/seen-message-store'

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
    await store.add('msg-1')
    expect(await store.hasSeen('msg-1')).toBe(true)
  })

  it('should persist to chrome.storage.session', async () => {
    const store = new SeenMessageStore()
    await store.add('msg-1')

    expect(chrome.storage.session.set).toHaveBeenCalledWith(
      expect.objectContaining({
        'inboxkey.seen_messages': expect.any(String),
      })
    )
  })

  it('should restore from chrome.storage.session', async () => {
    const now = Date.now()
    const serialized = JSON.stringify([['msg-1', now]])
    vi.mocked(chrome.storage.session.get).mockResolvedValue({
      'inboxkey.seen_messages': serialized,
    })

    const store = new SeenMessageStore()
    await store.load()
    expect(await store.hasSeen('msg-1')).toBe(true)
  })

  it('should prune entries older than 24 hours', async () => {
    const now = Date.now()
    const oldTs = now - 25 * 60 * 60 * 1000 // 25 hours ago
    const recentTs = now - 1 * 60 * 60 * 1000 // 1 hour ago
    const serialized = JSON.stringify([['old-msg', oldTs], ['recent-msg', recentTs]])
    vi.mocked(chrome.storage.session.get).mockResolvedValue({
      'inboxkey.seen_messages': serialized,
    })

    const store = new SeenMessageStore()
    await store.load()

    expect(await store.hasSeen('old-msg')).toBe(false) // pruned
    expect(await store.hasSeen('recent-msg')).toBe(true) // kept
  })

  it('should add multiple entries in batch', async () => {
    const store = new SeenMessageStore()
    await store.addBatch(['msg-1', 'msg-2', 'msg-3'])

    expect(await store.hasSeen('msg-1')).toBe(true)
    expect(await store.hasSeen('msg-2')).toBe(true)
    expect(await store.hasSeen('msg-3')).toBe(true)
  })
})
