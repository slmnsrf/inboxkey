/**
 * Unit Tests for Background Service Worker
 * Tests message routing, lifecycle handlers, and error boundaries
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock dependencies
const mockKeyManager = {
  getInstance: vi.fn(() => ({
    initialize: vi.fn().mockResolvedValue({ salt: new Uint8Array([1, 2, 3, 4]) }),
    unlock: vi.fn().mockResolvedValue(true),
    lock: vi.fn(),
    isUnlocked: vi.fn().mockReturnValue(true),
    isLocked: vi.fn().mockReturnValue(false),
    resetAutoLockTimer: vi.fn(),
  })),
}

const _mockSessionController = {
  initialize: vi.fn().mockResolvedValue(undefined),
  startSession: vi.fn().mockResolvedValue({
    id: 'session-123',
    tabId: 1,
    url: 'https://example.com',
    status: 'active',
    pollsCompleted: 0,
  }),
  cancelSession: vi.fn().mockResolvedValue(undefined),
  handleAlarm: vi.fn().mockResolvedValue(undefined),
}

const _mockPopupCacheManager = {
  initialize: vi.fn().mockResolvedValue(undefined),
  updateWithNewCodes: vi.fn().mockResolvedValue(undefined),
  warmCache: vi.fn().mockResolvedValue(undefined),
}

const _mockPopupMessageHandler = {
  handleMessage: vi.fn().mockResolvedValue({ success: true }),
}

const mockStorageFactory = {
  create: vi.fn(() => ({
    getMailboxes: vi.fn().mockResolvedValue([]),
    getRecentCodes: vi.fn().mockResolvedValue([]),
    clearOldCodes: vi.fn().mockResolvedValue(undefined),
    addMailbox: vi.fn().mockResolvedValue(undefined),
    removeMailbox: vi.fn().mockResolvedValue(undefined),
    clearAllCodes: vi.fn().mockResolvedValue(undefined),
  })),
}

const mockGetSavedSalt = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4]))

// Mock chrome APIs
const mockSendMessage = vi.fn()
const mockOnMessageListeners: Array<(msg: any, sender: any, sendResponse: any) => boolean | void> = []
const mockOnInstalledListeners: Array<(details: any) => void> = []
const mockOnStartupListeners: Array<() => void> = []
const mockOnAlarmListeners: Array<(alarm: any) => void> = []
const mockOnConnectListeners: Array<(port: any) => void> = []
const mockCreateTab = vi.fn()
const mockGetURL = vi.fn((path: string) => `chrome-extension://test/${path}`)

// Storage mocks for chrome.storage.local, session, and sync
const mockStorageLocal = {
  get: vi.fn().mockResolvedValue({}),
  set: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
}

const mockStorageSession = {
  get: vi.fn().mockResolvedValue({}),
  set: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
}

const mockStorageSync = {
  get: vi.fn().mockResolvedValue({}),
  set: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
}

/**
 * Re-wire addListener implementations and storage mock return values
 * after vi.clearAllMocks() resets them. This is necessary because
 * clearAllMocks removes both mock implementations and return values.
 */
