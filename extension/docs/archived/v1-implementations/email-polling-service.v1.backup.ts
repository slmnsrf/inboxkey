/**
 * Email Polling Service
 *
 * Coordinates email fetching, extraction, and storage for all connected mailboxes.
 * This service is called by SessionController during polling cycles.
 */

import type { IStorage } from '@/lib/storage/storage-interface'
import type { Mailbox, StoredCode } from '@/lib/storage/schema'
import type { IEmailProvider } from '@/lib/providers/provider-interface'
import { GmailProvider } from '@/lib/providers/gmail/gmail-provider'
import { OutlookProvider } from '@/lib/providers/outlook/outlook-provider'
import { EmailExtractor } from '@/lib/extraction/extractor'
import type { ExtractionResult } from '@/lib/extraction/extraction-types'
import type { EmailMessage } from '@/lib/providers/provider-interface'
import type { PopupCacheManager } from '@/background/popup-cache'

interface PollResult {
  newCodesCount: number
  mailboxesPolled: number
  errors: Array<{ mailboxId: string; error: string }>
}

interface GmailConfig {
  clientId: string
  redirectUri?: string
  scopes?: string[]
}

/**
 * Email Polling Service
 *
 * Fetches emails from all connected mailboxes, extracts verification codes,
 * and saves them to encrypted storage.
 */
export class EmailPollingService {
  private extractor = new EmailExtractor()

  constructor(
    private readonly storage: IStorage,
    private readonly gmailConfig: GmailConfig,
    private readonly popupCache?: PopupCacheManager // Optional for testing
  ) {}

  /**
   * Create provider instance based on provider ID
   */
  private createProvider(providerId: 'gmail' | 'outlook'): IEmailProvider {
    switch (providerId) {
      case 'gmail':
        return new GmailProvider()
      case 'outlook':
        return new OutlookProvider()
      default:
        throw new Error(`Unknown provider: ${providerId}`)
    }
  }

