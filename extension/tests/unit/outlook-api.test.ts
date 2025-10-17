/**
 * Outlook API Client Unit Tests
 *
 * Tests for Microsoft Graph API client:
 * - OutlookAPIClient: Message listing and fetching
 * - Query parameter construction
 * - Error handling for Graph API errors
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { OutlookAPIClient } from '../../src/lib/providers/outlook/outlook-api'
import type {
  GraphMessage,
  GraphMessageList,
  GraphError,
} from '../../src/lib/providers/outlook/outlook-api'

describe('OutlookAPIClient', () => {
  let client: OutlookAPIClient
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    client = new OutlookAPIClient()
    fetchSpy = vi.spyOn(global, 'fetch')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('listMessages', () => {
    it('should list messages with default parameters', async () => {
      const mockResponse: GraphMessageList = {
        '@odata.context':
          "https://graph.microsoft.com/v1.0/$metadata#users('user')/messages",
        value: [
          {
            id: 'msg1',
            subject: 'Test 1',
            from: {
              emailAddress: {
                name: 'Sender One',
                address: 'sender1@example.com',
              },
            },
            receivedDateTime: '2025-01-15T10:00:00Z',
            body: {
              contentType: 'html',
              content: '<p>Test content</p>',
            },
            bodyPreview: 'Test content',
            isRead: false,
            hasAttachments: false,
          },
          {
            id: 'msg2',
            subject: 'Test 2',
            from: {
              emailAddress: {
                name: 'Sender Two',
                address: 'sender2@example.com',
              },
            },
            receivedDateTime: '2025-01-15T09:00:00Z',
            body: {
              contentType: 'text',
              content: 'Plain text content',
            },
            bodyPreview: 'Plain text content',
            isRead: true,
            hasAttachments: true,
          },
        ],
      }

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const result = await client.listMessages('test-token')

      expect(result).toEqual([{ id: 'msg1' }, { id: 'msg2' }])
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/me/messages?'),
        expect.objectContaining({
          headers: {
            Authorization: 'Bearer test-token',
          },
        })
      )
    })

    it('should apply maxResults parameter', async () => {
      const mockResponse: GraphMessageList = {
        '@odata.context': '',
        value: [],
      }

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      await client.listMessages('test-token', { maxResults: 25 })

      const calledUrl = fetchSpy.mock.calls[0][0] as string
      // URL encoding: $ becomes %24
      expect(calledUrl).toContain('%24top=25')
    })

    it('should apply unreadOnly filter', async () => {
      const mockResponse: GraphMessageList = {
        '@odata.context': '',
        value: [],
      }

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      await client.listMessages('test-token', { unreadOnly: true })

      const calledUrl = fetchSpy.mock.calls[0][0] as string
      // URL encoding: spaces become + and $ becomes %24
      expect(calledUrl).toContain('%24filter=isRead+eq+false')
    })

    it('should apply newerThan date filter', async () => {
      const mockResponse: GraphMessageList = {
        '@odata.context': '',
        value: [],
      }

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const testDate = new Date('2025-01-15T00:00:00Z')
      await client.listMessages('test-token', { newerThan: testDate })

      const calledUrl = fetchSpy.mock.calls[0][0] as string
      // URL encoding: spaces become +, : becomes %3A, $ becomes %24
      expect(calledUrl).toContain('%24filter=receivedDateTime+ge+2025-01-15T00%3A00%3A00.000Z')
    })

    it('should combine multiple filters', async () => {
      const mockResponse: GraphMessageList = {
        '@odata.context': '',
        value: [],
      }

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const testDate = new Date('2025-01-15T00:00:00Z')
      await client.listMessages('test-token', {
        unreadOnly: true,
        newerThan: testDate,
      })

      const calledUrl = fetchSpy.mock.calls[0][0] as string
      expect(calledUrl).toContain('%24filter=')
      expect(calledUrl).toContain('isRead+eq+false')
      expect(calledUrl).toContain('receivedDateTime+ge')
      expect(calledUrl).toContain('+and+')
    })

    it('should apply search query parameter', async () => {
      const mockResponse: GraphMessageList = {
        '@odata.context': '',
        value: [],
      }

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      await client.listMessages('test-token', { query: 'verification code' })

      const calledUrl = fetchSpy.mock.calls[0][0] as string
      const calledHeaders = (fetchSpy.mock.calls[0][1] as RequestInit)
        ?.headers as Record<string, string>

      // URL encoding: $ becomes %24, spaces become +, quotes become %22
      expect(calledUrl).toContain('%24search=%22verification+code%22')
      expect(calledHeaders['ConsistencyLevel']).toBe('eventual')
    })

    it('should include orderby parameter', async () => {
      const mockResponse: GraphMessageList = {
        '@odata.context': '',
        value: [],
      }

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      await client.listMessages('test-token')

      const calledUrl = fetchSpy.mock.calls[0][0] as string
      // URL encoding: $ becomes %24, spaces become +
      expect(calledUrl).toContain('%24orderby=receivedDateTime+desc')
    })

    it('should include select parameter for minimal fields', async () => {
      const mockResponse: GraphMessageList = {
        '@odata.context': '',
        value: [],
      }

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      await client.listMessages('test-token')

      const calledUrl = fetchSpy.mock.calls[0][0] as string
      // URL encoding: $ becomes %24, commas become %2C
      expect(calledUrl).toContain('%24select=id%2Csubject%2Cfrom%2CreceivedDateTime%2CbodyPreview')
    })

    it('should return empty array when no messages', async () => {
      const mockResponse: GraphMessageList = {
        '@odata.context': '',
        value: [],
      }

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const result = await client.listMessages('test-token')

      expect(result).toEqual([])
    })

    it('should handle pagination nextLink in response', async () => {
      const mockResponse: GraphMessageList = {
        '@odata.context': '',
        value: [{ id: 'msg1' } as GraphMessage],
        '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/messages?$skip=10',
      }

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const result = await client.listMessages('test-token')

      expect(result).toEqual([{ id: 'msg1' }])
      // Note: Current implementation doesn't auto-follow pagination
      // This is consistent with Gmail client behavior
    })
  })

  describe('getMessage', () => {
    it('should fetch single message by ID', async () => {
      const mockMessage: GraphMessage = {
        id: 'msg123',
        subject: 'Test Message',
        from: {
          emailAddress: {
            name: 'Test Sender',
            address: 'sender@example.com',
          },
        },
        receivedDateTime: '2025-01-15T10:00:00Z',
        body: {
          contentType: 'html',
          content: '<p>Message body</p>',
        },
        bodyPreview: 'Message body',
        isRead: false,
        hasAttachments: false,
      }

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMessage,
      } as Response)

      const result = await client.getMessage('test-token', 'msg123')

      expect(result).toEqual(mockMessage)
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/me/messages/msg123'),
        expect.objectContaining({
          headers: {
            Authorization: 'Bearer test-token',
          },
        })
      )
    })

    it('should include select parameter for full message', async () => {
      const mockMessage: GraphMessage = {
        id: 'msg123',
        subject: 'Test',
        from: {
          emailAddress: { name: 'Sender', address: 'sender@example.com' },
        },
        receivedDateTime: '2025-01-15T10:00:00Z',
        body: { contentType: 'text', content: 'Body' },
        bodyPreview: 'Body',
        isRead: false,
        hasAttachments: false,
      }

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMessage,
      } as Response)

      await client.getMessage('test-token', 'msg123')

      const calledUrl = fetchSpy.mock.calls[0][0] as string
      // URL encoding: $ becomes %24
      expect(calledUrl).toContain('%24select=')
      expect(calledUrl).toContain('id')
      expect(calledUrl).toContain('subject')
      expect(calledUrl).toContain('from')
      expect(calledUrl).toContain('body')
    })
  })

  describe('getMessages', () => {
    it('should fetch multiple messages in parallel', async () => {
      const mockMessages: GraphMessage[] = [
        {
          id: 'msg1',
          subject: 'Message 1',
          from: {
            emailAddress: { name: 'Sender 1', address: 'sender1@example.com' },
          },
          receivedDateTime: '2025-01-15T10:00:00Z',
          body: { contentType: 'text', content: 'Body 1' },
          bodyPreview: 'Body 1',
          isRead: false,
          hasAttachments: false,
        },
        {
          id: 'msg2',
          subject: 'Message 2',
          from: {
            emailAddress: { name: 'Sender 2', address: 'sender2@example.com' },
          },
          receivedDateTime: '2025-01-15T09:00:00Z',
          body: { contentType: 'html', content: '<p>Body 2</p>' },
          bodyPreview: 'Body 2',
          isRead: true,
          hasAttachments: false,
        },
      ]

      fetchSpy
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockMessages[0],
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockMessages[1],
        } as Response)

      const result = await client.getMessages('test-token', ['msg1', 'msg2'])

      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('msg1')
      expect(result[1].id).toBe('msg2')
      expect(fetchSpy).toHaveBeenCalledTimes(2)
    })

    it('should return empty array for empty message IDs', async () => {
      const result = await client.getMessages('test-token', [])

      expect(result).toEqual([])
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('should handle single message ID', async () => {
      const mockMessage: GraphMessage = {
        id: 'msg1',
        subject: 'Single Message',
        from: {
          emailAddress: { name: 'Sender', address: 'sender@example.com' },
        },
        receivedDateTime: '2025-01-15T10:00:00Z',
        body: { contentType: 'text', content: 'Body' },
        bodyPreview: 'Body',
        isRead: false,
        hasAttachments: false,
      }

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMessage,
      } as Response)

      const result = await client.getMessages('test-token', ['msg1'])

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual(mockMessage)
    })
  })

  describe('error handling', () => {
    it('should handle 401 Unauthorized error', async () => {
      const errorResponse: GraphError = {
        error: {
          code: 'InvalidAuthenticationToken',
          message: 'Access token has expired',
        },
      }

      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => errorResponse,
        text: async () => JSON.stringify(errorResponse),
      } as Response)

      await expect(client.listMessages('invalid-token')).rejects.toThrow(
        'Microsoft Graph API error (401): InvalidAuthenticationToken - Access token has expired (Access token expired or invalid)'
      )
    })

    it('should handle 403 Forbidden error', async () => {
      const errorResponse: GraphError = {
        error: {
          code: 'ErrorAccessDenied',
          message: 'Access is denied',
        },
      }

      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => errorResponse,
        text: async () => JSON.stringify(errorResponse),
      } as Response)

      await expect(client.listMessages('test-token')).rejects.toThrow(
        'Insufficient permissions'
      )
    })

    it('should handle 404 Not Found error', async () => {
      const errorResponse: GraphError = {
        error: {
          code: 'ErrorItemNotFound',
          message: 'The specified object was not found',
        },
      }

      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => errorResponse,
        text: async () => JSON.stringify(errorResponse),
      } as Response)

      await expect(client.getMessage('test-token', 'nonexistent')).rejects.toThrow(
        'Message not found'
      )
    })

    it('should handle 429 Rate Limit error', async () => {
      const errorResponse: GraphError = {
        error: {
          code: 'TooManyRequests',
          message: 'Rate limit exceeded',
        },
      }

      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => errorResponse,
        text: async () => JSON.stringify(errorResponse),
      } as Response)

      await expect(client.listMessages('test-token')).rejects.toThrow(
        'Rate limit exceeded'
      )
    })

    it('should handle 500 Server Error', async () => {
      const errorResponse: GraphError = {
        error: {
          code: 'InternalServerError',
          message: 'An internal server error occurred',
        },
      }

      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => errorResponse,
        text: async () => JSON.stringify(errorResponse),
      } as Response)

      await expect(client.listMessages('test-token')).rejects.toThrow(
        'service error'
      )
    })

    it('should handle error without JSON body', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => {
          throw new Error('Not JSON')
        },
        text: async () => 'Bad Gateway',
      } as Response)

      await expect(client.listMessages('test-token')).rejects.toThrow(
        'Microsoft Graph API error (502): Bad Gateway'
      )
    })

    it('should handle network errors', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('Network failure'))

      await expect(client.listMessages('test-token')).rejects.toThrow(
        'Network failure'
      )
    })
  })

  describe('constructor', () => {
    it('should use default base URL', () => {
      const defaultClient = new OutlookAPIClient()
      expect(defaultClient['baseUrl']).toBe('https://graph.microsoft.com/v1.0')
    })

    it('should accept custom base URL', () => {
      const customClient = new OutlookAPIClient('https://custom.api.url')
      expect(customClient['baseUrl']).toBe('https://custom.api.url')
    })
  })
})
