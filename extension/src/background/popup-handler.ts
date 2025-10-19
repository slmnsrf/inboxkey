/**
 * Popup Message Handler
 *
 * Handles messages from the popup UI, providing fast access to cached
 * verification codes and magic links.
 */

import { PopupCacheManager } from './popup-cache'
import type { PopupRequest, PopupResponse } from '@/shared/popup-messages'
import { EmailPollingService } from '@/lib/services/email-polling-service'
import { createAdaptersFromMailboxes } from '@/lib/services/provider-adapter'
import { StorageFactory } from '@/lib/storage/storage-factory'

/**
 * Handles popup-related messages from the UI
 */
export class PopupMessageHandler {
  constructor(
    private readonly cacheManager: PopupCacheManager
  ) {}

  /**
   * Handle a popup request and return the appropriate response
   */
  async handleMessage(request: PopupRequest): Promise<PopupResponse> {
    try {
      switch (request.type) {
        case 'GET_POPUP_DATA': {
          const cache = await this.cacheManager.getCache()
          return { success: true, data: cache }
        }

        case 'MARK_CODE_USED': {
          await this.cacheManager.markCodeUsed(request.code)
          const cache = await this.cacheManager.getCache()
          return { success: true, data: cache }
        }

        case 'MARK_LINK_OPENED': {
          await this.cacheManager.markLinkOpened(request.url)
          const cache = await this.cacheManager.getCache()
          return { success: true, data: cache }
        }

        case 'TRIGGER_SYNC': {
          try {
            // Get storage for current mode
            const storage = await StorageFactory.create()

            // Get mailboxes
            const mailboxes = await storage.getMailboxes()

            if (mailboxes.length === 0) {
              return {
                success: false,
                error: 'No mailboxes configured',
              }
            }

            // Create adapters from mailboxes (v2 pattern)
            const adapters = await createAdaptersFromMailboxes(storage)

            // Run email polling (v2 API)
            const pollingService = new EmailPollingService(adapters)
            const candidates = await pollingService.pollOnce()

            console.log(`[PopupHandler] Manual sync found ${candidates.length} candidates`)

            // Convert v2 candidates to StoredCode format and save to storage
            let newCodesCount = 0
            for (const candidate of candidates) {
              // Find mailbox for this provider
              const mailbox = mailboxes.find(m => m.providerId === candidate.provider)
              if (!mailbox) continue

              if (candidate.code) {
                // Save OTP code
                const storedCode = {
                  code: candidate.code.value,
                  timestamp: candidate.receivedEpochMs || Date.now(),
                  source: `${candidate.from || 'Unknown'} - ${candidate.subject || 'No subject'}`,
                  used: false,
                  siteMatch: undefined,
                  mailboxId: mailbox.id,
                }

                // Check for duplicates
                const recentCodes = await storage.getRecentCodes(50)
                const isDuplicate = recentCodes.some(c => c.code === storedCode.code)

                if (!isDuplicate) {
                  await storage.addCode(storedCode)
                  newCodesCount++
                  console.log(`[PopupHandler] Saved code: ${storedCode.code}`)
                }
              }

              if (candidate.link) {
                // Save magic link (with "magic-link:" prefix for compatibility)
                const storedLink = {
                  code: `magic-link:${candidate.link.href}`,
                  timestamp: candidate.receivedEpochMs || Date.now(),
                  source: `${candidate.from || 'Unknown'} - ${candidate.subject || 'No subject'}`,
                  used: false,
                  siteMatch: candidate.link.domain,
                  mailboxId: mailbox.id,
                }

                // Check for duplicates
                const recentCodes = await storage.getRecentCodes(50)
                const isDuplicate = recentCodes.some(c => c.code === storedLink.code)

                if (!isDuplicate) {
                  await storage.addCode(storedLink)
                  newCodesCount++
                  console.log(`[PopupHandler] Saved magic link from: ${candidate.link.domain}`)
                }
              }
            }

            console.log(`[PopupHandler] Stored ${newCodesCount} new items`)

            // Update lastSyncedAt for all mailboxes after successful sync
            const now = Date.now()
            for (const mailbox of mailboxes) {
              await storage.updateMailbox(mailbox.id, { lastSyncedAt: now })
            }
            console.log(`[PopupHandler] Updated lastSyncedAt for ${mailboxes.length} mailboxes`)

            // Update popup cache with recent codes from storage
            const recentCodes = await storage.getRecentCodes(10)
            await this.cacheManager.updateWithNewCodes(recentCodes, mailboxes.length, mailboxes)

            // Return updated cache
            const cache = await this.cacheManager.getCache()

            return {
              success: true,
              data: cache,
            }
          } catch (error) {
            console.error('[PopupHandler] Manual sync failed:', error)
            return {
              success: false,
              error: error instanceof Error ? error.message : String(error),
            }
          }
        }

        case 'GET_MAILBOXES': {
          try {
            const storage = await StorageFactory.create()
            const mailboxes = await storage.getMailboxes()

            // Return without sensitive tokens
            return {
              success: true,
              mailboxes: mailboxes.map((m) => ({
                id: m.id,
                providerId: m.providerId,
                email: m.email,
                addedAt: m.addedAt,
                lastSyncedAt: m.lastSyncedAt,
                tokenExpiresAt: m.tokenExpiresAt,
              })),
            }
          } catch (error) {
            console.error('[PopupHandler] GET_MAILBOXES failed:', error)
            return {
              success: false,
              error: error instanceof Error ? error.message : String(error),
            }
          }
        }

        default: {
          // TypeScript exhaustiveness check ensures all request types are handled
          return { success: false, error: `Unknown request type: ${(request as any).type}` }
        }
      }
    } catch (error) {
      console.error('[PopupHandler] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
}
