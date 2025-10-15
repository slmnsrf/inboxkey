/**
 * IMAP Bridge Provider Adapter
 *
 * Adapter for IMAP email access via Native Messaging (InboxBridge).
 * Unlike OAuth providers, IMAP credentials are stored in OS keychain
 * by the native app, not in extension storage.
 */

import type { ProviderAdapter, EmailLike } from '../../services/provider-adapter'
import {
  NativeMessagingClient,
  type FetchRecentResult,
  NativeErrorCode,
  NativeMessagingError,
} from '../../native-messaging'

/**
 * Provider adapter for IMAP Bridge (Native Messaging)
 *
 * Key differences from OAuth providers:
 * - No token refresh (password-based auth via native app)
 * - Credentials stored in OS keychain, not extension storage
 * - Uses Native Messaging for all operations
 */
export class IMAPBridgeAdapter implements ProviderAdapter {
  public readonly mailboxId: string

  constructor(
    private accountId: string,
    private accountEmail: string,
    mailboxId: string
  ) {
    this.mailboxId = mailboxId
  }

  get id(): 'imap-bridge' {
    return 'imap-bridge'
  }

  /**
   * Fetch recent emails from IMAP account via Native Messaging
   *
   * @param params - Fetch parameters
   * @returns Array of emails matching criteria
   */
  async listRecent(params: {
    sinceEpochMs: number
    max: number
    keywordHint?: string
  }): Promise<EmailLike[]> {
    const client = NativeMessagingClient.getInstance()

    // Convert sinceEpochMs to minutes (InboxBridge protocol uses minutes-ago, not epoch)
    const sinceMinutes = Math.ceil((Date.now() - params.sinceEpochMs) / 60000)

    try {
      // Call mail.fetchRecent RPC method
      const response = await client.request<FetchRecentResult>('mail.fetchRecent', {
        accountId: this.accountId,
        sinceMinutes,
        limit: params.max,
      })

      // Convert IMAP messages to EmailLike format
      return response.messages.map((msg) => this.convertToEmailLike(msg))
    } catch (error) {
      // Map errors to user-facing messages, then re-throw so pollOnce() can
      // record this adapter as failed in adapterResults with a meaningful message.
      const userMessage = this.getUserFacingError(error)
      console.warn(`[IMAPBridgeAdapter] ${userMessage}`)

      // Re-throw with user-facing message so it propagates to lastSyncError
      throw new Error(userMessage)
    }
  }

  /**
   * Map raw errors to user-facing messages for UI display (lastSyncError).
   */
  private getUserFacingError(error: unknown): string {
    if (error instanceof NativeMessagingError) {
      switch (error.code) {
        case NativeErrorCode.ACCOUNT_NOT_FOUND:
          return 'Account not found in InboxBridge. Reconnect in settings.'
        case NativeErrorCode.KEYCHAIN_UNAVAILABLE:
          return 'OS keychain unavailable. Restart your computer or check permissions.'
        case NativeErrorCode.IMAP_AUTH:
          return 'Login failed. Check your email password.'
        case NativeErrorCode.IMAP_NETWORK:
          return 'Could not reach mail server. Check your internet connection.'
        case NativeErrorCode.PORT_DISCONNECTED:
          return 'InboxBridge is not running. Start it and try again.'
        case NativeErrorCode.TIMEOUT:
          return 'Mail server took too long to respond.'
        case NativeErrorCode.TLS_HANDSHAKE:
          return 'Secure connection failed. Check server settings.'
        case NativeErrorCode.RATE_LIMIT_EXCEEDED:
          return 'Too many requests. Try again in a few minutes.'
        case NativeErrorCode.CONNECTION_LIMIT:
          return 'Too many connections to mail server. Close other email clients.'
        default:
          return `Sync failed: ${error.message}`
      }
    }
    return error instanceof Error ? error.message : 'Unknown sync error'
  }

  /**
   * Convert IMAP message from native app to EmailLike format
   *
   * Maps InboxBridge protocol message format (PROTOCOL.md § 3.8) to
   * EmailLike interface used by email-polling-service.
   *
   * @param msg - Raw message from native app
   * @returns EmailLike object for internal use
   */
  private convertToEmailLike(msg: {
    uid: number
    mailbox?: string
    date: string
    from: string
    subject: string
    snippet: string
  }): EmailLike {
    const mailbox = msg.mailbox || 'INBOX' // Default to INBOX if not specified
    return {
      id: `${this.accountId}:${mailbox}:${msg.uid}`, // Composite key: accountId:mailbox:uid (IMAP UIDs only unique per mailbox)
      provider: 'imap-bridge',
      mailboxId: this.mailboxId,
      subject: msg.subject,
      from: msg.from,
      receivedEpochMs: new Date(msg.date).getTime(),
      text: msg.snippet, // Use snippet as text body (first ~200 chars)
      html: undefined, // IMAP doesn't provide HTML in initial fetch
    }
  }
}
