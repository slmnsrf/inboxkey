/**
 * Gmail Provider
 *
 * Implements IEmailProvider for Gmail using OAuth 2.0 PKCE
 */

import type {
  IChromeIdentityProvider,
  EmailMessage,
  FetchOptions,
} from '../provider-interface'
import { GmailAuth } from './gmail-auth'
import { GmailAPIClient } from './gmail-api'
import { GmailParser } from './gmail-parser'
import { GMAIL_CONFIG } from './config'

export class GmailProvider implements IChromeIdentityProvider {
  readonly providerId = 'gmail' as const
  readonly displayName = 'Gmail'

  private auth: GmailAuth
  private api: GmailAPIClient
  private parser: GmailParser

  constructor() {
    this.auth = new GmailAuth(GMAIL_CONFIG)
    this.api = new GmailAPIClient()
    this.parser = new GmailParser()
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshTokens(refreshToken: string) {
    return await this.auth.refreshTokens(refreshToken)
  }

  /**
   * Fetch recent emails
   */
  async fetchEmails(
    accessToken: string,
    options: FetchOptions = {}
  ): Promise<EmailMessage[]> {
    // Build Gmail search query
    const query = this.buildSearchQuery(options)

    console.log('[GmailProvider] fetchEmails called:', {
      query,
      maxResults: options.maxResults || 10,
      newerThan: options.newerThan,
    })

    // List message IDs
    const messages = await this.api.listMessages(accessToken, {
      maxResults: options.maxResults || 10,
      query,
    })

    console.log('[GmailProvider] Message IDs received:', messages.length)

    if (messages.length === 0) {
      console.log('[GmailProvider] No messages found, returning empty array')
      return []
    }

    // Fetch full message details
    console.log('[GmailProvider] Fetching full message details for', messages.length, 'messages')
    const gmailMessages = await this.api.getMessages(
      accessToken,
      messages.map((m) => m.id)
    )

    console.log('[GmailProvider] Full messages fetched:', gmailMessages.length)

    // Parse to EmailMessage format
    const parsed = gmailMessages.map((msg) => this.parser.parseMessage(msg))
    console.log('[GmailProvider] Parsed emails:', {
      count: parsed.length,
      subjects: parsed.map(e => e.subject.substring(0, 50))
    })

    return parsed
  }

  /**
   * Revoke tokens (logout)
   */
  async revokeTokens(accessToken: string) {
    await this.auth.revokeTokens(accessToken)
  }

  /**
   * Build Gmail search query from fetch options
   */
  private buildSearchQuery(options: FetchOptions): string {
    const queryParts: string[] = []

    // Note: 'is:unread' was previously prepended here. It caused codes
    // to be missed whenever the user had Gmail open in another tab, a
    // filter auto-marked the message, or a mark-all-as-read extension
    // touched the inbox before we polled. The time window below plus
    // maxResults is enough to keep the query tight.

    // Add date filter. Gmail's `newer_than:` operator accepts only
    // `d` (days), `m` (months), and `y` (years) - there is NO minute
    // suffix. Emitting `Nm` was silently fetching the last N months
    // of mail and relying on the service-side receivedEpochMs filter
    // to drop stale results, which worked for correctness but wasted
    // huge amounts of Gmail API quota per poll.
    //
    // Sub-day precision must be enforced client-side by the caller
    // (EmailPollingService.pollOnce filters `msg.receivedEpochMs <
    // since`). Server-side we can only narrow to whole days, so emit
    // a 1-day floor and let the client filter do the minute-level cut.
    if (options.newerThan) {
      const daysAgo = Math.max(
        1,
        Math.ceil((Date.now() - options.newerThan.getTime()) / (1000 * 60 * 60 * 24))
      )
      queryParts.push(`newer_than:${daysAgo}d`)
    }

    // Add custom query
    if (options.query) {
      queryParts.push(options.query)
    }

    return queryParts.join(' ')
  }
}
