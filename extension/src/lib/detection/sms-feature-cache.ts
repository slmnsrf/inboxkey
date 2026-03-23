/**
 * SMS Feature Cache
 *
 * Synchronous module-level boolean that tracks whether any Google Messages
 * mailbox is connected. Consumed by the Tier 1 and Tier 2 SMS rejection
 * gates to allow SMS-only fields when the user has an SMS source.
 *
 * Performance: The cache is a plain boolean read -- 0ms in the hot path.
 * Hydration is async but runs once before the first detection scan.
 *
 * Storage listener keeps the cache in sync after initial hydration
 * (e.g., user adds/removes a Google Messages account in settings).
 */

import { StorageFactory } from '@/lib/storage/storage-factory'

/** True when at least one google-messages mailbox exists in storage. */
export let smsFeatureEnabledCache = false

/**
 * Reset cache to false (test-only).
 * Production code should never call this.
 */
export function _resetSmsCacheForTest(): void {
  smsFeatureEnabledCache = false
}

/**
 * Read mailboxes from storage and set the cache.
 * Must be awaited before the first detection run to prevent
 * a race where SMS fields get rejected before the cache loads.
 */
export async function hydrateSmsCache(): Promise<void> {
  // IMPORTANT: Use StorageFactory, not raw chrome.storage.local.get('mailboxes').
  // The plaintext backend stores mailboxes under 'mailboxes_plain', not 'mailboxes'.
  try {
    const storage = await StorageFactory.create()
    const mailboxes = await storage.getMailboxes()
    smsFeatureEnabledCache = mailboxes.some(
      m => m.providerId === 'google-messages'
    )
  } catch {
    smsFeatureEnabledCache = false
  }
}

// Keep in sync after initial hydration.
// Listens for changes to the plaintext mailboxes storage key.
chrome.storage.onChanged.addListener((changes) => {
  if (changes.mailboxes_plain) {
    hydrateSmsCache()
  }
})
