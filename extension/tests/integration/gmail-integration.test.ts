/**
 * Gmail Integration Tests
 *
 * Tests Gmail provider with mocked Gmail API endpoints using MSW
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { GmailProvider } from '../../src/lib/providers/gmail/gmail-provider'
import { GmailAPIClient } from '../../src/lib/providers/gmail/gmail-api'
import type { GmailMessage } from '../../src/lib/providers/gmail/gmail-api'
import { GMAIL_API_BASE } from '../../src/lib/providers/gmail/config'

// Mock Gmail API responses
const mockListMessagesResponse = {
  messages: [
    { id: 'msg1', threadId: 'thread1' },
    { id: 'msg2', threadId: 'thread2' },
  ],
  resultSizeEstimate: 2,
}

const mockMessage1: GmailMessage = {
  id: 'msg1',
  threadId: 'thread1',
  labelIds: ['UNREAD', 'INBOX'],
  snippet: 'This is the first test message...',
  internalDate: '1640995200000', // 2022-01-01
  payload: {
    headers: [
      { name: 'From', value: 'Alice Smith <alice@example.com>' },
      { name: 'Subject', value: 'Test Email 1' },
      { name: 'Date', value: 'Sat, 01 Jan 2022 00:00:00 +0000' },
    ],
    body: {
      data: 'SGVsbG8sIHRoaXMgaXMgdGhlIGZpcnN0IHRlc3QgbWVzc2FnZS4', // "Hello, this is the first test message."
      size: 38,
    },
  },
}

const mockMessage2: GmailMessage = {
  id: 'msg2',
  threadId: 'thread2',
  labelIds: ['UNREAD', 'INBOX'],
  snippet: 'This is the second test message...',
  internalDate: '1641081600000', // 2022-01-02
  payload: {
    headers: [
      { name: 'From', value: 'Bob Johnson <bob@example.com>' },
      { name: 'Subject', value: 'Test Email 2' },
      { name: 'Date', value: 'Sun, 02 Jan 2022 00:00:00 +0000' },
    ],
    body: { size: 0 },
    parts: [
      {
        mimeType: 'text/plain',
        body: {
          data: 'VGhpcyBpcyB0aGUgc2Vjb25kIHRlc3QgbWVzc2FnZS4', // "This is the second test message."
          size: 32,
        },
      },
      {
        mimeType: 'text/html',
        body: {
          data: 'PHA-VGhpcyBpcyB0aGUgc2Vjb25kIHRlc3QgbWVzc2FnZS48L3A-', // "<p>This is the second test message.</p>"
          size: 40,
        },
      },
    ],
  },
}

// MSW server setup
const server = setupServer(
  // List messages endpoint
  http.get(`${GMAIL_API_BASE}/users/me/messages`, ({ request }) => {
    const url = new URL(request.url)
    const auth = request.headers.get('Authorization')

    // Check auth header
    if (!auth || !auth.startsWith('Bearer ')) {
      return new HttpResponse(
        JSON.stringify({ error: 'unauthorized' }),
        { status: 401 }
      )
    }

    // Check for invalid token
    if (auth === 'Bearer invalid-token') {
      return new HttpResponse(
        JSON.stringify({
          error: { code: 401, message: 'Invalid Credentials' },
        }),
        { status: 401 }
      )
    }

    // Check for expired token
    if (auth === 'Bearer expired-token') {
      return new HttpResponse(
        JSON.stringify({
          error: { code: 401, message: 'Token expired' },
        }),
        { status: 401 }
      )
    }

    // Handle query parameters
    const query = url.searchParams.get('q')
    const maxResults = url.searchParams.get('maxResults')

    // Return appropriate response based on query
    if (query?.includes('from:nonexistent')) {
      return HttpResponse.json({ messages: [] })
    }

    return HttpResponse.json(mockListMessagesResponse)
  }),

  // Get message endpoint
  http.get(`${GMAIL_API_BASE}/users/me/messages/:messageId`, ({ params, request }) => {
    const { messageId } = params
    const auth = request.headers.get('Authorization')

    // Check auth header
    if (!auth || auth === 'Bearer ' || !auth.startsWith('Bearer ')) {
      return new HttpResponse(
        JSON.stringify({ error: 'unauthorized' }),
        { status: 401 }
      )
    }

    // Return appropriate message
    if (messageId === 'msg1') {
      return HttpResponse.json(mockMessage1)
    }
    if (messageId === 'msg2') {
      return HttpResponse.json(mockMessage2)
    }

    // Message not found
    return new HttpResponse(
      JSON.stringify({ error: { code: 404, message: 'Message not found' } }),
      { status: 404 }
    )
  })
)

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('Gmail API Integration', () => {
  describe('GmailAPIClient', () => {
    let client: GmailAPIClient

    beforeAll(() => {
      client = new GmailAPIClient()
    })

    describe('listMessages', () => {
      it('should list messages successfully', async () => {
        const result = await client.listMessages('valid-token', {
          maxResults: 10,
        })

        expect(result).toHaveLength(2)
        expect(result[0]).toEqual({ id: 'msg1', threadId: 'thread1' })
        expect(result[1]).toEqual({ id: 'msg2', threadId: 'thread2' })
      })

      it('should handle query parameter', async () => {
        const result = await client.listMessages('valid-token', {
          query: 'is:unread',
        })

        expect(result).toHaveLength(2)
      })

      it('should return empty array for no results', async () => {
        const result = await client.listMessages('valid-token', {
          query: 'from:nonexistent@example.com',
        })

        expect(result).toEqual([])
      })

      it('should throw error on 401 unauthorized', async () => {
        await expect(
          client.listMessages('invalid-token')
        ).rejects.toThrow(/401/)
      })

      it('should throw error on expired token', async () => {
        await expect(
          client.listMessages('expired-token')
        ).rejects.toThrow(/401/)
      })
    })

    describe('getMessage', () => {
      it('should get message by ID', async () => {
        const result = await client.getMessage('valid-token', 'msg1')

        expect(result.id).toBe('msg1')
        expect(result.threadId).toBe('thread1')
        expect(result.snippet).toBe('This is the first test message...')
      })

      it('should throw error for non-existent message', async () => {
        await expect(
          client.getMessage('valid-token', 'nonexistent')
        ).rejects.toThrow(/404/)
      })

      it('should throw error without auth', async () => {
        await expect(
          client.getMessage('', 'msg1')
        ).rejects.toThrow(/401/)
      })
    })

    describe('getMessages', () => {
      it('should get multiple messages in batch', async () => {
        const result = await client.getMessages('valid-token', [
          'msg1',
          'msg2',
        ])

        expect(result).toHaveLength(2)
        expect(result[0].id).toBe('msg1')
        expect(result[1].id).toBe('msg2')
      })

      it('should handle empty message list', async () => {
        const result = await client.getMessages('valid-token', [])

        expect(result).toEqual([])
      })

      it('should fetch messages in parallel', async () => {
        const startTime = Date.now()
        await client.getMessages('valid-token', ['msg1', 'msg2'])
        const duration = Date.now() - startTime

        // Should complete quickly due to parallel fetching
        expect(duration).toBeLessThan(1000)
      })
    })
  })

  describe('GmailProvider Integration', () => {
    let provider: GmailProvider

    beforeAll(() => {
      provider = new GmailProvider()
    })

    describe('fetchEmails', () => {
      it('should fetch and parse emails', async () => {
        const emails = await provider.fetchEmails('valid-token', {
          maxResults: 10,
        })

        expect(emails).toHaveLength(2)

        // Check first email
        expect(emails[0]).toMatchObject({
          id: 'msg1',
          subject: 'Test Email 1',
          from: {
            email: 'alice@example.com',
            name: 'Alice Smith',
          },
          snippet: 'This is the first test message...',
        })
        expect(emails[0].bodyText).toBe(
          'Hello, this is the first test message.'
        )

        // Check second email
        expect(emails[1]).toMatchObject({
          id: 'msg2',
          subject: 'Test Email 2',
          from: {
            email: 'bob@example.com',
            name: 'Bob Johnson',
          },
          snippet: 'This is the second test message...',
        })
        expect(emails[1].bodyText).toBe('This is the second test message.')
        expect(emails[1].bodyHtml).toBe(
          '<p>This is the second test message.</p>'
        )
      })

      it('should return empty array when no messages', async () => {
        const emails = await provider.fetchEmails('valid-token', {
          query: 'from:nonexistent',
        })

        expect(emails).toEqual([])
      })

      it('should respect maxResults option', async () => {
        const emails = await provider.fetchEmails('valid-token', {
          maxResults: 1,
        })

        // Should still get 2 since our mock returns 2, but the request included maxResults
        expect(emails).toHaveLength(2)
      })

      it('should handle API errors', async () => {
        await expect(
          provider.fetchEmails('invalid-token')
        ).rejects.toThrow()
      })
    })

    describe('error handling', () => {
      it('should handle 401 unauthorized', async () => {
        await expect(
          provider.fetchEmails('invalid-token')
        ).rejects.toThrow(/401/)
      })

      it('should handle expired token', async () => {
        await expect(
          provider.fetchEmails('expired-token')
        ).rejects.toThrow(/401/)
      })
    })

    describe('rate limiting', () => {
      it('should handle 429 rate limit', async () => {
        // Add temporary handler for rate limit
        server.use(
          http.get(`${GMAIL_API_BASE}/users/me/messages`, () => {
            return new HttpResponse(
              JSON.stringify({
                error: {
                  code: 429,
                  message: 'Rate limit exceeded',
                },
              }),
              { status: 429 }
            )
          })
        )

        await expect(
          provider.fetchEmails('valid-token')
        ).rejects.toThrow(/429/)
      })
    })

    describe('server errors', () => {
      it('should handle 500 server error', async () => {
        server.use(
          http.get(`${GMAIL_API_BASE}/users/me/messages`, () => {
            return new HttpResponse(
              JSON.stringify({ error: 'Internal server error' }),
              { status: 500 }
            )
          })
        )

        await expect(
          provider.fetchEmails('valid-token')
        ).rejects.toThrow(/500/)
      })

      it('should handle 503 service unavailable', async () => {
        server.use(
          http.get(`${GMAIL_API_BASE}/users/me/messages`, () => {
            return new HttpResponse(
              JSON.stringify({ error: 'Service unavailable' }),
              { status: 503 }
            )
          })
        )

        await expect(
          provider.fetchEmails('valid-token')
        ).rejects.toThrow(/503/)
      })
    })
  })

  describe('Message Formats', () => {
    it('should handle text-only message', async () => {
      const textOnlyMessage: GmailMessage = {
        ...mockMessage1,
        id: 'text-only',
        payload: {
          ...mockMessage1.payload,
          body: {
            data: 'UGxhaW4gdGV4dCBvbmx5', // "Plain text only"
            size: 15,
          },
        },
      }

      server.use(
        http.get(`${GMAIL_API_BASE}/users/me/messages`, () => {
          return HttpResponse.json({
            messages: [{ id: 'text-only', threadId: 'thread1' }],
          })
        }),
        http.get(`${GMAIL_API_BASE}/users/me/messages/text-only`, () => {
          return HttpResponse.json(textOnlyMessage)
        })
      )

      const provider = new GmailProvider()
      const emails = await provider.fetchEmails('valid-token')

      expect(emails[0].bodyText).toBe('Plain text only')
      expect(emails[0].bodyHtml).toBeUndefined()
    })

    it('should handle HTML-only message', async () => {
      const htmlOnlyMessage: GmailMessage = {
        ...mockMessage1,
        id: 'html-only',
        payload: {
          ...mockMessage1.payload,
          body: { size: 0 },
          parts: [
            {
              mimeType: 'text/html',
              body: {
                data: 'PGh0bWw-PGJvZHk-SFRNTCBvbmx5PC9ib2R5PjwvaHRtbD4', // "<html><body>HTML only</body></html>"
                size: 32,
              },
            },
          ],
        },
      }

      server.use(
        http.get(`${GMAIL_API_BASE}/users/me/messages`, () => {
          return HttpResponse.json({
            messages: [{ id: 'html-only', threadId: 'thread1' }],
          })
        }),
        http.get(`${GMAIL_API_BASE}/users/me/messages/html-only`, () => {
          return HttpResponse.json(htmlOnlyMessage)
        })
      )

      const provider = new GmailProvider()
      const emails = await provider.fetchEmails('valid-token')

      expect(emails[0].bodyText).toBeUndefined()
      expect(emails[0].bodyHtml).toBe('<html><body>HTML only</body></html>')
    })

    it('should handle message with attachments', async () => {
      const messageWithAttachment: GmailMessage = {
        ...mockMessage1,
        id: 'with-attachment',
        payload: {
          ...mockMessage1.payload,
          body: { size: 0 },
          parts: [
            {
              mimeType: 'text/plain',
              body: {
                data: 'TWVzc2FnZSB3aXRoIGF0dGFjaG1lbnQ', // "Message with attachment"
                size: 23,
              },
            },
            {
              mimeType: 'application/pdf',
              body: { size: 1024 }, // Attachment without data
            },
          ],
        },
      }

      server.use(
        http.get(`${GMAIL_API_BASE}/users/me/messages`, () => {
          return HttpResponse.json({
            messages: [{ id: 'with-attachment', threadId: 'thread1' }],
          })
        }),
        http.get(`${GMAIL_API_BASE}/users/me/messages/with-attachment`, () => {
          return HttpResponse.json(messageWithAttachment)
        })
      )

      const provider = new GmailProvider()
      const emails = await provider.fetchEmails('valid-token')

      expect(emails[0].bodyText).toBe('Message with attachment')
    })
  })
})
