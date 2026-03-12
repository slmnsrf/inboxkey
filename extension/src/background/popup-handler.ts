/**
 * Popup Message Handler
 *
 * Handles messages from the popup UI, providing fast access to cached
 * verification codes and magic links.
 */

import { PopupCacheManager } from './popup-cache'
import { ErrorStateManager } from './error-state-manager'
import { SyncRateLimiter } from './sync-rate-limiter'
import type { PopupRequest, PopupResponse } from '@/shared/popup-messages'
import { EmailPollingService } from '@/lib/services/email-polling-service'
import { createAdaptersFromMailboxes } from '@/lib/services/provider-adapter'
import { SeenMessageStore } from '@/lib/services/seen-message-store'
import { StorageFactory } from '@/lib/storage/storage-factory'
import { setBadgeCount, setBadgeSyncError, clearBadge } from '@/contents/badge-manager'
import { BADGE_EXPIRY_MS } from '@/lib/popup/popup-config'

/**
 * Handles popup-related messages from the UI
 */
export class PopupMessageHandler {
  private readonly rateLimiter = new SyncRateLimiter()
  private readonly seenStore = new SeenMessageStore()

  constructor(
    private readonly cacheManager: PopupCacheManager,
    private readonly errorManager: ErrorStateManager
  ) {}

