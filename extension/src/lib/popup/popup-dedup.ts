/**
 * Popup Deduplication Logic
 *
 * Canonical deduplication using normalized values + domain + time buckets
 * to eliminate duplicates from forwards, grouped codes, etc.
 */

import type { PopupItem } from '@/shared/popup-messages'
import { DEDUP_TIME_BUCKET_MINUTES } from './popup-config'

/**
 * Normalize a verification code for deduplication
 * - Strip spaces and dashes
 * - Uppercase alphanumeric
 */
export function normalizeCode(code: string): string {
  return code
    .replace(/[\s\-]/g, '') // Remove spaces and dashes
    .toUpperCase() // Uppercase for case-insensitive matching
}

/**
 * Normalize a URL for deduplication
 * - Extract origin + pathname + relevant query params
 * - Ignore tracking params
 */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url)

    // Start with origin + pathname
    let normalized = u.origin + u.pathname

    // Include token-like query params (common in magic links).
    // Two magic links with different secrets MUST normalize differently
    // even when they share the path, otherwise dedupeByKey drops one.
    // Provider conventions vary widely:
    //   token / code / verify / session / key / id  - generic
    //   token_hash / oobCode                          - Supabase, Firebase
    //   auth_token / login_token / access_token       - Auth0, Stytch, custom
    //   ticket                                        - Auth0 / SAML
    //   state                                         - OAuth state param
    //   t / k / sig                                   - shorthand variants
    const tokenParams = [
      'token',
      'code',
      'verify',
      'session',
      'key',
      'id',
      'token_hash',
      'oobcode',
      'auth_token',
      'login_token',
      'access_token',
      'magic_token',
      'ticket',
      'state',
      't',
      'k',
      'sig',
      'signature',
    ]
    const params = new URLSearchParams(u.search)

    const relevantParams: string[] = []
    // URLSearchParams keys are case-sensitive but most providers use
    // lower-case. Iterate the actual keys present so we match
    // case-insensitively against our allowlist without having to
    // try every case variant.
    const lowerAllow = new Set(tokenParams.map(p => p.toLowerCase()))
    for (const [name, value] of params.entries()) {
      if (lowerAllow.has(name.toLowerCase()) && value) {
        relevantParams.push(`${name.toLowerCase()}=${value}`)
      }
    }

    if (relevantParams.length > 0) {
      normalized += '?' + relevantParams.sort().join('&')
    }

    return normalized
  } catch (error) {
    // Fallback to raw URL if parsing fails
    return url
  }
}

/**
 * Get normalized value for an item (code or URL)
 */
function getNormalizedValue(item: PopupItem): string {
  if (item.kind === 'code') {
    return normalizeCode(item.code)
  } else {
    return normalizeUrl(item.url)
  }
}

/**
 * Bucket a timestamp into N-minute windows
 * Items in the same bucket are considered duplicates if they match
 */
function timeBucket(timestamp: number, bucketMinutes: number): number {
  const bucketMs = bucketMinutes * 60 * 1000
  return Math.floor(timestamp / bucketMs) * bucketMs
}

/**
 * Create canonical dedup key for an item
 * Format: `kind|normalizedValue|domain|timeBucket`
 */
export function makeDedupKey(item: PopupItem): string {
  const normalizedValue = getNormalizedValue(item)
  const domain = item.domain || ''
  const bucket = timeBucket(item.receivedAt, DEDUP_TIME_BUCKET_MINUTES)

  return `${item.kind}|${normalizedValue}|${domain}|${bucket}`
}

/**
 * Deduplicate items by canonical key
 * - Groups items by dedup key
 * - Keeps the newest item per key
 * - Merges usage timestamps (usedAt, openedAt)
 */
export function dedupeByKey(items: PopupItem[]): PopupItem[] {
  const groups = new Map<string, PopupItem[]>()

  // Group items by dedup key
  for (const item of items) {
    const key = makeDedupKey(item)
    const group = groups.get(key) || []
    group.push(item)
    groups.set(key, group)
  }

  // For each group, keep the newest item and merge usage timestamps
  const deduplicated: PopupItem[] = []

  for (const group of groups.values()) {
    if (group.length === 0) continue

    // Sort by receivedAt descending (newest first)
    group.sort((a, b) => b.receivedAt - a.receivedAt)

    // Take the newest item
    const newest = { ...group[0] }

    // Merge usage timestamps from all items in group
    // (take earliest usage time if multiple items were used)
    for (const item of group) {
      if (item.usedAt && (!newest.usedAt || item.usedAt < newest.usedAt)) {
        newest.usedAt = item.usedAt
      }
      if (item.openedAt && (!newest.openedAt || item.openedAt < newest.openedAt)) {
        newest.openedAt = item.openedAt
      }
    }

    deduplicated.push(newest)
  }

  return deduplicated
}
