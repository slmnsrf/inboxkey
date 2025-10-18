/**
 * Popup Filtering Logic
 *
 * Functions for filtering popup items based on:
 * - Freshness (TTL checks)
 * - Safety (HTTPS-only, denylist)
 * - Score thresholds
 * - Usage state
 */

import type { PopupItem, CodeItem, LinkItem } from '@/shared/popup-messages'
import {
  CODE_TTL_MS,
  LINK_TTL_MS,
  SCORE_POPUP,
  USED_ITEM_HIDE_MS,
  LINK_DENY_PATTERNS,
  HIDDEN_LINK_TYPES,
} from './popup-config'

/**
 * Check if an item is fresh (within TTL)
 */
export function isFresh(item: PopupItem, now: number): boolean {
  const age = now - item.receivedAt
  const ttl = item.kind === 'code' ? CODE_TTL_MS : LINK_TTL_MS
  return age <= ttl
}

/**
 * Check if an item meets minimum score threshold
 */
export function meetsScoreThreshold(item: PopupItem): boolean {
  return item.score >= SCORE_POPUP
}

/**
 * Check if a link is safe to display
 * - HTTPS-only
 * - Not in denylist (unsubscribe, reset, etc.)
 * - Not a hidden type by default
 */
export function isSafeLink(link: LinkItem): boolean {
  try {
    const url = new URL(link.url)

    // Must be HTTPS
    if (url.protocol !== 'https:') {
      return false
    }

    // Check against denylist
    const hostAndPath = url.hostname + url.pathname
    for (const pattern of LINK_DENY_PATTERNS) {
      if (hostAndPath.toLowerCase().includes(pattern)) {
        return false
      }
    }

    // Check if link type is hidden by default
    if (HIDDEN_LINK_TYPES.includes(link.linkType)) {
      return false
    }

    return true
  } catch (error) {
    // Invalid URL
    return false
  }
}

/**
 * Check if item should be hidden due to usage state
 * Used items are hidden after USED_ITEM_HIDE_MS (10 minutes)
 */
export function shouldHideUsedItem(item: PopupItem, now: number): boolean {
  const usageTime = item.usedAt || item.openedAt
  if (!usageTime) {
    return false // Not used, don't hide
  }

  const timeSinceUse = now - usageTime
  return timeSinceUse > USED_ITEM_HIDE_MS
}

/**
 * Filter items for popup display
 * Applies all safety and freshness filters
 */
export function filterPopupItems(items: PopupItem[], now: number): PopupItem[] {
  return items.filter((item) => {
    // Must be fresh
    if (!isFresh(item, now)) {
      return false
    }

    // Must meet score threshold
    if (!meetsScoreThreshold(item)) {
      return false
    }

    // Links must be safe
    if (item.kind === 'link' && !isSafeLink(item)) {
      return false
    }

    // Must not be hidden due to usage
    if (shouldHideUsedItem(item, now)) {
      return false
    }

    return true
  })
}

/**
 * Separate items into codes and links
 */
export function separateItems(items: PopupItem[]): {
  codes: CodeItem[]
  links: LinkItem[]
} {
  const codes: CodeItem[] = []
  const links: LinkItem[] = []

  for (const item of items) {
    if (item.kind === 'code') {
      codes.push(item)
    } else if (item.kind === 'link') {
      links.push(item)
    }
  }

  return { codes, links }
}
