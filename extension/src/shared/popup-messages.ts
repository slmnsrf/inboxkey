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
  providerId?: 'gmail' | 'outlook' // Provider ID
  providerName?: string // Display name (e.g., "Gmail", "Outlook")
  from?: string // Parsed sender email/name
  to?: string // Intended recipient (mailbox email)
  subject?: string // Parsed subject line
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
 * Lock status with initialization state
 */
export interface LockStatusResponse {
  isInitialized: boolean
  isUnlocked: boolean
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
  tokenExpiresAt: number
}

/**
 * Messages sent from popup to background
 */
export type PopupRequest =
  | { type: 'GET_POPUP_DATA' }
  | { type: 'GET_LOCK_STATUS' }
  | { type: 'TRIGGER_SYNC' }
  | { type: 'MARK_CODE_USED'; code: string }
  | { type: 'MARK_LINK_OPENED'; url: string }
  | { type: 'INITIALIZE_PASSWORD'; password: string }
  | { type: 'UNLOCK'; password: string }
  | { type: 'LOCK' }
  | { type: 'CHANGE_PASSWORD'; currentPassword: string; newPassword: string }
  | { type: 'DISABLE_PASSWORD'; password: string }
  | { type: 'GET_MAILBOXES' }

/**
 * Responses sent from background to popup
 */
export type PopupResponse =
  | { success: true; data: PopupCache }
  | { success: true; locked: boolean }
  | { success: true; isInitialized: boolean; isUnlocked: boolean }
  | { success: true; mailboxes: MailboxInfo[] }
  | { success: true }
  | { success: false; error: string }
