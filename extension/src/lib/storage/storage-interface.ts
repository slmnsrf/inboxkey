/**
 * Storage interface for InboxKey
 *
 * Abstracts storage operations for the extension.
 * Implemented by:
 * - PlaintextStorage: Stores data in plaintext using Chrome Storage API
 */

import type { Mailbox, SessionState, Settings, DomainPreferences } from "./schema"

/**
 * Storage interface defining all storage operations
 */
export interface IStorage {
  // ============================================================================
  // Mailbox Operations
  // ============================================================================

  /**
   * Add a new mailbox
   * @throws ValidationError if mailbox data is invalid or duplicate exists
   */
  addMailbox(mailbox: Mailbox): Promise<void>

  /**
   * Get all mailboxes
   * @returns Array of mailboxes (empty array if none exist)
   */
  getMailboxes(): Promise<Mailbox[]>

  /**
   * Get a specific mailbox by ID
   * @param id - Mailbox UUID
   * @returns Mailbox if found, null otherwise
   * @throws ValidationError if ID format is invalid
   */
  getMailbox(id: string): Promise<Mailbox | null>

  /**
   * Update a mailbox
   * @param id - Mailbox UUID
   * @param updates - Partial mailbox data to update
   * @throws ValidationError if ID is invalid or mailbox not found
   */
  updateMailbox(id: string, updates: Partial<Mailbox>): Promise<void>

  /**
   * Remove a mailbox
   * @param id - Mailbox UUID
   * @throws ValidationError if ID is invalid or mailbox not found
   */
  removeMailbox(id: string): Promise<void>

  // ============================================================================
  // Settings Operations
  // ============================================================================

  /**
   * Get user settings
   * @returns Settings object (returns defaults if not set)
   */
  getSettings(): Promise<Settings>

  /**
   * Update user settings
   * @param updates - Partial settings to update
   * @throws ValidationError if settings structure is invalid
   */
  updateSettings(updates: Partial<Settings>): Promise<void>

  // ============================================================================
  // Session State Operations
  // ============================================================================

  /**
   * Get current session state
   * @returns Session state (returns defaults if not set)
   */
  getSessionState(): Promise<SessionState>

  /**
   * Update session state
   * @param updates - Partial session state to update
   * @throws ValidationError if session state structure is invalid
   */
  updateSessionState(updates: Partial<SessionState>): Promise<void>

  // ============================================================================
  // Domain Preferences Operations
  // ============================================================================

  /**
   * Get domain preferences
   * @returns Domain preferences object (returns defaults if not set)
   */
  getDomainPreferences(): Promise<DomainPreferences>

  /**
   * Set preference for a specific domain
   * @param domain - eTLD+1 domain
   * @param enabled - Whether InboxKey is enabled for this domain
   */
  setDomainPreference(domain: string, enabled: boolean): Promise<void>

  /**
   * Get preference for a specific domain
   * @param domain - eTLD+1 domain
   * @returns true if enabled, false if disabled, undefined if no preference set
   */
  getDomainPreference(domain: string): Promise<boolean | undefined>

  // ============================================================================
  // Utility Operations
  // ============================================================================

  /**
   * Clear all storage data (both local and session)
   */
  clear(): Promise<void>

  /**
   * Get total storage size in bytes
   * @returns Number of bytes used in chrome.storage.local
   */
  getStorageSize(): Promise<number>
}
