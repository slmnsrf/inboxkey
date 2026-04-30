/**
 * Integration tests for Google Messages background message handlers.
 *
 * Tests CONNECT_GOOGLE_MESSAGES, CHECK_GM_PAIRING_STATUS,
 * CANCEL_GM_SETUP, and DISCONNECT_GOOGLE_MESSAGES handlers.
 *
 * Mocks: MessagesTabManager (via module mock), StorageFactory, chrome APIs.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock setup -- must be before imports that reference mocked modules
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockTabManager = {
  savePendingSetup: vi.fn().mockResolvedValue(undefined),
  getPendingSetup: vi.fn().mockResolvedValue(null),
  clearPendingSetup: vi.fn().mockResolvedValue(undefined),
  ensureTab: vi.fn().mockResolvedValue({ tabId: 100, owned: true }),
  checkPairingStatus: vi.fn().mockResolvedValue('unpaired'),
  closeIfOwned: vi.fn().mockResolvedValue(undefined),
  recoverFromRestart: vi.fn().mockResolvedValue(undefined),
} as Record<string, ReturnType<typeof vi.fn>>

vi.mock('@/lib/providers/google-messages/tab-manager', () => ({
  getMessagesTabManager: () => mockTabManager,
}))

const mockStorage = {
  addMailbox: vi.fn().mockResolvedValue(undefined),
  getMailboxes: vi.fn().mockResolvedValue([]),
  removeMailbox: vi.fn().mockResolvedValue(undefined),
  getSettings: vi.fn().mockResolvedValue({
    autoFillEnabled: true,
    allowedDomains: [],
    deniedDomains: [],
    notificationsEnabled: true,
  }),
} as Record<string, ReturnType<typeof vi.fn>>

vi.mock('@/lib/storage/storage-factory', () => ({
  StorageFactory: {
    create: vi.fn(async () => mockStorage),
  },
}))

// Mock PopupCacheManager
vi.mock('../../background/popup-cache', () => ({
  PopupCacheManager: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(async () => {}),
    getCache: vi.fn(async () => ({ codes: [] })),
    warmCache: vi.fn(async () => {}),
    updateWithNewCodes: vi.fn(async () => {}),
  })),
}))

// Mock ErrorStateManager
vi.mock('../../background/error-state-manager', () => ({
  ErrorStateManager: vi.fn().mockImplementation(() => ({
    shouldShowBadge: vi.fn(async () => false),
    removeMailboxErrors: vi.fn(async () => {}),
  })),
}))

// Mock PopupMessageHandler
vi.mock('../../background/popup-handler', () => ({
  PopupMessageHandler: vi.fn().mockImplementation(() => ({
    handleMessage: vi.fn(async () => ({})),
  })),
}))

// Mock SessionController
vi.mock('../../background/session-controller', () => ({
  SessionController: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(async () => {}),
    startSession: vi.fn(async () => ({ id: 'test-session' })),
    cancelSession: vi.fn(async () => {}),
  })),
}))

// Mock badge-manager
vi.mock('@/contents/badge-manager', () => ({
  setBadgeListening: vi.fn(),
  setBadgeSuccess: vi.fn(),
  setBadgeNoCode: vi.fn(),
  setBadgeCount: vi.fn(),
  setBadgeSyncError: vi.fn(),
  clearBadge: vi.fn(),
}))

// Mock blacklist
vi.mock('@/lib/utils/blacklist', () => ({
  addBlacklistedDomain: vi.fn(async () => {}),
  removeBlacklistedDomain: vi.fn(async () => {}),
}))

// Mock token-refresh
vi.mock('../../background/token-refresh', () => ({
  registerTokenRefreshAlarm: vi.fn(),
  refreshExpiringTokens: vi.fn(async () => {}),
}))

// Stub chrome.runtime, chrome.storage, chrome.identity, chrome.tabs, chrome.alarms
const sessionStore = new Map<string, unknown>()

function buildChromeMock() {
  return {
    runtime: {
      onConnect: { addListener: vi.fn() },
      onMessage: { addListener: vi.fn() },
      onInstalled: { addListener: vi.fn() },
      onStartup: { addListener: vi.fn() },
      lastError: null,
      getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
    },
    tabs: {
      query: vi.fn(async () => []),
      create: vi.fn(async () => ({ id: 100 })),
      get: vi.fn(async (id: number) => ({ id })),
      remove: vi.fn(async () => {}),
      sendMessage: vi.fn(),
    },
    storage: {
      local: {
        get: vi.fn(async () => ({})),
        set: vi.fn(async () => {}),
        remove: vi.fn(async () => {}),
      },
      session: {
        get: vi.fn(async (key: string) => {
          const val = sessionStore.get(key)
          return val !== undefined ? { [key]: val } : {}
        }),
        set: vi.fn(async (items: Record<string, unknown>) => {
          for (const [k, v] of Object.entries(items)) {
            sessionStore.set(k, v)
          }
        }),
        remove: vi.fn(async (key: string | string[]) => {
          const keys = Array.isArray(key) ? key : [key]
          keys.forEach((k) => sessionStore.delete(k))
        }),
      },
      sync: {
        remove: vi.fn(async () => {}),
      },
    },
    identity: {
      getRedirectURL: vi.fn(() => 'https://test.chromiumapp.org/'),
    },
    alarms: {
      create: vi.fn(),
      onAlarm: { addListener: vi.fn() },
    },
    scripting: {
      executeScript: vi.fn(async () => [{ result: undefined }]),
    },
    action: {
      setBadgeText: vi.fn(),
      setBadgeBackgroundColor: vi.fn(),
    },
    notifications: {
      create: vi.fn(),
      clear: vi.fn(),
      update: vi.fn(),
      onClicked: { addListener: vi.fn(), removeListener: vi.fn() },
      onClosed: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  }
}

let chromeMock: ReturnType<typeof buildChromeMock>

/**
 * Extract the onMessage listener registered by background/index.ts.
 * The background module registers listeners via chrome.runtime.onMessage.addListener,
 * so we capture the first handler callback.
 */