  /**
   * Handle a popup request and return the appropriate response
   */
  async handleMessage(request: PopupRequest): Promise<PopupResponse> {
    try {
      switch (request.type) {
        case 'GET_POPUP_DATA': {
          const currentDomain = request.currentDomain

          // Refresh cache with domain context if we have one
          if (currentDomain) {
            const storage = await StorageFactory.create()
            const mailboxes = await storage.getMailboxes()
            const cache = await this.cacheManager.getCache()

            // Re-score with domain context (use existing codes)
            const storedCodes = cache.codes.map(c => ({
              code: c.code,
              timestamp: c.receivedAt,
              source: c.source,
              used: !!c.usedAt,
              siteMatch: undefined,
              mailboxId: undefined,
            }))

            await this.cacheManager.updateWithNewCodes(
              storedCodes,
              mailboxes.length,
              mailboxes,
              currentDomain
            )
          }

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
            // Check rate limit
            if (!await this.rateLimiter.canSync()) {
              const remaining = await this.rateLimiter.getTimeRemaining()
              return {
                success: false,
                error: `Please wait ${Math.ceil(remaining / 1000)}s before syncing again`
              }
            }

            // Record sync started
            await this.rateLimiter.recordSync()

            const startTime = Date.now()

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

            // Run email polling (v2 API) — share seenStore to persist across syncs
            const pollingService = new EmailPollingService(adapters, this.seenStore)
            const { candidates, adapterResults } = await pollingService.pollOnce()

            console.log(`[PopupHandler] Manual sync found ${candidates.length} candidates`)

            // Convert v2 candidates to StoredCode format for PopupCache (ephemeral only)
            const ephemeralCodes = candidates.flatMap(candidate => {
              // Find mailbox by ID (multi-account safe)
              const mailbox = mailboxes.find(m => m.id === candidate.mailboxId)
              if (!mailbox) return []

              const results = []

              if (candidate.code) {
                results.push({
                  code: candidate.code.value,
                  timestamp: candidate.receivedEpochMs || Date.now(),
                  source: `${candidate.from || 'Unknown'} - ${candidate.subject || 'No subject'}`,
                  used: false,
                  siteMatch: undefined,
                  mailboxId: mailbox.id,
                })
                console.log(`[PopupHandler] Found code: (redacted ${candidate.code.value.length} chars)`)
              }

              if (candidate.link) {
                results.push({
                  code: `magic-link:${candidate.link.href}`,
                  timestamp: candidate.receivedEpochMs || Date.now(),
                  source: `${candidate.from || 'Unknown'} - ${candidate.subject || 'No subject'}`,
                  used: false,
                  siteMatch: candidate.link.domain,
                  mailboxId: mailbox.id,
                })
                console.log(`[PopupHandler] Found magic link from: ${candidate.link.domain}`)
              }

              return results
            })

            console.log(`[PopupHandler] Found ${ephemeralCodes.length} new items (ephemeral only)`)

            // Update lastSyncedAt only for mailboxes whose adapter succeeded
            const now = Date.now()
            const successfulMailboxIds = new Set(
              adapterResults.filter(r => r.success).map(r => r.mailboxId)
            )
            let updatedCount = 0
            for (const mailbox of mailboxes) {
              if (successfulMailboxIds.has(mailbox.id)) {
                await storage.updateMailbox(mailbox.id, { lastSyncedAt: now })
                updatedCount++
              }
            }
            console.log(`[PopupHandler] Updated lastSyncedAt for ${updatedCount}/${mailboxes.length} mailboxes`)

            // Update popup cache with ephemeral codes (session storage only)
            await this.cacheManager.updateWithNewCodes(ephemeralCodes, mailboxes.length, mailboxes)

            // Return updated cache
            const cache = await this.cacheManager.getCache()

            // Update error state based on per-adapter results
            const allSucceeded = adapterResults.every(r => r.success)
            const allFailed = adapterResults.every(r => !r.success)

            if (allSucceeded) {
              await this.errorManager.recordSuccess()
            } else if (allFailed) {
              const firstError = adapterResults.find(r => r.error)?.error || 'All adapters failed'
              await this.errorManager.recordFailure(new Error(firstError))
            } else {
              // Partial failure: some adapters succeeded, some failed
              const failedAdapters = adapterResults.filter(r => !r.success)
              const failedIds = failedAdapters.map(r => r.mailboxId).join(', ')
              await this.errorManager.recordFailure(
                new Error(`Partial sync failure: ${failedAdapters.length} adapter(s) failed (${failedIds})`)
              )
            }

            // Update badge with unseen code count (only fresh codes < 10 min old)
            const unseenCount = cache.codes.filter((c) =>
              !c.seenAt &&
              !c.usedAt &&
              (now - c.receivedAt) < BADGE_EXPIRY_MS
            ).length
            if (unseenCount > 0) {
              setBadgeCount(unseenCount)
            } else {
              clearBadge()
            }

            // Enforce minimum duration (3 seconds) for visual feedback
            const elapsed = Date.now() - startTime
            const MIN_DURATION = 3000
            if (elapsed < MIN_DURATION) {
              const delay = MIN_DURATION - elapsed
              console.log(`[PopupHandler] Sync completed in ${elapsed}ms, waiting ${delay}ms for minimum duration`)
              await new Promise(resolve => setTimeout(resolve, delay))
            }

            return {
              success: true,
              data: cache,
            }
          } catch (error) {
            console.error('[PopupHandler] Manual sync failed:', error)

            // Track sync failures for error badge
            await this.errorManager.recordFailure(error as Error)

            // Show error badge if needed
            if (await this.errorManager.shouldShowBadge()) {
              setBadgeSyncError()
            } else {
              clearBadge()
            }

            const errorMsg = error instanceof Error ? error.message : String(error)
            return {
              success: false,
              error: errorMsg,
            }
          }
        }

        case 'GET_SYNC_ERROR': {
          // Return current sync error state for error banner
          const error = await this.errorManager.getCurrentError()
          return {
            success: true,
            error
          }
        }

        case 'MARK_CODES_SEEN': {
          // Mark all codes as seen (set seenAt timestamp)
          try {
            const cache = await this.cacheManager.getCache()
            if (cache.codes.length > 0) {
              const now = Date.now()
              cache.codes.forEach((code) => {
                if (!code.seenAt) {
                  code.seenAt = now
                }
              })
              // Save updated cache
              await chrome.storage.session.set({ 'inboxkey.popup_cache': cache })

              // Clear badge since all codes are now seen
              clearBadge()
            }
            return { success: true }
          } catch (error) {
            console.error('[PopupHandler] MARK_CODES_SEEN failed:', error)
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

            // Return without sensitive tokens (include IMAP metadata for reconnect)
            return {
              success: true,
              mailboxes: mailboxes.map((m) => ({
                id: m.id,
                providerId: m.providerId,
                email: m.email,
                addedAt: m.addedAt,
                lastSyncedAt: m.lastSyncedAt,
                tokenExpiresAt: m.tokenExpiresAt,
                ...(m.providerId === 'imap-bridge' ? {
                  imapServer: m.imapServer,
                  imapPort: m.imapPort,
                } : {}),
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
