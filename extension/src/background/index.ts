/**
 * Background Service Worker
 * Entry point for the MV3 background service worker.
 *
 * Responsibilities:
 * - Coordinate watch sessions via SessionController
 * - Maintain keep-alive ports from content scripts
 * - Handle extension lifecycle events
 */

import {
  SessionController,
  type SessionCompletion,
  type SessionState,
} from "./session-controller"
import { PopupCacheManager } from "./popup-cache"
import { PopupMessageHandler } from "./popup-handler"
import { ErrorStateManager } from "./error-state-manager"
import { StorageFactory } from "@/lib/storage/storage-factory"
import type { Mailbox } from "@/lib/storage/schema"
import {
  setBadgeListening,
  setBadgeSuccess,
  setBadgeNoCode,
  setBadgeCount,
  setBadgeSyncError,
  clearBadge,
} from "@/contents/badge-manager"
import { addBlacklistedDomain, removeBlacklistedDomain } from "@/lib/utils/blacklist"
import { getMessagesTabManager } from "@/lib/providers/google-messages/tab-manager"

interface StartSessionMessage {
  type: "START_SESSION"
  url: string
  expected?: {
    length?: number
    charset?: "digits" | "alnum"
  }
  timeoutSeconds?: number
  detectedChannels?: Array<'email' | 'sms'>
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
const errorStateManager = new ErrorStateManager()
const popupMessageHandler = new PopupMessageHandler(
  popupCacheManager,
  errorStateManager
)

// One-time migration: remove legacy Outlook OAuth mailboxes (Outlook now uses IMAP only).
// Reads raw storage to bypass schema validation (outlook is no longer a valid ProviderId).
// MUST complete before serving any storage-backed requests (GET_MAILBOXES, TRIGGER_SYNC, etc.)
// to prevent race where validated getMailboxes() rejects stale 'outlook' rows.
const outlookMigrationDone = (async () => {
  try {
    const raw = await chrome.storage.local.get('mailboxes_plain')
    const all: Array<{ id: string; providerId: string; email?: string }> =
      raw['mailboxes_plain'] || []
    const outlookIds = all.filter(m => m.providerId === 'outlook')
    if (outlookIds.length === 0) return

    const kept = all.filter(m => m.providerId !== 'outlook')
    await chrome.storage.local.set({ mailboxes_plain: kept })

    for (const mb of outlookIds) {
      await errorStateManager.removeMailboxErrors(mb.id)
      console.log(`[Background] Removed legacy Outlook OAuth mailbox: ${mb.email ?? mb.id}`)
    }
  } catch (e) {
    console.warn('[Background] Outlook migration cleanup failed:', e)
  }
})()

const sessionController = new SessionController(
  {
    onSessionUpdated: (session) => {
      deliverSessionUpdate(session)
    },
    onSessionCompleted: (session, result) => {
      deliverSessionCompletion(session, result)
    },
  },
  popupCacheManager // Pass cache manager for updates
)

sessionController
  .initialize()
  .then(async () => {
    console.log("[InboxKey] SessionController initialized")
    await popupCacheManager.initialize()
    console.log("[InboxKey] PopupCacheManager initialized")

    // Warm popup cache with mailbox count (codes are ephemeral-only now)
    try {
      const storage = await StorageFactory.create()

      const mailboxes = await storage.getMailboxes()
      // Codes are ephemeral (chrome.storage.session only), so start with empty cache
      await popupCacheManager.updateWithNewCodes([], mailboxes.length, mailboxes)
      console.log(`[InboxKey] PopupCache warmed with ${mailboxes.length} mailboxes (codes ephemeral-only)`)

      // Update count badge with unseen codes
      const cache = await popupCacheManager.getCache()
      const unseenCount = cache.codes.filter((c) => !c.seenAt && !c.usedAt).length
      if (unseenCount > 0) {
        setBadgeCount(unseenCount)
      }

      // Restore error badge if needed
      if (await errorStateManager.shouldShowBadge()) {
        console.log('[InboxKey] Restoring error badge from previous session')
        setBadgeSyncError()
      }
    } catch (error) {
      console.warn("[InboxKey] Failed to warm popup cache:", error)
    }
  })
  .catch((error) => {
    console.error("[InboxKey] Failed to initialize:", error)
  })

// Recover Google Messages tab state after service worker restarts
getMessagesTabManager().recoverFromRestart().catch((error) => {
  console.warn("[InboxKey] Failed to recover Google Messages tab state:", error)
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
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log("[InboxKey] SW onInstalled fired:", details.reason)
  console.log("[InboxKey] Installation timestamp:", Date.now())

  if (details.reason === 'install') {
    chrome.tabs.create({
      url: chrome.runtime.getURL('options.html?tab=accounts')
    })
  }

  // Clean up legacy migration-related storage keys on any install/update
  // (Harmless if keys don't exist)
  await chrome.storage.local.remove([
    'masterKeySalt',
    'keyVerification',
    'lockState',
    'lastUnlockedAt',
    'autoLockTimeout',
    'migration_backup'
  ])
  await chrome.storage.sync.remove(['lockEnabled', 'lockTimeoutMinutes'])
  console.log('[InboxKey] Cleaned up legacy migration keys')
})

chrome.runtime.onStartup.addListener(async () => {
  console.log("[InboxKey] SW onStartup fired at:", new Date().toISOString())
  startupTimestamp = Date.now()

})

// V2: SessionPoller handles alarms internally via its own listener
// No need to register chrome.alarms.onAlarm listener here

// Click-to-copy for code notifications
let lastNotificationCode: Record<string, string> = {}
chrome.notifications.onClicked.addListener((notifId) => {
  const code = lastNotificationCode[notifId]
  if (code) {
    // Copy code to clipboard (service worker can use Clipboard API in recent Chrome)
    try {
      // @ts-ignore -- navigator.clipboard available in SW in Chrome 105+
      navigator.clipboard.writeText(code).catch(() => {})
    } catch { /* fallback: user can still open popup */ }
    delete lastNotificationCode[notifId]
  }
  chrome.notifications.clear(notifId)
})

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

