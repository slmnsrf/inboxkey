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
 * Items-first semantics:
 * - items[] is the single authoritative store
 * - Legacy codes[]/magicLinks[] are derived on read in getCache()
 * - markCodeUsed, markLinkOpened, markCodesSeen all operate on items[]
 *
 * Design:
 * - Stores up to 5 items (MAX_ITEMS) in a unified priority-sorted list
 * - Updates automatically after email polling
 * - Responds to popup requests in <50ms
 */

import type { StoredCode, Mailbox } from '@/lib/storage/schema'
import type {
  UnifiedPopupCache,
  PopupCacheCode,
  PopupCacheMagicLink,
  PopupItem,
  CodeItem,
  LinkItem,
  ProviderId,
} from '@/shared/popup-messages'
import { filterPopupItems, separateItems } from '@/lib/popup/popup-filters'
import { dedupeByKey } from '@/lib/popup/popup-dedup'
import { sortByPriority, computePriority } from '@/lib/popup/popup-priority'
import {
  MAX_ITEMS,
  POPUP_CACHE_STALE_MS,
} from '@/lib/popup/popup-config'
import { extractETLD, domainAffinity as computeDomainAffinity } from '@/lib/matching/domain-affinity'
import { recencyBoost } from '@/lib/matching/recency-scorer'

const POPUP_CACHE_KEY = 'inboxkey.popup_cache'

/**
 * Internal cache shape stored in memory and chrome.storage.session.
 * Only items[] is stored; legacy arrays are derived on read.
 */
interface InternalCache {
  items: PopupItem[]
  lastSync: number
  mailboxCount: number
  ts?: number
}

/**
 * Manages the popup cache for fast access to recent codes/links
 */
export class PopupCacheManager {
  private cache: InternalCache | null = null
  private mailboxCache: Map<string, Mailbox> = new Map()

