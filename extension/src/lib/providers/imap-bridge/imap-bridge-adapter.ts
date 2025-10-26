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
  constructor(
    private accountId: string,
    private accountEmail: string
  ) {}

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
      // Handle errors gracefully - don't crash polling
      // Return empty array to allow other providers (Gmail, Outlook) to continue
      if (error instanceof NativeMessagingError) {
        switch (error.code) {
          case NativeErrorCode.ACCOUNT_NOT_FOUND:
            console.error(
              `[IMAPBridgeAdapter] Account ${this.accountId} not found on backend`
            )
            break
          case NativeErrorCode.KEYCHAIN_UNAVAILABLE:
            console.error(
              `[IMAPBridgeAdapter] Keychain unavailable for ${this.accountId}`
            )
            break
          case NativeErrorCode.IMAP_AUTH:
            console.error(`[IMAPBridgeAdapter] Auth failed for ${this.accountEmail}`)
            break
          case NativeErrorCode.IMAP_NETWORK:
            console.warn(`[IMAPBridgeAdapter] Network error for ${this.accountEmail}`)
            break
          case NativeErrorCode.PORT_DISCONNECTED:
            console.error('[IMAPBridgeAdapter] InboxBridge not running')
            break
          case NativeErrorCode.TIMEOUT:
            console.warn(
              `[IMAPBridgeAdapter] Timeout fetching emails for ${this.accountEmail}`
            )
            break
          default:
            console.error('[IMAPBridgeAdapter] Unknown error:', error.message)
        }
      } else {
        console.error('[IMAPBridgeAdapter] Unexpected error:', error)
      }

      // Return empty array to allow other providers to continue
      return []
    }
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
      subject: msg.subject,
      from: msg.from,
      receivedEpochMs: new Date(msg.date).getTime(),
      text: msg.snippet, // Use snippet as text body (first ~200 chars)
      html: undefined, // IMAP doesn't provide HTML in initial fetch
    }
  }
}
