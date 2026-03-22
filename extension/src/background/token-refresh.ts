/**
 * Background Token Refresh
 *
 * Periodically refreshes OAuth tokens for Outlook accounts before they expire.
 * Gmail tokens are managed by Chrome Identity API and don't need this.
 *
 * Alarm interval is 20 minutes. With a 10-minute pre-expiry buffer and
 * Microsoft's ~60-minute token lifetime, this guarantees at least one check
 * falls within the refresh window regardless of token issue timing.
 */

import { StorageFactory } from '@/lib/storage/storage-factory'
import { OutlookProvider } from '@/lib/providers/outlook/outlook-provider'
import { ErrorStateManager } from './error-state-manager'

const ALARM_NAME = 'token-refresh'
const ALARM_INTERVAL_MINUTES = 20
const REFRESH_BUFFER_MS = 10 * 60 * 1000 // 10 minutes before expiry

/**
 * Register the periodic token refresh alarm and its listener.
 * Checks if the alarm already exists to avoid resetting the timer
 * on service worker restarts (Chrome replaces same-named alarms).
 */
export function registerTokenRefreshAlarm(): void {
  // Only create the alarm if it doesn't already exist
  chrome.alarms.get(ALARM_NAME, (existing) => {
    if (!existing) {
      chrome.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_INTERVAL_MINUTES })
      console.log(`[TokenRefresh] Alarm created (every ${ALARM_INTERVAL_MINUTES}min)`)
    }
  })

  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === ALARM_NAME) {
      await refreshExpiringTokens()
    }
  })
}

/**
 * Check all Outlook mailboxes and refresh tokens that are about to expire.
 * Safe to call at any time -- skips mailboxes that don't need refresh.
 * On successful refresh, clears stale error state for the mailbox.
 */
export async function refreshExpiringTokens(): Promise<void> {
  try {
    const storage = await StorageFactory.create()
    const mailboxes = await storage.getMailboxes()
    const now = Date.now()
    const provider = new OutlookProvider()
    const errorManager = new ErrorStateManager()

    for (const mailbox of mailboxes) {
      // Only Outlook needs background refresh (Gmail uses Chrome Identity)
      if (mailbox.providerId !== 'outlook') continue

      // Skip if token isn't expiring soon
      if (!mailbox.tokenExpiresAt || mailbox.tokenExpiresAt > now + REFRESH_BUFFER_MS) continue

      // Skip if no refresh token
      if (!mailbox.refreshToken) continue

      try {
        const tokens = await provider.refreshTokens(mailbox.refreshToken)
        const expiresAt = Date.now() + tokens.expiresIn * 1000

        await storage.updateMailbox(mailbox.id, {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken || mailbox.refreshToken,
          tokenExpiresAt: expiresAt,
          lastSyncError: undefined, // Clear stale error on successful refresh
        })

        // Clear stale popup error state for this mailbox
        await errorManager.recordSuccess(mailbox.id)

        // Clear badge if no errors remain
        const remaining = await errorManager.getCurrentErrors()
        if (remaining.length === 0) {
          chrome.action.setBadgeText({ text: '' })
        }

        console.log(`[TokenRefresh] Refreshed token for ${mailbox.email}`)
      } catch (error) {
        console.error(`[TokenRefresh] Failed to refresh ${mailbox.email}:`, error)
      }
    }
  } catch (error) {
    console.error('[TokenRefresh] Failed to run token refresh:', error)
  }
}
