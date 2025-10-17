/**
 * Background Service Worker
 * Entry point for the MV3 background service worker.
 *
 * Responsibilities:
 * - Manage lock/unlock workflow (KeyManager)
 * - Coordinate watch sessions via SessionController
 * - Maintain keep-alive ports from content scripts
 */

import { KeyManager } from "@/lib/crypto/key-manager"
import { getSavedSalt } from "@/lib/crypto/lock-state"
import {
  SessionController,
  type SessionCompletion,
  type SessionState,
} from "./session-controller"
import { PopupCacheManager } from "./popup-cache"
import { PopupMessageHandler } from "./popup-handler"
import { StorageFactory } from "@/lib/storage/storage-factory"
import type { Mailbox } from "@/lib/storage/schema"

interface StartSessionMessage {
  type: "START_SESSION"
  url: string
  expected?: {
    length?: number
    charset?: "digits" | "alnum"
  }
}

interface StopSessionMessage {
  type: "STOP_SESSION"
}

interface PingMessage {
  type: "PING"
}

type WatchPortMessage = StartSessionMessage | StopSessionMessage | PingMessage

interface WatchPortContext {
  tabId: number
  port?: chrome.runtime.Port
  sessionId?: string
  keepAliveTimer?: NodeJS.Timeout
}

const tabContexts = new Map<number, WatchPortContext>()
const sessionContexts = new Map<string, WatchPortContext>()

// Create popup cache manager and handler
const popupCacheManager = new PopupCacheManager()
const popupMessageHandler = new PopupMessageHandler(
  popupCacheManager,
  KeyManager.getInstance()
)

const sessionController = new SessionController(
  {
    onSessionUpdated: (session) => {
      deliverSessionUpdate(session)
    },
    onSessionCompleted: (session, result) => {
      deliverSessionCompletion(session, result)
    },
  },
  undefined, // Use default poll schedule
  popupCacheManager // Pass cache manager for updates
)

sessionController
  .initialize()
  .then(async () => {
    console.log("[InboxKey] SessionController initialized")
    await popupCacheManager.initialize()
    console.log("[InboxKey] PopupCacheManager initialized")
  })
  .catch((error) => {
    console.error("[InboxKey] Failed to initialize:", error)
  })

// Track lifecycle across restarts
let startupTimestamp = Date.now()
let messageCount = 0
let lastMessageTimestamp = 0

console.log("[InboxKey] Service worker started at", new Date().toISOString())
if (typeof chrome.identity !== "undefined" && chrome.identity?.getRedirectURL) {
  const resolvedRedirect = chrome.identity.getRedirectURL("oauth2")
  console.log("[InboxKey] OAuth redirect URI:", resolvedRedirect)
}

// Auto-open options page on first install
chrome.runtime.onInstalled.addListener((details) => {
  console.log("[InboxKey] SW onInstalled fired:", details.reason)
  console.log("[InboxKey] Installation timestamp:", Date.now())

  if (details.reason === 'install') {
    chrome.tabs.create({
      url: chrome.runtime.getURL('options.html?tab=accounts')
    })
  }
})

chrome.runtime.onStartup.addListener(() => {
  console.log("[InboxKey] SW onStartup fired at:", new Date().toISOString())
  startupTimestamp = Date.now()
})

