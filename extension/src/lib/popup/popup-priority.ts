/**
 * Popup Priority Scoring Engine
 *
 * Computes priority scores for popup items based on:
 * - Recency (how recent the email is)
 * - Domain affinity (match with current tab domain)
 * - Format match (expected length/charset)
 * - Freshness bonus (unused items score higher)
 */

import type { PopupItem, CodeItem } from '@/shared/popup-messages'
import {
  WEIGHT_RECENCY,
  WEIGHT_DOMAIN,
  WEIGHT_FORMAT,
  WEIGHT_FRESHNESS,
  RECENCY_BREAKPOINTS,
  DOMAIN_AFFINITY,
} from './popup-config'

/**
 * Compute recency score based on email age
 * - 0-2 min: 1.0 (very fresh)
 * - 2-5 min: 0.7 (fresh)
 * - 5-10 min: 0.4 (medium)
 * - 10-30 min: 0.0 (old but valid)
 */
export function recencyScore(now: number, receivedAt: number): number {
  const ageMinutes = (now - receivedAt) / (60 * 1000)

  if (ageMinutes <= RECENCY_BREAKPOINTS.veryFresh) {
    return 1.0
  } else if (ageMinutes <= RECENCY_BREAKPOINTS.fresh) {
    return 0.7
  } else if (ageMinutes <= RECENCY_BREAKPOINTS.medium) {
    return 0.4
  } else {
    return 0.0
  }
}

/**
 * Extract eTLD+1 (effective top-level domain + 1 level)
 * Simplified version - extracts last 2 parts of hostname
 * Examples:
 * - "accounts.google.com" → "google.com"
 * - "login.microsoftonline.com" → "microsoftonline.com"
 */
function extractETLDPlus1(hostname: string): string {
  const parts = hostname.split('.')
  if (parts.length >= 2) {
    return parts.slice(-2).join('.')
  }
  return hostname
}

/**
 * Compute domain affinity between current tab and item domain
 * - Same eTLD+1: 1.0 (perfect match)
 * - Subdomain or known alias: 0.6 (related)
 * - Different: 0.0 (no match)
 */
export function domainAffinity(tabDomain: string | undefined, itemDomain: string | undefined): number {
  if (!tabDomain || !itemDomain) {
    return DOMAIN_AFFINITY.none
  }

  // Normalize to lowercase
  const tab = tabDomain.toLowerCase()
  const item = itemDomain.toLowerCase()

  // Exact match
  if (tab === item) {
    return DOMAIN_AFFINITY.perfect
  }

  // Check eTLD+1 match
  const tabETLD = extractETLDPlus1(tab)
  const itemETLD = extractETLDPlus1(item)

  if (tabETLD === itemETLD) {
    return DOMAIN_AFFINITY.perfect
  }

  // Check if one is subdomain of the other
  if (tab.endsWith('.' + item) || item.endsWith('.' + tab)) {
    return DOMAIN_AFFINITY.related
  }

  // Check known brand aliases
  // (Could be expanded with a brand alias map)
  const knownAliases = [
    ['google', 'gmail', 'gstatic'],
    ['microsoft', 'live', 'outlook', 'office'],
    ['facebook', 'fb'],
    ['amazon', 'aws'],
  ]

  for (const aliasGroup of knownAliases) {
    const tabMatches = aliasGroup.some((alias) => tab.includes(alias))
    const itemMatches = aliasGroup.some((alias) => item.includes(alias))
    if (tabMatches && itemMatches) {
      return DOMAIN_AFFINITY.related
    }
  }

  return DOMAIN_AFFINITY.none
}

/**
 * Compute format score for codes
 * - Length 4-8: 1.0 (typical verification code)
 * - Other: 0.6 (valid but unusual)
 * - Links always get 0.6 (neutral)
 */
export function formatScore(item: PopupItem): number {
  if (item.kind === 'code') {
    const codeItem = item as CodeItem
    const len = codeItem.len || codeItem.code.length

    // Typical verification code lengths: 4, 6, 8
    if (len >= 4 && len <= 8) {
      return 1.0
    }

    // Valid but unusual length
    return 0.6
  }

  // Links get neutral format score
  return 0.6
}

/**
 * Compute freshness bonus
 * - Unused items: 0.1 (small boost to surface fresh items)
 * - Used items: 0.0 (de-prioritize)
 */
export function freshnessBonus(usedAt: number | undefined, openedAt: number | undefined): number {
  return (usedAt || openedAt) ? 0.0 : 0.1
}

/**
 * Compute overall priority score for an item
 *
 * Formula:
 * priority = 0.55 * recencyScore
 *          + 0.25 * domainAffinity
 *          + 0.10 * formatScore
 *          + 0.10 * freshnessBonus
 *
 * @param item - The popup item to score
 * @param now - Current timestamp (ms)
 * @param currentTabDomain - Domain of current active tab (optional)
 * @returns Priority score (0..1)
 */
export function computePriority(
  item: PopupItem,
  now: number,
  currentTabDomain?: string
): number {
  const recency = recencyScore(now, item.receivedAt)
  const affinity = domainAffinity(currentTabDomain, item.domain)
  const format = formatScore(item)
  const freshness = freshnessBonus(item.usedAt, item.openedAt)

  const priority =
    WEIGHT_RECENCY * recency +
    WEIGHT_DOMAIN * affinity +
    WEIGHT_FORMAT * format +
    WEIGHT_FRESHNESS * freshness

  return priority
}

/**
 * Sort items by priority (descending)
 * Higher priority items appear first
 */
export function sortByPriority(items: PopupItem[], now: number, currentTabDomain?: string): PopupItem[] {
  return items
    .map((item) => ({
      item,
      priority: computePriority(item, now, currentTabDomain),
    }))
    .sort((a, b) => b.priority - a.priority)
    .map((scored) => scored.item)
}
