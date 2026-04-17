/**
 * Gmail Provider Unit Tests
 *
 * Tests for GmailProvider: IEmailProvider implementation
 * - Provider metadata
 * - Search query building
 * - fetchEmails integration
 *
 * Note: GmailParser tests live in gmail-parser.test.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GmailProvider } from '../../src/lib/providers/gmail/gmail-provider'
import type { GmailMessage } from '../../src/lib/providers/gmail/gmail-api'

describe('GmailProvider', () => {
  let provider: GmailProvider

  beforeEach(() => {
    provider = new GmailProvider()
  })

  describe('provider metadata', () => {
    it('should have correct provider ID', () => {
      expect(provider.providerId).toBe('gmail')
    })

    it('should have correct display name', () => {
      expect(provider.displayName).toBe('Gmail')
    })
  })

  describe('buildSearchQuery', () => {
    it('should build empty query when no options provided', async () => {
      // is:unread was removed - see bug #11 (auto-read emails were being
      // missed). Time window + maxResults is sufficient to keep the
      // query tight.
      let capturedQuery = ''
      vi.spyOn(provider['api'], 'listMessages').mockImplementation(
        async (token, options) => {
          capturedQuery = options.query || ''
          return []
        }
      )

      await provider.fetchEmails('token123')

      expect(capturedQuery).toBe('')
    })

    it('should build query with newerThan filter in minute granularity', async () => {
      let capturedQuery = ''
      vi.spyOn(provider['api'], 'listMessages').mockImplementation(
        async (token, options) => {
          capturedQuery = options.query || ''
          return []
        }
      )

      const twentyMinAgo = new Date(Date.now() - 20 * 60 * 1000)
      await provider.fetchEmails('token123', { newerThan: twentyMinAgo })

      // Minute granularity: previously rounded to days (a 20-minute
      // window became newer_than:1d - full 24h fetch per poll).
      expect(capturedQuery).toMatch(/^newer_than:(20|21)m$/)
    })

    it('should build query with custom search term', async () => {
      let capturedQuery = ''
      vi.spyOn(provider['api'], 'listMessages').mockImplementation(
        async (token, options) => {
          capturedQuery = options.query || ''
          return []
        }
      )

      await provider.fetchEmails('token123', { query: 'from:sender@example.com' })

      expect(capturedQuery).toBe('from:sender@example.com')
    })

    it('should build query with all filters', async () => {
      let capturedQuery = ''
      vi.spyOn(provider['api'], 'listMessages').mockImplementation(
        async (token, options) => {
          capturedQuery = options.query || ''
          return []
        }
      )

      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000)
      await provider.fetchEmails('token123', {
        newerThan: tenMinAgo,
        query: 'subject:urgent',
      })

      expect(capturedQuery).toMatch(/newer_than:(10|11)m/)
      expect(capturedQuery).toContain('subject:urgent')
    })
  })

  describe('fetchEmails', () => {
    it('should return empty array when no messages', async () => {
      vi.spyOn(provider['api'], 'listMessages').mockResolvedValue([])

      const result = await provider.fetchEmails('token123')

      expect(result).toEqual([])
    })

    it('should fetch and parse messages', async () => {
      const mockMessages = [
        { id: 'msg1', threadId: 'thread1' },
        { id: 'msg2', threadId: 'thread2' },
      ]

      const mockGmailMessages: GmailMessage[] = [
        {
          id: 'msg1',
          threadId: 'thread1',
          labelIds: [],
          snippet: 'First message',
          internalDate: '1609459200000',
          payload: {
            headers: [
              { name: 'From', value: 'sender1@example.com' },
              { name: 'Subject', value: 'Message 1' },
            ],
            body: { data: 'Rmlyc3Q', size: 5 }, // "First"
          },
        },
        {
          id: 'msg2',
          threadId: 'thread2',
          labelIds: [],
          snippet: 'Second message',
          internalDate: '1609545600000',
          payload: {
            headers: [
              { name: 'From', value: 'sender2@example.com' },
              { name: 'Subject', value: 'Message 2' },
            ],
            body: { data: 'U2Vjb25k', size: 6 }, // "Second"
          },
        },
      ]

      vi.spyOn(provider['api'], 'listMessages').mockResolvedValue(mockMessages)
      vi.spyOn(provider['api'], 'getMessages').mockResolvedValue(
        mockGmailMessages
      )

      const result = await provider.fetchEmails('token123', { maxResults: 2 })

      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('msg1')
      expect(result[0].subject).toBe('Message 1')
      expect(result[0].bodyText).toBe('First')
      expect(result[1].id).toBe('msg2')
      expect(result[1].subject).toBe('Message 2')
      expect(result[1].bodyText).toBe('Second')
    })

    it('should respect maxResults option', async () => {
      let capturedMaxResults = 0
      vi.spyOn(provider['api'], 'listMessages').mockImplementation(
        async (token, options) => {
          capturedMaxResults = options.maxResults || 0
          return []
        }
      )

      await provider.fetchEmails('token123', { maxResults: 25 })

      expect(capturedMaxResults).toBe(25)
    })

    it('should use default maxResults of 10', async () => {
      let capturedMaxResults = 0
      vi.spyOn(provider['api'], 'listMessages').mockImplementation(
        async (token, options) => {
          capturedMaxResults = options.maxResults || 0
          return []
        }
      )

      await provider.fetchEmails('token123')

      expect(capturedMaxResults).toBe(10)
    })
  })
})