function setupChromeMock(): void {
  // Reset storage mock implementations (clearAllMocks wipes mockResolvedValue)
  mockStorageLocal.get.mockResolvedValue({})
  mockStorageLocal.set.mockResolvedValue(undefined)
  mockStorageLocal.remove.mockResolvedValue(undefined)
  mockStorageSession.get.mockResolvedValue({})
  mockStorageSession.set.mockResolvedValue(undefined)
  mockStorageSession.remove.mockResolvedValue(undefined)
  mockStorageSync.get.mockResolvedValue({})
  mockStorageSync.set.mockResolvedValue(undefined)
  mockStorageSync.remove.mockResolvedValue(undefined)

  mockGetURL.mockImplementation((path: string) => `chrome-extension://test/${path}`)
  mockGetSavedSalt.mockResolvedValue(new Uint8Array([1, 2, 3, 4]))

  global.chrome = {
    runtime: {
      onMessage: {
        addListener: vi.fn((fn) => mockOnMessageListeners.push(fn)),
      },
      onInstalled: {
        addListener: vi.fn((fn) => mockOnInstalledListeners.push(fn)),
      },
      onStartup: {
        addListener: vi.fn((fn) => mockOnStartupListeners.push(fn)),
      },
      onConnect: {
        addListener: vi.fn((fn) => mockOnConnectListeners.push(fn)),
      },
      sendMessage: mockSendMessage,
      getURL: mockGetURL,
      lastError: undefined,
    },
    alarms: {
      create: vi.fn(),
      get: vi.fn((_name: string, cb: (alarm: any) => void) => cb(undefined)),
      onAlarm: {
        addListener: vi.fn((fn) => mockOnAlarmListeners.push(fn)),
      },
    },
    tabs: {
      create: mockCreateTab,
      sendMessage: vi.fn(),
    },
    storage: {
      local: mockStorageLocal,
      session: mockStorageSession,
      sync: mockStorageSync,
    },
    identity: {
      getRedirectURL: vi.fn(() => 'https://test.chromiumapp.org/oauth2'),
    },
    notifications: {
      create: vi.fn(),
      clear: vi.fn(),
      update: vi.fn(),
      onClicked: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
      onClosed: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
  } as any
}

/**
 * Re-apply mock implementations for module-level mocks (KeyManager, StorageFactory, etc.)
 * that get wiped by vi.clearAllMocks().
 */
function resetMockImplementations(): void {
  mockKeyManager.getInstance.mockReturnValue({
    initialize: vi.fn().mockResolvedValue({ salt: new Uint8Array([1, 2, 3, 4]) }),
    unlock: vi.fn().mockResolvedValue(true),
    lock: vi.fn(),
    isUnlocked: vi.fn().mockReturnValue(true),
    isLocked: vi.fn().mockReturnValue(false),
    resetAutoLockTimer: vi.fn(),
  })

  mockStorageFactory.create.mockReturnValue({
    getMailboxes: vi.fn().mockResolvedValue([]),
    getRecentCodes: vi.fn().mockResolvedValue([]),
    clearOldCodes: vi.fn().mockResolvedValue(undefined),
    addMailbox: vi.fn().mockResolvedValue(undefined),
    removeMailbox: vi.fn().mockResolvedValue(undefined),
    clearAllCodes: vi.fn().mockResolvedValue(undefined),
    getSettings: vi.fn().mockResolvedValue({}),
    setDomainPreference: vi.fn().mockResolvedValue(undefined),
  })
}

// Initial setup
setupChromeMock()

// Mock module imports
vi.mock('@/lib/crypto/key-manager', () => ({
  KeyManager: mockKeyManager,
}))

vi.mock('@/lib/crypto/lock-state', () => ({
  getSavedSalt: mockGetSavedSalt,
}))

vi.mock('@/lib/storage/storage-factory', () => ({
  StorageFactory: mockStorageFactory,
}))

describe('Background Service Worker - Message Routing', () => {
  let sendResponseSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    sendResponseSpy = vi.fn()
    mockOnMessageListeners.length = 0
    mockOnInstalledListeners.length = 0
    mockOnStartupListeners.length = 0
    mockOnAlarmListeners.length = 0
    mockOnConnectListeners.length = 0
    vi.clearAllMocks()

    // Re-setup mock implementations after clearAllMocks resets them
    setupChromeMock()
    resetMockImplementations()

    // Reset module registry so re-importing background/index re-executes its code
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Message Listener Setup', () => {
    it('should register chrome.runtime.onMessage listener on load', async () => {
      // Import the background script (triggers listener registration)
      await import('../../src/background/index')

      expect(chrome.runtime.onMessage.addListener).toHaveBeenCalled()
      expect(mockOnMessageListeners.length).toBeGreaterThan(0)
    })

    it('should register chrome.runtime.onInstalled listener', async () => {
      await import('../../src/background/index')

      expect(chrome.runtime.onInstalled.addListener).toHaveBeenCalled()
      expect(mockOnInstalledListeners.length).toBeGreaterThan(0)
    })

    it('should register chrome.runtime.onStartup listener', async () => {
      await import('../../src/background/index')

      expect(chrome.runtime.onStartup.addListener).toHaveBeenCalled()
      expect(mockOnStartupListeners.length).toBeGreaterThan(0)
    })

    it('should register chrome.alarms.onAlarm listener via SessionPoller', async () => {
      await import('../../src/background/index')

      // SessionPoller (used by SessionController) registers its own alarm listener
      expect(chrome.alarms.onAlarm.addListener).toHaveBeenCalled()
      expect(mockOnAlarmListeners.length).toBeGreaterThan(0)
    })

    it('should register chrome.runtime.onConnect listener for watch sessions', async () => {
      await import('../../src/background/index')

      expect(chrome.runtime.onConnect.addListener).toHaveBeenCalled()
      expect(mockOnConnectListeners.length).toBeGreaterThan(0)
    })
  })

  describe('Message Type Routing', () => {
    it('should route TRIGGER_SYNC to popup handler (async)', async () => {
      await import('../../src/background/index')

      const listener = mockOnMessageListeners[0]
      const msg = { type: 'TRIGGER_SYNC' }
      const sender = { tab: { id: 1 } }

      const result = listener(msg, sender, sendResponseSpy)

      expect(result).toBe(true) // Async response
    })

    it('should route MARK_CODE_USED to popup handler (async)', async () => {
      await import('../../src/background/index')

      const listener = mockOnMessageListeners[0]
      const msg = { type: 'MARK_CODE_USED', codeId: 'code-1' }
      const sender = { tab: { id: 1 } }

      const result = listener(msg, sender, sendResponseSpy)

      expect(result).toBe(true) // Async response
    })

    it('should route MARK_CODES_SEEN to popup handler (async)', async () => {
      await import('../../src/background/index')

      const listener = mockOnMessageListeners[0]
      const msg = { type: 'MARK_CODES_SEEN' }
      const sender = { tab: { id: 1 } }

      const result = listener(msg, sender, sendResponseSpy)

      expect(result).toBe(true) // Async response
    })

    it('should route GET_SYNC_ERROR to popup handler (async)', async () => {
      await import('../../src/background/index')

      const listener = mockOnMessageListeners[0]
      const msg = { type: 'GET_SYNC_ERROR' }
      const sender = { tab: { id: 1 } }

      const result = listener(msg, sender, sendResponseSpy)

      expect(result).toBe(true) // Async response
    })

    it('should route GET_MAILBOXES to popup handler (async)', async () => {
      await import('../../src/background/index')

      const listener = mockOnMessageListeners[0]
      const msg = { type: 'GET_MAILBOXES' }
      const sender = { tab: { id: 1 } }

      const result = listener(msg, sender, sendResponseSpy)

      expect(result).toBe(true) // Async response
    })

    it('should route GET_POPUP_DATA to popup handler', async () => {
      await import('../../src/background/index')

      const listener = mockOnMessageListeners[0]
      const msg = { type: 'GET_POPUP_DATA' }
      const sender = { tab: { id: 1 } }

      const result = listener(msg, sender, sendResponseSpy)

      expect(result).toBe(true) // Async response
    })

    it('should route STORE_MAILBOX to handleStoreMailbox', async () => {
      await import('../../src/background/index')

      const listener = mockOnMessageListeners[0]
      const msg = {
        type: 'STORE_MAILBOX',
        provider: 'gmail',
        email: 'test@gmail.com',
        tokens: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresIn: 3600,
        },
      }
      const sender = { tab: { id: 1 } }

      const result = listener(msg, sender, sendResponseSpy)

      expect(result).toBe(true)
    })

    it('should route REMOVE_MAILBOX to handleRemoveMailbox', async () => {
      await import('../../src/background/index')

      const listener = mockOnMessageListeners[0]
      const msg = { type: 'REMOVE_MAILBOX', mailboxId: 'mailbox-123' }
      const sender = { tab: { id: 1 } }

      const result = listener(msg, sender, sendResponseSpy)

      expect(result).toBe(true)
    })

    it('should route CLEAR_ALL_CODES to handleClearAllCodes', async () => {
      await import('../../src/background/index')

      const listener = mockOnMessageListeners[0]
      const msg = { type: 'CLEAR_ALL_CODES' }
      const sender = { tab: { id: 1 } }

      const result = listener(msg, sender, sendResponseSpy)

      expect(result).toBe(true)
    })

    it('should handle unknown message types gracefully', async () => {
      await import('../../src/background/index')

      const listener = mockOnMessageListeners[0]
      const msg = { type: 'UNKNOWN_MESSAGE_TYPE' }
      const sender = { tab: { id: 1 } }

      listener(msg, sender, sendResponseSpy)

      expect(sendResponseSpy).toHaveBeenCalledWith({ error: 'Unknown message type' })
    })

    it('should handle deprecated FETCH_CODE message', async () => {
      await import('../../src/background/index')

      const listener = mockOnMessageListeners[0]
      const msg = { type: 'FETCH_CODE' }
      const sender = { tab: { id: 1 } }

      listener(msg, sender, sendResponseSpy)

      expect(sendResponseSpy).toHaveBeenCalledWith({
        error: 'FETCH_CODE_DEPRECATED',
        codes: [],
      })
    })
  })

  describe('STORE_MAILBOX Handler', () => {
    it('should store a gmail mailbox successfully', async () => {
      await import('../../src/background/index')

      const listener = mockOnMessageListeners[0]
      const msg = {
        type: 'STORE_MAILBOX',
        provider: 'gmail',
        email: 'user@gmail.com',
        tokens: {
          accessToken: 'access-123',
          refreshToken: 'refresh-456',
          expiresIn: 3600,
        },
      }
      const sender = { tab: { id: 1 } }

      const result = listener(msg, sender, sendResponseSpy)
      expect(result).toBe(true) // Async response

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(sendResponseSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          mailbox: expect.objectContaining({ email: 'user@gmail.com' }),
        })
      )
    })

    it('should store an IMAP mailbox via STORE_IMAP_MAILBOX', async () => {
      await import('../../src/background/index')

      const listener = mockOnMessageListeners[0]
      const msg = {
        type: 'STORE_IMAP_MAILBOX',
        email: 'user@example.com',
        server: 'imap.example.com',
        port: 993,
        accountId: 'acct-1',
      }
      const sender = { tab: { id: 1 } }

      const result = listener(msg, sender, sendResponseSpy)
      expect(result).toBe(true)

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(sendResponseSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          mailbox: expect.objectContaining({ email: 'user@example.com' }),
        })
      )
    })

    it('should remove a mailbox via REMOVE_MAILBOX', async () => {
      await import('../../src/background/index')

      const listener = mockOnMessageListeners[0]
      const msg = { type: 'REMOVE_MAILBOX', mailboxId: 'mailbox-abc' }
      const sender = { tab: { id: 1 } }

      const result = listener(msg, sender, sendResponseSpy)
      expect(result).toBe(true)

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(sendResponseSpy).toHaveBeenCalledWith({ success: true })
    })

    it('should handle storage errors during STORE_MAILBOX', async () => {
      mockStorageFactory.create.mockReturnValueOnce({
        getMailboxes: vi.fn().mockResolvedValue([]),
        getRecentCodes: vi.fn().mockResolvedValue([]),
        addMailbox: vi.fn().mockRejectedValue(new Error('Storage full')),
        removeMailbox: vi.fn(),
        clearAllCodes: vi.fn(),
        getSettings: vi.fn().mockResolvedValue({}),
        setDomainPreference: vi.fn(),
      })

      await import('../../src/background/index')

      const listener = mockOnMessageListeners[0]
      const msg = {
        type: 'STORE_MAILBOX',
        provider: 'gmail',
        email: 'test@gmail.com',
        tokens: { accessToken: 'a', refreshToken: 'r', expiresIn: 3600 },
      }
      const sender = { tab: { id: 1 } }

      listener(msg, sender, sendResponseSpy)

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(sendResponseSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Storage full',
        })
      )
    })
  })

  describe('Automation Level Handler', () => {
    it('should return automation level via GET_AUTOMATION_LEVEL', async () => {
      mockStorageLocal.get.mockResolvedValue({ settings: { automationLevel: 'popup' } })

      await import('../../src/background/index')

      const listener = mockOnMessageListeners[0]
      const msg = { type: 'GET_AUTOMATION_LEVEL' }
      const sender = { tab: { id: 1 } }

      const result = listener(msg, sender, sendResponseSpy)
      expect(result).toBe(true)

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(sendResponseSpy).toHaveBeenCalledWith({
        success: true,
        level: 'popup',
      })
    })

    it('should default to autofill when no automation level is stored', async () => {
      await import('../../src/background/index')

      const listener = mockOnMessageListeners[0]
      const msg = { type: 'GET_AUTOMATION_LEVEL' }
      const sender = { tab: { id: 1 } }

      listener(msg, sender, sendResponseSpy)

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(sendResponseSpy).toHaveBeenCalledWith({
        success: true,
        level: 'autofill',
      })
    })

    it('should set automation level via SET_AUTOMATION_LEVEL', async () => {
      await import('../../src/background/index')

      const listener = mockOnMessageListeners[0]
      const msg = { type: 'SET_AUTOMATION_LEVEL', level: 'popup' }
      const sender = { tab: { id: 1 } }

      const result = listener(msg, sender, sendResponseSpy)
      expect(result).toBe(true)

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(sendResponseSpy).toHaveBeenCalledWith({ success: true })
    })

    it('should handle CLEAR_CACHE by clearing session storage', async () => {
      await import('../../src/background/index')

      const listener = mockOnMessageListeners[0]
      const msg = { type: 'CLEAR_CACHE' }
      const sender = { tab: { id: 1 } }

      const result = listener(msg, sender, sendResponseSpy)
      expect(result).toBe(true)

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(mockStorageSession.remove).toHaveBeenCalledWith('inboxkey.popup_cache')
      expect(sendResponseSpy).toHaveBeenCalledWith({ success: true })
    })
  })

  describe('Service Worker Lifecycle', () => {
    it('should handle onInstalled with reason=install', async () => {
      await import('../../src/background/index')

      const handler = mockOnInstalledListeners[0]
      handler({ reason: 'install' })

      expect(mockCreateTab).toHaveBeenCalledWith({
        url: 'chrome-extension://test/options.html?tab=accounts',
      })
    })

    it('should not open options page on update', async () => {
      await import('../../src/background/index')

      const handler = mockOnInstalledListeners[0]
      handler({ reason: 'update' })

      expect(mockCreateTab).not.toHaveBeenCalled()
    })

    it('should handle onStartup event', async () => {
      await import('../../src/background/index')

      const handler = mockOnStartupListeners[0]

      // Should not throw
      expect(() => handler()).not.toThrow()
    })

    it('should have alarm listener registered by SessionPoller', async () => {
      await import('../../src/background/index')

      // SessionPoller registers its own alarm listener internally
      expect(mockOnAlarmListeners.length).toBeGreaterThan(0)
    })
  })

  describe('Error Boundaries', () => {
    it('should not crash worker on message handler error', async () => {
      // Make StorageFactory.create throw for STORE_MAILBOX
      mockStorageFactory.create.mockImplementationOnce(() => {
        throw new Error('Storage error')
      })

      await import('../../src/background/index')

      const listener = mockOnMessageListeners[0]
      const msg = {
        type: 'STORE_MAILBOX',
        provider: 'gmail',
        email: 'test@gmail.com',
        tokens: { accessToken: 'a', refreshToken: 'r', expiresIn: 3600 },
      }
      const sender = { tab: { id: 1 } }

      // Should not throw even when handler errors internally
      expect(() => listener(msg, sender, sendResponseSpy)).not.toThrow()

      await new Promise(resolve => setTimeout(resolve, 50))

      // Should send error response
      expect(sendResponseSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('Storage error'),
        })
      )
    })

    it('should handle non-Error exceptions in async handlers', async () => {
      mockStorageFactory.create.mockImplementationOnce(() => {
        throw 'String error'
      })

      await import('../../src/background/index')

      const listener = mockOnMessageListeners[0]
      const msg = {
        type: 'REMOVE_MAILBOX',
        mailboxId: 'mailbox-1',
      }
      const sender = { tab: { id: 1 } }

      listener(msg, sender, sendResponseSpy)

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(sendResponseSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'String error',
        })
      )
    })

    it('should continue processing after a failed message', async () => {
      await import('../../src/background/index')

      const listener = mockOnMessageListeners[0]
      const sender = { tab: { id: 1 } }

      // First: unknown message type (handled synchronously, no crash)
      const sendResponse1 = vi.fn()
      listener({ type: 'NONEXISTENT_TYPE' }, sender, sendResponse1)
      expect(sendResponse1).toHaveBeenCalledWith({ error: 'Unknown message type' })

      // Second: valid FETCH_CODE message should still work
      const sendResponse2 = vi.fn()
      listener({ type: 'FETCH_CODE' }, sender, sendResponse2)
      expect(sendResponse2).toHaveBeenCalledWith({
        error: 'FETCH_CODE_DEPRECATED',
        codes: [],
      })
    })
  })

  describe('Watch Session Port Handling', () => {
    it('should accept watch-session port connections', async () => {
      await import('../../src/background/index')

      const handler = mockOnConnectListeners[0]
      const mockPort = {
        name: 'watch-session',
        sender: { tab: { id: 1 } },
        disconnect: vi.fn(),
        onDisconnect: { addListener: vi.fn() },
        onMessage: { addListener: vi.fn() },
        postMessage: vi.fn(),
      }

      handler(mockPort)

      expect(mockPort.onMessage.addListener).toHaveBeenCalled()
      expect(mockPort.onDisconnect.addListener).toHaveBeenCalled()
    })

    it('should reject non-watch-session ports', async () => {
      await import('../../src/background/index')

      const handler = mockOnConnectListeners[0]
      const mockPort = {
        name: 'other-port',
        sender: { tab: { id: 1 } },
        disconnect: vi.fn(),
        onDisconnect: { addListener: vi.fn() },
        onMessage: { addListener: vi.fn() },
      }

      handler(mockPort)

      expect(mockPort.disconnect).not.toHaveBeenCalled()
      expect(mockPort.onMessage.addListener).not.toHaveBeenCalled()
    })

    it('should reject ports without tabId', async () => {
      await import('../../src/background/index')

      const handler = mockOnConnectListeners[0]
      const mockPort = {
        name: 'watch-session',
        sender: {},
        disconnect: vi.fn(),
        onDisconnect: { addListener: vi.fn() },
        onMessage: { addListener: vi.fn() },
      }

      handler(mockPort)

      expect(mockPort.disconnect).toHaveBeenCalled()
      expect(mockPort.onMessage.addListener).not.toHaveBeenCalled()
    })
  })

  describe('Mailbox Management', () => {
    it('should store mailbox and respond with id and email', async () => {
      await import('../../src/background/index')

      const listener = mockOnMessageListeners[0]
      const msg = {
        type: 'STORE_MAILBOX',
        provider: 'gmail',
        email: 'test@gmail.com',
        tokens: {
          accessToken: 'token',
          refreshToken: 'refresh',
          expiresIn: 3600,
        },
      }
      const sender = { tab: { id: 1 } }

      listener(msg, sender, sendResponseSpy)

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(sendResponseSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          mailbox: expect.objectContaining({ email: 'test@gmail.com' }),
        })
      )
    })

    it('should remove mailbox via REMOVE_MAILBOX', async () => {
      await import('../../src/background/index')

      const listener = mockOnMessageListeners[0]
      const msg = { type: 'REMOVE_MAILBOX', mailboxId: 'mailbox-123' }
      const sender = { tab: { id: 1 } }

      listener(msg, sender, sendResponseSpy)

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(sendResponseSpy).toHaveBeenCalledWith({ success: true })
    })

    it('should clear ephemeral codes via CLEAR_ALL_CODES using session storage', async () => {
      await import('../../src/background/index')

      const listener = mockOnMessageListeners[0]
      const msg = { type: 'CLEAR_ALL_CODES' }
      const sender = { tab: { id: 1 } }

      listener(msg, sender, sendResponseSpy)

      await new Promise(resolve => setTimeout(resolve, 50))

      // CLEAR_ALL_CODES now clears ephemeral session storage, not persistent storage
      expect(mockStorageSession.remove).toHaveBeenCalledWith('inboxkey.popup_cache')
      expect(sendResponseSpy).toHaveBeenCalledWith({ success: true })
    })

    it('should handle UPDATE_BADGE messages synchronously', async () => {
      await import('../../src/background/index')

      const listener = mockOnMessageListeners[0]
      const msg = { type: 'UPDATE_BADGE', state: 'clear' }
      const sender = { tab: { id: 1 } }

      const result = listener(msg, sender, sendResponseSpy)

      // UPDATE_BADGE returns false (synchronous, no response needed)
      expect(result).toBe(false)
    })
  })
})
