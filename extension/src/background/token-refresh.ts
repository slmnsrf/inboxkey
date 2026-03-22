/**
 * Background Token Refresh
 *
 * Periodically refreshes OAuth tokens for Outlook accounts before they expire.
 * Gmail tokens are managed by Chrome Identity API and don't need this.
 */

import { StorageFactory } from '@/lib/storage/storage-factory'
import { OutlookProvider } from '@/lib/providers/outlook/outlook-provider'

const ALARM_NAME = 'token-refresh'
const ALARM_INTERVAL_MINUTES = 45
const REFRESH_BUFFER_MS = 10 * 60 * 1000 // 10 minutes before expiry

/**
 * Register the periodic token refresh alarm and its listener.
 * Call once from the service worker entry point.
 */
export function registerTokenRefreshAlarm(): void {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_INTERVAL_MINUTES })

  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === ALARM_NAME) {
      await refreshExpiringTokens()
    }
  })
}

/**
 * Check all Outlook mailboxes and refresh tokens that are about to expire.
 * Safe to call at any time -- skips mailboxes that don't need refresh.
 */
export async function refreshExpiringTokens(): Promise<void> {
  try {
    const storage = await StorageFactory.create()
    const mailboxes = await storage.getMailboxes()
    const now = Date.now()
    const provider = new OutlookProvider()

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
        })

        console.log(`[TokenRefresh] Refreshed token for ${mailbox.email}`)
      } catch (error) {
        console.error(`[TokenRefresh] Failed to refresh ${mailbox.email}:`, error)
        // Don't mark as expired -- the next watch session will surface the error
      }
    }
  } catch (error) {
    console.error('[TokenRefresh] Failed to run token refresh:', error)
  }
}
