/**
 * Popup Cache Types
 *
 * Type definitions for the popup cache system that provides fast access
 * to recent verification codes and magic links for the popup UI.
 *
 * V2 Architecture (New):
 * - BaseItem: Shared properties
 * - CodeItem/LinkItem: Specific types with kind discriminator
 * - Priority-based sorting with domain affinity
 * - Hard TTLs for freshness
 *
 * V1 Architecture (Legacy):
 * - PopupCacheCode/PopupCacheMagicLink: Backward-compatible aliases
 */

/**
 * Provider type
 */
export type ProviderId = 'gmail' | 'outlook' | 'imap-bridge'

/**
 * Base properties shared by all popup items
 */
export interface BaseItem {
  /** Unique identifier: `${provider}:${messageId}` */
  id: string
  /** Provider that fetched this item */
  providerId: ProviderId
  /** Display source: "from@example.com — Subject" */
  source: string
  /** When email was received (Unix timestamp ms) */
  receivedAt: number
  /** Confidence score from matcher (0..1) */
  score: number
  /** Brand domain for affinity matching */
  domain?: string
  /** When code was copied/autofilled */
  usedAt?: number
  /** When link was opened */
  openedAt?: number
}

/**
 * Verification code item (V2)
 */
export interface CodeItem extends BaseItem {
  kind: 'code'
  /** The verification code (normalized) */
  code: string
  /** Optional: code length for UI styling */
  len?: number
}

/**
 * Magic link item (V2)
 */
export interface LinkItem extends BaseItem {
  kind: 'link'
  /** The magic link URL */
  url: string
  /** Link type classification */
  linkType: 'login' | 'verify' | 'reset'
  /** HTTPS validation flag */
  httpsOnly?: true
}

/**
 * Union type for all popup items
 */
export type PopupItem = CodeItem | LinkItem

// =============================================================================
// LEGACY TYPES (V1) - Backward Compatibility
// =============================================================================

/**
 * A verification code cached for the popup (Legacy V1)
 * @deprecated Use CodeItem instead
 */
export interface PopupCacheCode {
  code: string
  source: string // "gmail:user@example.com" or "from@example.com - Subject"
  receivedAt: number // Unix timestamp (ms)
  usedAt?: number // If autofilled
  seenAt?: number // When user opened popup and saw this code (for unread count)
  providerId?: 'gmail' | 'outlook' // Provider ID
  providerName?: string // Display name (e.g., "Gmail", "Outlook")
  from?: string // Parsed sender email/name
  to?: string // Intended recipient (mailbox email)
  subject?: string // Parsed subject line
  // Scoring metadata (V2+)
  senderETLD?: string // eTLD+1 of sender email (e.g., "example.com" from "noreply@example.com")
  domainAffinity?: number // 0-1.0 domain match score
  recencyScore?: number // 0-1.0 recency score
  sessionBoost?: number // 0 or 0.15 session boost
  shapeScore?: number // -0.12 to +0.28 shape alignment
  totalScore?: number // final priority score (for sorting)
}

/**
 * A magic link cached for the popup
 */
export interface PopupCacheMagicLink {
  url: string
  type: 'login' | 'verify' | 'reset'
  source: string
  receivedAt: number
  openedAt?: number
  providerId?: 'gmail' | 'outlook' // Provider ID
  providerName?: string // Display name (e.g., "Gmail", "Outlook")
  from?: string
  to?: string
  subject?: string
}

/**
 * Complete popup cache structure
 */
export interface PopupCache {
  codes: PopupCacheCode[]
  magicLinks: PopupCacheMagicLink[]
  lastSync: number
  mailboxCount: number
  /** Cache timestamp for staleness detection (ms) */
  ts?: number
}

/**
 * Unified popup cache structure (V2)
 *
 * Single priority-sorted list of codes and links combined.
 * Replaces separate codes/magicLinks arrays with unified items array.
 *
 * Benefits:
 * - Solves empty section problem (no wasted space)
 * - Top N most relevant items regardless of type
 * - Simplified UI rendering (single section)
 *
 * Backward compatibility: Still includes legacy codes/magicLinks arrays
 * for gradual migration. UI can use either format.
 */
export interface UnifiedPopupCache {
  /** Unified priority-sorted items (codes + links combined) */
  items: PopupItem[]
  /** Legacy: Separate codes array (for backward compatibility) */
  codes: PopupCacheCode[]
  /** Legacy: Separate links array (for backward compatibility) */
  magicLinks: PopupCacheMagicLink[]
  lastSync: number
  mailboxCount: number
  /** Cache timestamp for staleness detection (ms) */
  ts?: number
}

/**
 * Mailbox information returned to popup (without sensitive tokens)
 */
export interface MailboxInfo {
  id: string
  providerId: 'gmail' | 'outlook' | 'imap-bridge'
  email: string
  addedAt: number
  lastSyncedAt: number
  /** OAuth token expiry (undefined for IMAP providers) */
  tokenExpiresAt?: number
}

/**
 * Messages sent from popup to background
 */
export type PopupRequest =
  | { type: 'GET_POPUP_DATA'; currentDomain?: string }
  | { type: 'TRIGGER_SYNC' }
  | { type: 'MARK_CODE_USED'; code: string }
  | { type: 'MARK_CODES_SEEN' } // Mark all codes as seen when popup opens
  | { type: 'MARK_LINK_OPENED'; url: string }
  | { type: 'GET_MAILBOXES' }
  | { type: 'GET_SYNC_ERROR' }

/**
 * Sync error info
 */
export interface SyncErrorInfo {
  type: 'sync-failed' | 'auth-expired' | 'network-offline'
  variant: 'error' | 'warning' | 'info'
  message: string
  timestamp: number
}

/**
 * Responses sent from background to popup
 */
export type PopupResponse =
  | { success: true; data: PopupCache }
  | { success: true; mailboxes: MailboxInfo[] }
  | { success: true; error: SyncErrorInfo | null }
  | { success: true }
  | { success: false; error: string }