// Validate Chrome APIs are available
if (!chrome.alarms) {
  console.error("[InboxKey] chrome.alarms API not available - check permissions and reinstall extension")
} else {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (!alarm.name) return

    sessionController.handleAlarm(alarm.name).catch((error) => {
      console.error("[InboxKey] Alarm handling failed:", error)
    })
  })
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "watch-session") {
    return
  }

  const tabId = port.sender?.tab?.id
  if (tabId === undefined) {
    console.warn("[InboxKey] Watch port connected without tabId")
    port.disconnect()
    return
  }

  const context = getOrCreateContext(tabId)
  attachPort(context, port)
})

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const now = Date.now()
  messageCount += 1

  const timeSinceStartup = now - startupTimestamp
  const timeSinceLastMessage =
    lastMessageTimestamp > 0 ? now - lastMessageTimestamp : 0

  const isFreshWake = timeSinceStartup < 100

  console.log("[InboxKey] ==========================================")
  console.log("[InboxKey] Message received:", msg.type)
  console.log("[InboxKey] Message #:", messageCount)
  console.log("[InboxKey] Timestamp:", new Date(now).toISOString())
  console.log("[InboxKey] Time since SW startup:", `${timeSinceStartup}ms`)
  console.log("[InboxKey] Time since last message:", `${timeSinceLastMessage}ms`)
  console.log("[InboxKey] Fresh wake?:", isFreshWake)
  console.log("[InboxKey] Sender tab ID:", sender.tab?.id)
  console.log("[InboxKey] Sender URL:", sender.url)
  console.log("[InboxKey] ==========================================")

  lastMessageTimestamp = now

  if (msg.type === "INITIALIZE_LOCK") {
    handleInitializeLock(msg, sendResponse)
    return true
  }

  if (msg.type === "UNLOCK") {
    handleUnlock(msg, sendResponse)
    return true
  }

  if (msg.type === "LOCK") {
    handleLock(sendResponse)
    return false
  }

  if (msg.type === "CHECK_LOCK_STATUS") {
    handleCheckLockStatus(sendResponse)
    return false
  }

  if (msg.type === "ACTIVITY") {
    handleActivity(sendResponse)
    return false
  }

  // Handle popup messages
  if (
    msg.type === "GET_POPUP_DATA" ||
    msg.type === "GET_LOCK_STATUS" ||
    msg.type === "TRIGGER_SYNC" ||
    msg.type === "MARK_CODE_USED" ||
    msg.type === "MARK_LINK_OPENED" ||
    msg.type === "GET_MAILBOXES" ||
    msg.type === "INITIALIZE_PASSWORD" ||
    msg.type === "CHANGE_PASSWORD" ||
    msg.type === "DISABLE_PASSWORD"
  ) {
    popupMessageHandler
      .handleMessage(msg)
      .then(sendResponse)
      .catch((error) => {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        })
      })
    return true // Async response
  }

  // Handle mailbox management
  if (msg.type === "STORE_MAILBOX") {
    handleStoreMailbox(msg, sendResponse)
    return true
  }

  if (msg.type === "REMOVE_MAILBOX") {
    handleRemoveMailbox(msg, sendResponse)
    return true
  }

  if (msg.type === "FETCH_CODE") {
    console.warn(
      "[InboxKey] FETCH_CODE is deprecated. SessionController now manages polling."
    )
    sendResponse({
      error: "FETCH_CODE_DEPRECATED",
      codes: [],
    })
    return false
  }

  console.warn("[InboxKey] Unknown message type:", msg.type)
  sendResponse({ error: "Unknown message type" })
  return false
})

// Provide idle logging for debugging
let idleTimeout: NodeJS.Timeout | null = null
chrome.runtime.onMessage.addListener(() => {
  if (idleTimeout) {
    clearTimeout(idleTimeout)
  }

  idleTimeout = setTimeout(() => {
    console.log(
      "[InboxKey] SW has been idle for 5 seconds, may be terminated soon"
    )
  }, 5000)
})

console.log("[InboxKey] Service worker initialization complete")

/**
 * Attach a runtime port to an existing context.
 */
function attachPort(context: WatchPortContext, port: chrome.runtime.Port): void {
  context.port = port

  port.onDisconnect.addListener(() => {
    console.log(
      `[InboxKey] Port disconnected for tab ${context.tabId}, session ${context.sessionId}`
    )
    if (context.keepAliveTimer) {
      clearInterval(context.keepAliveTimer)
      context.keepAliveTimer = undefined
    }

    if (context.port === port) {
      context.port = undefined
    }
  })

  port.onMessage.addListener((message: WatchPortMessage) => {
    handleWatchPortMessage(context, port, message).catch((error) => {
      console.error("[InboxKey] Failed handling watch-port message:", error)
    })
  })
}

/**
 * Handle messages arriving on the watch session port.
 */
