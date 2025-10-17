/**
 * Storage interface for InboxKey
 *
 * Abstracts storage operations to support both encrypted and plaintext modes.
 * Implemented by:
 * - EncryptedStorage: Password-protected mode with AES-GCM encryption
 * - PlaintextStorage: Passwordless mode with unencrypted storage
 */

import type { Mailbox, SessionState, Settings, StoredCode } from "./schema"

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
  // Code Operations
  // ============================================================================

  /**
   * Add a new verification code
   * @throws ValidationError if code data is invalid
   */
  addCode(code: StoredCode): Promise<void>

  /**
   * Get recent verification codes
   * @param limit - Optional maximum number of codes to return
   * @returns Array of codes sorted by timestamp (newest first)
   */
  getRecentCodes(limit?: number): Promise<StoredCode[]>

  /**
   * Mark a code as used
   * @param code - The code string to mark as used
   * @throws ValidationError if code is empty or not found
   */
  markCodeUsed(code: string): Promise<void>

  /**
   * Clear old verification codes
   * @param olderThanMs - Clear codes older than this many milliseconds
   * @throws ValidationError if olderThanMs is not positive
   */
  clearOldCodes(olderThanMs: number): Promise<void>

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
