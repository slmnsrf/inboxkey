/**
 * Popup Cache Manager
 *
 * Manages an in-memory cache of recent verification codes and magic links
 * for fast popup access. The cache persists to chrome.storage.session to
 * survive service worker restarts.
 *
 * Design:
 * - Stores last 5 verification codes
 * - Stores last 3 magic links
 * - Updates automatically after email polling
 * - Responds to popup requests in <50ms
 */

import type { StoredCode, Mailbox } from '@/lib/storage/schema'
import type {
  PopupCache,
  PopupCacheCode,
  PopupCacheMagicLink,
} from '@/shared/popup-messages'

const POPUP_CACHE_KEY = 'inboxkey.popup_cache'
const MAX_CODES = 5
const MAX_LINKS = 3

/**
 * Manages the popup cache for fast access to recent codes/links
 */
export class PopupCacheManager {
  private cache: PopupCache | null = null
  private mailboxCache: Map<string, Mailbox> = new Map()

  /**
   * Initialize cache from storage (called on SW startup).
   */
  async initialize(): Promise<void> {
    const result = await chrome.storage.session.get(POPUP_CACHE_KEY)
    this.cache = (result[POPUP_CACHE_KEY] as PopupCache | undefined) || this.getEmptyCache()
  }

  /**
   * Update the mailbox cache (called before converting codes)
   */
  updateMailboxCache(mailboxes: Mailbox[]): void {
    this.mailboxCache.clear()
    for (const mailbox of mailboxes) {
      this.mailboxCache.set(mailbox.id, mailbox)
    }
  }

  /**
   * Get current cache (fast path if warm, fallback to storage).
   */
  async getCache(): Promise<PopupCache> {
    if (this.cache) {
      return this.cache
    }

    // Cold start: read from storage
    const result = await chrome.storage.session.get(POPUP_CACHE_KEY)
    this.cache = (result[POPUP_CACHE_KEY] as PopupCache | undefined) || this.getEmptyCache()
    return this.cache
  }

  /**
   * Update cache with new codes from email extraction.
   * Called by EmailPollingService after successful extraction.
   */
  async updateWithNewCodes(
    storedCodes: StoredCode[],
    mailboxCount: number,
    mailboxes?: Mailbox[]
  ): Promise<void> {
    const cache = await this.getCache()

    // Update mailbox cache if provided
    if (mailboxes) {
      this.updateMailboxCache(mailboxes)
    }

    // Convert StoredCode to PopupCacheCode
    const newCodes = storedCodes
      .filter((c) => !c.code.startsWith('magic-link:'))
      .map((c) => this.convertToPopupCode(c))
      .filter((code) => !cache.codes.some((existing) => existing.code === code.code))

    // Add new codes, keep only last 5
    cache.codes = [...newCodes, ...cache.codes].slice(0, MAX_CODES)

    // Extract magic links (codes with "magic-link:" prefix)
    const newLinks = storedCodes
      .filter((c) => c.code.startsWith('magic-link:'))
      .map((c) => this.convertToPopupLink(c))
      .filter((link) => !cache.magicLinks.some((existing) => existing.url === link.url))

    cache.magicLinks = [...newLinks, ...cache.magicLinks].slice(0, MAX_LINKS)

    cache.lastSync = Date.now()
    cache.mailboxCount = mailboxCount

    await this.saveCache(cache)
  }

  /**
   * Mark a code as used (when popup copies it).
   */
  async markCodeUsed(code: string): Promise<void> {
    const cache = await this.getCache()
    const found = cache.codes.find((c) => c.code === code)

    if (found) {
      found.usedAt = Date.now()
      await this.saveCache(cache)
    }
  }

  /**
   * Mark a magic link as opened.
   */
  async markLinkOpened(url: string): Promise<void> {
    const cache = await this.getCache()
    const found = cache.magicLinks.find((l) => l.url === url)

    if (found) {
      found.openedAt = Date.now()
      await this.saveCache(cache)
    }
  }

  /**
   * Warm cache from encrypted storage (preload on unlock).
   */
  async warmCache(
    recentCodes: StoredCode[],
    mailboxCount: number,
    mailboxes?: Mailbox[]
  ): Promise<void> {
    await this.updateWithNewCodes(recentCodes, mailboxCount, mailboxes)
  }

  /**
   * Save cache to both memory and chrome.storage.session
   */
  private async saveCache(cache: PopupCache): Promise<void> {
    this.cache = cache
    await chrome.storage.session.set({ [POPUP_CACHE_KEY]: cache })
  }

  /**
   * Create an empty cache
   */
  private getEmptyCache(): PopupCache {
    return {
      codes: [],
      magicLinks: [],
      lastSync: 0,
      mailboxCount: 0,
    }
  }

  /**
   * Convert StoredCode to PopupCacheCode
   */
  private convertToPopupCode(stored: StoredCode): PopupCacheCode {
    let providerId: 'gmail' | 'outlook' | undefined
    let providerName: string | undefined

    // Look up provider from mailbox cache
    if (stored.mailboxId) {
      const mailbox = this.mailboxCache.get(stored.mailboxId)
      if (mailbox) {
        if (mailbox.providerId === 'gmail' || mailbox.providerId === 'outlook') {
          providerId = mailbox.providerId
          providerName = mailbox.providerId === 'gmail' ? 'Gmail' : 'Outlook'
        }
      }
    }

    return {
      code: stored.code,
      source: stored.source,
      receivedAt: stored.timestamp,
      usedAt: stored.used ? stored.timestamp : undefined,
      providerId,
      providerName,
    }
  }

  /**
   * Convert StoredCode (magic-link) to PopupCacheMagicLink
   */
  private convertToPopupLink(stored: StoredCode): PopupCacheMagicLink {
    // Extract URL from "magic-link:URL" format
    const url = stored.code.replace('magic-link:', '')

    // Determine type from URL patterns
    let type: 'login' | 'verify' | 'reset' = 'login'
    if (url.includes('/verify') || url.includes('/confirm')) type = 'verify'
    if (url.includes('/reset') || url.includes('/password')) type = 'reset'

    let providerId: 'gmail' | 'outlook' | undefined
    let providerName: string | undefined

    // Look up provider from mailbox cache
    if (stored.mailboxId) {
      const mailbox = this.mailboxCache.get(stored.mailboxId)
      if (mailbox) {
        if (mailbox.providerId === 'gmail' || mailbox.providerId === 'outlook') {
          providerId = mailbox.providerId
          providerName = mailbox.providerId === 'gmail' ? 'Gmail' : 'Outlook'
        }
      }
    }

    return {
      url,
      type,
      source: stored.source,
      receivedAt: stored.timestamp,
      openedAt: stored.used ? stored.timestamp : undefined,
      providerId,
      providerName,
    }
  }
}
