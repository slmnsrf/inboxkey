/**
 * IMAP Bridge Provider Adapter
 *
 * Adapter for IMAP email access via Native Messaging (InboxBridge).
 * Unlike OAuth providers, IMAP credentials are stored in OS keychain
 * by the native app, not in extension storage.
 */

import type { ProviderAdapter, EmailLike } from '../../services/provider-adapter'

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
   *
   * TODO Phase 3: Implement Native Messaging calls to InboxBridge
   */
  async listRecent(params: {
    sinceEpochMs: number
    max: number
    keywordHint?: string
  }): Promise<EmailLike[]> {
    // TODO: Implement in Phase 3 - Native Messaging Integration
    //
    // Implementation plan:
    // 1. Connect to native app via chrome.runtime.connectNative('com.inboxkey.bridge')
    // 2. Send mail.fetchRecent request (PROTOCOL.md § 3.8):
    //    {
    //      "v": 1,
    //      "id": "uuid-...",
    //      "method": "mail.fetchRecent",
    //      "params": {
    //        "accountId": this.accountId,
    //        "sinceMinutes": Math.ceil((Date.now() - params.sinceEpochMs) / 60000),
    //        "limit": params.max
    //      }
    //    }
    // 3. Wait for response with messages array
    // 4. Convert each message to EmailLike format via convertToEmailLike()
    // 5. Handle errors (connection lost, auth failure, etc.)

    throw new Error('IMAPBridgeAdapter.listRecent not yet implemented')
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
    mailbox: string
    date: string
    from: string
    subject: string
    snippet: string
  }): EmailLike {
    return {
      id: `${this.accountId}:${msg.mailbox}:${msg.uid}`, // Composite key: accountId:mailbox:uid (IMAP UIDs only unique per mailbox)
      provider: 'imap-bridge',
      subject: msg.subject,
      from: msg.from,
      receivedEpochMs: new Date(msg.date).getTime(),
      text: msg.snippet, // Use snippet as text body (first ~200 chars)
      html: undefined, // IMAP doesn't provide HTML in initial fetch
    }
  }
}
