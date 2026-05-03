/**
 * Provider Adapter
 *
 * Bridges v1 architecture (Storage + Providers) with v2 EmailPollingService adapter pattern.
 * This allows the v2 polling service to work with existing storage and provider implementations.
 */

import type { IStorage } from '@/lib/storage/storage-interface'
import { IMAPBridgeAdapter } from '@/lib/providers/imap-bridge/imap-bridge-adapter'
import { MessagesProviderAdapter } from '@/lib/providers/google-messages/adapter'
import { getMessagesTabManager } from '@/lib/providers/google-messages/tab-manager'
import { type ProviderAdapter, type EmailLike, type ProviderId } from './email-polling-service'

// Re-export for consumers that import from this module
export type { ProviderAdapter, EmailLike, ProviderId }

/**
 * Factory function to create adapters from all configured mailboxes.
 * This bridges the v1 storage layer with v2 adapter pattern.
 *
 * @param storage - Storage instance for mailbox retrieval and token refresh
 * @param sessionId - Watch session ID. When provided, google-messages adapters
 *   are included with per-session poll budgeting. When undefined (popup sync),
 *   google-messages adapters are excluded since SMS scraping requires a session.
 */
export async function createAdaptersFromMailboxes(
  storage: IStorage,
  sessionId?: string
): Promise<ProviderAdapter[]> {
  const mailboxes = await storage.getMailboxes()

  const adapters: Array<ProviderAdapter | null> = await Promise.all(
    mailboxes.map(async (mailbox): Promise<ProviderAdapter | null> => {
      if (mailbox.providerId === 'google-messages') {
        // Google Messages (SMS): requires an active watch session for poll budgeting.
        // Excluded from popup/manual sync (no sessionId) since SMS scraping is
        // session-scoped and has no meaningful "manual refresh" concept.
        if (!sessionId) return null
        return new MessagesProviderAdapter(getMessagesTabManager(), mailbox.id, sessionId)
      }

      if (mailbox.providerId === 'imap-bridge') {
        // IMAP provider: use IMAPBridgeAdapter (no OAuth provider needed)
        return new IMAPBridgeAdapter(
          mailbox.imapAccountId || '',
          mailbox.email,
          mailbox.id
        )
      }

      // Unknown provider — should be unreachable after the migration shim
      // strips legacy 'gmail' records (Task 1) and the ProviderId union is
      // narrowed (commit 2). Returning null follows the existing factory
      // pattern (see line 150 for the google-messages session-skip case)
      // rather than throwing inside Promise.all, which would fail-loud the
      // entire sync over a single corrupt record. The null filter on line 170
      // drops it silently after a console.warn for diagnostics.
      console.warn('[provider-adapter] Unknown providerId, skipping mailbox:', mailbox.providerId, mailbox.id)
      return null
    })
  )

  return adapters.filter((a): a is ProviderAdapter => a !== null)
}
