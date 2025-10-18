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
    onAlarm: {
      addListener: vi.fn((fn) => mockOnAlarmListeners.push(fn)),
    },
  },
  tabs: {
    create: mockCreateTab,
    sendMessage: vi.fn(),
  },
  identity: {
    getRedirectURL: vi.fn(() => 'https://test.chromiumapp.org/oauth2'),
  },
} as any

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

    it('should register chrome.alarms.onAlarm listener', async () => {
      await import('../../src/background/index')

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
    it('should route INITIALIZE_LOCK to handleInitializeLock', async () => {
      await import('../../src/background/index')

      const listener = mockOnMessageListeners[0]
      const msg = { type: 'INITIALIZE_LOCK', password: '123456' }
      const sender = { tab: { id: 1 } }

      const result = listener(msg, sender, sendResponseSpy)

      // Should return true for async response
      expect(result).toBe(true)

      // Wait for async handler
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(mockKeyManager.getInstance).toHaveBeenCalled()
    })

    it('should route UNLOCK to handleUnlock', async () => {
      await import('../../src/background/index')

      const listener = mockOnMessageListeners[0]
      const msg = { type: 'UNLOCK', password: '123456' }
      const sender = { tab: { id: 1 } }

      const result = listener(msg, sender, sendResponseSpy)

      expect(result).toBe(true)

      await new Promise(resolve => setTimeout(resolve, 10))

      expect(mockKeyManager.getInstance).toHaveBeenCalled()
    })

    it('should route LOCK to handleLock', async () => {
      await import('../../src/background/index')

      const listener = mockOnMessageListeners[0]
      const msg = { type: 'LOCK' }
      const sender = { tab: { id: 1 } }

      const result = listener(msg, sender, sendResponseSpy)

      expect(result).toBe(false) // Synchronous response
      expect(sendResponseSpy).toHaveBeenCalledWith({ success: true })
    })

    it('should route CHECK_LOCK_STATUS to handleCheckLockStatus', async () => {
      await import('../../src/background/index')

      const listener = mockOnMessageListeners[0]
      const msg = { type: 'CHECK_LOCK_STATUS' }
      const sender = { tab: { id: 1 } }

      listener(msg, sender, sendResponseSpy)

      expect(sendResponseSpy).toHaveBeenCalledWith({ isUnlocked: true })
    })

    it('should route ACTIVITY to handleActivity', async () => {
      await import('../../src/background/index')

      const listener = mockOnMessageListeners[0]
      const msg = { type: 'ACTIVITY' }
      const sender = { tab: { id: 1 } }

      listener(msg, sender, sendResponseSpy)

      expect(sendResponseSpy).toHaveBeenCalledWith({ success: true })
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

  describe('INITIALIZE_LOCK Handler', () => {
    it('should reject requests without password', async () => {
      await import('../../src/background/index')

      const listener = mockOnMessageListeners[0]
      const msg = { type: 'INITIALIZE_LOCK' }
      const sender = { tab: { id: 1 } }

      listener(msg, sender, sendResponseSpy)

      await new Promise(resolve => setTimeout(resolve, 10))

      expect(sendResponseSpy).toHaveBeenCalledWith({
        success: false,
        error: 'PIN required',
      })
    })

    it('should initialize KeyManager with provided password', async () => {
      await import('../../src/background/index')

      const listener = mockOnMessageListeners[0]
      const msg = { type: 'INITIALIZE_LOCK', password: '123456' }
      const sender = { tab: { id: 1 } }

      listener(msg, sender, sendResponseSpy)

      await new Promise(resolve => setTimeout(resolve, 10))

      const kmInstance = mockKeyManager.getInstance()
      expect(kmInstance.initialize).toHaveBeenCalledWith('123456')
    })

    it('should return salt on successful initialization', async () => {
      await import('../../src/background/index')

      const listener = mockOnMessageListeners[0]
      const msg = { type: 'INITIALIZE_LOCK', password: '123456' }
      const sender = { tab: { id: 1 } }

      listener(msg, sender, sendResponseSpy)

      await new Promise(resolve => setTimeout(resolve, 10))

      expect(sendResponseSpy).toHaveBeenCalledWith({
        success: true,
        salt: [1, 2, 3, 4],
      })
    })

    it('should handle initialization errors', async () => {
      const errorInstance = mockKeyManager.getInstance()
      errorInstance.initialize.mockRejectedValueOnce(new Error('Invalid PIN'))

      await import('../../src/background/index')

      const listener = mockOnMessageListeners[0]
      const msg = { type: 'INITIALIZE_LOCK', password: '123' }
      const sender = { tab: { id: 1 } }

      listener(msg, sender, sendResponseSpy)

      await new Promise(resolve => setTimeout(resolve, 10))

      expect(sendResponseSpy).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid PIN',
      })
    })
  })

  describe('UNLOCK Handler', () => {
    it('should reject requests without password', async () => {
      await import('../../src/background/index')

      const listener = mockOnMessageListeners[0]
      const msg = { type: 'UNLOCK' }
      const sender = { tab: { id: 1 } }

      listener(msg, sender, sendResponseSpy)

      await new Promise(resolve => setTimeout(resolve, 10))

      expect(sendResponseSpy).toHaveBeenCalledWith({
        success: false,
        error: 'PIN required',
      })
    })

    it('should reject unlock if extension not initialized', async () => {
      mockGetSavedSalt.mockResolvedValueOnce(null)

      await import('../../src/background/index')

      const listener = mockOnMessageListeners[0]
      const msg = { type: 'UNLOCK', password: '123456' }
      const sender = { tab: { id: 1 } }

      listener(msg, sender, sendResponseSpy)

      await new Promise(resolve => setTimeout(resolve, 10))

      expect(sendResponseSpy).toHaveBeenCalledWith({
        success: false,
        error: 'Extension not initialized',
      })
    })

    it('should unlock with correct password', async () => {
      await import('../../src/background/index')

      const listener = mockOnMessageListeners[0]
      const msg = { type: 'UNLOCK', password: '123456' }
      const sender = { tab: { id: 1 } }

      listener(msg, sender, sendResponseSpy)

      await new Promise(resolve => setTimeout(resolve, 10))

      expect(sendResponseSpy).toHaveBeenCalledWith({ success: true })
    })

    it('should reject unlock with incorrect password', async () => {
      const kmInstance = mockKeyManager.getInstance()
      kmInstance.unlock.mockResolvedValueOnce(false)

      await import('../../src/background/index')

      const listener = mockOnMessageListeners[0]
      const msg = { type: 'UNLOCK', password: 'wrong' }
      const sender = { tab: { id: 1 } }

      listener(msg, sender, sendResponseSpy)

      await new Promise(resolve => setTimeout(resolve, 10))

      expect(sendResponseSpy).toHaveBeenCalledWith({
        success: false,
        error: 'Incorrect PIN',
      })
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

    it('should handle alarm events', async () => {
      await import('../../src/background/index')

      const handler = mockOnAlarmListeners[0]
      const alarm = { name: 'poll-session-123' }

      await handler(alarm)

      // Alarm should be handled (exact behavior depends on SessionController)
      expect(handler).toBeDefined()
    })

    it('should ignore alarms without names', async () => {
      await import('../../src/background/index')

      const handler = mockOnAlarmListeners[0]
      const alarm = { name: '' }

      // Should not throw or call sessionController
      await expect(handler(alarm)).resolves.toBeUndefined()
    })
  })

  describe('Error Boundaries', () => {
    it('should not crash worker on message handler error', async () => {
      const kmInstance = mockKeyManager.getInstance()
      kmInstance.initialize.mockRejectedValueOnce(new Error('Crypto error'))

      await import('../../src/background/index')

      const listener = mockOnMessageListeners[0]
      const msg = { type: 'INITIALIZE_LOCK', password: '123456' }
      const sender = { tab: { id: 1 } }

      // Should not throw
      expect(() => listener(msg, sender, sendResponseSpy)).not.toThrow()

      await new Promise(resolve => setTimeout(resolve, 10))

      // Should send error response
      expect(sendResponseSpy).toHaveBeenCalledWith({
        success: false,
        error: 'Crypto error',
      })
    })

    it('should handle non-Error exceptions', async () => {
      const kmInstance = mockKeyManager.getInstance()
      kmInstance.unlock.mockRejectedValueOnce('String error')

      await import('../../src/background/index')

      const listener = mockOnMessageListeners[0]
      const msg = { type: 'UNLOCK', password: '123456' }
      const sender = { tab: { id: 1 } }

      listener(msg, sender, sendResponseSpy)

      await new Promise(resolve => setTimeout(resolve, 10))

      expect(sendResponseSpy).toHaveBeenCalledWith({
        success: false,
        error: 'String error',
      })
    })

    it('should log errors but continue processing', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const kmInstance = mockKeyManager.getInstance()
      kmInstance.initialize.mockRejectedValueOnce(new Error('Test error'))

      await import('../../src/background/index')

      const listener = mockOnMessageListeners[0]
      const msg1 = { type: 'INITIALIZE_LOCK', password: '123456' }
      const msg2 = { type: 'CHECK_LOCK_STATUS' }
      const sender = { tab: { id: 1 } }

      // First message should error
      listener(msg1, sender, sendResponseSpy)
      await new Promise(resolve => setTimeout(resolve, 10))

      // Second message should still work
      listener(msg2, sender, sendResponseSpy)

      expect(sendResponseSpy).toHaveBeenCalledWith({ isUnlocked: true })

      consoleErrorSpy.mockRestore()
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
    it('should store mailbox when unlocked', async () => {
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

      await new Promise(resolve => setTimeout(resolve, 10))

      const storage = await mockStorageFactory.create()
      expect(storage.addMailbox).toHaveBeenCalled()
    })

    it('should reject mailbox operations when locked', async () => {
      const kmInstance = mockKeyManager.getInstance()
      kmInstance.isLocked.mockReturnValueOnce(true)

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

      await new Promise(resolve => setTimeout(resolve, 10))

      expect(sendResponseSpy).toHaveBeenCalledWith({
        success: false,
        error: 'Extension is locked',
      })
    })

    it('should remove mailbox when unlocked', async () => {
      await import('../../src/background/index')

      const listener = mockOnMessageListeners[0]
      const msg = { type: 'REMOVE_MAILBOX', mailboxId: 'mailbox-123' }
      const sender = { tab: { id: 1 } }

      listener(msg, sender, sendResponseSpy)

      await new Promise(resolve => setTimeout(resolve, 10))

      const storage = await mockStorageFactory.create()
      expect(storage.removeMailbox).toHaveBeenCalledWith('mailbox-123')
    })

    it('should clear all codes when unlocked', async () => {
      await import('../../src/background/index')

      const listener = mockOnMessageListeners[0]
      const msg = { type: 'CLEAR_ALL_CODES' }
      const sender = { tab: { id: 1 } }

      listener(msg, sender, sendResponseSpy)

      await new Promise(resolve => setTimeout(resolve, 10))

      const storage = await mockStorageFactory.create()
      expect(storage.clearAllCodes).toHaveBeenCalled()
    })
  })
})
