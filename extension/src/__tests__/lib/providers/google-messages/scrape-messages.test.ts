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
 * Build an mws-conversation-list-item element matching the real Google Messages
 * DOM structure (verified against a live capture from 2026-03).
 *
 * Real DOM uses data-e2e-* attributes for sender, snippet, unread, and
 * mws-relative-timestamp for time display.
 */
function makeConversationItem(
  sender: string,
  preview: string,
  opts: { isUnread?: boolean; timestamp?: string } = {}
): string {
  const { isUnread = false, timestamp } = opts
  const tsEl = timestamp
    ? `<mws-relative-timestamp>${timestamp}</mws-relative-timestamp>`
    : '<mws-relative-timestamp></mws-relative-timestamp>'
  return `
    <mws-conversation-list-item>
      <div data-e2e-is-unread="${isUnread}">
        <span data-e2e-conversation-name="">${sender}</span>
        ${tsEl}
        <span data-e2e-conversation-snippet="">${preview}</span>
      </div>
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

    it('marks item as unread when data-e2e-is-unread is "true"', () => {
      setBody(`
        <mws-conversations-list>
          ${makeConversationItem('Charlie', 'OTP: 111222', { isUnread: true })}
        </mws-conversations-list>
      `)

      const result = scrapeMessages()

      expect(result.previews[0].isUnread).toBe(true)
    })

    it('marks item as read when data-e2e-is-unread is "false"', () => {
      setBody(`
        <mws-conversations-list>
          ${makeConversationItem('Dave', 'Old message', { isUnread: false })}
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

    it('extracts timestamp from mws-relative-timestamp element', () => {
      setBody(`
        <mws-conversations-list>
          ${makeConversationItem('Eve', 'Code: 999888', { timestamp: '1:15 PM' })}
        </mws-conversations-list>
      `)

      const result = scrapeMessages()

      expect(result.previews[0].timestamp).toBe('1:15 PM')
    })

    it('returns undefined timestamp when mws-relative-timestamp is empty', () => {
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
          ${makeConversationItem('Frank', 'Code: 001122', { isUnread: true })}
          ${makeConversationItem('Grace', 'Hello there', { isUnread: false })}
          ${makeConversationItem('Hank', 'OTP: 334455', { isUnread: true })}
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
  // Real-world DOM fidelity
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // Provenance fields (conversationHref + isUnread)
  // -------------------------------------------------------------------------

  describe('provenance fields', () => {
    it('captures conversationHref from list item <a href>', () => {
      // Live Google Messages renders the list item as
      //   <a class="list-item" href="/web/conversations/CgiqjpTyoePbfRIBOQ">...</a>
      setBody(`
        <mws-conversations-list>
          <mws-conversation-list-item>
            <a class="list-item" href="/web/conversations/CgABCXYZ">
              <div data-e2e-is-unread="false">
                <span data-e2e-conversation-name="">Amazon</span>
                <mws-relative-timestamp>1 min</mws-relative-timestamp>
                <span data-e2e-conversation-snippet="">code 1</span>
              </div>
            </a>
          </mws-conversation-list-item>
        </mws-conversations-list>
      `)

      const result = scrapeMessages()
      expect(result.previews[0].conversationHref).toBe('/web/conversations/CgABCXYZ')
    })

    it('omits conversationHref when no <a href> is present (older fixtures)', () => {
      setBody(`
        <mws-conversations-list>
          <mws-conversation-list-item>
            <div data-e2e-is-unread="false">
              <span data-e2e-conversation-name="">Amazon</span>
              <mws-relative-timestamp>1 min</mws-relative-timestamp>
              <span data-e2e-conversation-snippet="">code 1</span>
            </div>
          </mws-conversation-list-item>
        </mws-conversations-list>
      `)

      const result = scrapeMessages()
      expect(result.previews[0].conversationHref).toBeUndefined()
    })

    it('isUnread reflects the data-e2e-is-unread attribute', () => {
      setBody(`
        <mws-conversations-list>
          <mws-conversation-list-item>
            <div data-e2e-is-unread="true">
              <span data-e2e-conversation-name="">Amazon</span>
              <mws-relative-timestamp>Now</mws-relative-timestamp>
              <span data-e2e-conversation-snippet="">code</span>
            </div>
          </mws-conversation-list-item>
        </mws-conversations-list>
      `)

      const result = scrapeMessages()
      expect(result.previews[0].isUnread).toBe(true)
    })

    it('prefers aria-label timestamp when present, falls back to textContent', () => {
      // Older messages render as <div aria-label="24 min ago">24 min</div>
      setBody(`
        <mws-conversations-list>
          <mws-conversation-list-item>
            <div data-e2e-is-unread="false">
              <span data-e2e-conversation-name="">Amazon</span>
              <mws-relative-timestamp>
                <div aria-label="24 min ago">24 min</div>
              </mws-relative-timestamp>
              <span data-e2e-conversation-snippet="">code</span>
            </div>
          </mws-conversation-list-item>
        </mws-conversations-list>
      `)

      const result = scrapeMessages()
      // aria-label is more parser-friendly (always includes "ago" suffix
      // for older messages, more carefully localized).
      expect(result.previews[0].timestamp).toBe('24 min ago')
    })

    it('uses textContent for fresh "Now" messages (no aria-label child)', () => {
      // Fresh messages render text directly inside <mws-relative-timestamp>.
      setBody(`
        <mws-conversations-list>
          <mws-conversation-list-item>
            <div data-e2e-is-unread="true">
              <span data-e2e-conversation-name="">Amazon</span>
              <mws-relative-timestamp>Now</mws-relative-timestamp>
              <span data-e2e-conversation-snippet="">code</span>
            </div>
          </mws-conversation-list-item>
        </mws-conversations-list>
      `)

      const result = scrapeMessages()
      expect(result.previews[0].timestamp).toBe('Now')
    })
  })

  describe('real-world DOM fidelity', () => {
    it('excludes mws-conversation-list-item-menu siblings from results', () => {
      setBody(`
        <mws-conversations-list>
          <mws-conversation-list-item>
            <div data-e2e-is-unread="true">
              <span data-e2e-conversation-name="">Amazon</span>
              <mws-relative-timestamp>Mar 12</mws-relative-timestamp>
              <span data-e2e-conversation-snippet="">Your code is 482916</span>
            </div>
          </mws-conversation-list-item>
          <mws-conversation-list-item-menu aria-hidden="false">
            <span>Pin</span><span>Delete</span>
          </mws-conversation-list-item-menu>
        </mws-conversations-list>
      `)

      const result = scrapeMessages()

      expect(result.previews).toHaveLength(1)
      expect(result.previews[0].senderName).toBe('Amazon')
      expect(result.previews[0].previewText).toBe('Your code is 482916')
      expect(result.previews[0].timestamp).toBe('Mar 12')
    })
  })

  // -------------------------------------------------------------------------
  // Tolerance for unusual inner structures (fallback path)
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

    it('falls back to leaf-node traversal when data-e2e attributes are missing', () => {
      // Simulates a future Google Messages DOM change that removes data-e2e-*
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