  /**
   * Poll all connected mailboxes for new verification codes.
   * Returns the number of new codes found.
   */
  async pollAllMailboxes(): Promise<PollResult> {
    const result: PollResult = {
      newCodesCount: 0,
      mailboxesPolled: 0,
      errors: [],
    }

    let mailboxes: Mailbox[] = []
    try {
      mailboxes = await this.storage.getMailboxes()
    } catch (error) {
      console.error('[EmailPollingService] Failed to retrieve mailboxes:', error)
      result.errors.push({
        mailboxId: 'all',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      return result
    }

    if (mailboxes.length === 0) {
      console.log('[EmailPollingService] No mailboxes configured')
      return result
    }

    // Poll each mailbox concurrently
    const pollPromises = mailboxes.map(async (mailbox) => {
      try {
        const codesFound = await this.pollMailbox(mailbox)
        result.newCodesCount += codesFound
        result.mailboxesPolled++
      } catch (error) {
        console.error(
          `[EmailPollingService] Failed to poll mailbox ${mailbox.id}:`,
          error
        )
        result.errors.push({
          mailboxId: mailbox.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    })

    await Promise.allSettled(pollPromises)

    console.log(
      `[EmailPollingService] Poll complete: ${result.newCodesCount} codes from ${result.mailboxesPolled} mailboxes`
    )

    // Update popup cache after successful polling
    if (this.popupCache && result.newCodesCount > 0) {
      try {
        const recentCodes = await this.storage.getRecentCodes(10)
        await this.popupCache.updateWithNewCodes(recentCodes, mailboxes.length, mailboxes)
        console.log('[EmailPollingService] Updated popup cache with new codes')
      } catch (error) {
        console.error('[EmailPollingService] Failed to update popup cache:', error)
      }
    }

    return result
  }

  /**
   * Poll a specific mailbox for new codes.
   * Returns the number of new codes found.
   */
  private async pollMailbox(mailbox: Mailbox): Promise<number> {
    // Check if token needs refresh (with 5-minute buffer)
    const now = Date.now()
    const REFRESH_BUFFER_MS = 5 * 60 * 1000 // 5 minutes
    let accessToken = mailbox.accessToken

    if (now >= mailbox.tokenExpiresAt - REFRESH_BUFFER_MS) {
      console.log(
        `[EmailPollingService] Token expiring soon for ${mailbox.email}, refreshing...`,
        {
          expiresAt: new Date(mailbox.tokenExpiresAt).toISOString(),
          now: new Date(now).toISOString(),
          timeUntilExpiry: Math.round((mailbox.tokenExpiresAt - now) / 1000 / 60) + ' minutes'
        }
      )
      try {
        accessToken = await this.refreshMailboxToken(mailbox)
      } catch (error) {
        throw new Error(
          `Token refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      }
    }

    // Create provider and fetch emails
    const provider = this.createProvider(mailbox.providerId)
    const fiveMinutesAgo = new Date(now - 5 * 60 * 1000)

    console.log(`[EmailPollingService] Fetching emails for ${mailbox.email}`, {
      provider: mailbox.providerId,
      newerThan: fiveMinutesAgo.toISOString(),
      maxResults: 10,
      tokenExpiresAt: new Date(mailbox.tokenExpiresAt).toISOString()
    })

    let emails: EmailMessage[] = []
    try {
      emails = await provider.fetchEmails(accessToken, {
        newerThan: fiveMinutesAgo,
        maxResults: 10,
      })
    } catch (error) {
      console.error(`[EmailPollingService] Email fetch error for ${mailbox.email}:`, error)

      // Check if it's a 401 authentication error
      const errorMessage = error instanceof Error ? error.message : String(error)
      if (errorMessage.includes('401') || errorMessage.includes('UNAUTHENTICATED')) {
        console.log(`[EmailPollingService] 🔄 Got 401 error, forcing token refresh for ${mailbox.email}`)

        try {
          // Force token refresh
          accessToken = await this.refreshMailboxToken(mailbox)

          // Retry with new token
          console.log(`[EmailPollingService] 🔄 Retrying email fetch with refreshed token`)
          emails = await provider.fetchEmails(accessToken, {
            newerThan: fiveMinutesAgo,
            maxResults: 10,
          })
          console.log(`[EmailPollingService] ✅ Retry successful!`)
        } catch (retryError) {
          console.error(`[EmailPollingService] ❌ Retry also failed:`, retryError)
          throw new Error(
            `${mailbox.providerId} email fetch failed after token refresh: ${retryError instanceof Error ? retryError.message : 'Unknown error'}`
          )
        }
      } else {
        throw new Error(
          `${mailbox.providerId} email fetch failed: ${errorMessage}`
        )
      }
    }

    if (emails.length === 0) {
      console.log(`[EmailPollingService] No new emails for ${mailbox.email}`)
      // Update lastSyncedAt even if no emails
      await this.storage.updateMailbox(mailbox.id, { lastSyncedAt: now })
      return 0
    }

    console.log(
      `[EmailPollingService] Found ${emails.length} emails for ${mailbox.email}:`,
      emails.map(e => ({
        subject: e.subject.substring(0, 50),
        from: e.from.email,
        date: e.date instanceof Date ? e.date.toISOString() : 'Invalid Date'
      }))
    )

    // Extract codes from emails and track which emails have codes
    let newCodesCount = 0
    const emailsWithCodes: Array<{ email: EmailMessage; codes: StoredCode[] }> = []

    for (const email of emails) {
      console.log(`[EmailPollingService] Extracting codes from email:`, {
        subject: email.subject.substring(0, 80),
        from: email.from.email,
        date: email.date.toISOString(),
        bodyTextLength: email.bodyText?.length || 0,
        bodyHtmlLength: email.bodyHtml?.length || 0
      })

      const extractionResult = this.extractor.extract(email)
      console.log(`[EmailPollingService] Extraction result:`, {
        subject: email.subject.substring(0, 80),
        otpCandidates: extractionResult.otpCandidates.length,
        magicLinks: extractionResult.magicLinks.length,
        codes: extractionResult.otpCandidates.map(c => ({
          code: c.code,
          confidence: c.confidence,
          pattern: c.pattern
        })),
        links: extractionResult.magicLinks.map(l => ({
          domain: l.domain,
          confidence: l.confidence,
          type: l.type
        }))
      })

      const storedCodes = this.convertToStoredCodes(extractionResult, mailbox.id)

      // Track emails that have codes - BUT ONLY KEEP THE HIGHEST CONFIDENCE CODE
      if (storedCodes.length > 0) {
        // Sort by confidence and pick the best one
        const sortedCodes = [...storedCodes].sort((a, b) => {
          // Extract confidence from source if available, otherwise use default
          return 0 // We'll use the first code from extraction which is already highest confidence
        })

        // Only keep the first (highest confidence) code from this email
        const bestCode = storedCodes[0]
        console.log(`[EmailPollingService] Found ${storedCodes.length} codes in email, keeping best: "${bestCode.code}"`)

        emailsWithCodes.push({ email, codes: [bestCode] })
      }
    }

    // Only store codes from the last 3 emails that have codes
    const emailsToStore = emailsWithCodes.slice(0, 3)

    console.log(`[EmailPollingService] Found codes in ${emailsWithCodes.length} emails, storing 1 code each from ${emailsToStore.length} most recent`)

    for (const { email, codes } of emailsToStore) {
      for (const storedCode of codes) {
        // Check for duplicates
        const isDuplicate = await this.isCodeDuplicate(storedCode.code)
        if (!isDuplicate) {
          await this.storage.addCode(storedCode)
          newCodesCount++
          console.log(
            `[EmailPollingService] ✅ Saved code: ${storedCode.code} from "${email.subject.substring(0, 60)}"`
          )
        } else {
          console.log(
            `[EmailPollingService] ⏭️  Skipped duplicate code: ${storedCode.code}`
          )
        }
      }
    }

    // Update lastSyncedAt
    await this.storage.updateMailbox(mailbox.id, { lastSyncedAt: now })

    return newCodesCount
  }

  /**
   * Refresh mailbox access token and update storage.
   */
  private async refreshMailboxToken(mailbox: Mailbox): Promise<string> {
    const provider = this.createProvider(mailbox.providerId)

    try {
      // For Gmail, pass the old access token so it can be removed from cache
      // For other providers, pass the refresh token
      const tokenToPass = mailbox.providerId === 'gmail'
        ? mailbox.accessToken
        : (mailbox.refreshToken || '')

      const tokens = await provider.refreshTokens(tokenToPass)

      // Calculate new expiration time
      const expiresAt = Date.now() + tokens.expiresIn * 1000

      // Update mailbox with new tokens
      await this.storage.updateMailbox(mailbox.id, {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken || mailbox.refreshToken, // Keep old refresh token if new one is empty (Gmail)
        tokenExpiresAt: expiresAt,
      })

      console.log(`[EmailPollingService] ✅ Token refreshed for ${mailbox.email}`)

      return tokens.accessToken
    } catch (error) {
      console.error(
        `[EmailPollingService] ❌ Token refresh failed for ${mailbox.email}:`,
        error
      )
      throw error
    }
  }

  /**
   * Convert extraction results to StoredCode format.
   */
  private convertToStoredCodes(result: ExtractionResult, mailboxId: string): StoredCode[] {
    const storedCodes: StoredCode[] = []

    // Convert OTP candidates
    for (const candidate of result.otpCandidates) {
      storedCodes.push({
        code: candidate.code,
        timestamp: result.metadata.timestamp,
        source: `${result.metadata.from} - ${result.metadata.subject}`,
        used: false,
        siteMatch: undefined, // Will be set by code-matcher later
        mailboxId,
      })
    }

    // Convert magic links (store with "magic-link:" prefix)
    for (const link of result.magicLinks) {
      storedCodes.push({
        code: `magic-link:${link.url}`,
        timestamp: result.metadata.timestamp,
        source: `${result.metadata.from} - ${result.metadata.subject}`,
        used: false,
        siteMatch: link.domain,
        mailboxId,
      })
    }

    return storedCodes
  }

  /**
   * Check if code already exists in storage (deduplication).
   */
  private async isCodeDuplicate(code: string): Promise<boolean> {
    try {
      const recentCodes = await this.storage.getRecentCodes(50)
      return recentCodes.some((storedCode) => storedCode.code === code)
    } catch (error) {
      console.error('[EmailPollingService] Failed to check duplicates:', error)
      // If we can't check, assume it's not a duplicate to avoid losing codes
      return false
    }
  }
}
