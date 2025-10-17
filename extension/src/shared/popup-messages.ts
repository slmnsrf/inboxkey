/**
 * Popup Cache Types
 *
 * Type definitions for the popup cache system that provides fast access
 * to recent verification codes and magic links for the popup UI.
 */

/**
 * A verification code cached for the popup
 */
export interface PopupCacheCode {
  code: string
  source: string // "gmail:user@example.com" or "from@example.com - Subject"
  receivedAt: number // Unix timestamp (ms)
  usedAt?: number // If autofilled
  providerId?: 'gmail' | 'outlook' // Provider ID
  providerName?: string // Display name (e.g., "Gmail", "Outlook")
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
}

/**
 * Complete popup cache structure
 */
export interface PopupCache {
  codes: PopupCacheCode[]
  magicLinks: PopupCacheMagicLink[]
  lastSync: number
  mailboxCount: number
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
