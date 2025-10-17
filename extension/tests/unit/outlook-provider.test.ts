/**
 * Outlook Provider Unit Tests
 *
 * Tests for Outlook provider implementation:
 * - OutlookProvider: IEmailProvider implementation
 * - Component integration (auth, API, parser)
 * - Error handling and propagation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { OutlookProvider } from '../../src/lib/providers/outlook/outlook-provider'
import type { GraphMessage } from '../../src/lib/providers/outlook/outlook-api'

describe('OutlookProvider', () => {
  let provider: OutlookProvider

  // Shared mock data for all tests
  const mockGraphMessages: GraphMessage[] = [
    {
      id: 'msg1',
      subject: 'First Email',
      from: {
        emailAddress: {
          name: 'Sender One',
          address: 'sender1@example.com',
        },
      },
      receivedDateTime: '2023-01-01T12:00:00Z',
      body: {
        contentType: 'text',
        content: 'First email body',
      },
      bodyPreview: 'First email preview',
      isRead: false,
      hasAttachments: false,
    },
    {
      id: 'msg2',
      subject: 'Second Email',
      from: {
        emailAddress: {
          name: 'Sender Two',
          address: 'sender2@example.com',
        },
      },
      receivedDateTime: '2023-01-02T12:00:00Z',
      body: {
        contentType: 'html',
        content: '<p>Second email body</p>',
      },
      bodyPreview: 'Second email preview',
      isRead: false,
      hasAttachments: true,
    },
  ]

  beforeEach(() => {
    provider = new OutlookProvider()
  })

  describe('provider metadata', () => {
    it('should have correct provider ID', () => {
      expect(provider.providerId).toBe('outlook')
    })

    it('should have correct display name', () => {
      expect(provider.displayName).toBe('Microsoft Outlook')
    })
  })

  describe('startAuth', () => {
    it('should delegate to auth component', async () => {
      const mockResult = {
        authUrl: 'https://login.microsoftonline.com/...',
        codeVerifier: 'test-verifier',
        state: 'test-state',
      }

      vi.spyOn(provider['auth'], 'startAuth').mockResolvedValue(mockResult)

      const result = await provider.startAuth()

      expect(result).toEqual(mockResult)
      expect(provider['auth'].startAuth).toHaveBeenCalledTimes(1)
    })

    it('should propagate auth errors', async () => {
      const error = new Error('Auth initialization failed')
      vi.spyOn(provider['auth'], 'startAuth').mockRejectedValue(error)

      await expect(provider.startAuth()).rejects.toThrow('Auth initialization failed')
    })
  })

  describe('completeAuth', () => {
    it('should delegate to auth component with correct params', async () => {
      const mockTokens = {
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-456',
        expiresIn: 3600,
        tokenType: 'Bearer',
        scope: 'https://graph.microsoft.com/Mail.Read offline_access',
      }

      const params = {
        code: 'auth-code-789',
        codeVerifier: 'verifier-abc',
        state: 'state-xyz',
      }

      vi.spyOn(provider['auth'], 'completeAuth').mockResolvedValue(mockTokens)

      const result = await provider.completeAuth(params)

      expect(result).toEqual(mockTokens)
      expect(provider['auth'].completeAuth).toHaveBeenCalledWith(params)
      expect(provider['auth'].completeAuth).toHaveBeenCalledTimes(1)
    })

    it('should propagate token exchange errors', async () => {
      const error = new Error('Token exchange failed: invalid_grant')
      vi.spyOn(provider['auth'], 'completeAuth').mockRejectedValue(error)

      await expect(
        provider.completeAuth({
          code: 'invalid',
          codeVerifier: 'verifier',
          state: 'state',
        })
      ).rejects.toThrow('Token exchange failed: invalid_grant')
    })
  })

  describe('refreshTokens', () => {
    it('should delegate to auth component with refresh token', async () => {
      const mockTokens = {
        accessToken: 'new-access-token',
        refreshToken: 'refresh-token',
        expiresIn: 3600,
        tokenType: 'Bearer',
        scope: 'https://graph.microsoft.com/Mail.Read offline_access',
      }

      vi.spyOn(provider['auth'], 'refreshTokens').mockResolvedValue(mockTokens)

      const result = await provider.refreshTokens('refresh-token')

      expect(result).toEqual(mockTokens)
      expect(provider['auth'].refreshTokens).toHaveBeenCalledWith('refresh-token')
      expect(provider['auth'].refreshTokens).toHaveBeenCalledTimes(1)
    })

    it('should propagate refresh errors', async () => {
      const error = new Error('Token refresh failed: invalid_grant')
      vi.spyOn(provider['auth'], 'refreshTokens').mockRejectedValue(error)

      await expect(provider.refreshTokens('invalid-token')).rejects.toThrow(
        'Token refresh failed: invalid_grant'
      )
    })
  })

  describe('revokeTokens', () => {
    it('should delegate to auth component', async () => {
      vi.spyOn(provider['auth'], 'revokeTokens').mockResolvedValue(undefined)

      await provider.revokeTokens('access-token')

      expect(provider['auth'].revokeTokens).toHaveBeenCalledWith('access-token')
      expect(provider['auth'].revokeTokens).toHaveBeenCalledTimes(1)
    })

    it('should propagate revocation errors', async () => {
      const error = new Error('Token revocation failed')
      vi.spyOn(provider['auth'], 'revokeTokens').mockRejectedValue(error)

      await expect(provider.revokeTokens('token')).rejects.toThrow('Token revocation failed')
    })
  })

  describe('fetchEmails', () => {
    it('should return empty array when no messages', async () => {
      vi.spyOn(provider['api'], 'listMessages').mockResolvedValue([])

      const result = await provider.fetchEmails('token123')

      expect(result).toEqual([])
      expect(provider['api'].listMessages).toHaveBeenCalledWith('token123', {
        maxResults: 10,
        unreadOnly: true,
        query: undefined,
        newerThan: undefined,
      })
    })

    it('should fetch and parse messages with default options', async () => {
      const mockMessageIds = [{ id: 'msg1' }, { id: 'msg2' }]

      vi.spyOn(provider['api'], 'listMessages').mockResolvedValue(mockMessageIds)
      vi.spyOn(provider['api'], 'getMessages').mockResolvedValue(mockGraphMessages)

      const result = await provider.fetchEmails('token123')

      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('msg1')
      expect(result[0].subject).toBe('First Email')
      expect(result[0].from.email).toBe('sender1@example.com')
      expect(result[0].from.name).toBe('Sender One')
      expect(result[0].bodyText).toBe('First email body')
      expect(result[0].bodyHtml).toBeUndefined()

      expect(result[1].id).toBe('msg2')
      expect(result[1].subject).toBe('Second Email')
      expect(result[1].from.email).toBe('sender2@example.com')
      expect(result[1].bodyHtml).toBe('<p>Second email body</p>')
    })

    it('should respect maxResults option', async () => {
      vi.spyOn(provider['api'], 'listMessages').mockResolvedValue([])

      await provider.fetchEmails('token123', { maxResults: 25 })

      expect(provider['api'].listMessages).toHaveBeenCalledWith('token123', {
        maxResults: 25,
        unreadOnly: true,
        query: undefined,
        newerThan: undefined,
      })
    })

    it('should use default maxResults of 10', async () => {
      vi.spyOn(provider['api'], 'listMessages').mockResolvedValue([])

      await provider.fetchEmails('token123')

      expect(provider['api'].listMessages).toHaveBeenCalledWith('token123', {
        maxResults: 10,
        unreadOnly: true,
        query: undefined,
        newerThan: undefined,
      })
    })

    it('should pass query option to API', async () => {
      vi.spyOn(provider['api'], 'listMessages').mockResolvedValue([])

      await provider.fetchEmails('token123', { query: 'from:sender@example.com' })

      expect(provider['api'].listMessages).toHaveBeenCalledWith('token123', {
        maxResults: 10,
        unreadOnly: true,
        query: 'from:sender@example.com',
        newerThan: undefined,
      })
    })

    it('should pass newerThan option to API', async () => {
      vi.spyOn(provider['api'], 'listMessages').mockResolvedValue([])

      const date = new Date('2023-01-01T00:00:00Z')
      await provider.fetchEmails('token123', { newerThan: date })

      expect(provider['api'].listMessages).toHaveBeenCalledWith('token123', {
        maxResults: 10,
        unreadOnly: true,
        query: undefined,
        newerThan: date,
      })
    })

    it('should pass all options to API', async () => {
      vi.spyOn(provider['api'], 'listMessages').mockResolvedValue([])

      const date = new Date('2023-01-01T00:00:00Z')
      await provider.fetchEmails('token123', {
        maxResults: 50,
        query: 'subject:urgent',
        newerThan: date,
      })

      expect(provider['api'].listMessages).toHaveBeenCalledWith('token123', {
        maxResults: 50,
        unreadOnly: true,
        query: 'subject:urgent',
        newerThan: date,
      })
    })

    it('should default unreadOnly to true', async () => {
      vi.spyOn(provider['api'], 'listMessages').mockResolvedValue([])

      await provider.fetchEmails('token123')

      expect(provider['api'].listMessages).toHaveBeenCalledWith('token123', {
        maxResults: 10,
        unreadOnly: true,
        query: undefined,
        newerThan: undefined,
      })
    })

    it('should fetch messages in parallel', async () => {
      const mockMessageIds = [{ id: 'msg1' }, { id: 'msg2' }, { id: 'msg3' }]

      vi.spyOn(provider['api'], 'listMessages').mockResolvedValue(mockMessageIds)
      vi.spyOn(provider['api'], 'getMessages').mockResolvedValue(mockGraphMessages)

      await provider.fetchEmails('token123')

      expect(provider['api'].getMessages).toHaveBeenCalledWith('token123', ['msg1', 'msg2', 'msg3'])
      expect(provider['api'].getMessages).toHaveBeenCalledTimes(1)
    })

    it('should parse all messages correctly', async () => {
      const mockMessageIds = [{ id: 'msg1' }, { id: 'msg2' }]

      vi.spyOn(provider['api'], 'listMessages').mockResolvedValue(mockMessageIds)
      vi.spyOn(provider['api'], 'getMessages').mockResolvedValue(mockGraphMessages)

      const parseSpy = vi.spyOn(provider['parser'], 'parseMessage')

      const result = await provider.fetchEmails('token123')

      expect(parseSpy).toHaveBeenCalledTimes(2)
      expect(parseSpy).toHaveBeenNthCalledWith(1, mockGraphMessages[0])
      expect(parseSpy).toHaveBeenNthCalledWith(2, mockGraphMessages[1])
      expect(result).toHaveLength(2)
    })

    it('should handle API errors during listMessages', async () => {
      const error = new Error('Microsoft Graph API error (401): Unauthorized')
      vi.spyOn(provider['api'], 'listMessages').mockRejectedValue(error)

      await expect(provider.fetchEmails('invalid-token')).rejects.toThrow(
        'Microsoft Graph API error (401): Unauthorized'
      )
    })

    it('should handle API errors during getMessages', async () => {
      const mockMessageIds = [{ id: 'msg1' }]
      vi.spyOn(provider['api'], 'listMessages').mockResolvedValue(mockMessageIds)

      const error = new Error('Microsoft Graph API error (404): Not Found')
      vi.spyOn(provider['api'], 'getMessages').mockRejectedValue(error)

      await expect(provider.fetchEmails('token123')).rejects.toThrow(
        'Microsoft Graph API error (404): Not Found'
      )
    })

    it('should handle parser errors', async () => {
      const mockMessageIds = [{ id: 'msg1' }]
      vi.spyOn(provider['api'], 'listMessages').mockResolvedValue(mockMessageIds)
      vi.spyOn(provider['api'], 'getMessages').mockResolvedValue(mockGraphMessages)

      const error = new Error('Parser error: Invalid message format')
      vi.spyOn(provider['parser'], 'parseMessage').mockImplementation(() => {
        throw error
      })

      await expect(provider.fetchEmails('token123')).rejects.toThrow(
        'Parser error: Invalid message format'
      )
    })

    it('should handle empty options gracefully', async () => {
      vi.spyOn(provider['api'], 'listMessages').mockResolvedValue([])

      await provider.fetchEmails('token123', {})

      expect(provider['api'].listMessages).toHaveBeenCalledWith('token123', {
        maxResults: 10,
        unreadOnly: true,
        query: undefined,
        newerThan: undefined,
      })
    })

    it('should handle single message', async () => {
      const mockMessageIds = [{ id: 'msg1' }]
      const singleMessage = [mockGraphMessages[0]]

      vi.spyOn(provider['api'], 'listMessages').mockResolvedValue(mockMessageIds)
      vi.spyOn(provider['api'], 'getMessages').mockResolvedValue(singleMessage)

      const result = await provider.fetchEmails('token123')

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('msg1')
    })
  })

  describe('component initialization', () => {
    it('should initialize all components on construction', () => {
      const provider = new OutlookProvider()

      expect(provider['auth']).toBeDefined()
      expect(provider['api']).toBeDefined()
      expect(provider['parser']).toBeDefined()
    })

    it('should create separate component instances', () => {
      const provider1 = new OutlookProvider()
      const provider2 = new OutlookProvider()

      expect(provider1['auth']).not.toBe(provider2['auth'])
      expect(provider1['api']).not.toBe(provider2['api'])
      expect(provider1['parser']).not.toBe(provider2['parser'])
    })
  })

  describe('integration scenarios', () => {
    it('should complete full fetch flow', async () => {
      // Simulate complete fetch flow
      const mockMessageIds = [{ id: 'msg1' }]
      const mockMessages = [mockGraphMessages[0]]

      vi.spyOn(provider['api'], 'listMessages').mockResolvedValue(mockMessageIds)
      vi.spyOn(provider['api'], 'getMessages').mockResolvedValue(mockMessages)

      const result = await provider.fetchEmails('token123', {
        maxResults: 5,
        query: 'verification code',
        newerThan: new Date('2023-01-01T00:00:00Z'),
      })

      // Verify the flow
      expect(provider['api'].listMessages).toHaveBeenCalled()
      expect(provider['api'].getMessages).toHaveBeenCalled()
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        id: 'msg1',
        subject: 'First Email',
        from: {
          email: 'sender1@example.com',
          name: 'Sender One',
        },
      })
    })

    it('should handle rate limiting errors', async () => {
      const error = new Error('Microsoft Graph API error (429): Rate limit exceeded')
      vi.spyOn(provider['api'], 'listMessages').mockRejectedValue(error)

      await expect(provider.fetchEmails('token123')).rejects.toThrow('Rate limit exceeded')
    })

    it('should handle token expiry errors', async () => {
      const error = new Error('Microsoft Graph API error (401): Access token expired')
      vi.spyOn(provider['api'], 'listMessages').mockRejectedValue(error)

      await expect(provider.fetchEmails('expired-token')).rejects.toThrow('Access token expired')
    })

    it('should handle permission errors', async () => {
      const error = new Error('Microsoft Graph API error (403): Insufficient permissions')
      vi.spyOn(provider['api'], 'listMessages').mockRejectedValue(error)

      await expect(provider.fetchEmails('limited-token')).rejects.toThrow('Insufficient permissions')
    })
  })
})
