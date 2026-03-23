/**
 * MessagesProviderAdapter
 *
 * Adapts the Google Messages tab manager (SMS scraping) into the
 * ProviderAdapter interface consumed by EmailPollingService.
 *
 * Responsibilities:
 * - Translate MessagePreview[] into EmailLike[] (subject = '', html = undefined)
 * - Enforce per-session poll budget (max 5 polls via tab manager)
 * - Convert relative timestamp strings ("2 min", "Yesterday") to epoch ms
 * - Generate stable IDs for dedup (conversationId + previewText hash)
 * - Gracefully return [] on any tab manager failure
 */

import type { ProviderAdapter, EmailLike, ProviderId } from '@/lib/services/email-polling-service'
import type { MessagesTabManager } from './tab-manager'

/** Maximum message previews returned per poll (keeps payload small). */
const MAX_PREVIEWS = 4

export class MessagesProviderAdapter implements ProviderAdapter {
  readonly id: ProviderId = 'google-messages'
  readonly mailboxId: string

  constructor(
    private readonly tabManager: MessagesTabManager,
    mailboxId: string,
    private readonly sessionId?: string
  ) {
    this.mailboxId = mailboxId
  }

  async listRecent(_params: {
    sinceEpochMs: number
    max: number
    keywordHint?: string
  }): Promise<EmailLike[]> {
    // Check poll budget (skip if no sessionId -- popup sync excluded)
    if (this.sessionId) {
      const count = this.tabManager.getPollCount(this.sessionId)
      if (count >= 5) {
        return [] // Budget exhausted for this session
      }
    }

    try {
      const tab = await this.tabManager.ensureTab()
      const previews = await this.tabManager.scrapeRecentPreviews(tab.tabId)

      // Increment poll count AFTER successful scrape
      if (this.sessionId) {
        const newCount = this.tabManager.incrementPollCount(this.sessionId)
        if (newCount >= 5) {
          await this.tabManager.closeIfOwned()
        }
      }

      // Translate MessagePreview[] -> EmailLike[]
      return previews.slice(0, MAX_PREVIEWS).map(preview => ({
        id: `gm-${this.hashPreview(preview.conversationId, preview.previewText)}`,
        provider: 'google-messages' as ProviderId,
        mailboxId: this.mailboxId,
        subject: '',
        from: preview.senderName,
        text: preview.previewText,
        html: undefined,
        receivedEpochMs: this.approximateTimestamp(preview.timestamp),
      }))
    } catch (error) {
      console.warn('[MessagesProviderAdapter] listRecent failed:', error)
      // Re-throw so EmailPollingService records this as a failed adapter
      // (EmailPollingService catches per-adapter and records { success: false })
      throw error
    }
  }

  /** Convert relative time strings to approximate epoch timestamps. */
  private approximateTimestamp(timestamp?: string): number {
    if (!timestamp) return Date.now()
    const t = timestamp.toLowerCase().trim()

    // "N min" or "N min ago"
    const minMatch = t.match(/^(\d+)\s*min/)
    if (minMatch) return Date.now() - parseInt(minMatch[1], 10) * 60_000

    // "N hr" or "N hour" or "N hours ago"
    const hrMatch = t.match(/^(\d+)\s*h(?:r|our)/)
    if (hrMatch) return Date.now() - parseInt(hrMatch[1], 10) * 3_600_000

    // "yesterday"
    if (t.includes('yesterday')) return Date.now() - 86_400_000

    // "just now" or "now"
    if (t === 'now' || t === 'just now') return Date.now()

    // Time like "1:15 PM" -- treat as today
    if (/^\d{1,2}:\d{2}\s*(am|pm)?$/i.test(t)) return Date.now()

    // Date like "Mar 16" or other unparseable -- default to now
    return Date.now()
  }

  /** Generate a stable hash for dedup (same conversationId + previewText = same ID). */
  private hashPreview(conversationId: string, previewText: string): string {
    const str = `${conversationId}:${previewText}`
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash |= 0 // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36)
  }
}