let messageHandler: (
  msg: any,
  sender: any,
  sendResponse: (response: any) => void
) => boolean | void

beforeEach(async () => {
  sessionStore.clear()
  chromeMock = buildChromeMock()
  ;(globalThis as any).chrome = chromeMock

  // Reset all mock call history (not implementations)
  Object.values(mockTabManager).forEach((fn) => fn.mockClear())
  Object.values(mockStorage).forEach((fn) => fn.mockClear())

  // Re-apply default return values (mockClear preserves, but be explicit)
  mockTabManager.savePendingSetup.mockResolvedValue(undefined)
  mockTabManager.getPendingSetup.mockResolvedValue(null)
  mockTabManager.clearPendingSetup.mockResolvedValue(undefined)
  mockTabManager.ensureTab.mockResolvedValue({ tabId: 100, owned: true })
  mockTabManager.checkPairingStatus.mockResolvedValue('unpaired')
  mockTabManager.closeIfOwned.mockResolvedValue(undefined)
  mockTabManager.recoverFromRestart.mockResolvedValue(undefined)
  mockStorage.addMailbox.mockResolvedValue(undefined)
  mockStorage.getMailboxes.mockResolvedValue([])
  mockStorage.removeMailbox.mockResolvedValue(undefined)

  // Dynamically import the background module to capture the onMessage handler
  // We need to reset the module registry to get a fresh import each time
  vi.resetModules()

  // Re-apply mocks after resetModules
  vi.doMock('@/lib/providers/google-messages/tab-manager', () => ({
    getMessagesTabManager: () => mockTabManager,
  }))
  vi.doMock('@/lib/storage/storage-factory', () => ({
    StorageFactory: {
      create: vi.fn(async () => mockStorage),
    },
  }))
  vi.doMock('../../background/popup-cache', () => ({
    PopupCacheManager: vi.fn().mockImplementation(() => ({
      initialize: vi.fn(async () => {}),
      getCache: vi.fn(async () => ({ codes: [] })),
      warmCache: vi.fn(async () => {}),
      updateWithNewCodes: vi.fn(async () => {}),
    })),
  }))
  vi.doMock('../../background/error-state-manager', () => ({
    ErrorStateManager: vi.fn().mockImplementation(() => ({
      shouldShowBadge: vi.fn(async () => false),
      removeMailboxErrors: vi.fn(async () => {}),
    })),
  }))
  vi.doMock('../../background/popup-handler', () => ({
    PopupMessageHandler: vi.fn().mockImplementation(() => ({
      handleMessage: vi.fn(async () => ({})),
    })),
  }))
  vi.doMock('../../background/session-controller', () => ({
    SessionController: vi.fn().mockImplementation(() => ({
      initialize: vi.fn(async () => {}),
      startSession: vi.fn(async () => ({ id: 'test-session' })),
      cancelSession: vi.fn(async () => {}),
    })),
  }))
  vi.doMock('@/contents/badge-manager', () => ({
    setBadgeListening: vi.fn(),
    setBadgeSuccess: vi.fn(),
    setBadgeNoCode: vi.fn(),
    setBadgeCount: vi.fn(),
    setBadgeSyncError: vi.fn(),
    clearBadge: vi.fn(),
  }))
  vi.doMock('@/lib/utils/blacklist', () => ({
    addBlacklistedDomain: vi.fn(async () => {}),
    removeBlacklistedDomain: vi.fn(async () => {}),
  }))
  vi.doMock('../../background/token-refresh', () => ({
    registerTokenRefreshAlarm: vi.fn(),
    refreshExpiringTokens: vi.fn(async () => {}),
  }))

  await import('../../background/index')

  // Extract the message handler from the first onMessage.addListener call
  const calls = chromeMock.runtime.onMessage.addListener.mock.calls
  messageHandler = calls[0][0]
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Helper: send a message and collect the async response
// ---------------------------------------------------------------------------

function sendMessage(msg: any): Promise<any> {
  return new Promise((resolve) => {
    const sender = { tab: { id: 1 }, url: 'chrome-extension://test/options.html' }
    const returnedTrue = messageHandler(msg, sender, resolve)
    // Handler must return true for async response
    expect(returnedTrue).toBe(true)
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Google Messages background handlers', () => {
  // ---- CONNECT_GOOGLE_MESSAGES ------------------------------------------

  describe('CONNECT_GOOGLE_MESSAGES', () => {
    it('persists pending setup and returns "pairing" when not yet paired', async () => {
      mockTabManager.checkPairingStatus.mockResolvedValue('unpaired')

      const response = await sendMessage({
        type: 'CONNECT_GOOGLE_MESSAGES',
        phoneNumber: '+905551234455',
      })

      expect(response.status).toBe('pairing')
      expect(mockTabManager.savePendingSetup).toHaveBeenCalledTimes(2)
      expect(mockTabManager.ensureTab).toHaveBeenCalledOnce()
      expect(mockTabManager.checkPairingStatus).toHaveBeenCalledWith(100)
    })

    it('saves mailbox and returns "paired" when already paired', async () => {
      mockTabManager.checkPairingStatus.mockResolvedValue('paired')

      const response = await sendMessage({
        type: 'CONNECT_GOOGLE_MESSAGES',
        phoneNumber: '+905551234455',
      })

      expect(response.status).toBe('paired')
      expect(mockStorage.addMailbox).toHaveBeenCalledOnce()

      const savedMailbox = mockStorage.addMailbox.mock.calls[0][0]
      expect(savedMailbox.providerId).toBe('google-messages')
      expect(savedMailbox.email).toBe('sms@google-messages.local')
      expect(savedMailbox.gmPhoneNumber).toBe('+905551234455')
      expect(savedMailbox.lastSyncedAt).toBe(0)

      expect(mockTabManager.clearPendingSetup).toHaveBeenCalledOnce()
    })

    it('rejects when a google-messages mailbox already exists', async () => {
      mockTabManager.checkPairingStatus.mockResolvedValue('paired')
      mockStorage.getMailboxes.mockResolvedValue([
        { id: 'existing-id', providerId: 'google-messages', email: 'sms@google-messages.local' },
      ])

      const response = await sendMessage({
        type: 'CONNECT_GOOGLE_MESSAGES',
        phoneNumber: '+905551234455',
      })

      expect(response.status).toBe('error')
      expect(response.error).toContain('already exists')
      expect(mockStorage.addMailbox).not.toHaveBeenCalled()
    })
  })

  // ---- CHECK_GM_PAIRING_STATUS -----------------------------------------

  describe('CHECK_GM_PAIRING_STATUS', () => {
    it('returns "not-open" when no pending setup exists', async () => {
      mockTabManager.getPendingSetup.mockResolvedValue(null)

      const response = await sendMessage({
        type: 'CHECK_GM_PAIRING_STATUS',
      })

      expect(response.status).toBe('not-open')
    })

    it('returns "unpaired" when pending setup exists but not yet paired', async () => {
      mockTabManager.getPendingSetup.mockResolvedValue({
        phoneNumber: '+905551234455',
        tabId: 100,
        owned: true,
        startedAt: Date.now(),
      })
      mockTabManager.checkPairingStatus.mockResolvedValue('unpaired')

      const response = await sendMessage({
        type: 'CHECK_GM_PAIRING_STATUS',
      })

      expect(response.status).toBe('unpaired')
    })

    it('saves mailbox with placeholder email when paired', async () => {
      mockTabManager.getPendingSetup.mockResolvedValue({
        phoneNumber: '+905551234455',
        tabId: 100,
        owned: true,
        startedAt: Date.now(),
      })
      mockTabManager.checkPairingStatus.mockResolvedValue('paired')

      const response = await sendMessage({
        type: 'CHECK_GM_PAIRING_STATUS',
      })

      expect(response.status).toBe('paired')
      expect(mockStorage.addMailbox).toHaveBeenCalledOnce()

      const saved = mockStorage.addMailbox.mock.calls[0][0]
      expect(saved.email).toBe('sms@google-messages.local')
      expect(saved.providerId).toBe('google-messages')
      expect(saved.gmPhoneNumber).toBe('+905551234455')

      expect(mockTabManager.clearPendingSetup).toHaveBeenCalledOnce()
      // On pairing success the handler intentionally leaves the
      // Messages tab open (settings tab gets focus, user keeps
      // Messages for SMS scraping). closeIfOwned is only called on
      // the one-account-limit rejection path and on cancel.
      expect(mockTabManager.closeIfOwned).not.toHaveBeenCalled()
    })

    it('enforces one-account limit when checking pairing', async () => {
      mockTabManager.getPendingSetup.mockResolvedValue({
        phoneNumber: '+905551234455',
        tabId: 100,
        owned: true,
        startedAt: Date.now(),
      })
      mockTabManager.checkPairingStatus.mockResolvedValue('paired')
      mockStorage.getMailboxes.mockResolvedValue([
        { id: 'existing', providerId: 'google-messages', email: 'sms@google-messages.local' },
      ])

      const response = await sendMessage({
        type: 'CHECK_GM_PAIRING_STATUS',
      })

      expect(response.status).toBe('error')
      expect(response.error).toContain('already exists')
      expect(mockStorage.addMailbox).not.toHaveBeenCalled()
      expect(mockTabManager.clearPendingSetup).toHaveBeenCalledOnce()
      expect(mockTabManager.closeIfOwned).toHaveBeenCalledOnce()
    })

    it('returns "unpaired" when pending has no tabId', async () => {
      mockTabManager.getPendingSetup.mockResolvedValue({
        phoneNumber: '+905551234455',
        owned: false,
        startedAt: Date.now(),
        // no tabId
      })

      const response = await sendMessage({
        type: 'CHECK_GM_PAIRING_STATUS',
      })

      expect(response.status).toBe('unpaired')
      expect(mockTabManager.checkPairingStatus).not.toHaveBeenCalled()
    })
  })

  // ---- CANCEL_GM_SETUP -------------------------------------------------

  describe('CANCEL_GM_SETUP', () => {
    it('clears pending setup and closes tab', async () => {
      const response = await sendMessage({
        type: 'CANCEL_GM_SETUP',
      })

      expect(response.ok).toBe(true)
      expect(mockTabManager.clearPendingSetup).toHaveBeenCalledOnce()
      expect(mockTabManager.closeIfOwned).toHaveBeenCalledOnce()
    })
  })

  // ---- DISCONNECT_GOOGLE_MESSAGES --------------------------------------

  describe('DISCONNECT_GOOGLE_MESSAGES', () => {
    it('removes mailbox from storage', async () => {
      const response = await sendMessage({
        type: 'DISCONNECT_GOOGLE_MESSAGES',
        mailboxId: 'test-mailbox-id',
      })

      expect(response.ok).toBe(true)
      expect(mockStorage.removeMailbox).toHaveBeenCalledWith('test-mailbox-id')
    })
  })
})
