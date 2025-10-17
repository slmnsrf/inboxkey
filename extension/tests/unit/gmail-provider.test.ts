/**
 * Gmail Provider Unit Tests
 *
 * Tests for Gmail provider components:
 * - GmailParser: Message parsing and format conversion
 * - GmailProvider: IEmailProvider implementation
 * - Search query building
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GmailParser } from '../../src/lib/providers/gmail/gmail-parser'
import { GmailProvider } from '../../src/lib/providers/gmail/gmail-provider'
import type { GmailMessage } from '../../src/lib/providers/gmail/gmail-api'

describe('GmailParser', () => {
  let parser: GmailParser

  beforeEach(() => {
    parser = new GmailParser()
  })

  describe('parseMessage', () => {
    it('should parse basic message with text body', () => {
      const gmailMsg: GmailMessage = {
        id: 'msg123',
        threadId: 'thread123',
        labelIds: ['UNREAD', 'INBOX'],
        snippet: 'Hello world preview...',
        internalDate: '1609459200000', // 2021-01-01
        payload: {
          headers: [
            { name: 'From', value: 'sender@example.com' },
            { name: 'Subject', value: 'Test Email' },
            { name: 'Date', value: 'Fri, 01 Jan 2021 00:00:00 +0000' },
            { name: 'Content-Type', value: 'text/plain; charset="UTF-8"' },
          ],
          body: {
            data: 'SGVsbG8gd29ybGQ', // "Hello world" in base64url
            size: 11,
          },
        },
      }

      const result = parser.parseMessage(gmailMsg)

      expect(result).toEqual({
        id: 'msg123',
        from: {
          email: 'sender@example.com',
          name: undefined,
        },
        subject: 'Test Email',
        date: new Date(1609459200000),
        bodyText: 'Hello world',
        bodyHtml: undefined,
        snippet: 'Hello world preview...',
      })
    })

    it('should parse sender with name and email', () => {
      const gmailMsg: GmailMessage = {
        id: 'msg123',
        threadId: 'thread123',
        labelIds: [],
        snippet: '',
        internalDate: '1609459200000',
        payload: {
          headers: [
            { name: 'From', value: 'John Doe <john@example.com>' },
            { name: 'Subject', value: 'Test' },
          ],
          body: { size: 0 },
        },
      }

      const result = parser.parseMessage(gmailMsg)

      expect(result.from).toEqual({
        email: 'john@example.com',
        name: 'John Doe',
      })
    })

    it('should parse sender with quoted name', () => {
      const gmailMsg: GmailMessage = {
        id: 'msg123',
        threadId: 'thread123',
        labelIds: [],
        snippet: '',
        internalDate: '1609459200000',
        payload: {
          headers: [
            { name: 'From', value: '"Jane Smith" <jane@example.com>' },
            { name: 'Subject', value: 'Test' },
          ],
          body: { size: 0 },
        },
      }

      const result = parser.parseMessage(gmailMsg)

      expect(result.from).toEqual({
        email: 'jane@example.com',
        name: 'Jane Smith',
      })
    })

    it('should parse sender with only email', () => {
      const gmailMsg: GmailMessage = {
        id: 'msg123',
        threadId: 'thread123',
        labelIds: [],
        snippet: '',
        internalDate: '1609459200000',
        payload: {
          headers: [
            { name: 'From', value: 'noreply@example.com' },
            { name: 'Subject', value: 'Test' },
          ],
          body: { size: 0 },
        },
      }

      const result = parser.parseMessage(gmailMsg)

      expect(result.from).toEqual({
        email: 'noreply@example.com',
        name: undefined,
      })
    })

    it('should handle missing subject', () => {
      const gmailMsg: GmailMessage = {
        id: 'msg123',
        threadId: 'thread123',
        labelIds: [],
        snippet: '',
        internalDate: '1609459200000',
        payload: {
          headers: [{ name: 'From', value: 'sender@example.com' }],
          body: { size: 0 },
        },
      }

      const result = parser.parseMessage(gmailMsg)

      expect(result.subject).toBe('(No subject)')
    })

    it('should parse multipart message with text and html', () => {
      const gmailMsg: GmailMessage = {
        id: 'msg123',
        threadId: 'thread123',
        labelIds: [],
        snippet: '',
        internalDate: '1609459200000',
        payload: {
          headers: [
            { name: 'From', value: 'sender@example.com' },
            { name: 'Subject', value: 'Test' },
          ],
          body: { size: 0 },
          parts: [
            {
              mimeType: 'text/plain',
              body: { data: 'SGVsbG8gdGV4dA', size: 10 }, // "Hello text"
            },
            {
              mimeType: 'text/html',
              body: { data: 'PGI-SGVsbG8gSFRNTDwvYj4', size: 18 }, // "<b>Hello HTML</b>"
            },
          ],
        },
      }

      const result = parser.parseMessage(gmailMsg)

      expect(result.bodyText).toBe('Hello text')
      expect(result.bodyHtml).toBe('<b>Hello HTML</b>')
    })

    it('should parse nested multipart message', () => {
      const gmailMsg: GmailMessage = {
        id: 'msg123',
        threadId: 'thread123',
        labelIds: [],
        snippet: '',
        internalDate: '1609459200000',
        payload: {
          headers: [
            { name: 'From', value: 'sender@example.com' },
            { name: 'Subject', value: 'Test' },
          ],
          body: { size: 0 },
          parts: [
            {
              mimeType: 'multipart/alternative',
              body: { size: 0 },
              parts: [
                {
                  mimeType: 'text/plain',
                  body: { data: 'TmVzdGVkIHRleHQ', size: 11 }, // "Nested text"
                },
                {
                  mimeType: 'text/html',
                  body: { data: 'PHA-TmVzdGVkIEhUTUw8L3A-', size: 20 }, // "<p>Nested HTML</p>"
                },
              ],
            },
          ],
        },
      }

      const result = parser.parseMessage(gmailMsg)

      expect(result.bodyText).toBe('Nested text')
      expect(result.bodyHtml).toBe('<p>Nested HTML</p>')
    })

    it('should handle message with only HTML part', () => {
      const gmailMsg: GmailMessage = {
        id: 'msg123',
        threadId: 'thread123',
        labelIds: [],
        snippet: '',
        internalDate: '1609459200000',
        payload: {
          headers: [
            { name: 'From', value: 'sender@example.com' },
            { name: 'Subject', value: 'Test' },
          ],
          body: { size: 0 },
          parts: [
            {
              mimeType: 'text/html',
              body: { data: 'PGh0bWw-dGVzdDwvaHRtbD4', size: 16 }, // "<html>test</html>"
            },
          ],
        },
      }

      const result = parser.parseMessage(gmailMsg)

      expect(result.bodyText).toBeUndefined()
      expect(result.bodyHtml).toBe('<html>test</html>')
    })

    it('should handle empty message body', () => {
      const gmailMsg: GmailMessage = {
        id: 'msg123',
        threadId: 'thread123',
        labelIds: [],
        snippet: '',
        internalDate: '1609459200000',
        payload: {
          headers: [
            { name: 'From', value: 'sender@example.com' },
            { name: 'Subject', value: 'Test' },
          ],
          body: { size: 0 },
        },
      }

      const result = parser.parseMessage(gmailMsg)

      expect(result.bodyText).toBeUndefined()
      expect(result.bodyHtml).toBeUndefined()
    })

    it('should decode base64url with URL-safe characters', () => {
      const gmailMsg: GmailMessage = {
        id: 'msg123',
        threadId: 'thread123',
        labelIds: [],
        snippet: '',
        internalDate: '1609459200000',
        payload: {
          headers: [
            { name: 'From', value: 'sender@example.com' },
            { name: 'Subject', value: 'Test' },
          ],
          body: {
            // Base64url with - and _ characters (URL-safe)
            data: 'VGVzdCB3aXRoIHNwZWNpYWwgY2hhcnM6ID8gJiA-',
            size: 30,
          },
        },
      }

      const result = parser.parseMessage(gmailMsg)

      expect(result.bodyText).toBe('Test with special chars: ? & >')
    })

    it('should decode base64url without padding', () => {
      const gmailMsg: GmailMessage = {
        id: 'msg123',
        threadId: 'thread123',
        labelIds: [],
        snippet: '',
        internalDate: '1609459200000',
        payload: {
          headers: [
            { name: 'From', value: 'sender@example.com' },
            { name: 'Subject', value: 'Test' },
          ],
          body: {
            // Base64url without padding
            data: 'SGk',
            size: 2,
          },
        },
      }

      const result = parser.parseMessage(gmailMsg)

      expect(result.bodyText).toBe('Hi')
    })

    it('should handle UTF-8 characters in body', () => {
      const gmailMsg: GmailMessage = {
        id: 'msg123',
        threadId: 'thread123',
        labelIds: [],
        snippet: '',
        internalDate: '1609459200000',
        payload: {
          headers: [
            { name: 'From', value: 'sender@example.com' },
            { name: 'Subject', value: 'Test' },
          ],
          body: {
            // "Hello 世界" in base64url
            data: 'SGVsbG8g5LiW55WM',
            size: 12,
          },
        },
      }

      const result = parser.parseMessage(gmailMsg)

      expect(result.bodyText).toBe('Hello 世界')
    })

    it('should handle emoji in body', () => {
      const gmailMsg: GmailMessage = {
        id: 'msg123',
        threadId: 'thread123',
        labelIds: [],
        snippet: '',
        internalDate: '1609459200000',
        payload: {
          headers: [
            { name: 'From', value: 'sender@example.com' },
            { name: 'Subject', value: 'Test' },
          ],
          body: {
            // "Hello 👋" in base64url
            data: 'SGVsbG8g8J-Riw',
            size: 10,
          },
        },
      }

      const result = parser.parseMessage(gmailMsg)

      expect(result.bodyText).toBe('Hello 👋')
    })

    it('should handle message with attachments', () => {
      const gmailMsg: GmailMessage = {
        id: 'msg123',
        threadId: 'thread123',
        labelIds: [],
        snippet: '',
        internalDate: '1609459200000',
        payload: {
          headers: [
            { name: 'From', value: 'sender@example.com' },
            { name: 'Subject', value: 'Test' },
          ],
          body: { size: 0 },
          parts: [
            {
              mimeType: 'text/plain',
              body: { data: 'SGVsbG8', size: 5 }, // "Hello"
            },
            {
              mimeType: 'application/pdf',
              body: { size: 1024 }, // Attachment without data
            },
          ],
        },
      }

      const result = parser.parseMessage(gmailMsg)

      expect(result.bodyText).toBe('Hello')
      expect(result.bodyHtml).toBeUndefined()
    })

    it('should handle complex nested structure', () => {
      const gmailMsg: GmailMessage = {
        id: 'msg123',
        threadId: 'thread123',
        labelIds: [],
        snippet: '',
        internalDate: '1609459200000',
        payload: {
          headers: [
            { name: 'From', value: 'sender@example.com' },
            { name: 'Subject', value: 'Test' },
          ],
          body: { size: 0 },
          parts: [
            {
              mimeType: 'multipart/mixed',
              body: { size: 0 },
              parts: [
                {
                  mimeType: 'multipart/alternative',
                  body: { size: 0 },
                  parts: [
                    {
                      mimeType: 'text/plain',
                      body: { data: 'Q29tcGxleA', size: 7 }, // "Complex"
                    },
                    {
                      mimeType: 'text/html',
                      body: { data: 'PGI-Q29tcGxleDwvYj4', size: 14 }, // "<b>Complex</b>"
                    },
                  ],
                },
                {
                  mimeType: 'image/png',
                  body: { size: 2048 },
                },
              ],
            },
          ],
        },
      }

      const result = parser.parseMessage(gmailMsg)

      expect(result.bodyText).toBe('Complex')
      expect(result.bodyHtml).toBe('<b>Complex</b>')
    })

    it('should handle invalid base64url gracefully', () => {
      const gmailMsg: GmailMessage = {
        id: 'msg123',
        threadId: 'thread123',
        labelIds: [],
        snippet: '',
        internalDate: '1609459200000',
        payload: {
          headers: [
            { name: 'From', value: 'sender@example.com' },
            { name: 'Subject', value: 'Test' },
          ],
          body: {
            data: 'invalid!!!base64',
            size: 16,
          },
        },
      }

      const result = parser.parseMessage(gmailMsg)

      // Should return empty string on decode error
      expect(result.bodyText).toBe('')
    })

    it('should handle empty from header', () => {
      const gmailMsg: GmailMessage = {
        id: 'msg123',
        threadId: 'thread123',
        labelIds: [],
        snippet: '',
        internalDate: '1609459200000',
        payload: {
          headers: [{ name: 'Subject', value: 'Test' }],
          body: { size: 0 },
        },
      }

      const result = parser.parseMessage(gmailMsg)

      expect(result.from).toEqual({
        email: '',
        name: undefined,
      })
    })

    it('should handle case-insensitive headers', () => {
      const gmailMsg: GmailMessage = {
        id: 'msg123',
        threadId: 'thread123',
        labelIds: [],
        snippet: '',
        internalDate: '1609459200000',
        payload: {
          headers: [
            { name: 'from', value: 'test@example.com' },
            { name: 'SUBJECT', value: 'Case Test' },
            { name: 'Date', value: 'Fri, 01 Jan 2021 00:00:00 +0000' },
          ],
          body: { size: 0 },
        },
      }

      const result = parser.parseMessage(gmailMsg)

      expect(result.from.email).toBe('test@example.com')
      expect(result.subject).toBe('Case Test')
    })

    it('should parse date from internalDate correctly', () => {
      const gmailMsg: GmailMessage = {
        id: 'msg123',
        threadId: 'thread123',
        labelIds: [],
        snippet: '',
        internalDate: '1640995200000', // 2022-01-01 00:00:00 UTC
        payload: {
          headers: [
            { name: 'From', value: 'sender@example.com' },
            { name: 'Subject', value: 'Test' },
          ],
          body: { size: 0 },
        },
      }

      const result = parser.parseMessage(gmailMsg)

      expect(result.date).toEqual(new Date(1640995200000))
      expect(result.date.toISOString()).toBe('2022-01-01T00:00:00.000Z')
    })
  })
})

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
    it('should build query with default unread filter', async () => {
      // Mock the api.listMessages to capture the query
      let capturedQuery = ''
      vi.spyOn(provider['api'], 'listMessages').mockImplementation(
        async (token, options) => {
          capturedQuery = options.query || ''
          return []
        }
      )

      await provider.fetchEmails('token123')

      expect(capturedQuery).toBe('is:unread')
    })

    it('should build query with newerThan filter', async () => {
      let capturedQuery = ''
      vi.spyOn(provider['api'], 'listMessages').mockImplementation(
        async (token, options) => {
          capturedQuery = options.query || ''
          return []
        }
      )

      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
      await provider.fetchEmails('token123', { newerThan: twoDaysAgo })

      expect(capturedQuery).toContain('is:unread')
      expect(capturedQuery).toContain('newer_than:2d')
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

      expect(capturedQuery).toBe('is:unread from:sender@example.com')
    })

    it('should build query with all filters', async () => {
      let capturedQuery = ''
      vi.spyOn(provider['api'], 'listMessages').mockImplementation(
        async (token, options) => {
          capturedQuery = options.query || ''
          return []
        }
      )

      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
      await provider.fetchEmails('token123', {
        newerThan: threeDaysAgo,
        query: 'subject:urgent',
      })

      expect(capturedQuery).toContain('is:unread')
      expect(capturedQuery).toContain('newer_than:3d')
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