async function handleWatchPortMessage(
  context: WatchPortContext,
  port: chrome.runtime.Port,
  message: WatchPortMessage
): Promise<void> {
  if (message.type === "PING") {
    port.postMessage({ type: "PONG", timestamp: Date.now() })
    return
  }

  if (message.type === "STOP_SESSION") {
    if (context.sessionId) {
      await sessionController.cancelSession(context.sessionId)
      sessionContexts.delete(context.sessionId)
      context.sessionId = undefined
    }
    return
  }

  if (message.type === "START_SESSION") {
    const expected = message.expected ?? {}
    const session = await sessionController.startSession({
      tabId: context.tabId,
      url: message.url,
      expected,
    })

    // Replace existing session mapping if necessary
    if (context.sessionId) {
      sessionContexts.delete(context.sessionId)
    }

    context.sessionId = session.id
    sessionContexts.set(session.id, context)

    port.postMessage({
      type: "SESSION_STARTED",
      session: serializeSession(session),
    })

    ensureKeepAlivePing(context, port)
  }
}

/**
 * Ensure we send periodic keepalive pings back to the port (mirrors content pings).
 */
function ensureKeepAlivePing(
  context: WatchPortContext,
  port: chrome.runtime.Port
): void {
  if (context.keepAliveTimer) {
    clearInterval(context.keepAliveTimer)
  }

  context.keepAliveTimer = setInterval(() => {
    try {
      port.postMessage({ type: "SERVER_KEEPALIVE", timestamp: Date.now() })
    } catch (error) {
      console.warn("[InboxKey] Failed to send keepalive:", error)
    }
  }, 10000)
}

/**
 * Deliver intermediate session updates back to the content script if port is alive.
 */
function deliverSessionUpdate(session: SessionState): void {
  const context = sessionContexts.get(session.id)
  if (!context) {
    return
  }

  if (context.port) {
    try {
      context.port.postMessage({
        type: "SESSION_UPDATE",
        session: serializeSession(session),
      })
    } catch (error) {
      console.warn("[InboxKey] Failed delivering session update:", error)
    }
  }
}

/**
 * Deliver final session results back to the content script / tab.
 */
function deliverSessionCompletion(
  session: SessionState,
  result: SessionCompletion
): void {
  const context = sessionContexts.get(session.id)

  if (!context) {
    return
  }

  const message =
    result.status === "filled"
      ? {
          type: "SESSION_CODE_FOUND" as const,
          sessionId: session.id,
          code: result.code,
        }
      : {
          type:
            result.status === "timedout"
              ? "SESSION_TIMED_OUT"
              : "SESSION_CANCELED",
          sessionId: session.id,
        }

  if (context.port) {
    try {
      context.port.postMessage(message)
    } catch (error) {
      console.warn("[InboxKey] Failed to notify via port:", error)
      sendTabMessage(context.tabId, message)
    }
  } else {
    sendTabMessage(context.tabId, message)
  }

  cleanupSessionContext(session.id, context)
}

/**
 * Remove session context mappings after completion or cancellation.
 */
function cleanupSessionContext(
  sessionId: string,
  context: WatchPortContext
): void {
  sessionContexts.delete(sessionId)

  if (context.sessionId === sessionId) {
    context.sessionId = undefined
  }

  if (context.keepAliveTimer) {
    clearInterval(context.keepAliveTimer)
    context.keepAliveTimer = undefined
  }
}

/**
 * Helper to send message directly to tab when port is unavailable.
 */
function sendTabMessage(tabId: number, message: unknown): void {
  chrome.tabs.sendMessage(tabId, message, () => {
    if (chrome.runtime.lastError) {
      console.warn(
        "[InboxKey] Failed to send tab message:",
        chrome.runtime.lastError.message
      )
    }
  })
}

/**
 * Serialize session state for messaging (omit sensitive fields).
 */
function serializeSession(session: SessionState) {
  return {
    id: session.id,
    tabId: session.tabId,
    url: session.url,
    expected: session.expected,
    startedAt: session.startedAt,
    status: session.status,
    pollSchedule: session.pollSchedule,
    pollsCompleted: session.pollsCompleted,
    lastUpdated: session.lastUpdated,
  }
}

/**
 * Fetch or create the port context for a tab.
 */
function getOrCreateContext(tabId: number): WatchPortContext {
  let context = tabContexts.get(tabId)
  if (!context) {
    context = { tabId }
    tabContexts.set(tabId, context)
  }
  return context
}

/**
 * Handle INITIALIZE_LOCK requests.
 */
