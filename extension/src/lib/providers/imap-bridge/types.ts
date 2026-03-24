/**
 * IMAP Provider Interface
 *
 * IMAP providers use Native Messaging to communicate with InboxBridge native app.
 * Unlike the Gmail OAuth provider, IMAP credentials are stored in OS keychain
 * by the native app, not in extension storage.
 */

/**
 * IMAP provider interface for Native Messaging-based email access
 *
 * Key differences from OAuth providers:
 * - No OAuth flow (uses username/password)
 * - Credentials stored in OS keychain via native app
 * - No token refresh (password-based auth)
 */
export interface IIMAPProvider {
  readonly providerId: 'imap-bridge'
  readonly displayName: string

  /**
   * Configure IMAP account and store credentials in native keychain
   *
   * @param params - Account configuration
   * @returns Account ID assigned by native app
   */
  configureAccount(params: {
    label: string
    server: string
    port: number
    tls: boolean
    email: string
    password: string
  }): Promise<{ accountId: string }>

  /**
   * Test IMAP connection without saving account
   *
   * @param params - Connection parameters
   * @returns Success status and round-trip latency
   */
  testConnection(params: {
    server: string
    port: number
    tls: boolean
    email: string
    password: string
  }): Promise<{ success: boolean; roundTripMs: number }>

  /**
   * Disconnect IMAP account and remove credentials from keychain
   *
   * @param accountId - Account ID from native app
   */
  disconnect(accountId: string): Promise<void>

  /**
   * Fetch recent emails from IMAP account
   *
   * @param accountId - Account ID from native app
   * @param options - Fetch options
   * @returns Array of email messages
   */
  fetchEmails(accountId: string, options?: FetchOptions): Promise<EmailMessage[]>
}

/**
 * Options for fetching emails from IMAP
 */
export interface FetchOptions {
  /** Only fetch emails newer than this date */
  newerThan?: Date
  /** Maximum number of emails to fetch */
  maxResults?: number
  /** Only fetch unseen (unread) emails */
  unseenOnly?: boolean
}

/**
 * Email message from IMAP server
 *
 * Simplified schema matching InboxBridge protocol (PROTOCOL.md § 3.8)
 */
export interface EmailMessage {
  /** IMAP UID (unique within mailbox) */
  uid: number
  /** ISO 8601 timestamp */
  date: string
  /** Sender email address */
  from: string
  /** Email subject */
  subject: string
  /** First ~200 chars of plain text body */
  snippet: string
}