  /**
   * Initialize cache from storage (called on SW startup).
   */
  async initialize(): Promise<void> {
    const result = await chrome.storage.session.get(POPUP_CACHE_KEY)
    const stored = result[POPUP_CACHE_KEY] as (InternalCache | UnifiedPopupCache | undefined)

    if (stored) {
      // Migrate from legacy format: if stored has codes/magicLinks but no items,
      // or if stored has items alongside legacy arrays (V2 transition)
      this.cache = {
        items: stored.items || [],
        lastSync: stored.lastSync || 0,
        mailboxCount: stored.mailboxCount || 0,
        ts: stored.ts,
      }
    } else {
      this.cache = this.getEmptyInternalCache()
    }
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
   * Derives legacy codes[]/magicLinks[] from items[] on every read.
   * Detects staleness and can trigger async refresh if needed.
   */
  async getCache(): Promise<UnifiedPopupCache> {
    if (!this.cache) {
      // Cold start: read from storage
      const result = await chrome.storage.session.get(POPUP_CACHE_KEY)
      const stored = result[POPUP_CACHE_KEY] as (InternalCache | UnifiedPopupCache | undefined)

      if (stored) {
        this.cache = {
          items: stored.items || [],
          lastSync: stored.lastSync || 0,
          mailboxCount: stored.mailboxCount || 0,
          ts: stored.ts,
        }
      } else {
        this.cache = this.getEmptyInternalCache()
      }
    }

    // Check staleness (V2 feature)
    if (this.cache.ts) {
      const age = Date.now() - this.cache.ts
      if (age > POPUP_CACHE_STALE_MS) {
        // Cache is stale but return it anyway (popup will trigger refresh)
        // Staleness is expected behavior; popup will trigger async refresh
      }
    }

    // Derive legacy arrays from items[]
    return this.deriveUnifiedCache(this.cache)
  }

  /**
   * Update cache with new codes from email extraction (V2).
   * Called by EmailPollingService after successful extraction.
   *
   * V2 Pipeline:
   * 1. Convert StoredCode[] -> PopupItem[]
   * 2. Filter: fresh + safe + score threshold
   * 3. Deduplicate: canonical keys
   * 4. Sort: priority scoring
   * 5. Slice: MAX_ITEMS
   * 6. Store only items[] (legacy arrays derived on read)
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

    // Step 1: Convert StoredCode[] -> PopupItem[]
    const allItems: PopupItem[] = storedCodes.map((stored) =>
      this.convertStoredCodeToPopupItem(stored)
    )

    // Step 2: Apply filtering pipeline (fresh + safe + score threshold)
    const freshItems = filterPopupItems(allItems, now)

    // Step 3: Canonical deduplication
    const dedupedItems = dedupeByKey(freshItems)

    // Step 4: Priority sorting
    const sortedItems = sortByPriority(dedupedItems, now, currentTabDomain)

    // Step 5: Slice unified list to MAX_ITEMS
    const topItems = sortedItems.slice(0, MAX_ITEMS)

    // Build internal cache with only items[]
    const cache: InternalCache = {
      items: topItems,
      lastSync: now,
      mailboxCount,
      ts: now,
    }

    await this.saveCache(cache)
  }

  /**
   * Mark a code as used (when popup copies it).
   * Operates on items[] directly; legacy arrays are derived on read.
   */
  async markCodeUsed(code: string): Promise<void> {
    const internal = await this.getInternalCache()
    const found = internal.items.find(
      (item) => item.kind === 'code' && (item as CodeItem).code === code
    )

    if (found) {
      found.usedAt = Date.now()
      await this.saveCache(internal)
    }
  }

  /**
   * Mark a magic link as opened.
   * Operates on items[] directly; legacy arrays are derived on read.
   */
  async markLinkOpened(url: string): Promise<void> {
    const internal = await this.getInternalCache()
    const found = internal.items.find(
      (item) => item.kind === 'link' && (item as LinkItem).url === url
    )

    if (found) {
      found.openedAt = Date.now()
      await this.saveCache(internal)
    }
  }

  /**
   * Mark all items as seen (set seenAt on items that don't already have it).
   * Called when popup opens to clear the unread badge.
   */
  async markCodesSeen(): Promise<void> {
    const internal = await this.getInternalCache()
    const now = Date.now()
    let changed = false

    for (const item of internal.items) {
      if (!item.seenAt) {
        item.seenAt = now
        changed = true
      }
    }

    if (changed) {
      await this.saveCache(internal)
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
   * Convert CodeItem to legacy PopupCacheCode (V2 -> V1)
   * Now includes scoring metadata for debug/display purposes.
   * Public so popup-handler can do domain projection.
   */
  convertPopupItemToLegacyCode(item: CodeItem, now: number, currentTabDomain?: string): PopupCacheCode {
    const { from, subject } = this.parseSource(item.source)
    const to = this.getMailboxEmail(item.id)
    const providerName = this.getProviderName(item.providerId)

    // Extract sender eTLD from the from email address
    let senderETLD: string | undefined
    if (from) {
      const emailMatch = from.match(/([^@]+@)?([^@]+\.[^@>\s]+)/i)
      if (emailMatch && emailMatch[2]) {
        senderETLD = extractETLD(emailMatch[2])
      }
    }

    // Compute scoring metadata for display/debug
    const currentTabETLD = currentTabDomain ? extractETLD(currentTabDomain) : undefined
    const domainAffinity = senderETLD && currentTabETLD
      ? computeDomainAffinity(currentTabETLD, senderETLD, subject)
      : 0

    const ageSeconds = (now - item.receivedAt) / 1000
    const recencyScore = recencyBoost(ageSeconds)

    // Session boost is not applicable in popup context (no session start time)
    const sessionBoost = 0

    // Shape score would require expected shape from current site
    const shapeScore = 0

    // Compute total priority score
    const totalScore = computePriority(item, now, currentTabDomain)

    return {
      code: item.code,
      source: item.source,
      receivedAt: item.receivedAt,
      usedAt: item.usedAt,
      seenAt: item.seenAt,
      providerId: item.providerId === 'imap-bridge' ? undefined : item.providerId,
      providerName,
      from,
      to,
      subject,
      // Scoring metadata
      senderETLD,
      domainAffinity,
      recencyScore,
      sessionBoost,
      shapeScore,
      totalScore,
    }
  }

  /**
   * Convert LinkItem to legacy PopupCacheMagicLink (V2 -> V1)
   * Public so popup-handler can do domain projection.
   */
  convertPopupItemToLegacyLink(item: LinkItem): PopupCacheMagicLink {
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
   * Save cache to both memory and chrome.storage.session.
   * Only stores InternalCache shape (items[] only, no legacy arrays).
   */
  private async saveCache(cache: InternalCache): Promise<void> {
    this.cache = cache
    try {
      await chrome.storage.session.set({ [POPUP_CACHE_KEY]: cache })
    } catch (err) {
      console.warn('[PopupCache] Failed to persist cache to session storage:', err)
    }
  }

  /**
   * Get internal cache (warm or cold start).
   * Does NOT derive legacy arrays.
   */
  private async getInternalCache(): Promise<InternalCache> {
    if (this.cache) {
      return this.cache
    }

    // Cold start: read from storage
    const result = await chrome.storage.session.get(POPUP_CACHE_KEY)
    const stored = result[POPUP_CACHE_KEY] as (InternalCache | UnifiedPopupCache | undefined)

    if (stored) {
      this.cache = {
        items: stored.items || [],
        lastSync: stored.lastSync || 0,
        mailboxCount: stored.mailboxCount || 0,
        ts: stored.ts,
      }
    } else {
      this.cache = this.getEmptyInternalCache()
    }

    return this.cache
  }

  /**
   * Derive the full UnifiedPopupCache (with legacy arrays) from internal cache.
   * This is the only place legacy arrays are constructed.
   */
  private deriveUnifiedCache(internal: InternalCache): UnifiedPopupCache {
    const now = Date.now()
    const { codes: codeItems, links: linkItems } = separateItems(internal.items)

    const legacyCodes = codeItems.map((item) =>
      this.convertPopupItemToLegacyCode(item as CodeItem, now)
    )
    const legacyLinks = linkItems.map((item) =>
      this.convertPopupItemToLegacyLink(item as LinkItem)
    )

    return {
      items: internal.items,
      codes: legacyCodes,
      magicLinks: legacyLinks,
      lastSync: internal.lastSync,
      mailboxCount: internal.mailboxCount,
      ts: internal.ts,
    }
  }

  /**
   * Create an empty internal cache
   */
  private getEmptyInternalCache(): InternalCache {
    return {
      items: [],
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
      case 'google-messages':
        return 'Google Messages'
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
