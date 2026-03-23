/**
 * MessagesTabManager -- singleton managing the Chrome tab lifecycle
 * for scraping Google Messages for Web.
 *
 * Runs in the MV3 service worker context. Handles:
 * - Tab creation/reuse with ownership tracking (extension vs user tab)
 * - Mutex-protected ensureTab to prevent duplicate tab creation
 * - Pairing detection (QR code vs conversation list)
 * - Per-session poll-count budgeting
 * - Service-worker restart recovery via chrome.storage.session
 * - Pending setup state persistence
 */

import type { MessagePreview, ScrapeResult, PendingGmSetup } from './types'
import { scrapeMessages } from './scrape-messages'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MESSAGES_URL_WELCOME = 'https://messages.google.com/web/welcome'
const MESSAGES_URL_CONVERSATIONS = 'https://messages.google.com/web/conversations'
const SESSION_STORAGE_KEY = 'gm_tab_state'
const PENDING_SETUP_KEY = 'gm_pending_setup'
const MAX_POLLS_PER_SESSION = 5
const READINESS_TIMEOUT_MS = 15_000
const READINESS_POLL_INTERVAL_MS = 1_000
const EMPTY_WAIT_MS = 5_000
const PAIRING_POLL_INTERVAL_MS = 4_000
const PAIRING_MAX_WAIT_MS = 120_000

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TabState {
  tabId: number
  /** true = extension opened it, false = user already had it open */
  owned: boolean
}

// ---------------------------------------------------------------------------
// MessagesTabManager
// ---------------------------------------------------------------------------

export class MessagesTabManager {
  private tabState: TabState | null = null
  private pollCounts = new Map<string, number>()
  private ensureMutex: Promise<TabState> | null = null

  // === Tab Lifecycle (mutex-protected) ===================================

  /**
   * Ensure a Google Messages tab is available. If one already exists it is
   * reused; otherwise a new tab is created.
   *
   * @param opts.forPairing - When true, opens a visible active tab (not pinned)
   *   so the user can see the pairing flow. When false (default), opens a pinned
   *   background tab for silent scraping.
   *
   * Concurrent calls are serialized -- the second caller awaits the first
   * rather than creating a duplicate tab.
   */
  async ensureTab(opts?: { forPairing?: boolean }): Promise<TabState> {
    if (this.ensureMutex) {
      return this.ensureMutex
    }
    this.ensureMutex = this._ensureTab(opts)
    try {
      return await this.ensureMutex
    } finally {
      this.ensureMutex = null
    }
  }

  private async _ensureTab(opts?: { forPairing?: boolean }): Promise<TabState> {
    const forPairing = opts?.forPairing ?? false

    // Re-validate a previously cached tabId
    if (this.tabState) {
      try {
        await chrome.tabs.get(this.tabState.tabId)
        return this.tabState
      } catch {
        this.tabState = null
      }
    }

    // Look for an existing Google Messages tab the user may have open
    const existing = await chrome.tabs.query({ url: 'https://messages.google.com/*' })
    if (existing.length > 0 && existing[0].id) {
      this.tabState = { tabId: existing[0].id, owned: false }
      await this.persistTabState()
      return this.tabState
    }

    // Nothing found -- open a new tab
    // Pairing: welcome page, visible + active so user can interact with QR/pairing
    // Scraping: conversations page, pinned + background so it doesn't interrupt
    const tab = await chrome.tabs.create({
      url: forPairing ? MESSAGES_URL_WELCOME : MESSAGES_URL_CONVERSATIONS,
      pinned: !forPairing,
      active: forPairing,
    })

    this.tabState = { tabId: tab.id!, owned: true }
    await this.persistTabState()
    return this.tabState
  }

  /**
   * Close the Messages tab only if the extension opened it AND no active
   * sessions still have remaining polls in their budget.
   */
  async closeIfOwned(): Promise<void> {
    if (!this.tabState || !this.tabState.owned) return

    // Check whether any session still has polls remaining
    const activeSessions = Array.from(this.pollCounts.values()).filter(
      (count) => count < MAX_POLLS_PER_SESSION
    )
    if (activeSessions.length > 0) return

    try {
      await chrome.tabs.remove(this.tabState.tabId)
    } catch {
      /* tab may already be closed */
    }

    this.tabState = null
    await this.clearTabState()
  }

  // === Pairing Detection =================================================

