/**
 * Unit tests for scrapeMessages()
 *
 * Uses happy-dom (configured globally in vitest.config.ts) to simulate a
 * messages.google.com DOM. Each test rebuilds document.body from scratch so
 * tests are completely isolated from one another.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { scrapeMessages } from '@/lib/providers/google-messages/scrape-messages'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Replace document.body content with the provided HTML string. */
function setBody(html: string): void {
  document.body.innerHTML = html
}

/**
 * Build an mws-conversation-list-item element with the given sender name,
 * preview text, and optional unread indicator.
 *
 * The inner structure intentionally avoids fixed class names to mirror the
 * unpredictable real-world Google Messages DOM.
 */
function makeConversationItem(
  sender: string,
  preview: string,
  isUnread = false
): string {
  const unreadAttr = isUnread
    ? '<span data-e2e-is-unread="true"></span>'
    : ''
  return `
    <mws-conversation-list-item>
      ${unreadAttr}
      <mws-conversation-snippet>
        <span>${sender}</span>
        <span>${preview}</span>
      </mws-conversation-snippet>
    </mws-conversation-list-item>
  `
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('scrapeMessages()', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  // -------------------------------------------------------------------------
  // Status: unpaired
  // -------------------------------------------------------------------------

  describe('unpaired state', () => {
    it('returns unpaired status with empty previews when QR code element is present', () => {
      setBody('<mw-qr-code></mw-qr-code>')

      const result = scrapeMessages()

      expect(result).toEqual({ status: 'unpaired', previews: [] })
    })

    it('returns unpaired even when a conversation list also exists alongside the QR code', () => {
      // Edge case: transient rendering where both elements are briefly present
      setBody(`
        <mw-qr-code></mw-qr-code>
        <mws-conversations-list></mws-conversations-list>
      `)

      const result = scrapeMessages()

      expect(result.status).toBe('unpaired')
      expect(result.previews).toHaveLength(0)
    })
  })

  // -------------------------------------------------------------------------
  // Status: not-ready
  // -------------------------------------------------------------------------

  describe('not-ready state', () => {
    it('returns not-ready status with empty previews when no conversation list exists', () => {
      setBody('<div>Loading...</div>')

      const result = scrapeMessages()

      expect(result).toEqual({ status: 'not-ready', previews: [] })
    })

    it('returns not-ready on completely empty document body', () => {
      setBody('')

      const result = scrapeMessages()

      expect(result).toEqual({ status: 'not-ready', previews: [] })
    })
  })

  // -------------------------------------------------------------------------
  // Status: paired -- empty list
  // -------------------------------------------------------------------------

  describe('paired state -- empty conversation list', () => {
    it('returns paired status with empty previews when list exists but has no items', () => {
      setBody('<mws-conversations-list></mws-conversations-list>')

      const result = scrapeMessages()

      expect(result).toEqual({ status: 'paired', previews: [] })
    })
  })

  // -------------------------------------------------------------------------
  // Status: paired -- with conversations
  // -------------------------------------------------------------------------

  describe('paired state -- with conversations', () => {
    it('extracts senderName from first leaf text node of each item', () => {
      setBody(`
        <mws-conversations-list>
          ${makeConversationItem('Alice', 'Your code is 123456')}
        </mws-conversations-list>
      `)

      const result = scrapeMessages()

      expect(result.status).toBe('paired')
      expect(result.previews[0].senderName).toBe('Alice')
    })

    it('extracts previewText from second leaf text node of each item', () => {
      setBody(`
        <mws-conversations-list>
          ${makeConversationItem('Bob', 'Your verification code: 654321')}
        </mws-conversations-list>
      `)

      const result = scrapeMessages()

      expect(result.previews[0].previewText).toBe('Your verification code: 654321')
    })

    it('marks item as unread when data-e2e-is-unread attribute is present', () => {
      setBody(`
        <mws-conversations-list>
          ${makeConversationItem('Charlie', 'OTP: 111222', true)}
        </mws-conversations-list>
      `)

      const result = scrapeMessages()

      expect(result.previews[0].isUnread).toBe(true)
    })

    it('marks item as read when data-e2e-is-unread attribute is absent', () => {
      setBody(`
        <mws-conversations-list>
          ${makeConversationItem('Dave', 'Old message', false)}
        </mws-conversations-list>
      `)

      const result = scrapeMessages()

      expect(result.previews[0].isUnread).toBe(false)
    })

    it('assigns sequential conversationId values starting at conv-0', () => {
      setBody(`
        <mws-conversations-list>
          ${makeConversationItem('Sender A', 'Preview A')}
          ${makeConversationItem('Sender B', 'Preview B')}
          ${makeConversationItem('Sender C', 'Preview C')}
        </mws-conversations-list>
      `)

      const result = scrapeMessages()

      expect(result.previews[0].conversationId).toBe('conv-0')
      expect(result.previews[1].conversationId).toBe('conv-1')
      expect(result.previews[2].conversationId).toBe('conv-2')
    })

    it('sets timestamp to undefined for all previews', () => {
      setBody(`
        <mws-conversations-list>
          ${makeConversationItem('Eve', 'Code: 999888')}
        </mws-conversations-list>
      `)

      const result = scrapeMessages()

      expect(result.previews[0].timestamp).toBeUndefined()
    })

    it('extracts all 6 items when exactly 6 conversation items are present', () => {
      const items = Array.from({ length: 6 }, (_, i) =>
        makeConversationItem(`Sender ${i}`, `Preview ${i}`)
      ).join('')

      setBody(`<mws-conversations-list>${items}</mws-conversations-list>`)

      const result = scrapeMessages()

      expect(result.previews).toHaveLength(6)
    })

    it('limits to first 6 items when more than 6 conversation items exist', () => {
      const items = Array.from({ length: 10 }, (_, i) =>
        makeConversationItem(`Sender ${i}`, `Preview ${i}`)
      ).join('')

      setBody(`<mws-conversations-list>${items}</mws-conversations-list>`)

      const result = scrapeMessages()

      expect(result.previews).toHaveLength(6)
      expect(result.previews[5].senderName).toBe('Sender 5')
    })

    it('returns correct data for multiple conversations with mixed unread states', () => {
      setBody(`
        <mws-conversations-list>
          ${makeConversationItem('Frank', 'Code: 001122', true)}
          ${makeConversationItem('Grace', 'Hello there', false)}
          ${makeConversationItem('Hank', 'OTP: 334455', true)}
        </mws-conversations-list>
      `)

      const result = scrapeMessages()

      expect(result.status).toBe('paired')
      expect(result.previews).toHaveLength(3)

      expect(result.previews[0]).toMatchObject({
        conversationId: 'conv-0',
        senderName: 'Frank',
        previewText: 'Code: 001122',
        isUnread: true,
      })
      expect(result.previews[1]).toMatchObject({
        conversationId: 'conv-1',
        senderName: 'Grace',
        previewText: 'Hello there',
        isUnread: false,
      })
      expect(result.previews[2]).toMatchObject({
        conversationId: 'conv-2',
        senderName: 'Hank',
        previewText: 'OTP: 334455',
        isUnread: true,
      })
    })
  })

  // -------------------------------------------------------------------------
  // Tolerance for unusual inner structures
  // -------------------------------------------------------------------------

  describe('tolerance for unusual inner structures', () => {
    it('falls back to "Unknown" sender when item has no leaf text nodes', () => {
      setBody(`
        <mws-conversations-list>
          <mws-conversation-list-item></mws-conversation-list-item>
        </mws-conversations-list>
      `)

      const result = scrapeMessages()

      expect(result.previews[0].senderName).toBe('Unknown')
    })

    it('uses empty string for previewText when item has only one leaf text node', () => {
      setBody(`
        <mws-conversations-list>
          <mws-conversation-list-item>
            <span>Only Sender</span>
          </mws-conversation-list-item>
        </mws-conversations-list>
      `)

      const result = scrapeMessages()

      expect(result.previews[0].senderName).toBe('Only Sender')
      expect(result.previews[0].previewText).toBe('')
    })

    it('correctly reads text when item uses a .text-content class element', () => {
      // Alternative inner markup some versions of Google Messages emit
      setBody(`
        <mws-conversations-list>
          <mws-conversation-list-item>
            <div class="text-content">
              <span>Ivan</span>
              <span>Your magic link</span>
            </div>
          </mws-conversation-list-item>
        </mws-conversations-list>
      `)

      const result = scrapeMessages()

      expect(result.previews[0].senderName).toBe('Ivan')
      expect(result.previews[0].previewText).toBe('Your magic link')
    })
  })
})
