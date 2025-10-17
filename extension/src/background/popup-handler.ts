/**
 * Popup Message Handler
 *
 * Handles messages from the popup UI, providing fast access to cached
 * verification codes and magic links, as well as lock status.
 */

import { PopupCacheManager } from './popup-cache'
import { KeyManager } from '@/lib/crypto/key-manager'
import { getSavedSalt } from '@/lib/crypto/lock-state'
import type { PopupRequest, PopupResponse } from '@/shared/popup-messages'
import { EmailPollingService } from '@/lib/services/email-polling-service'
import { createAdaptersFromMailboxes } from '@/lib/services/provider-adapter'
import { StorageFactory } from '@/lib/storage/storage-factory'
import { migrateToEncrypted, migrateToPlaintext } from '@/lib/storage/migration'

/**
 * Broadcast lock state change to all extension contexts
 */
async function broadcastLockStateChange(keyManager: KeyManager): Promise<void> {
  const isInitialized = await keyManager.isInitialized()
  const isUnlocked = keyManager.isUnlocked()

  try {
    await chrome.runtime.sendMessage({
      type: 'LOCK_STATE_CHANGED',
      status: {
        isInitialized,
        isUnlocked,
        isLoading: false,
      },
    })
  } catch (error) {
    // Ignore errors if no listeners (e.g., popup closed)
    console.debug('[PopupHandler] No listeners for lock state broadcast:', error)
  }
}

/**
 * Handles popup-related messages from the UI
 */
export class PopupMessageHandler {
  constructor(
    private readonly cacheManager: PopupCacheManager,
    private readonly keyManager: KeyManager
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

        case 'GET_LOCK_STATUS': {
          // Return full lock status with initialization state
          const isInitialized = await this.keyManager.isInitialized()
          const isUnlocked = this.keyManager.isUnlocked()

          return {
            success: true,
            isInitialized,
            isUnlocked,
          }
        }

        case 'INITIALIZE_PASSWORD': {
          try {
            // Migrate plaintext data to encrypted storage
            console.log('[PopupHandler] Migrating data to encrypted storage...')
            const migrationResult = await migrateToEncrypted(request.password)

            if (!migrationResult.success) {
              return {
                success: false,
                error: `Migration failed: ${migrationResult.error}`
              }
            }

            console.log(
              `[PopupHandler] Migration complete: ${migrationResult.mailboxesMigrated} mailboxes, ${migrationResult.codesMigrated} codes`
            )

            // Initialize password protection with the new password
            await this.keyManager.initialize(request.password)

            // Broadcast state change to all contexts
            await broadcastLockStateChange(this.keyManager)

            return { success: true }
          } catch (error) {
            return {
              success: false,
              error: error instanceof Error ? error.message : String(error),
            }
          }
        }

        case 'UNLOCK': {
          try {
            // Get saved salt
            const salt = await getSavedSalt()
            if (!salt) {
              return { success: false, error: 'Extension not initialized' }
            }

            // Attempt unlock
            const unlocked = await this.keyManager.unlock(request.password, salt)

            if (unlocked) {
              // Broadcast state change to all contexts
              await broadcastLockStateChange(this.keyManager)
              return { success: true }
            } else {
              return { success: false, error: 'Wrong PIN' }
            }
          } catch (error) {
            return {
              success: false,
              error: error instanceof Error ? error.message : String(error),
            }
          }
        }

        case 'LOCK': {
          try {
            this.keyManager.lock()
            // Broadcast state change to all contexts
            await broadcastLockStateChange(this.keyManager)
            return { success: true }
          } catch (error) {
            return {
              success: false,
              error: error instanceof Error ? error.message : String(error),
            }
          }
        }

        case 'CHANGE_PASSWORD': {
          try {
            // Get saved salt
            const salt = await getSavedSalt()
            if (!salt) {
              return { success: false, error: 'Extension not initialized' }
            }

            // Verify current password
            const verified = await this.keyManager.verifyPassword(
              request.currentPassword,
              salt
            )

            if (!verified) {
              return { success: false, error: 'Current PIN is incorrect' }
            }

            // Initialize with new password (replaces old)
            await this.keyManager.initialize(request.newPassword)

            // Broadcast state change to all contexts
            await broadcastLockStateChange(this.keyManager)
            return { success: true }
          } catch (error) {
            return {
              success: false,
              error: error instanceof Error ? error.message : String(error),
            }
          }
        }

        case 'DISABLE_PASSWORD': {
          try {
            // Get saved salt
            const salt = await getSavedSalt()
            if (!salt) {
              return { success: false, error: 'Extension not initialized' }
            }

            // Verify password
            const verified = await this.keyManager.verifyPassword(request.password, salt)

            if (!verified) {
              return { success: false, error: 'PIN is incorrect' }
            }

            // Migrate encrypted data to plaintext storage
            console.log('[PopupHandler] Migrating data to plaintext storage...')
            const migrationResult = await migrateToPlaintext(request.password)

            if (!migrationResult.success) {
              return {
                success: false,
                error: `Migration failed: ${migrationResult.error}`
              }
            }

            console.log(
              `[PopupHandler] Migration complete: ${migrationResult.mailboxesMigrated} mailboxes, ${migrationResult.codesMigrated} codes`
            )

            // Clear all lock-related data
            const { clearLockData } = await import('@/lib/crypto/lock-state')
            await clearLockData()

            // Clear the key verification data
            await chrome.storage.local.remove('keyVerification')

            // Clear password protection flag in KeyManager
            this.keyManager.clearPasswordProtection()

            // Broadcast state change to all contexts
            await broadcastLockStateChange(this.keyManager)

            return { success: true }
          } catch (error) {
            return {
              success: false,
              error: error instanceof Error ? error.message : String(error),
            }
          }
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
            const keyManager = this.keyManager

            // Check if locked
            if (keyManager.isLocked()) {
              return { success: false, error: 'Extension is locked. Please unlock first.' }
            }

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
            if (this.keyManager.isLocked()) {
              return { success: false, error: 'Extension is locked' }
            }

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
