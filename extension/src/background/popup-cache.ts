/**
 * Popup Cache Manager (V2)
 *
 * Manages an in-memory cache of recent verification codes and magic links
 * for fast popup access. The cache persists to chrome.storage.session to
 * survive service worker restarts.
 *
 * V2 Changes:
 * - Priority-based sorting with domain affinity
 * - Hard TTLs (30min codes, 24h links)
 * - Canonical deduplication
 * - Stricter score thresholds (0.60/0.70/0.80)
 * - Staleness detection with async refresh
 *
 * Design:
 * - Stores up to 5 verification codes (MAX_CODES)
 * - Stores up to 3 magic links (MAX_LINKS)
 * - Updates automatically after email polling
 * - Responds to popup requests in <50ms
 */

import type { StoredCode, Mailbox } from '@/lib/storage/schema'
import type {
  PopupCache,
  PopupCacheCode,
  PopupCacheMagicLink,
  PopupItem,
  CodeItem,
  LinkItem,
  ProviderId,
} from '@/shared/popup-messages'
import { filterPopupItems, separateItems } from '@/lib/popup/popup-filters'
import { dedupeByKey } from '@/lib/popup/popup-dedup'
import { sortByPriority } from '@/lib/popup/popup-priority'
import {
  MAX_CODES,
  MAX_LINKS,
  POPUP_CACHE_STALE_MS,
} from '@/lib/popup/popup-config'