  /**
   * Detect whether the device is paired by checking for DOM indicators.
   * - `mw-qr-code` present  --> 'unpaired'
   * - `mws-conversations-list` present --> 'paired'
   * - Neither --> defaults to 'unpaired'
   */
  async checkPairingStatus(
    tabId: number
  ): Promise<'paired' | 'unpaired'> {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        if (document.querySelector('mw-qr-code')) return 'unpaired'
        if (document.querySelector('mws-conversations-list')) return 'paired'
        return 'unpaired'
      },
    })
    return (results?.[0]?.result as 'paired' | 'unpaired') ?? 'unpaired'
  }

  /**
   * Poll the tab repeatedly until the device is paired or a timeout
   * of 2 minutes is reached.
   */
  async waitForPairing(tabId: number): Promise<boolean> {
    const start = Date.now()

    while (Date.now() - start < PAIRING_MAX_WAIT_MS) {
      const status = await this.checkPairingStatus(tabId)
      if (status === 'paired') return true
      await new Promise((r) => setTimeout(r, PAIRING_POLL_INTERVAL_MS))
    }
    return false
  }

  // === Scraping ==========================================================

  /**
   * Scrape recent message previews from the tab. Waits for the
   * conversation list to become ready before scraping.
   */
  async scrapeRecentPreviews(tabId: number): Promise<MessagePreview[]> {
    try {
      await this.waitForReadiness(tabId)

      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: scrapeMessages,
      })

      const result = results?.[0]?.result as ScrapeResult | undefined
      if (!result || result.status !== 'paired') {
        return []
      }
      return result.previews
    } catch (error) {
      console.warn('[MessagesTabManager] Scraping failed:', error)
      return []
    }
  }

  private async waitForReadiness(tabId: number): Promise<void> {
    const start = Date.now()

    while (Date.now() - start < READINESS_TIMEOUT_MS) {
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            const list = document.querySelector('mws-conversations-list')
            if (!list) return 'not-ready'
            const items = list.querySelectorAll('mws-conversation-list-item')
            return items.length > 0 ? 'ready' : 'ready-empty'
          },
        })

        const status = results?.[0]?.result
        if (status === 'ready') return
        if (status === 'ready-empty') {
          // Give items a moment to render, then proceed anyway
          if (Date.now() - start > EMPTY_WAIT_MS) return
        }
      } catch {
        /* tab not ready yet */
      }

      await new Promise((r) => setTimeout(r, READINESS_POLL_INTERVAL_MS))
    }
  }

  // === Per-Session Poll Tracking =========================================

  /**
   * Increment the poll counter for a watch session. Returns the new count.
   * Each session gets MAX_POLLS_PER_SESSION (5) polls before it is
   * considered exhausted.
   */
  incrementPollCount(sessionId: string): number {
    const current = this.pollCounts.get(sessionId) ?? 0
    const next = current + 1
    this.pollCounts.set(sessionId, next)
    return next
  }

  /** Remove the poll counter for a session (e.g. when the session ends). */
  resetPollCount(sessionId: string): void {
    this.pollCounts.delete(sessionId)
  }

  /** Read the current poll count for a session (0 if unknown). */
  getPollCount(sessionId: string): number {
    return this.pollCounts.get(sessionId) ?? 0
  }

  // === Pending Setup Persistence =========================================

  /** Persist a pending Google Messages setup so it survives SW restarts. */
  async savePendingSetup(setup: PendingGmSetup): Promise<void> {
    await chrome.storage.session.set({ [PENDING_SETUP_KEY]: setup })
  }

  /** Retrieve the pending setup, or null if none. */
  async getPendingSetup(): Promise<PendingGmSetup | null> {
    const result = await chrome.storage.session.get(PENDING_SETUP_KEY)
    return (result[PENDING_SETUP_KEY] as PendingGmSetup) ?? null
  }

  /** Clear the pending setup from session storage. */
  async clearPendingSetup(): Promise<void> {
    await chrome.storage.session.remove(PENDING_SETUP_KEY)
  }

  // === Service Worker Restart Recovery ===================================

  /**
   * Called on SW startup to restore tab state from session storage.
   * Validates that the stored tabId still exists; cleans up if stale.
   */
  async recoverFromRestart(): Promise<void> {
    try {
      const result = await chrome.storage.session.get(SESSION_STORAGE_KEY)
      const stored = result[SESSION_STORAGE_KEY] as TabState | undefined
      if (!stored) return

      // Verify the tab still exists
      try {
        await chrome.tabs.get(stored.tabId)
        this.tabState = stored
      } catch {
        // Tab was closed while the SW was asleep -- clean up
        await this.clearTabState()
      }
    } catch {
      // Storage error -- start fresh
    }
  }

  // === Persistence Helpers ===============================================

  private async persistTabState(): Promise<void> {
    if (this.tabState) {
      await chrome.storage.session.set({
        [SESSION_STORAGE_KEY]: this.tabState,
      })
    }
  }

  private async clearTabState(): Promise<void> {
    await chrome.storage.session.remove(SESSION_STORAGE_KEY)
  }
}

// ---------------------------------------------------------------------------
// Singleton accessor
// ---------------------------------------------------------------------------

let instance: MessagesTabManager | null = null

export function getMessagesTabManager(): MessagesTabManager {
  if (!instance) {
    instance = new MessagesTabManager()
  }
  return instance
}
