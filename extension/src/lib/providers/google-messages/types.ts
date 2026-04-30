/**
 * Google Messages for Web - Shared Types
 *
 * Type definitions for the Google Messages SMS provider.
 * Used by the content script scraper, background adapter, and setup flow.
 */

export interface MessagePreview {
  conversationId: string
  senderName: string
  previewText: string
  isUnread: boolean
  timestamp?: string
}

export interface ScrapeResult {
  status: 'paired' | 'unpaired' | 'not-ready'
  previews: MessagePreview[]
}

export interface PendingGmSetup {
  phoneNumber: string
  tabId?: number
  owned: boolean
  startedAt: number
}
