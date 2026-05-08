/**
 * Unit tests for PopupMessageHandler — TRIGGER_INBOX_POLL case.
 *
 * Test coverage:
 * 1. Rate-limit blocked  → returns { success: true } silently, pollOnce NOT called
 * 2. Rate-limit allowed  → pollOnce IS called, cache updated, badge updated
 * 3. lastSyncedAt is NOT touched by TRIGGER_INBOX_POLL
 * 4. errorManager.recordFailure NOT called even when adapter fails
 * 5. tryAcquirePoll() is called (cooldown enforced up-front, before any other I/O)
 * 6. Empty mailbox list → returns success silently, pollOnce NOT called
 * 7. tryAcquirePoll() called even when getMailboxes rejects (early I/O failure)
 * 8. Zero candidates → updateWithNewCodes and badge functions NOT called (Fix A)
 * 9. Manual sync zero candidates preserves existing popup cache (Fix B)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// ---------------------------------------------------------------------------
// vi.hoisted() — variables that vi.mock factories capture must be declared
// before the hoisted mock block runs. vi.hoisted() ensures they are available
// at the correct time even after Vitest hoists vi.mock calls to the top.
// ---------------------------------------------------------------------------
const {
  mockTryAcquirePoll,
  mockPollOnce,
  mockUpdateWithNewCodes,
  mockGetCache,
  mockSetBadgeCount,
  mockClearBadge,
  mockCountBadgeEligible,
} = vi.hoisted(() => ({
  mockTryAcquirePoll: vi.fn<[], Promise<boolean>>(),
  mockPollOnce: vi.fn<[], Promise<{ candidates: unknown[]; adapterResults: unknown[] }>>(),
  mockUpdateWithNewCodes: vi.fn<[], Promise<void>>(),
  mockGetCache: vi.fn<[], Promise<{ items: unknown[] }>>(),
  mockSetBadgeCount: vi.fn(),
  mockClearBadge: vi.fn(),
  mockCountBadgeEligible: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Module mocks — must be declared before any imports that load those modules
// ---------------------------------------------------------------------------

vi.mock('../auto-poll-rate-limiter', () => ({
  AutoPollRateLimiter: vi.fn().mockImplementation(() => ({
    tryAcquirePoll: mockTryAcquirePoll,
  })),
}))

vi.mock('@/lib/services/email-polling-service', () => ({
  EmailPollingService: vi.fn().mockImplementation(() => ({
    pollOnce: mockPollOnce,
  })),
}))

vi.mock('@/lib/services/provider-adapter', () => ({
  createAdaptersFromMailboxes: vi.fn(),
}))

vi.mock('@/lib/storage/storage-factory', () => ({
  StorageFactory: {
    create: vi.fn(),
  },
}))

vi.mock('../popup-cache', () => ({
  PopupCacheManager: vi.fn().mockImplementation(() => ({
    updateWithNewCodes: mockUpdateWithNewCodes,
    getCache: mockGetCache,
    convertPopupItemToLegacyCode: vi.fn(),
    convertPopupItemToLegacyLink: vi.fn(),
  })),
}))

vi.mock('../error-state-manager', () => ({
  ErrorStateManager: vi.fn().mockImplementation(() => ({
    recordSuccess: vi.fn(),
    recordFailure: vi.fn(),
    getCurrentErrors: vi.fn().mockResolvedValue([]),
    shouldShowBadge: vi.fn().mockResolvedValue(false),
  })),
}))

vi.mock('@/contents/badge-manager', () => ({
  setBadgeCount: mockSetBadgeCount,
  setBadgeSyncError: vi.fn(),
  clearBadge: mockClearBadge,
  setBadgeListening: vi.fn(),
  setBadgeSuccess: vi.fn(),
  setBadgeNoCode: vi.fn(),
}))

vi.mock('@/lib/popup/popup-config', () => ({
  BADGE_EXPIRY_MS: 5 * 60 * 1000,
}))

vi.mock('@/lib/popup/popup-priority', () => ({
  sortByPriority: vi.fn((items: unknown[]) => items),
}))

vi.mock('@/lib/popup/popup-filters', () => ({
  countBadgeEligible: mockCountBadgeEligible,
  separateItems: vi.fn(() => ({ codes: [], links: [] })),
}))

vi.mock('@/lib/services/seen-message-store', () => ({
  SeenMessageStore: vi.fn().mockImplementation(() => ({})),
}))

vi.mock('@/lib/providers/imap-bridge/imap-bridge-adapter', () => ({
  IMAPBridgeAdapter: vi.fn(),
}))

vi.mock('@/lib/providers/google-messages/tab-manager', () => ({
  getMessagesTabManager: vi.fn(),
}))

vi.mock('../sync-rate-limiter', () => ({
  SyncRateLimiter: vi.fn().mockImplementation(() => ({
    canSync: vi.fn().mockResolvedValue(true),
    recordSync: vi.fn().mockResolvedValue(undefined),
    getTimeRemaining: vi.fn().mockResolvedValue(0),
  })),
}))

// ---------------------------------------------------------------------------
// Imports — after all vi.mock() declarations
// ---------------------------------------------------------------------------

import { PopupMessageHandler } from '../popup-handler'
import { PopupCacheManager } from '../popup-cache'
import { ErrorStateManager } from '../error-state-manager'
import { createAdaptersFromMailboxes } from '@/lib/services/provider-adapter'
import { StorageFactory } from '@/lib/storage/storage-factory'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMailbox(id: string, providerId = 'imap-bridge') {
  return {
    id,
    providerId,
    email: `${id}@example.com`,
    imapServer: 'imap.example.com',
    imapPort: 993,
    imapAccountId: 'acc_test',
    addedAt: Date.now() - 10000,
    lastSyncedAt: Date.now() - 5000,
  }
}

function buildMockStorage(mailboxes: ReturnType<typeof makeMailbox>[]) {
  return {
    getMailboxes: vi.fn().mockResolvedValue(mailboxes),
    updateMailbox: vi.fn().mockResolvedValue(undefined),
    addMailbox: vi.fn(),
    removeMailbox: vi.fn(),
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PopupMessageHandler — TRIGGER_INBOX_POLL', () => {
  let handler: PopupMessageHandler

  beforeEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()

    // Default: polling is allowed (tryAcquirePoll returns true)
    mockTryAcquirePoll.mockResolvedValue(true)

    // Default: pollOnce returns no candidates
    mockPollOnce.mockResolvedValue({ candidates: [], adapterResults: [] })

    // Default: cache returns empty items
    mockGetCache.mockResolvedValue({ items: [] })
    mockUpdateWithNewCodes.mockResolvedValue(undefined)

    // Default: countBadgeEligible returns 0
    mockCountBadgeEligible.mockReturnValue(0)

    // Construct handler with mocked dependencies (constructors are vi.fn mocks, cast to bypass TS arg check)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cacheManager = new (PopupCacheManager as any)()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errorManager = new (ErrorStateManager as any)()
    handler = new PopupMessageHandler(cacheManager, errorManager)
  })

  // -------------------------------------------------------------------------
  // Test 1: Rate-limit blocked
  // -------------------------------------------------------------------------
  it('returns { success: true } silently when rate-limited, without calling pollOnce', async () => {
    mockTryAcquirePoll.mockResolvedValue(false)

    const mockStorage = buildMockStorage([makeMailbox('mb1')])
    ;(StorageFactory.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockStorage)

    const response = await handler.handleMessage({
      type: 'TRIGGER_INBOX_POLL',
      source: 'passwordless-page',
      url: 'https://example.com/login',
    })

    expect(response).toEqual({ success: true })
    expect(mockPollOnce).not.toHaveBeenCalled()
    // tryAcquirePoll was called but returned false — cooldown still active
    expect(mockTryAcquirePoll).toHaveBeenCalledTimes(1)
  })

  // -------------------------------------------------------------------------
  // Test 2: Rate-limit allowed → pollOnce called, cache and badge updated
  // -------------------------------------------------------------------------
  it('calls pollOnce, updates cache and badge when rate-limit allows', async () => {
    const mockStorage = buildMockStorage([makeMailbox('mb1')])
    ;(StorageFactory.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockStorage)
    ;(createAdaptersFromMailboxes as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'adapter1' }])
    mockPollOnce.mockResolvedValue({
      candidates: [
        {
          mailboxId: 'mb1',
          from: 'noreply@example.com',
          subject: 'Your code',
          receivedEpochMs: Date.now(),
          code: { value: '123456', score: 0.95 },
          link: null,
        },
      ],
      adapterResults: [{ mailboxId: 'mb1', success: true }],
    })
    mockCountBadgeEligible.mockReturnValue(1)

    const response = await handler.handleMessage({
      type: 'TRIGGER_INBOX_POLL',
      source: 'passwordless-page',
      url: 'https://example.com/login',
    })

    expect(response).toEqual({ success: true })
    expect(mockPollOnce).toHaveBeenCalledTimes(1)
    expect(mockUpdateWithNewCodes).toHaveBeenCalledTimes(1)
    expect(mockSetBadgeCount).toHaveBeenCalledWith(1)
  })

  // -------------------------------------------------------------------------
  // Test 3: lastSyncedAt NOT touched
  // -------------------------------------------------------------------------
  it('does NOT call storage.updateMailbox (no lastSyncedAt update)', async () => {
    const mockStorage = buildMockStorage([makeMailbox('mb1')])
    ;(StorageFactory.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockStorage)
    ;(createAdaptersFromMailboxes as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'adapter1' }])

    await handler.handleMessage({
      type: 'TRIGGER_INBOX_POLL',
      source: 'passwordless-page',
      url: 'https://example.com/login',
    })

    expect(mockStorage.updateMailbox).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Test 4: errorManager.recordFailure NOT called even when adapter fails
  // -------------------------------------------------------------------------
  it('does NOT call errorManager when pollOnce rejects', async () => {
    const mockStorage = buildMockStorage([makeMailbox('mb1')])
    ;(StorageFactory.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockStorage)
    ;(createAdaptersFromMailboxes as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'adapter1' }])
    mockPollOnce.mockRejectedValue(new Error('Network failure'))

    // Capture the ErrorStateManager instance created during handler construction
    const ErrorStateManagerMock = ErrorStateManager as ReturnType<typeof vi.fn>
    const errorManagerInstance = ErrorStateManagerMock.mock.results.at(-1)?.value

    const response = await handler.handleMessage({
      type: 'TRIGGER_INBOX_POLL',
      source: 'passwordless-page',
      url: 'https://example.com/login',
    })

    // Still returns success (silent failure)
    expect(response).toEqual({ success: true })

    // errorManager must NOT have been touched
    expect(errorManagerInstance?.recordFailure).not.toHaveBeenCalled()
    expect(errorManagerInstance?.recordSuccess).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Test 5: tryAcquirePoll() IS called — both on success and on failure
  // The cooldown is enforced atomically inside tryAcquirePoll, so a single
  // call both checks AND records the timestamp. Verifying it was called once
  // ensures the rate-limit gate ran before any downstream I/O.
  // -------------------------------------------------------------------------
  it('calls tryAcquirePoll() for a successful poll', async () => {
    const mockStorage = buildMockStorage([makeMailbox('mb1')])
    ;(StorageFactory.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockStorage)
    ;(createAdaptersFromMailboxes as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'adapter1' }])

    await handler.handleMessage({
      type: 'TRIGGER_INBOX_POLL',
      source: 'passwordless-page',
      url: 'https://example.com/login',
    })

    expect(mockTryAcquirePoll).toHaveBeenCalledTimes(1)
  })

  it('calls tryAcquirePoll() even when pollOnce throws', async () => {
    const mockStorage = buildMockStorage([makeMailbox('mb1')])
    ;(StorageFactory.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockStorage)
    ;(createAdaptersFromMailboxes as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'adapter1' }])
    mockPollOnce.mockRejectedValue(new Error('Adapter failed'))

    await handler.handleMessage({
      type: 'TRIGGER_INBOX_POLL',
      source: 'passwordless-page',
      url: 'https://example.com/login',
    })

    // tryAcquirePoll is called before I/O so it is recorded on failure too
    expect(mockTryAcquirePoll).toHaveBeenCalledTimes(1)
  })

  // -------------------------------------------------------------------------
  // Test 6: Empty mailbox list → returns success silently, pollOnce NOT called
  // -------------------------------------------------------------------------
  it('returns { success: true } silently when no mailboxes are configured', async () => {
    const mockStorage = buildMockStorage([])
    ;(StorageFactory.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockStorage)

    const response = await handler.handleMessage({
      type: 'TRIGGER_INBOX_POLL',
      source: 'passwordless-page',
      url: 'https://example.com/login',
    })

    expect(response).toEqual({ success: true })
    expect(mockPollOnce).not.toHaveBeenCalled()
    // tryAcquirePoll IS still called (up-front, before any I/O) so we don't spin on empty mailbox state
    expect(mockTryAcquirePoll).toHaveBeenCalledTimes(1)
  })

  // -------------------------------------------------------------------------
  // Test 7: tryAcquirePoll() called even when getMailboxes rejects (early I/O failure)
  // This is the regression test for the retry-spam bug: if the rate-limit gate
  // were called AFTER I/O, a storage failure would skip it and allow an instant
  // retry loop. tryAcquirePoll() atomically records the cooldown before any
  // downstream I/O proceeds.
  // -------------------------------------------------------------------------
  it('calls tryAcquirePoll() even when getMailboxes rejects (early I/O failure)', async () => {
    const failingStorage = {
      getMailboxes: vi.fn().mockRejectedValue(new Error('storage error')),
      updateMailbox: vi.fn(),
      addMailbox: vi.fn(),
      removeMailbox: vi.fn(),
    }
    ;(StorageFactory.create as ReturnType<typeof vi.fn>).mockResolvedValue(failingStorage)

    const result = await handler.handleMessage({
      type: 'TRIGGER_INBOX_POLL',
      source: 'passwordless-page',
      url: 'https://example.com/login',
    })

    // Still silent success
    expect(result).toEqual({ success: true })
    // Critical: tryAcquirePoll must have been called before the I/O that failed
    expect(mockTryAcquirePoll).toHaveBeenCalledTimes(1)
  })

  // -------------------------------------------------------------------------
  // Test 8: Zero candidates → does NOT call updateWithNewCodes or badge functions
  // Fix A: auto-poll must not wipe cache on no-result
  // -------------------------------------------------------------------------
  it('does NOT call updateWithNewCodes or badge functions when pollOnce returns zero candidates', async () => {
    const mockStorage = buildMockStorage([makeMailbox('m1')])
    ;(StorageFactory.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockStorage)
    ;(createAdaptersFromMailboxes as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'adapter1' }])
    mockPollOnce.mockResolvedValue({
      candidates: [],
      adapterResults: [{ mailboxId: 'm1', success: true }],
    })

    const response = await handler.handleMessage({
      type: 'TRIGGER_INBOX_POLL',
      source: 'passwordless-page',
      url: 'https://example.com/login',
    })

    expect(response).toEqual({ success: true })
    expect(mockUpdateWithNewCodes).not.toHaveBeenCalled()
    expect(mockSetBadgeCount).not.toHaveBeenCalled()
    expect(mockClearBadge).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Test 9: Manual sync zero candidates → preserve existing cache
  // Fix B: opening/refreshing the popup must not wipe SMS items captured by
  // an active watch session when normal email sync finds nothing new.
  // -------------------------------------------------------------------------
  it('preserves existing cache when manual sync returns zero candidates', async () => {
    vi.useFakeTimers()

    try {
      const existingCache = {
        items: [
          {
            kind: 'code',
            id: 'google-messages:gm1:1000',
            providerId: 'google-messages',
            source: 'IKEA AILE - No subject',
            receivedAt: 1000,
            score: 0.95,
            code: '123456',
            len: 6,
          },
        ],
      }
      mockGetCache.mockResolvedValue(existingCache)

      const mockStorage = buildMockStorage([makeMailbox('m1')])
      ;(StorageFactory.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockStorage)
      ;(createAdaptersFromMailboxes as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'adapter1' }])
      mockPollOnce.mockResolvedValue({
        candidates: [],
        adapterResults: [{ mailboxId: 'm1', success: true }],
      })

      const responsePromise = handler.handleMessage({ type: 'TRIGGER_SYNC' })
      await vi.runAllTimersAsync()
      const response = await responsePromise

      expect(response).toEqual({ success: true, data: existingCache })
      expect(mockUpdateWithNewCodes).not.toHaveBeenCalled()
      expect(mockGetCache).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
