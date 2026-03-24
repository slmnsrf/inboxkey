/**
 * Popup Message Handler
 *
 * Handles messages from the popup UI, providing fast access to cached
 * verification codes and magic links.
 */

import { PopupCacheManager } from './popup-cache'
import { ErrorStateManager } from './error-state-manager'
import { SyncRateLimiter } from './sync-rate-limiter'
import type { PopupRequest, PopupResponse, CodeItem, LinkItem } from '@/shared/popup-messages'
import { EmailPollingService } from '@/lib/services/email-polling-service'
import { createAdaptersFromMailboxes } from '@/lib/services/provider-adapter'
import { SeenMessageStore } from '@/lib/services/seen-message-store'
import { StorageFactory } from '@/lib/storage/storage-factory'
import { setBadgeCount, setBadgeSyncError, clearBadge } from '@/contents/badge-manager'
import { BADGE_EXPIRY_MS } from '@/lib/popup/popup-config'
import { sortByPriority } from '@/lib/popup/popup-priority'
import { separateItems } from '@/lib/popup/popup-filters'
import { GmailAPIClient } from '@/lib/providers/gmail/gmail-api'
import { IMAPBridgeAdapter } from '@/lib/providers/imap-bridge/imap-bridge-adapter'
import { getMessagesTabManager } from '@/lib/providers/google-messages/tab-manager'

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
          // Pure read path: never mutate cache on popup open
          const cache = await this.cacheManager.getCache()

          // Apply domain rescoring as a non-persistent projection
          if (request.currentDomain && cache.items?.length) {
            const now = Date.now()
            const projectedItems = sortByPriority(
              [...cache.items], // shallow copy
              now,
              request.currentDomain
            )
            // Derive legacy arrays from projected items
            const { codes: codeItems, links: linkItems } = separateItems(projectedItems)
            const projectedCodes = codeItems.map((item) =>
              this.cacheManager.convertPopupItemToLegacyCode(item as CodeItem, now, request.currentDomain)
            )
            const projectedLinks = linkItems.map((item) =>
              this.cacheManager.convertPopupItemToLegacyLink(item as LinkItem)
            )

            return {
              success: true,
              data: {
                ...cache,
                items: projectedItems,
                codes: projectedCodes,
                magicLinks: projectedLinks,
              },
            }
          }

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
            // No sessionId: google-messages adapters are excluded (SMS is session-scoped)
            const adapters = await createAdaptersFromMailboxes(storage)

            // SMS-only guard: if all mailboxes are google-messages, no adapters
            // will be created for popup sync. Return existing cache gracefully.
            if (adapters.length === 0 && mailboxes.every(m => m.providerId === 'google-messages')) {
              const cache = await this.cacheManager.getCache()
              return { success: true, data: cache }
            }

            // Run email polling (v2 API) - share seenStore to persist across syncs
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

            // Build user-friendly error descriptions from adapter results
            const sanitizeReason = (error: string): string => {
              const lower = error.toLowerCase()
              if (lower.includes('401') || lower.includes('auth') || lower.includes('token'))
                return 'Authentication expired'
              if (lower.includes('network') || lower.includes('fetch') || lower.includes('connection'))
                return 'Network error'
              if (lower.includes('429') || lower.includes('rate'))
                return 'Rate limited'
              if (lower.includes('timeout'))
                return 'Request timed out'
              if (lower.includes('inboxbridge') || lower.includes('native'))
                return 'InboxBridge unavailable'
              return 'Sync error'
            }

            const describeFailedAdapters = (failed: typeof adapterResults) => {
              return failed.map(r => {
                const mailbox = mailboxes.find(m => m.id === r.mailboxId)
                const label = mailbox?.email || r.mailboxId
                const reason = sanitizeReason(r.error || 'Unknown error')
                return `${label}: ${reason}`
              })
            }

            // Record per-mailbox success/failure for grouped error banners
            for (const result of adapterResults) {
              const mailbox = mailboxes.find(m => m.id === result.mailboxId)
              if (result.success) {
                await this.errorManager.recordSuccess(result.mailboxId)
              } else {
                const reason = sanitizeReason(result.error || 'Unknown error')
                await this.errorManager.recordFailure(
                  new Error(reason),
                  result.mailboxId,
                  mailbox?.email
                )
              }
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

            // Any failure = failure response (prevents green flash / banner dismissal)
            if (allFailed) {
              const descriptions = describeFailedAdapters(adapterResults.filter(r => !r.success))
              return {
                success: false,
                error: `Sync failed: ${descriptions.join('; ')}`,
              }
            }

            if (!allSucceeded) {
              // Partial failure: some data was retrieved but not all mailboxes synced
              const failedAdapters = adapterResults.filter(r => !r.success)
              const descriptions = describeFailedAdapters(failedAdapters)
              return {
                success: false,
                error: `Partial sync failure: ${descriptions.join('; ')}`,
              }
            }

            return {
              success: true,
              data: cache,
            }
          } catch (error) {
            console.warn('[PopupHandler] Manual sync failed:', error)

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
          // Return current sync errors array for grouped error banner
          const errors = await this.errorManager.getCurrentErrors()
          return {
            success: true,
            errors
          }
        }

        case 'MARK_CODES_SEEN': {
          try {
            await this.cacheManager.markCodesSeen()
            clearBadge()
            return { success: true }
          } catch (error) {
            console.warn('[PopupHandler] MARK_CODES_SEEN failed:', error)
            return {
              success: false,
              error: error instanceof Error ? error.message : String(error),
            }
          }
        }

        case 'TEST_MAILBOX_CONNECTION': {
          const { mailboxId } = request as { type: string; mailboxId: string }
          const storage = await StorageFactory.create()
          const mailboxes = await storage.getMailboxes()
          const mailbox = mailboxes.find(m => m.id === mailboxId)

          if (!mailbox) {
            return { success: false, error: 'Account not found' }
          }

          // Helper: record test result on mailbox so UI status updates
          const recordResult = async (ok: boolean, errorMsg?: string) => {
            if (ok) {
              await storage.updateMailbox(mailboxId, {
                lastSyncedAt: Date.now(),
                lastSyncError: undefined,
              })
            } else if (errorMsg) {
              await storage.updateMailbox(mailboxId, {
                lastSyncError: errorMsg,
              })
            }
          }

          try {
            if (mailbox.providerId === 'gmail') {
              if (!mailbox.accessToken) {
                const err = 'No access token. Please reconnect your Gmail account.'
                await recordResult(false, err)
                return { success: false, error: err }
              }
              const api = new GmailAPIClient()
              await api.getUserProfile(mailbox.accessToken)
              await recordResult(true)
              return { success: true }
            }

            if (mailbox.providerId === 'imap-bridge') {
              const adapter = new IMAPBridgeAdapter(
                mailbox.imapAccountId || '',
                mailbox.email,
                mailbox.id
              )
              await adapter.listRecent({
                sinceEpochMs: Date.now() - 10 * 60 * 1000,
                max: 1,
              })
              await recordResult(true)
              return { success: true }
            }

            if (mailbox.providerId === 'google-messages') {
              const tabManager = getMessagesTabManager()
              const tab = await tabManager.ensureTab()

              // Wait for page to be ready before checking pairing
              // Poll until we get a definitive answer (not just empty DOM)
              let pairingStatus: 'paired' | 'unpaired' = 'unpaired'
              const maxWait = 15000
              const start = Date.now()
              while (Date.now() - start < maxWait) {
                try {
                  // Check if the conversations list OR QR code is present
                  const results = await chrome.scripting.executeScript({
                    target: { tabId: tab.tabId },
                    func: () => {
                      if (document.querySelector('mws-conversations-list')) return 'paired'
                      if (document.querySelector('mw-qr-code')) return 'unpaired'
                      if (document.querySelector('[data-e2e-welcome-page-container]')) return 'unpaired'
                      return 'loading' // Neither element yet -- still loading
                    },
                  })
                  const result = results?.[0]?.result as string
                  if (result === 'paired' || result === 'unpaired') {
                    pairingStatus = result
                    break
                  }
                } catch { /* tab not ready */ }
                await new Promise(r => setTimeout(r, 1000))
              }
              // Close tab if extension opened it (user-owned tabs stay open)
              await tabManager.closeIfOwned()
              if (pairingStatus === 'paired') {
                await recordResult(true)
                return { success: true }
              }
              const err = 'Google Messages session has expired. Please re-pair your device.'
              await recordResult(false, 'session_expired')
              return { success: false, error: err }
            }

            return { success: false, error: 'Unknown provider' }
          } catch (error) {
            const raw = error instanceof Error ? error.message : String(error)
            let userMsg: string
            if (raw.includes('401') || raw.includes('auth') || raw.includes('token') || raw.includes('unauthorized')) {
              userMsg = 'Access expired. Please reconnect your account.'
            } else if (raw.includes('network') || raw.includes('fetch') || raw.includes('TIMEOUT') || raw.includes('Failed to fetch')) {
              userMsg = 'Network error. Please check your internet connection.'
            } else if (raw.includes('PORT_DISCONNECTED') || raw.includes('native') || raw.includes('Native host has exited')) {
              userMsg = 'InboxBridge is not running. Please start it and try again.'
            } else {
              userMsg = raw
            }
            await recordResult(false, userMsg).catch(() => {})
            return { success: false, error: userMsg }
          }
        }

        case 'GET_MAILBOXES': {
          try {
            const storage = await StorageFactory.create()
            const mailboxes = await storage.getMailboxes()

            // Return without sensitive tokens (include IMAP/GM metadata)
            return {
              success: true,
              mailboxes: mailboxes.map((m) => ({
                id: m.id,
                providerId: m.providerId,
                email: m.email,
                addedAt: m.addedAt,
                lastSyncedAt: m.lastSyncedAt,
                lastSyncError: m.lastSyncError,
                tokenExpiresAt: m.tokenExpiresAt,
                ...(m.providerId === 'imap-bridge' ? {
                  imapServer: m.imapServer,
                  imapPort: m.imapPort,
                } : {}),
                ...(m.providerId === 'google-messages' ? {
                  gmPhoneNumber: m.gmPhoneNumber,
                } : {}),
              })),
            }
          } catch (error) {
            console.warn('[PopupHandler] GET_MAILBOXES failed:', error)
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
      console.warn('[PopupHandler] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
}
