/**
 * Unit tests for MessagesProviderAdapter
 *
 * Covers EmailLike translation, poll budgeting, timestamp approximation,
 * stable ID generation, and graceful error handling.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MessagesProviderAdapter } from '@/lib/providers/google-messages/adapter'
import type { MessagesTabManager } from '@/lib/providers/google-messages/tab-manager'
import type { MessagePreview } from '@/lib/providers/google-messages/types'

// ---------------------------------------------------------------------------
// Mock tab manager factory
// ---------------------------------------------------------------------------

function createMockTabManager(overrides: Partial<MessagesTabManager> = {}): MessagesTabManager {
  const pollCounts = new Map<string, number>()

  return {
    ensureTab: vi.fn(async () => ({ tabId: 42, owned: true })),
    scrapeRecentPreviews: vi.fn(async () => [] as MessagePreview[]),
    closeIfOwned: vi.fn(async () => {}),
    incrementPollCount: vi.fn((sessionId: string) => {
      const current = pollCounts.get(sessionId) ?? 0
      const next = current + 1
      pollCounts.set(sessionId, next)
      return next
    }),
    getPollCount: vi.fn((sessionId: string) => pollCounts.get(sessionId) ?? 0),
    resetPollCount: vi.fn((sessionId: string) => { pollCounts.delete(sessionId) }),
    checkPairingStatus: vi.fn(async () => 'paired' as const),
    waitForPairing: vi.fn(async () => true),
    recoverFromRestart: vi.fn(async () => {}),
    savePendingSetup: vi.fn(async () => {}),
    getPendingSetup: vi.fn(async () => null),
    clearPendingSetup: vi.fn(async () => {}),
    ...overrides,
  } as unknown as MessagesTabManager
}

// ---------------------------------------------------------------------------
// Sample previews
// ---------------------------------------------------------------------------

const samplePreviews: MessagePreview[] = [
  {
    conversationId: 'conv-0',
    senderName: 'Amazon',
    previewText: 'Your verification code is 123456',
    isUnread: true,
    timestamp: '2 min',
  },
  {
    conversationId: 'conv-1',
    senderName: 'Trendyol',
    previewText: 'Login code: 789012',
    isUnread: false,
    timestamp: 'Yesterday',
  },
  {
    conversationId: 'conv-2',
    senderName: 'Mom',
    previewText: 'Are you coming for dinner?',
    isUnread: true,
    timestamp: '1:15 PM',
  },
]

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MessagesProviderAdapter', () => {
  let tabManager: MessagesTabManager

  beforeEach(() => {
    tabManager = createMockTabManager()
    vi.restoreAllMocks()
  })

  describe('listRecent() -- EmailLike translation', () => {
    it('translates MessagePreview[] to EmailLike[] correctly', async () => {
      const tm = createMockTabManager({
        scrapeRecentPreviews: vi.fn(async () => samplePreviews),
      })
      const adapter = new MessagesProviderAdapter(tm, 'mbx-1', 'sess-1')

      const result = await adapter.listRecent({ sinceEpochMs: 0, max: 10 })

      expect(result).toHaveLength(3)

      // First item
      expect(result[0].from).toBe('Amazon')
      expect(result[0].text).toBe('Your verification code is 123456')
      expect(result[0].subject).toBe('')
      expect(result[0].html).toBeUndefined()
      expect(result[0].provider).toBe('google-messages')
      expect(result[0].mailboxId).toBe('mbx-1')
      expect(result[0]._meta?.previewRank).toBe(0)

      // Second item
      expect(result[1].from).toBe('Trendyol')
      expect(result[1].text).toBe('Login code: 789012')
      expect(result[1]._meta?.previewRank).toBe(1)
    })

    it('caps output at 4 previews', async () => {
      const fivePreviews: MessagePreview[] = Array.from({ length: 5 }, (_, i) => ({
        conversationId: `conv-${i}`,
        senderName: `Sender-${i}`,
        previewText: `Code: ${100000 + i}`,
        isUnread: true,
        timestamp: '1 min',
      }))

      const tm = createMockTabManager({
        scrapeRecentPreviews: vi.fn(async () => fivePreviews),
      })
      const adapter = new MessagesProviderAdapter(tm, 'mbx-1', 'sess-1')

      const result = await adapter.listRecent({ sinceEpochMs: 0, max: 10 })
      expect(result).toHaveLength(4)
    })
  })

  describe('error handling', () => {
    it('re-throws on tab manager failure so polling service records adapter error', async () => {
      const tm = createMockTabManager({
        ensureTab: vi.fn(async () => { throw new Error('Tab crashed') }),
      })
      const adapter = new MessagesProviderAdapter(tm, 'mbx-1', 'sess-1')

      await expect(adapter.listRecent({ sinceEpochMs: 0, max: 10 })).rejects.toThrow('Tab crashed')
    })

    it('re-throws when scraping fails so polling service records adapter error', async () => {
      const tm = createMockTabManager({
        scrapeRecentPreviews: vi.fn(async () => { throw new Error('Scrape error') }),
      })
      const adapter = new MessagesProviderAdapter(tm, 'mbx-1', 'sess-1')

      await expect(adapter.listRecent({ sinceEpochMs: 0, max: 10 })).rejects.toThrow('Scrape error')
    })
  })

  describe('poll budget', () => {
    it('delegates poll count to tab manager', async () => {
      const tm = createMockTabManager({
        scrapeRecentPreviews: vi.fn(async () => samplePreviews),
      })
      const adapter = new MessagesProviderAdapter(tm, 'mbx-1', 'sess-1')

      await adapter.listRecent({ sinceEpochMs: 0, max: 10 })

      expect(tm.incrementPollCount).toHaveBeenCalledWith('sess-1')
    })

    it('returns empty after 5th poll (budget exhausted)', async () => {
      const tm = createMockTabManager({
        scrapeRecentPreviews: vi.fn(async () => samplePreviews),
      })
      // Manually set getPollCount to return 5 (budget exhausted)
      ;(tm.getPollCount as ReturnType<typeof vi.fn>).mockReturnValue(5)

      const adapter = new MessagesProviderAdapter(tm, 'mbx-1', 'sess-1')

      const result = await adapter.listRecent({ sinceEpochMs: 0, max: 10 })
      expect(result).toEqual([])
      // Should not have attempted scraping
      expect(tm.ensureTab).not.toHaveBeenCalled()
    })

    it('calls closeIfOwned when poll count reaches 5', async () => {
      const tm = createMockTabManager({
        scrapeRecentPreviews: vi.fn(async () => samplePreviews),
      })
      // Make incrementPollCount return 5 on the call
      ;(tm.incrementPollCount as ReturnType<typeof vi.fn>).mockReturnValue(5)

      const adapter = new MessagesProviderAdapter(tm, 'mbx-1', 'sess-1')

      await adapter.listRecent({ sinceEpochMs: 0, max: 10 })

      expect(tm.closeIfOwned).toHaveBeenCalled()
    })

    it('skips budget tracking when sessionId is undefined', async () => {
      const tm = createMockTabManager({
        scrapeRecentPreviews: vi.fn(async () => samplePreviews),
      })
      // No sessionId
      const adapter = new MessagesProviderAdapter(tm, 'mbx-1')

      const result = await adapter.listRecent({ sinceEpochMs: 0, max: 10 })
      expect(result).toHaveLength(3)
      expect(tm.getPollCount).not.toHaveBeenCalled()
      expect(tm.incrementPollCount).not.toHaveBeenCalled()
    })
  })

  describe('timestamp approximation', () => {
    it('"2 min" approximates to ~120000ms ago', async () => {
      const tm = createMockTabManager({
        scrapeRecentPreviews: vi.fn(async () => [
          { conversationId: 'c-0', senderName: 'Test', previewText: 'msg', isUnread: true, timestamp: '2 min' },
        ]),
      })
      const adapter = new MessagesProviderAdapter(tm, 'mbx-1', 'sess-1')
      const now = Date.now()

      const result = await adapter.listRecent({ sinceEpochMs: 0, max: 10 })
      const diff = now - result[0].receivedEpochMs!

      // Should be approximately 120000ms, allow 5s tolerance for test execution time
      expect(diff).toBeGreaterThanOrEqual(115000)
      expect(diff).toBeLessThanOrEqual(130000)
    })

    it('"Yesterday" approximates to ~86400000ms ago', async () => {
      const tm = createMockTabManager({
        scrapeRecentPreviews: vi.fn(async () => [
          { conversationId: 'c-0', senderName: 'Test', previewText: 'msg', isUnread: true, timestamp: 'Yesterday' },
        ]),
      })
      const adapter = new MessagesProviderAdapter(tm, 'mbx-1', 'sess-1')
      const now = Date.now()

      const result = await adapter.listRecent({ sinceEpochMs: 0, max: 10 })
      const diff = now - result[0].receivedEpochMs!

      expect(diff).toBeGreaterThanOrEqual(81400000)
      expect(diff).toBeLessThanOrEqual(91400000)
    })

    it('unparseable timestamp returns undefined (never fabricates Date.now())', async () => {
      // Date / clock-time strings that we cannot map to a precise instant
      // should return undefined. Substituting Date.now() would falsify the
      // freshness signal and let stale codes outrank fresh ones in scoring.
      const tm = createMockTabManager({
        scrapeRecentPreviews: vi.fn(async () => [
          { conversationId: 'c-0', senderName: 'Test', previewText: 'msg', isUnread: true, timestamp: 'Mar 16' },
        ]),
      })
      const adapter = new MessagesProviderAdapter(tm, 'mbx-1', 'sess-1')

      const result = await adapter.listRecent({ sinceEpochMs: 0, max: 10 })

      expect(result[0].receivedEpochMs).toBeUndefined()
    })

    it('undefined timestamp returns undefined receivedEpochMs', async () => {
      const tm = createMockTabManager({
        scrapeRecentPreviews: vi.fn(async () => [
          { conversationId: 'c-0', senderName: 'Test', previewText: 'msg', isUnread: true },
        ]),
      })
      const adapter = new MessagesProviderAdapter(tm, 'mbx-1', 'sess-1')

      const result = await adapter.listRecent({ sinceEpochMs: 0, max: 10 })

      expect(result[0].receivedEpochMs).toBeUndefined()
    })

    it('"3 hr" approximates to ~3 hours ago', async () => {
      const tm = createMockTabManager({
        scrapeRecentPreviews: vi.fn(async () => [
          { conversationId: 'c-0', senderName: 'Test', previewText: 'msg', isUnread: true, timestamp: '3 hr' },
        ]),
      })
      const adapter = new MessagesProviderAdapter(tm, 'mbx-1', 'sess-1')
      const now = Date.now()

      const result = await adapter.listRecent({ sinceEpochMs: 0, max: 10 })
      const diff = now - result[0].receivedEpochMs!

      expect(diff).toBeGreaterThanOrEqual(10_700_000)
      expect(diff).toBeLessThanOrEqual(10_900_000)
    })
  })

  describe('stable ID generation (dedup)', () => {
    it('same conversationId + previewText produces same ID', async () => {
      const preview: MessagePreview = {
        conversationId: 'conv-42',
        senderName: 'Amazon',
        previewText: 'Your code is 123456',
        isUnread: true,
        timestamp: '1 min',
      }

      const tm = createMockTabManager({
        scrapeRecentPreviews: vi.fn(async () => [preview]),
      })

      const adapter1 = new MessagesProviderAdapter(tm, 'mbx-1', 'sess-1')
      const result1 = await adapter1.listRecent({ sinceEpochMs: 0, max: 10 })

      // Reset mock to ensure a fresh call
      ;(tm.getPollCount as ReturnType<typeof vi.fn>).mockReturnValue(0)

      const adapter2 = new MessagesProviderAdapter(tm, 'mbx-1', 'sess-2')
      const result2 = await adapter2.listRecent({ sinceEpochMs: 0, max: 10 })

      expect(result1[0].id).toBe(result2[0].id)
    })

    it('different previewText produces different ID', async () => {
      const tm1 = createMockTabManager({
        scrapeRecentPreviews: vi.fn(async () => [{
          conversationId: 'conv-42',
          senderName: 'Amazon',
          previewText: 'Code: 111111',
          isUnread: true,
          timestamp: '1 min',
        }]),
      })
      const tm2 = createMockTabManager({
        scrapeRecentPreviews: vi.fn(async () => [{
          conversationId: 'conv-42',
          senderName: 'Amazon',
          previewText: 'Code: 222222',
          isUnread: true,
          timestamp: '1 min',
        }]),
      })

      const adapter1 = new MessagesProviderAdapter(tm1, 'mbx-1', 'sess-1')
      const adapter2 = new MessagesProviderAdapter(tm2, 'mbx-1', 'sess-2')

      const result1 = await adapter1.listRecent({ sinceEpochMs: 0, max: 10 })
      const result2 = await adapter2.listRecent({ sinceEpochMs: 0, max: 10 })

      expect(result1[0].id).not.toBe(result2[0].id)
    })

    it('ID starts with "gm-" prefix', async () => {
      const tm = createMockTabManager({
        scrapeRecentPreviews: vi.fn(async () => [samplePreviews[0]]),
      })
      const adapter = new MessagesProviderAdapter(tm, 'mbx-1', 'sess-1')

      const result = await adapter.listRecent({ sinceEpochMs: 0, max: 10 })
      expect(result[0].id).toMatch(/^gm-/)
    })
  })

  describe('adapter properties', () => {
    it('has correct id and mailboxId', () => {
      const adapter = new MessagesProviderAdapter(tabManager, 'mbx-42', 'sess-1')
      expect(adapter.id).toBe('google-messages')
      expect(adapter.mailboxId).toBe('mbx-42')
    })
  })

  describe('locale-aware timestamp parsing', () => {
    async function parsedFor(timestamp: string): Promise<number | undefined> {
      const tm = createMockTabManager({
        scrapeRecentPreviews: vi.fn(async () => [
          { conversationId: 'c-0', senderName: 'X', previewText: 'msg', isUnread: true, timestamp },
        ]),
      })
      const adapter = new MessagesProviderAdapter(tm, 'mbx-1', 'sess-l')
      const result = await adapter.listRecent({ sinceEpochMs: 0, max: 10 })
      return result[0].receivedEpochMs
    }

    function approxEqual(actual: number | undefined, expected: number, tolMs = 5_000): void {
      expect(actual).toBeDefined()
      expect(Math.abs((actual as number) - expected)).toBeLessThanOrEqual(tolMs)
    }

    describe('"Now" / fresh-message variants', () => {
      it.each([
        'now',
        'Now',
        'just now',
        'Just now',
        'şimdi',
        'Şimdi',
        'şu anda',
        'Şu Anda',
        'jetzt',
        'Jetzt',
        'soeben',
      ])('"%s" parses to ~now', async (label) => {
        const before = Date.now()
        const got = await parsedFor(label)
        approxEqual(got, before)
      })
    })

    describe('"N min" variants', () => {
      it.each([
        ['5 min', 5],
        ['5 mins', 5],
        ['5 minute', 5],
        ['5 minutes', 5],
        ['5 minutes ago', 5],
        ['5 dk', 5],
        ['5 dakika', 5],
        ['5 dk önce', 5],
        ['5 Min', 5],
        ['5 Minute', 5],
        ['5 Minuten', 5],
        ['vor 5 Min', 5],
      ])('"%s" parses to ~%i min ago', async (label, n) => {
        const before = Date.now()
        const got = await parsedFor(label)
        approxEqual(got, before - n * 60_000)
      })
    })

    describe('"N hr" variants', () => {
      it.each([
        ['3 hr', 3],
        ['3 hours', 3],
        ['3 sa', 3],
        ['3 saat', 3],
        ['3 Std', 3],
        ['3 Stunden', 3],
        ['vor 3 Std', 3],
      ])('"%s" parses to ~%i hr ago', async (label, n) => {
        const before = Date.now()
        const got = await parsedFor(label)
        approxEqual(got, before - n * 3_600_000, 30_000)
      })
    })

    describe('"Yesterday" variants', () => {
      it.each(['yesterday', 'Yesterday', 'dün', 'Dün', 'gestern', 'Gestern'])(
        '"%s" parses to ~24h ago',
        async (label) => {
          const before = Date.now()
          const got = await parsedFor(label)
          approxEqual(got, before - 86_400_000, 30_000)
        },
      )
    })

    describe('unknown / unparseable inputs', () => {
      it.each([
        'today',
        'Today',
        'bugün',
        'heute',
        '1:15 PM',
        '13:15',
        'Mar 16',
        '5 Mar',
        '',
        '   ',
      ])('"%s" returns undefined', async (label) => {
        const got = await parsedFor(label)
        expect(got).toBeUndefined()
      })
    })
  })
})