  // Handle badge update messages from content scripts
  if (msg.type === "UPDATE_BADGE") {
    handleBadgeUpdate(msg)
    return false
  }

  // Silent notification when code found but autofill failed
  if (msg.type === "SHOW_CODE_NOTIFICATION") {
    const notifId = `inboxkey-code-${Date.now()}`
    lastNotificationCode[notifId] = msg.code
    chrome.notifications.create(notifId, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icon128.plasmo.png'),
      title: 'Verification code found',
      message: `${msg.code} -- click to copy.`,
      silent: true,
      priority: 1,
    })
    // Auto-dismiss after 7 seconds
    setTimeout(() => {
      chrome.notifications.clear(notifId)
      delete lastNotificationCode[notifId]
    }, 7000)
    return false
  }

  // Handle popup messages
  if (
    msg.type === "GET_POPUP_DATA" ||
    msg.type === "TRIGGER_SYNC" ||
    msg.type === "MARK_CODE_USED" ||
    msg.type === "MARK_CODES_SEEN" ||
    msg.type === "MARK_LINK_OPENED" ||
    msg.type === "GET_SYNC_ERROR" ||
    msg.type === "GET_MAILBOXES" ||
    msg.type === "TEST_MAILBOX_CONNECTION"
  ) {
    outlookMigrationDone
      .then(() => popupMessageHandler.handleMessage(msg))
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

  if (msg.type === "STORE_IMAP_MAILBOX") {
    handleStoreImapMailbox(msg, sendResponse)
    return true
  }

  // Google Messages connect/disconnect handlers
  if (msg.type === "CONNECT_GOOGLE_MESSAGES") {
    handleConnectGoogleMessages(msg, sendResponse)
    return true
  }

  if (msg.type === "CHECK_GM_PAIRING_STATUS") {
    handleCheckGmPairingStatus(sendResponse)
    return true
  }

  if (msg.type === "CANCEL_GM_SETUP") {
    handleCancelGmSetup(sendResponse)
    return true
  }

  if (msg.type === "DISCONNECT_GOOGLE_MESSAGES") {
    handleDisconnectGoogleMessages(msg, sendResponse)
    return true
  }

  if (msg.type === "FOCUS_EXTENSION_TAB") {
    // Focus the extension's options/settings tab (used after pairing success)
    chrome.runtime.getURL('options.html')
    chrome.tabs.query({ url: chrome.runtime.getURL('options.html') + '*' }, (tabs) => {
      if (tabs.length > 0 && tabs[0].id) {
        chrome.tabs.update(tabs[0].id, { active: true })
        // Also focus the window containing the tab
        if (tabs[0].windowId) {
          chrome.windows.update(tabs[0].windowId, { focused: true })
        }
      }
    })
    sendResponse({ ok: true })
    return true
  }

  if (msg.type === "CLEAR_ALL_CODES") {
    handleClearAllCodes(sendResponse)
    return true
  }

  if (msg.type === "CLEAR_CACHE") {
    handleClearCache(sendResponse)
    return true
  }

  if (msg.type === "GET_AUTOMATION_LEVEL") {
    handleGetAutomationLevel(sendResponse)
    return true
  }

  if (msg.type === "SET_AUTOMATION_LEVEL") {
    handleSetAutomationLevel(msg, sendResponse)
    return true
  }

  if (msg.type === "SET_DOMAIN_PREFERENCE") {
    handleSetDomainPreference(msg, sendResponse)
    return true
  }

  if (msg.type === "RESET_SETTINGS") {
    handleResetSettings(sendResponse)
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
 * Handle badge update requests from content scripts
 */
function handleBadgeUpdate(msg: { state: string }): void {
  switch (msg.state) {
    case 'listening':
      setBadgeListening()
      break
    case 'success':
      setBadgeSuccess()
      break
    case 'no-code':
      setBadgeNoCode()
      break
    case 'clear':
      clearBadge()
      break
    default:
      console.warn('[InboxKey] Unknown badge state:', msg.state)
  }
}

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

    // GUARDRAIL 4: Cancel session on disconnect
    // Only cancel if this port is still the active port for the context.
    // If context.port !== port, a newer port has already replaced this one
    // (e.g., user switched fields), and context.sessionId points to the
    // new session. Canceling here would kill the wrong session.
    if (context.port === port && context.sessionId) {
      context.port = undefined
      const sessionId = context.sessionId
      sessionController.cancelSession(sessionId).catch((error) => {
        console.warn("[InboxKey] Failed to cancel session on disconnect:", error)
      })
    } else if (context.port === port) {
      context.port = undefined
    }
  })

  port.onMessage.addListener((message: WatchPortMessage) => {
    handleWatchPortMessage(context, port, message).catch((error) => {
      console.warn("[InboxKey] Failed handling watch-port message:", error)
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
      timeoutSeconds: message.timeoutSeconds,
      detectedChannels: message.detectedChannels,
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
      effectiveTimeoutSeconds: session.effectiveTimeout,
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

  const context = sessionContexts.get(session.id)

  // Post-SW-restart path: sessionContexts is in-memory only and empty
  // after Chrome wakes the worker. The session's persisted tabId still
  // lets us reach the content script, so fall through instead of
  // dropping the code on the floor.
  if (!context) {
    sendTabMessage(session.tabId, message)
    return
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
 * Handle STORE_MAILBOX requests.
 */
function handleStoreMailbox(msg: any, sendResponse: (response: any) => void) {
  ;(async () => {
    try {
      // Use StorageFactory to get appropriate storage
      const storage = await StorageFactory.create()

      // Create mailbox record
      const mailbox: Mailbox = {
        id: crypto.randomUUID(),
        providerId: msg.provider, // 'gmail'
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
      console.warn("[Background] Failed to store mailbox:", error)
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
      // Use StorageFactory to get appropriate storage
      const storage = await StorageFactory.create()

      // Read mailbox before removal for provider-specific cleanup
      const allMailboxes = await storage.getMailboxes()
      const mailbox = allMailboxes.find(m => m.id === msg.mailboxId)
      const isImap = mailbox?.providerId === 'imap-bridge'

      // Remove from storage FIRST -- if this fails, token stays valid (safe)
      await storage.removeMailbox(msg.mailboxId)

      // Clean up any error entries for this mailbox
      await errorStateManager.removeMailboxErrors(msg.mailboxId)

      // Revoke Gmail token AFTER successful removal (best-effort).
      // Skip if msg.skipRevoke is true (reconnect flow: same token is about to be re-stored).
      if (mailbox?.providerId === 'gmail' && mailbox.accessToken && !msg.skipRevoke) {
        try {
          const { GmailAuth } = await import('@/lib/providers/gmail/gmail-auth')
          const auth = new GmailAuth()
          await auth.revokeTokens(mailbox.accessToken)
        } catch (e) {
          console.warn('[Background] Gmail token revocation failed (best-effort):', e)
          // revokeTokens throws if Google endpoint fails, skipping Chrome cache clear.
          // Fallback: clear Chrome cache directly so account picker shows on next Connect.
          try {
            const { clearGmailToken } = await import('@/lib/providers/gmail/chrome-auth')
            await clearGmailToken(mailbox.accessToken)
          } catch { /* best effort */ }
        }
      }

      // Also remove from InboxBridge native app if IMAP.
      //
      // The uninstall flow (UninstallBridgeModal) sets skipBridgeCall=true
      // *after* a successful bridge.uninstall RPC has already wiped every
      // keychain entry and deleted accounts.json atomically. Calling
      // account.remove per account at that point would fail (state is
      // empty) and spam the console with warnings. When skipBridgeCall is
      // unset or false, we fall through to the legacy per-account path --
      // used by normal account-removal UI and by the uninstall fallback
      // for old bridges that lack bridge.uninstall entirely.
      if (isImap && mailbox?.imapAccountId && !msg.skipBridgeCall) {
        try {
          const { getNativeClient } = await import('@/lib/native-messaging')
          const client = getNativeClient()
          await client.call('account.remove', { accountId: mailbox.imapAccountId })
        } catch (e) {
          console.warn('[Background] Failed to remove from native app:', e)
        }
      }

      // Update popup cache
      const mailboxes = await storage.getMailboxes()
      await popupCacheManager.warmCache([], mailboxes.length, mailboxes)

      sendResponse({ success: true })
    } catch (error) {
      console.warn("[Background] Failed to remove mailbox:", error)
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })().catch((error) => {
    console.error("[Background] handleRemoveMailbox unhandled rejection:", error)
  })
}

/**
 * Handle STORE_IMAP_MAILBOX requests.
 */
function handleStoreImapMailbox(msg: any, sendResponse: (response: any) => void) {
  ;(async () => {
    try {
      // Use StorageFactory to get appropriate storage
      const storage = await StorageFactory.create()

      // Create IMAP mailbox record
      const mailbox: Mailbox = {
        id: crypto.randomUUID(),
        providerId: 'imap-bridge',
        email: msg.email,
        imapServer: msg.server,
        imapPort: msg.port,
        imapAccountId: msg.accountId,
        imapUsername: msg.email, // Default username to email
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
      console.warn("[Background] Failed to store IMAP mailbox:", error)
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })().catch((error) => {
    console.error("[Background] handleStoreImapMailbox unhandled rejection:", error)
  })
}

/**
 * Handle CLEAR_ALL_CODES requests.
 * Note: Codes are now ephemeral (chrome.storage.session only), so this clears the popup cache.
 */
function handleClearAllCodes(sendResponse: (response: any) => void) {
  ;(async () => {
    try {
      // Clear popup cache (ephemeral codes only)
      await chrome.storage.session.remove('inboxkey.popup_cache')

      // Re-initialize empty cache
      const storage = await StorageFactory.create()
      const mailboxes = await storage.getMailboxes()
      await popupCacheManager.warmCache([], mailboxes.length, mailboxes)

      sendResponse({ success: true })
    } catch (error) {
      console.warn("[Background] Failed to clear all codes:", error)
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })().catch((error) => {
    console.error("[Background] handleClearAllCodes unhandled rejection:", error)
  })
}

/**
 * Handle CLEAR_CACHE requests.
 */
function handleClearCache(sendResponse: (response: any) => void) {
  ;(async () => {
    try {
      // Clear session storage cache (ephemeral codes only)
      await chrome.storage.session.remove('inboxkey.popup_cache')

      // Re-warm the cache with empty codes
      const storage = await StorageFactory.create()
      const mailboxes = await storage.getMailboxes()
      await popupCacheManager.updateWithNewCodes([], mailboxes.length, mailboxes)

      console.log("[Background] Popup cache cleared and refreshed")
      sendResponse({ success: true })
    } catch (error) {
      console.warn("[Background] Failed to clear cache:", error)
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })().catch((error) => {
    console.error("[Background] handleClearCache unhandled rejection:", error)
  })
}

/**
 * Handle GET_AUTOMATION_LEVEL requests.
 */
function handleGetAutomationLevel(sendResponse: (response: any) => void) {
  ;(async () => {
    try {
      const result = await chrome.storage.local.get('settings')
      const automationLevel = result.settings?.automationLevel || 'autofill'

      sendResponse({ success: true, level: automationLevel })
    } catch (error) {
      console.warn("[Background] Failed to get automation level:", error)
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })().catch((error) => {
    console.error("[Background] handleGetAutomationLevel unhandled rejection:", error)
  })
}

/**
 * Handle SET_AUTOMATION_LEVEL requests.
 */
function handleSetAutomationLevel(msg: any, sendResponse: (response: any) => void) {
  ;(async () => {
    try {
      const storage = await StorageFactory.create()

      // Get current settings
      const settings = await storage.getSettings()

      // Update automation level
      settings.automationLevel = msg.level

      // Save back to storage
      await chrome.storage.local.set({ settings })

      console.log(`[Background] Automation level updated to: ${msg.level}`)
      sendResponse({ success: true })
    } catch (error) {
      console.warn("[Background] Failed to set automation level:", error)
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })().catch((error) => {
    console.error("[Background] handleSetAutomationLevel unhandled rejection:", error)
  })
}

/**
 * Handle SET_DOMAIN_PREFERENCE requests.
 */
function handleSetDomainPreference(msg: any, sendResponse: (response: any) => void) {
  ;(async () => {
    try {
      const storage = await StorageFactory.create()

      // Validate inputs
      if (!msg.domain || typeof msg.domain !== 'string') {
        throw new Error('Invalid domain')
      }
      if (typeof msg.enabled !== 'boolean') {
        throw new Error('Invalid enabled value')
      }

      // Set domain preference
      await storage.setDomainPreference(msg.domain, msg.enabled)

      // Sync with blacklist
      if (msg.enabled) {
        // Remove domain from blacklist (but preserve URL entries)
        await removeBlacklistedDomain(msg.domain)
        console.log(`[Background] Removed ${msg.domain} from blacklist (domain enabled)`)
      } else {
        // Add domain to blacklist
        await addBlacklistedDomain(msg.domain)
        console.log(`[Background] Added ${msg.domain} to blacklist (domain disabled)`)
      }

      console.log(`[Background] Domain preference updated: ${msg.domain} -> ${msg.enabled}`)
      sendResponse({ success: true })
    } catch (error) {
      console.warn("[Background] Failed to set domain preference:", error)
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })().catch((error) => {
    console.error("[Background] handleSetDomainPreference unhandled rejection:", error)
  })
}

/**
 * Handle RESET_SETTINGS requests.
 * Resets all user settings to factory defaults.
 */
function handleResetSettings(sendResponse: (response: any) => void) {
  ;(async () => {
    try {
      const { DEFAULT_SETTINGS } = await import("@/lib/storage/schema")
      // Full replace (not merge) to clear optional fields like extendedButtonDetection
      await chrome.storage.local.set({ settings: { ...DEFAULT_SETTINGS } })

      console.log("[Background] Settings reset to defaults")
      sendResponse({ success: true })
    } catch (error) {
      console.warn("[Background] Failed to reset settings:", error)
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })().catch((error) => {
    console.error("[Background] handleResetSettings unhandled rejection:", error)
  })
}

/**
 * Handle MARK_CODES_SEEN requests.
 */
// Removed handleMarkCodesSeen - now handled in popup-handler.ts

/**
 * Handle CONNECT_GOOGLE_MESSAGES requests.
 * Opens the Messages for Web tab, persists pending setup, and checks pairing.
 */
function handleConnectGoogleMessages(
  msg: { phoneNumber: string; repair?: boolean },
  sendResponse: (response: any) => void
) {
  ;(async () => {
    try {
      const tabManager = getMessagesTabManager()

      // If re-pairing, delete the existing google-messages mailbox first
      if (msg.repair) {
        const storage = await StorageFactory.create()
        const existing = await storage.getMailboxes()
        const gmMailbox = existing.find((m) => m.providerId === 'google-messages')
        if (gmMailbox) {
          await storage.removeMailbox(gmMailbox.id)
        }
      }

      // 1. Persist pending setup to session storage
      await tabManager.savePendingSetup({
        phoneNumber: msg.phoneNumber,
        owned: false,
        startedAt: Date.now(),
      })

      // 2. Ensure a Messages tab is open (visible for pairing)
      const tab = await tabManager.ensureTab({ forPairing: true })

      // 3. Update pending setup with tab info
      await tabManager.savePendingSetup({
        phoneNumber: msg.phoneNumber,
        tabId: tab.tabId,
        owned: tab.owned,
        startedAt: Date.now(),
      })

      // 4. Check if already paired
      const pairingStatus = await tabManager.checkPairingStatus(tab.tabId)

      if (pairingStatus === 'paired') {
        // Already paired -- save mailbox immediately
        const storage = await StorageFactory.create()

        // Enforce one-account limit
        const existing = await storage.getMailboxes()
        const hasGm = existing.some((m) => m.providerId === 'google-messages')
        if (hasGm) {
          await tabManager.clearPendingSetup()
          sendResponse({ status: 'error', error: 'A Google Messages account already exists' })
          return
        }

        const mailbox: Mailbox = {
          id: crypto.randomUUID(),
          providerId: 'google-messages',
          email: 'sms@google-messages.local',
          gmPhoneNumber: msg.phoneNumber,
          addedAt: Date.now(),
          lastSyncedAt: 0,
        }

        await storage.addMailbox(mailbox)
        await tabManager.clearPendingSetup()
        // Don't close Messages tab on pairing success --
        // settings tab is focused back, user keeps Messages open

        // Update popup cache
        const mailboxes = await storage.getMailboxes()
        await popupCacheManager.warmCache([], mailboxes.length, mailboxes)

        sendResponse({ status: 'paired' })
      } else {
        // Not paired -- UI will poll via CHECK_GM_PAIRING_STATUS
        sendResponse({ status: 'pairing' })
      }
    } catch (error) {
      console.warn("[Background] Failed to connect Google Messages:", error)
      sendResponse({
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })().catch((error) => {
    console.error("[Background] handleConnectGoogleMessages unhandled rejection:", error)
  })
}

/**
 * Handle CHECK_GM_PAIRING_STATUS requests.
 * Polls pairing state from the pending setup tab. Saves mailbox when paired.
 */
function handleCheckGmPairingStatus(sendResponse: (response: any) => void) {
  ;(async () => {
    try {
      const tabManager = getMessagesTabManager()
      const pending = await tabManager.getPendingSetup()

      if (!pending) {
        sendResponse({ status: 'not-open' })
        return
      }

      if (!pending.tabId) {
        sendResponse({ status: 'unpaired' })
        return
      }

      const pairingStatus = await tabManager.checkPairingStatus(pending.tabId)

      if (pairingStatus === 'paired') {
        const storage = await StorageFactory.create()

        // Enforce one-account limit
        const existing = await storage.getMailboxes()
        const hasGm = existing.some((m) => m.providerId === 'google-messages')
        if (hasGm) {
          await tabManager.clearPendingSetup()
          await tabManager.closeIfOwned()
          sendResponse({ status: 'error', error: 'A Google Messages account already exists' })
          return
        }

        const mailbox: Mailbox = {
          id: crypto.randomUUID(),
          providerId: 'google-messages',
          email: 'sms@google-messages.local',
          gmPhoneNumber: pending.phoneNumber,
          addedAt: Date.now(),
          lastSyncedAt: 0,
        }

        await storage.addMailbox(mailbox)
        await tabManager.clearPendingSetup()
        // Don't close Messages tab on pairing success --
        // settings tab is focused back, user keeps Messages open

        // Update popup cache
        const mailboxes = await storage.getMailboxes()
        await popupCacheManager.warmCache([], mailboxes.length, mailboxes)

        sendResponse({ status: 'paired' })
      } else {
        sendResponse({ status: 'unpaired' })
      }
    } catch (error) {
      console.warn("[Background] Failed to check GM pairing status:", error)
      sendResponse({
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })().catch((error) => {
    console.error("[Background] handleCheckGmPairingStatus unhandled rejection:", error)
  })
}

/**
 * Handle CANCEL_GM_SETUP requests.
 * Cleans up pending setup and closes the tab if extension-owned.
 */
function handleCancelGmSetup(sendResponse: (response: any) => void) {
  ;(async () => {
    try {
      const tabManager = getMessagesTabManager()
      await tabManager.clearPendingSetup()
      await tabManager.closeIfOwned()
      sendResponse({ ok: true })
    } catch (error) {
      console.warn("[Background] Failed to cancel GM setup:", error)
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })().catch((error) => {
    console.error("[Background] handleCancelGmSetup unhandled rejection:", error)
  })
}

/**
 * Handle DISCONNECT_GOOGLE_MESSAGES requests.
 * Removes the Google Messages mailbox from storage.
 */
function handleDisconnectGoogleMessages(
  msg: { mailboxId: string },
  sendResponse: (response: any) => void
) {
  ;(async () => {
    try {
      const storage = await StorageFactory.create()
      await storage.removeMailbox(msg.mailboxId)

      // Clean up any error entries for this mailbox
      await errorStateManager.removeMailboxErrors(msg.mailboxId)

      // Update popup cache
      const mailboxes = await storage.getMailboxes()
      await popupCacheManager.warmCache([], mailboxes.length, mailboxes)

      sendResponse({ ok: true })
    } catch (error) {
      console.warn("[Background] Failed to disconnect Google Messages:", error)
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })().catch((error) => {
    console.error("[Background] handleDisconnectGoogleMessages unhandled rejection:", error)
  })
}