const POPUP_CACHE_KEY = 'inboxkey.popup_cache'

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
   * Detects staleness and can trigger async refresh if needed.
   */
  async getCache(): Promise<PopupCache> {
    if (this.cache) {
      // Check staleness (V2 feature)
      if (this.cache.ts) {
        const age = Date.now() - this.cache.ts
        if (age > POPUP_CACHE_STALE_MS) {
          // Cache is stale but return it anyway (popup will trigger refresh)
          console.log(`[PopupCache] Cache is stale (${age}ms old)`)
        }
      }
      return this.cache
    }

    // Cold start: read from storage
    const result = await chrome.storage.session.get(POPUP_CACHE_KEY)
    this.cache = (result[POPUP_CACHE_KEY] as PopupCache | undefined) || this.getEmptyCache()
    return this.cache
  }

  /**
   * Update cache with new codes from email extraction (V2).
   * Called by EmailPollingService after successful extraction.
   *
   * V2 Pipeline:
   * 1. Convert StoredCode[] → PopupItem[]
   * 2. Filter: fresh + safe + score threshold
   * 3. Deduplicate: canonical keys
   * 4. Sort: priority scoring
   * 5. Slice: MAX_CODES/MAX_LINKS
   * 6. Convert back to legacy format for backward compat
   */
  async updateWithNewCodes(
    storedCodes: StoredCode[],
    mailboxCount: number,
    mailboxes?: Mailbox[],
    currentTabDomain?: string
  ): Promise<void> {
    const now = Date.now()

    // Update mailbox cache if provided
    if (mailboxes) {
      this.updateMailboxCache(mailboxes)
    }

    // Step 1: Convert StoredCode[] → PopupItem[]
    const allItems: PopupItem[] = storedCodes.map((stored) =>
      this.convertStoredCodeToPopupItem(stored)
    )

    // Step 2: Apply filtering pipeline (fresh + safe + score threshold)
    const freshItems = filterPopupItems(allItems, now)

    // Step 3: Canonical deduplication
    const dedupedItems = dedupeByKey(freshItems)

    // Step 4: Priority sorting
    const sortedItems = sortByPriority(dedupedItems, now, currentTabDomain)

    // Step 5: Separate codes and links, slice to limits
    const { codes: codeItems, links: linkItems } = separateItems(sortedItems)
    const topCodes = codeItems.slice(0, MAX_CODES)
    const topLinks = linkItems.slice(0, MAX_LINKS)

    // Step 6: Convert to legacy format for backward compatibility
    const legacyCodes = topCodes.map((item) => this.convertPopupItemToLegacyCode(item))
    const legacyLinks = topLinks.map((item) => this.convertPopupItemToLegacyLink(item))

    // Build cache with both V2 and V1 fields
    const cache: PopupCache = {
      codes: legacyCodes,
      magicLinks: legacyLinks,
      lastSync: now,
      mailboxCount,
      ts: now, // V2: Cache timestamp for staleness detection
    }

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
   * Convert StoredCode to PopupItem (V2)
   * Handles both verification codes and magic links
   */
  private convertStoredCodeToPopupItem(stored: StoredCode): PopupItem {
    // Get provider info from mailbox cache
    let providerId: ProviderId = 'gmail' // Default
    let domain: string | undefined

    if (stored.mailboxId) {
      const mailbox = this.mailboxCache.get(stored.mailboxId)
      if (mailbox) {
        providerId = mailbox.providerId
      }
    }

    // Extract domain from siteMatch if available
    if (stored.siteMatch) {
      try {
        const url = new URL(stored.siteMatch.startsWith('http') ? stored.siteMatch : `https://${stored.siteMatch}`)
        domain = url.hostname
      } catch {
        domain = stored.siteMatch
      }
    }

    // Generate unique ID
    const id = `${providerId}:${stored.mailboxId || 'unknown'}:${stored.timestamp}`

    // Determine if this is a magic link or code
    if (stored.code.startsWith('magic-link:')) {
      // Magic link
      const url = stored.code.replace('magic-link:', '')
      let linkType: 'login' | 'verify' | 'reset' = 'login'

      if (url.includes('/verify') || url.includes('/confirm')) linkType = 'verify'
      if (url.includes('/reset') || url.includes('/password')) linkType = 'reset'

      const linkItem: LinkItem = {
        kind: 'link',
        id,
        providerId,
        source: stored.source,
        receivedAt: stored.timestamp,
        score: 0.65, // Default score (will be overridden by matcher in future)
        domain,
        url,
        linkType,
        httpsOnly: true,
        openedAt: stored.used ? stored.timestamp : undefined,
      }
      return linkItem
    } else {
      // Verification code
      const codeItem: CodeItem = {
        kind: 'code',
        id,
        providerId,
        source: stored.source,
        receivedAt: stored.timestamp,
        score: 0.65, // Default score (will be overridden by matcher in future)
        domain,
        code: stored.code,
        len: stored.code.length,
        usedAt: stored.used ? stored.timestamp : undefined,
      }
      return codeItem
    }
  }

  /**
   * Convert CodeItem to legacy PopupCacheCode (V2 → V1)
   */
  private convertPopupItemToLegacyCode(item: CodeItem): PopupCacheCode {
    const { from, subject } = this.parseSource(item.source)
    const to = this.getMailboxEmail(item.id)
    const providerName = this.getProviderName(item.providerId)

    return {
      code: item.code,
      source: item.source,
      receivedAt: item.receivedAt,
      usedAt: item.usedAt,
      providerId: item.providerId === 'imap-bridge' ? undefined : item.providerId,
      providerName,
      from,
      to,
      subject,
    }
  }

  /**
   * Convert LinkItem to legacy PopupCacheMagicLink (V2 → V1)
   */
  private convertPopupItemToLegacyLink(item: LinkItem): PopupCacheMagicLink {
    const { from, subject } = this.parseSource(item.source)
    const to = this.getMailboxEmail(item.id)
    const providerName = this.getProviderName(item.providerId)

    return {
      url: item.url,
      type: item.linkType,
      source: item.source,
      receivedAt: item.receivedAt,
      openedAt: item.openedAt,
      providerId: item.providerId === 'imap-bridge' ? undefined : item.providerId,
      providerName,
      from,
      to,
      subject,
    }
  }

  /**
   * Extract mailbox email from PopupItem ID
   */
  private getMailboxEmail(itemId: string): string | undefined {
    const parts = itemId.split(':')
    if (parts.length >= 2) {
      const mailboxId = parts[1]
      const mailbox = this.mailboxCache.get(mailboxId)
      return mailbox?.email
    }
    return undefined
  }

  /**
   * Get provider display name
   */
  private getProviderName(providerId: ProviderId): string | undefined {
    switch (providerId) {
      case 'gmail':
        return 'Gmail'
      case 'outlook':
        return 'Outlook'
      case 'imap-bridge':
        return undefined
      default:
        return undefined
    }
  }

  /**
   * Parse stored source string (`from - subject`) into structured fields.
   */
  private parseSource(source: string): { from?: string; subject?: string } {
    if (!source) {
      return {}
    }

    const parts = source.split(' - ')
    if (parts.length === 0) {
      return { from: source || undefined }
    }

    const from = parts[0]?.trim() || undefined
    const subjectParts = parts.slice(1)
    const subject = subjectParts.length > 0 ? subjectParts.join(' - ').trim() : undefined

    return { from, subject }
  }
}
