/**
 * Outlook Provider
 *
 * Implements IEmailProvider for Microsoft Outlook/365 using OAuth 2.0 PKCE
 */

import type {
  IPKCEProvider,
  EmailMessage,
  FetchOptions,
} from '../provider-interface'
import { OutlookAuth } from './outlook-auth'
import { OutlookAPIClient } from './outlook-api'
import { OutlookParser } from './outlook-parser'
import { OUTLOOK_CONFIG } from './config'

export class OutlookProvider implements IPKCEProvider {
  readonly providerId = 'outlook' as const
  readonly displayName = 'Microsoft Outlook'

  private auth: OutlookAuth
  private api: OutlookAPIClient
  private parser: OutlookParser

  constructor() {
    this.auth = new OutlookAuth(OUTLOOK_CONFIG)
    this.api = new OutlookAPIClient()
    this.parser = new OutlookParser()
  }

  /**
   * Start OAuth PKCE authorization flow
   */
  async startAuth() {
    return await this.auth.startAuth()
  }

  /**
   * Complete OAuth flow by exchanging authorization code for tokens
   */
  async completeAuth(params: {
    code: string
    codeVerifier: string
    state: string
  }) {
    return await this.auth.completeAuth(params)
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
    // Build API options from FetchOptions
    const apiOptions = {
      maxResults: options.maxResults || 10,
      unreadOnly: true, // Default to unread like Gmail
      query: options.query,
      newerThan: options.newerThan,
    }

    // List message IDs
    const messages = await this.api.listMessages(accessToken, apiOptions)

    if (messages.length === 0) {
      return []
    }

    // Fetch full message details (parallel)
    const graphMessages = await this.api.getMessages(
      accessToken,
      messages.map((m) => m.id)
    )

    // Parse to EmailMessage format
    return graphMessages.map((msg) => this.parser.parseMessage(msg))
  }

  /**
   * Revoke tokens (logout)
   */
  async revokeTokens(accessToken: string) {
    await this.auth.revokeTokens(accessToken)
  }
}
