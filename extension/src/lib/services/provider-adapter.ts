/**
 * Provider Adapter
 *
 * Bridges v1 architecture (Storage + Providers) with v2 EmailPollingService adapter pattern.
 * This allows the v2 polling service to work with existing storage and provider implementations.
 */

import type { IStorage } from '@/lib/storage/storage-interface'
import type { IEmailProvider } from '@/lib/providers/provider-interface'
import { GmailProvider } from '@/lib/providers/gmail/gmail-provider'
import { OutlookProvider } from '@/lib/providers/outlook/outlook-provider'
import { IMAPBridgeAdapter } from '@/lib/providers/imap-bridge/imap-bridge-adapter'
import type { Mailbox } from '@/lib/storage/schema'

// Re-export types that v2 email-polling-service needs
export type ProviderId = 'gmail' | 'outlook' | 'imap-bridge'

export interface EmailLike {
  id: string
  provider: ProviderId
  subject?: string
  from?: string
  receivedEpochMs?: number
  text?: string
  html?: string
  _meta?: Record<string, unknown>
}

export interface ProviderAdapter {
  id: ProviderId
  listRecent(params: {
    sinceEpochMs: number
    max: number
    keywordHint?: string
  }): Promise<EmailLike[]>
}

/**
 * Adapter that bridges v1 mailbox/provider/storage architecture
 * with v2 EmailPollingService's adapter interface.
 */
export class StorageProviderAdapter implements ProviderAdapter {
  constructor(
    private storage: IStorage,
    private provider: IEmailProvider,
    private mailbox: Mailbox
  ) {}

  get id(): ProviderId {
    return this.mailbox.providerId as ProviderId
  }

  async listRecent(params: {
    sinceEpochMs: number
    max: number
    keywordHint?: string
  }): Promise<EmailLike[]> {
    // Token refresh logic (from v1)
    const now = Date.now()
    const REFRESH_BUFFER_MS = 5 * 60 * 1000
    let accessToken = this.mailbox.accessToken

    if (now >= this.mailbox.tokenExpiresAt - REFRESH_BUFFER_MS) {
      console.log(`[StorageProviderAdapter] Token expiring soon for ${this.mailbox.email}, refreshing...`)
      try {
        accessToken = await this.refreshToken()
      } catch (error) {
        throw new Error(
          `Token refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      }
    }

    // Fetch emails using v1 provider interface
    console.log(`[StorageProviderAdapter] Fetching emails for ${this.mailbox.email}`)

    let emails
    try {
      emails = await this.provider.fetchEmails(accessToken, {
        newerThan: new Date(params.sinceEpochMs),
        maxResults: params.max,
      })
    } catch (error) {
      // Check for 401 authentication error and retry with refreshed token
      const errorMessage = error instanceof Error ? error.message : String(error)
      if (errorMessage.includes('401') || errorMessage.includes('UNAUTHENTICATED')) {
        console.log(`[StorageProviderAdapter] Got 401 error, forcing token refresh for ${this.mailbox.email}`)
        accessToken = await this.refreshToken()

        // Retry with new token
        emails = await this.provider.fetchEmails(accessToken, {
          newerThan: new Date(params.sinceEpochMs),
          maxResults: params.max,
        })
      } else {
        throw error
      }
    }

    // Convert to EmailLike format that v2 expects
    return emails.map(email => ({
      id: email.id,
      provider: this.id,
      subject: email.subject,
      from: email.from.email,
      receivedEpochMs: email.date.getTime(),
      text: email.bodyText,
      html: email.bodyHtml,
    }))
  }

  private async refreshToken(): Promise<string> {
    // For Gmail, pass the old access token so it can be removed from cache
    // For other providers, pass the refresh token
    const tokenToPass = this.id === 'gmail'
      ? this.mailbox.accessToken
      : (this.mailbox.refreshToken || '')

    const tokens = await this.provider.refreshTokens(tokenToPass)
    const expiresAt = Date.now() + tokens.expiresIn * 1000

    // Update mailbox with new tokens
    await this.storage.updateMailbox(this.mailbox.id, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken || this.mailbox.refreshToken, // Keep old refresh token if new one is empty (Gmail)
      tokenExpiresAt: expiresAt,
    })

    console.log(`[StorageProviderAdapter] Token refreshed for ${this.mailbox.email}`)
    return tokens.accessToken
  }
}

/**
 * Factory function to create adapters from all configured mailboxes.
 * This bridges the v1 storage layer with v2 adapter pattern.
 */
export async function createAdaptersFromMailboxes(
  storage: IStorage
): Promise<ProviderAdapter[]> {
  const mailboxes = await storage.getMailboxes()

  return mailboxes.map(mailbox => {
    if (mailbox.providerId === 'imap-bridge') {
      // IMAP provider: use IMAPBridgeAdapter (no OAuth provider needed)
      return new IMAPBridgeAdapter(
        mailbox.imapAccountId || '',
        mailbox.email
      )
    } else {
      // OAuth provider: use StorageProviderAdapter with Gmail/Outlook provider
      const provider = mailbox.providerId === 'gmail'
        ? new GmailProvider()
        : new OutlookProvider()

      return new StorageProviderAdapter(storage, provider, mailbox)
    }
  })
}