function handleInitializeLock(msg: any, sendResponse: (response: any) => void) {
  const { password } = msg

  if (!password) {
    sendResponse({ success: false, error: "PIN required" })
    return
  }

  ;(async () => {
    try {
      const keyManager = KeyManager.getInstance()
      const { salt } = await keyManager.initialize(password)

      sendResponse({ success: true, salt: Array.from(salt) })
    } catch (error) {
      console.error("[InboxKey] Failed to initialize lock:", error)
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })().catch((error) => {
    console.error("[InboxKey] initializeLock unhandled rejection:", error)
  })
}

/**
 * Handle UNLOCK requests.
 */
function handleUnlock(msg: any, sendResponse: (response: any) => void) {
  const { password } = msg

  if (!password) {
    sendResponse({ success: false, error: "PIN required" })
    return
  }

  ;(async () => {
    try {
      const salt = await getSavedSalt()

      if (!salt) {
        sendResponse({ success: false, error: "Extension not initialized" })
        return
      }

      const keyManager = KeyManager.getInstance()
      const unlocked = await keyManager.unlock(password, salt)

      if (unlocked) {
        sendResponse({ success: true })
      } else {
        sendResponse({ success: false, error: "Incorrect PIN" })
      }
    } catch (error) {
      console.error("[InboxKey] Failed to unlock:", error)
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })().catch((error) => {
    console.error("[InboxKey] unlock unhandled rejection:", error)
  })
}

/**
 * Handle LOCK requests.
 */
function handleLock(sendResponse: (response: any) => void) {
  const keyManager = KeyManager.getInstance()
  keyManager.lock()
  sendResponse({ success: true })
}

/**
 * Handle CHECK_LOCK_STATUS requests.
 */
function handleCheckLockStatus(sendResponse: (response: any) => void) {
  const keyManager = KeyManager.getInstance()
  sendResponse({ isUnlocked: keyManager.isUnlocked() })
}

/**
 * Handle ACTIVITY notifications (reset auto-lock timer).
 */
function handleActivity(sendResponse: (response: any) => void) {
  const keyManager = KeyManager.getInstance()
  if (keyManager.isUnlocked()) {
    keyManager.resetAutoLockTimer()
  }
  sendResponse({ success: true })
}

/**
 * Handle STORE_MAILBOX requests.
 */
function handleStoreMailbox(msg: any, sendResponse: (response: any) => void) {
  ;(async () => {
    try {
      const keyManager = KeyManager.getInstance()

      // Check if locked
      if (keyManager.isLocked()) {
        sendResponse({ success: false, error: "Extension is locked" })
        return
      }

      // Use StorageFactory to get appropriate storage
      const storage = await StorageFactory.create()

      // Create mailbox record
      const mailbox: Mailbox = {
        id: crypto.randomUUID(),
        providerId: msg.provider, // 'gmail' | 'outlook'
        email: msg.email,
        accessToken: msg.tokens.accessToken,
        refreshToken: msg.tokens.refreshToken,
        tokenExpiresAt: Date.now() + msg.tokens.expiresIn * 1000,
        addedAt: Date.now(),
        lastSyncedAt: 0,
      }

      await storage.addMailbox(mailbox)

      // Update popup cache with new mailbox count
      const mailboxes = await storage.getMailboxes()
      await popupCacheManager.warmCache([], mailboxes.length, mailboxes)

      sendResponse({
        success: true,
        mailbox: { id: mailbox.id, email: mailbox.email },
      })
    } catch (error) {
      console.error("[Background] Failed to store mailbox:", error)
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })().catch((error) => {
    console.error("[Background] handleStoreMailbox unhandled rejection:", error)
  })
}

/**
 * Handle REMOVE_MAILBOX requests.
 */
function handleRemoveMailbox(msg: any, sendResponse: (response: any) => void) {
  ;(async () => {
    try {
      const keyManager = KeyManager.getInstance()

      // Check if locked
      if (keyManager.isLocked()) {
        sendResponse({ success: false, error: "Extension is locked" })
        return
      }

      // Use StorageFactory to get appropriate storage
      const storage = await StorageFactory.create()
      await storage.removeMailbox(msg.mailboxId)

      // Update popup cache
      const mailboxes = await storage.getMailboxes()
      await popupCacheManager.warmCache([], mailboxes.length, mailboxes)

      sendResponse({ success: true })
    } catch (error) {
      console.error("[Background] Failed to remove mailbox:", error)
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })().catch((error) => {
    console.error("[Background] handleRemoveMailbox unhandled rejection:", error)
  })
}
