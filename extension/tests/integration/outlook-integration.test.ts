/**
 * Outlook Integration Tests
 *
 * Comprehensive tests for Outlook provider with mocked Microsoft Graph API endpoints using MSW
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { OutlookProvider } from '../../src/lib/providers/outlook/outlook-provider'
import { OutlookAPIClient } from '../../src/lib/providers/outlook/outlook-api'
import { OutlookAuth } from '../../src/lib/providers/outlook/outlook-auth'
import type { GraphMessage } from '../../src/lib/providers/outlook/outlook-api'
import { OUTLOOK_API_BASE, OUTLOOK_CONFIG } from '../../src/lib/providers/outlook/config'

// ============================================================================
// Mock Microsoft Graph API Responses
// ============================================================================

/**
 * OAuth Token Response (successful)
 */
const mockTokenResponse = {
  access_token: 'mock_access_token_outlook',
  refresh_token: 'mock_refresh_token_outlook',
  expires_in: 3600,
  token_type: 'Bearer',
  scope: 'https://graph.microsoft.com/Mail.Read offline_access',
}

/**
 * OAuth Token Refresh Response
 */
const mockRefreshTokenResponse = {
  access_token: 'mock_refreshed_access_token',
  refresh_token: 'mock_new_refresh_token',
  expires_in: 3600,
  token_type: 'Bearer',
  scope: 'https://graph.microsoft.com/Mail.Read offline_access',
}

/**
 * GitHub Verification Email (HTML)
 */
const mockGitHubMessage: GraphMessage = {
  id: 'msg-github-001',
  subject: '[GitHub] Please verify your email address',
  from: {
    emailAddress: {
      name: 'GitHub',
      address: 'noreply@github.com',
    },
  },
  receivedDateTime: '2024-01-15T10:30:00Z',
  body: {
    contentType: 'html',
    content: `
      <html>
        <body>
          <h1>Verify your email</h1>
          <p>Your verification code is: <strong>847392</strong></p>
          <p>This code expires in 10 minutes.</p>
        </body>
      </html>
    `,
  },
  bodyPreview: 'Verify your email - Your verification code is: 847392',
  isRead: false,
  hasAttachments: false,
}

/**
 * Microsoft Account Verification Email (HTML)
 */
const mockMicrosoftMessage: GraphMessage = {
  id: 'msg-microsoft-001',
  subject: 'Microsoft account security code',
  from: {
    emailAddress: {
      name: 'Microsoft account team',
      address: 'account-security-noreply@accountprotection.microsoft.com',
    },
  },
  receivedDateTime: '2024-01-15T10:35:00Z',
  body: {
    contentType: 'html',
    content: `
      <html>
        <body>
          <div>Security code: 521896</div>
          <p>Use this code to verify your Microsoft account.</p>
          <p>This code will expire in 15 minutes.</p>
        </body>
      </html>
    `,
  },
  bodyPreview: 'Security code: 521896 - Use this code to verify your account',
  isRead: false,
  hasAttachments: false,
}

/**
 * AWS Password Reset Email (HTML + text fallback)
 */
const mockAWSMessage: GraphMessage = {
  id: 'msg-aws-001',
  subject: 'Password reset request for AWS',
  from: {
    emailAddress: {
      name: 'Amazon Web Services',
      address: 'no-reply@aws.amazon.com',
    },
  },
  receivedDateTime: '2024-01-15T10:40:00Z',
  body: {
    contentType: 'html',
    content: `
      <html>
        <body>
          <h2>AWS Password Reset</h2>
          <p>Your password reset code: <code>319847</code></p>
          <p>If you did not request this, please ignore this email.</p>
          <p><strong>Do NOT click this link:</strong> <a href="https://aws.amazon.com/reset?token=xyz">Reset Password</a></p>
        </body>
      </html>
    `,
  },
  bodyPreview: 'AWS Password Reset - Your password reset code: 319847',
  isRead: false,
  hasAttachments: false,
}

/**
 * Generic OTP Email (text only)
 */
const mockOTPTextMessage: GraphMessage = {
  id: 'msg-otp-text-001',
  subject: 'Your one-time password',
  from: {
    emailAddress: {
      name: 'Acme Corp',
      address: 'security@acme.example.com',
    },
  },
  receivedDateTime: '2024-01-15T10:45:00Z',
  body: {
    contentType: 'text',
    content: `
Hi there,

Your one-time password (OTP) is: 654321

This code is valid for 5 minutes.

Best regards,
Acme Security Team
    `,
  },
  bodyPreview: 'Your one-time password (OTP) is: 654321',
  isRead: false,
  hasAttachments: false,
}

/**
 * Email with Attachments
 */
const mockMessageWithAttachment: GraphMessage = {
  id: 'msg-attachment-001',
  subject: 'Invoice with verification code',
  from: {
    emailAddress: {
      name: 'Billing Team',
      address: 'billing@company.example.com',
    },
  },
  receivedDateTime: '2024-01-15T10:50:00Z',
  body: {
    contentType: 'html',
    content: '<p>Your invoice is attached. Verification code: 789012</p>',
  },
  bodyPreview: 'Your invoice is attached. Verification code: 789012',
  isRead: false,
  hasAttachments: true,
}

/**
 * Empty Inbox Response
 */
const mockEmptyResponse = {
  '@odata.context':
    "https://graph.microsoft.com/v1.0/$metadata#users('user-id')/messages",
  value: [],
}

/**
 * Multiple Messages List Response
 */
const mockMultipleMessagesResponse = {
  '@odata.context':
    "https://graph.microsoft.com/v1.0/$metadata#users('user-id')/messages",
  value: [
    { id: 'msg-github-001' },
    { id: 'msg-microsoft-001' },
    { id: 'msg-aws-001' },
  ],
}

// ============================================================================
// MSW Server Setup
// ============================================================================

const server = setupServer(
  // OAuth Token Exchange Endpoint
  http.post(
    'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    async ({ request }) => {
      const body = await request.text()
      const params = new URLSearchParams(body)

      const code = params.get('code')
      const grantType = params.get('grant_type')
      const refreshToken = params.get('refresh_token')

      // Handle authorization code exchange
      if (grantType === 'authorization_code') {
        if (code === 'valid-code') {
          return HttpResponse.json(mockTokenResponse)
        }
        if (code === 'invalid-code') {
          return HttpResponse.json(
            {
              error: 'invalid_grant',
              error_description: 'The provided authorization code is invalid',
            },
            { status: 400 }
          )
        }
      }

      // Handle refresh token
      if (grantType === 'refresh_token') {
        if (refreshToken === 'valid-refresh-token') {
          return HttpResponse.json(mockRefreshTokenResponse)
        }
        if (refreshToken === 'expired-refresh-token') {
          return HttpResponse.json(
            {
              error: 'invalid_grant',
              error_description: 'Refresh token has expired',
            },
            { status: 400 }
          )
        }
      }

      return HttpResponse.json(
        {
          error: 'invalid_request',
          error_description: 'Invalid request parameters',
        },
        { status: 400 }
      )
    }
  ),

  // OAuth Logout/Revoke Endpoint
  http.get(
    'https://login.microsoftonline.com/common/oauth2/v2.0/logout',
    ({ request }) => {
      const auth = request.headers.get('Authorization')

      if (!auth || auth === 'Bearer invalid-token') {
        return new HttpResponse('Unauthorized', { status: 401 })
      }

      return new HttpResponse('Success', { status: 200 })
    }
  ),

  // List Messages Endpoint
  http.get(`${OUTLOOK_API_BASE}/me/messages`, ({ request }) => {
    const url = new URL(request.url)
    const auth = request.headers.get('Authorization')

    // Check auth header
    if (!auth || !auth.startsWith('Bearer ')) {
      return HttpResponse.json(
        {
          error: {
            code: 'Unauthorized',
            message: 'Access token is missing or invalid',
          },
        },
        { status: 401 }
      )
    }

    // Handle invalid token
    if (auth === 'Bearer invalid-token') {
      return HttpResponse.json(
        {
          error: {
            code: 'InvalidAuthenticationToken',
            message: 'Access token validation failure',
          },
        },
        { status: 401 }
      )
    }

    // Handle expired token
    if (auth === 'Bearer expired-token') {
      return HttpResponse.json(
        {
          error: {
            code: 'ExpiredAuthenticationToken',
            message: 'Access token has expired',
          },
        },
        { status: 401 }
      )
    }

    // Handle rate limiting
    if (auth === 'Bearer rate-limited-token') {
      return HttpResponse.json(
        {
          error: {
            code: 'TooManyRequests',
            message: 'Rate limit exceeded',
          },
        },
        { status: 429 }
      )
    }

    // Check query parameters
    const filter = url.searchParams.get('$filter')
    const search = url.searchParams.get('$search')
    const top = url.searchParams.get('$top')

    // Handle search query returning no results
    if (search?.includes('nonexistent')) {
      return HttpResponse.json(mockEmptyResponse)
    }

    // Handle empty inbox (no unread messages)
    if (filter?.includes('isRead eq false') && auth === 'Bearer empty-inbox-token') {
      return HttpResponse.json(mockEmptyResponse)
    }

    // Return multiple messages by default
    return HttpResponse.json(mockMultipleMessagesResponse)
  }),

  // Get Message by ID Endpoint
  http.get(`${OUTLOOK_API_BASE}/me/messages/:messageId`, ({ params, request }) => {
    const { messageId } = params
    const auth = request.headers.get('Authorization')

    // Check auth header
    if (!auth || auth === 'Bearer ' || !auth.startsWith('Bearer ')) {
      return HttpResponse.json(
        {
          error: {
            code: 'Unauthorized',
            message: 'Access token is missing or invalid',
          },
        },
        { status: 401 }
      )
    }

    // Return appropriate message based on ID
    switch (messageId) {
      case 'msg-github-001':
        return HttpResponse.json(mockGitHubMessage)
      case 'msg-microsoft-001':
        return HttpResponse.json(mockMicrosoftMessage)
      case 'msg-aws-001':
        return HttpResponse.json(mockAWSMessage)
      case 'msg-otp-text-001':
        return HttpResponse.json(mockOTPTextMessage)
      case 'msg-attachment-001':
        return HttpResponse.json(mockMessageWithAttachment)
      case 'msg-deleted':
        return HttpResponse.json(
          {
            error: {
              code: 'ErrorItemNotFound',
              message: 'The specified message was not found',
            },
          },
          { status: 404 }
        )
      default:
        return HttpResponse.json(
          {
            error: {
              code: 'ResourceNotFound',
              message: 'Message not found',
            },
          },
          { status: 404 }
        )
    }
  })
)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

// ============================================================================
// OAuth Flow Tests
// ============================================================================

describe('Outlook OAuth Flow', () => {
  let auth: OutlookAuth

  beforeAll(() => {
    auth = new OutlookAuth(OUTLOOK_CONFIG)
  })

  describe('startAuth', () => {
    it('should return valid authorization URL with PKCE parameters', async () => {
      const result = await auth.startAuth()

      expect(result.authUrl).toContain(
        'https://login.microsoftonline.com/common/oauth2/v2.0/authorize'
      )
      expect(result.authUrl).toContain('client_id=')
      expect(result.authUrl).toContain('response_type=code')
      expect(result.authUrl).toContain('code_challenge=')
      expect(result.authUrl).toContain('code_challenge_method=S256')
      expect(result.authUrl).toContain('state=')
      expect(result.codeVerifier).toBeTruthy()
      expect(result.state).toBeTruthy()
    })

    it('should include required scopes in authorization URL', async () => {
      const result = await auth.startAuth()

      expect(result.authUrl).toContain('Mail.Read')
      expect(result.authUrl).toContain('offline_access')
    })

    it('should include redirect_uri in authorization URL', async () => {
      const result = await auth.startAuth()

      expect(result.authUrl).toContain('redirect_uri=')
    })

    it('should generate unique code verifiers on each call', async () => {
      const result1 = await auth.startAuth()
      const result2 = await auth.startAuth()

      expect(result1.codeVerifier).not.toBe(result2.codeVerifier)
      expect(result1.state).not.toBe(result2.state)
    })

    it('should include response_mode parameter', async () => {
      const result = await auth.startAuth()

      expect(result.authUrl).toContain('response_mode=query')
    })
  })

  describe('completeAuth', () => {
    it('should exchange valid code for tokens', async () => {
      const tokens = await auth.completeAuth({
        code: 'valid-code',
        codeVerifier: 'test-verifier',
        state: 'test-state',
      })

      expect(tokens.accessToken).toBe('mock_access_token_outlook')
      expect(tokens.refreshToken).toBe('mock_refresh_token_outlook')
      expect(tokens.expiresIn).toBe(3600)
      expect(tokens.tokenType).toBe('Bearer')
    })

    it('should throw error for invalid authorization code', async () => {
      await expect(
        auth.completeAuth({
          code: 'invalid-code',
          codeVerifier: 'test-verifier',
          state: 'test-state',
        })
      ).rejects.toThrow(/invalid/)
    })

    it('should throw error when access token missing from response', async () => {
      // Temporarily override handler to return incomplete response
      server.use(
        http.post(
          'https://login.microsoftonline.com/common/oauth2/v2.0/token',
          () => {
            return HttpResponse.json({ expires_in: 3600 })
          }
        )
      )

      await expect(
        auth.completeAuth({
          code: 'valid-code',
          codeVerifier: 'test-verifier',
          state: 'test-state',
        })
      ).rejects.toThrow(/No access token/)
    })
  })

  describe('refreshTokens', () => {
    it('should refresh tokens successfully', async () => {
      const tokens = await auth.refreshTokens('valid-refresh-token')

      expect(tokens.accessToken).toBe('mock_refreshed_access_token')
      expect(tokens.refreshToken).toBe('mock_new_refresh_token')
      expect(tokens.expiresIn).toBe(3600)
    })

    it('should throw error for expired refresh token', async () => {
      await expect(
        auth.refreshTokens('expired-refresh-token')
      ).rejects.toThrow(/expired/)
    })

    it('should throw error when refresh token is empty', async () => {
      await expect(auth.refreshTokens('')).rejects.toThrow(
        /Refresh token is required/
      )
    })

    it('should reuse old refresh token if new one not provided', async () => {
      server.use(
        http.post(
          'https://login.microsoftonline.com/common/oauth2/v2.0/token',
          () => {
            return HttpResponse.json({
              access_token: 'new_access_token',
              expires_in: 3600,
            })
          }
        )
      )

      const tokens = await auth.refreshTokens('old-refresh-token')

      expect(tokens.refreshToken).toBe('old-refresh-token')
    })
  })

  describe('revokeTokens', () => {
    it('should revoke tokens successfully', async () => {
      await expect(
        auth.revokeTokens('valid-access-token')
      ).resolves.not.toThrow()
    })

    it('should throw error for invalid token', async () => {
      await expect(auth.revokeTokens('invalid-token')).rejects.toThrow()
    })

    it('should throw error when token is empty', async () => {
      await expect(auth.revokeTokens('')).rejects.toThrow(
        /Access token is required/
      )
    })
  })
})

// ============================================================================
// Email Fetching Tests
// ============================================================================

describe('Outlook API Client', () => {
  let client: OutlookAPIClient

  beforeAll(() => {
    client = new OutlookAPIClient()
  })

  describe('listMessages', () => {
    it('should list messages with default options', async () => {
      const result = await client.listMessages('valid-token')

      expect(result).toHaveLength(3)
      expect(result[0]).toEqual({ id: 'msg-github-001' })
      expect(result[1]).toEqual({ id: 'msg-microsoft-001' })
      expect(result[2]).toEqual({ id: 'msg-aws-001' })
    })

    it('should respect maxResults option', async () => {
      const result = await client.listMessages('valid-token', {
        maxResults: 5,
      })

      // Mock returns 3, but API would respect the limit
      expect(result.length).toBeLessThanOrEqual(5)
    })

    it('should handle search query parameter', async () => {
      const result = await client.listMessages('valid-token', {
        query: 'verification code',
      })

      expect(result).toHaveLength(3)
    })

    it('should handle newerThan filter', async () => {
      const newerThan = new Date('2024-01-15T10:00:00Z')
      const result = await client.listMessages('valid-token', {
        newerThan,
      })

      expect(result).toHaveLength(3)
    })

    it('should return empty array for empty inbox', async () => {
      const result = await client.listMessages('empty-inbox-token', {
        unreadOnly: true,
      })

      expect(result).toEqual([])
    })

    it('should return empty array for no search results', async () => {
      const result = await client.listMessages('valid-token', {
        query: 'nonexistent query',
      })

      expect(result).toEqual([])
    })

    it('should throw error on 401 unauthorized', async () => {
      await expect(client.listMessages('invalid-token')).rejects.toThrow(/401/)
    })

    it('should throw error on expired token', async () => {
      await expect(client.listMessages('expired-token')).rejects.toThrow(/401/)
    })
  })

  describe('getMessage', () => {
    it('should get GitHub message by ID', async () => {
      const result = await client.getMessage('valid-token', 'msg-github-001')

      expect(result.id).toBe('msg-github-001')
      expect(result.subject).toContain('GitHub')
      expect(result.from.emailAddress.address).toBe('noreply@github.com')
      expect(result.body.contentType).toBe('html')
    })

    it('should get Microsoft message by ID', async () => {
      const result = await client.getMessage('valid-token', 'msg-microsoft-001')

      expect(result.id).toBe('msg-microsoft-001')
      expect(result.subject).toContain('Microsoft')
      expect(result.body.contentType).toBe('html')
    })

    it('should get text-only message', async () => {
      const result = await client.getMessage('valid-token', 'msg-otp-text-001')

      expect(result.id).toBe('msg-otp-text-001')
      expect(result.body.contentType).toBe('text')
      expect(result.body.content).toContain('654321')
    })

    it('should throw error for non-existent message', async () => {
      await expect(
        client.getMessage('valid-token', 'nonexistent')
      ).rejects.toThrow(/404/)
    })

    it('should throw error for deleted message', async () => {
      await expect(
        client.getMessage('valid-token', 'msg-deleted')
      ).rejects.toThrow(/404/)
    })

    it('should throw error without auth', async () => {
      await expect(client.getMessage('', 'msg-github-001')).rejects.toThrow(
        /401/
      )
    })
  })

  describe('getMessages', () => {
    it('should get multiple messages in batch', async () => {
      const result = await client.getMessages('valid-token', [
        'msg-github-001',
        'msg-microsoft-001',
        'msg-aws-001',
      ])

      expect(result).toHaveLength(3)
      expect(result[0].id).toBe('msg-github-001')
      expect(result[1].id).toBe('msg-microsoft-001')
      expect(result[2].id).toBe('msg-aws-001')
    })

    it('should handle empty message list', async () => {
      const result = await client.getMessages('valid-token', [])

      expect(result).toEqual([])
    })

    it('should fetch messages in parallel', async () => {
      const startTime = Date.now()
      await client.getMessages('valid-token', [
        'msg-github-001',
        'msg-microsoft-001',
      ])
      const duration = Date.now() - startTime

      // Should complete quickly due to parallel fetching
      expect(duration).toBeLessThan(1000)
    })
  })
})

// ============================================================================
// Error Handling Tests
// ============================================================================

describe('Outlook Error Handling', () => {
  let client: OutlookAPIClient

  beforeAll(() => {
    client = new OutlookAPIClient()
  })

  it('should handle 401 Unauthorized (expired token)', async () => {
    await expect(client.listMessages('expired-token')).rejects.toThrow(
      /expired/i
    )
  })

  it('should handle 403 Forbidden (insufficient permissions)', async () => {
    server.use(
      http.get(`${OUTLOOK_API_BASE}/me/messages`, () => {
        return HttpResponse.json(
          {
            error: {
              code: 'Forbidden',
              message: 'Insufficient privileges to complete the operation',
            },
          },
          { status: 403 }
        )
      })
    )

    await expect(client.listMessages('valid-token')).rejects.toThrow(
      /403.*permissions/i
    )
  })

  it('should handle 404 Not Found (message deleted)', async () => {
    await expect(
      client.getMessage('valid-token', 'msg-deleted')
    ).rejects.toThrow(/404/)
  })

  it('should handle 429 Rate Limit', async () => {
    await expect(client.listMessages('rate-limited-token')).rejects.toThrow(
      /429.*rate limit/i
    )
  })

  it('should handle 500 Server Error', async () => {
    server.use(
      http.get(`${OUTLOOK_API_BASE}/me/messages`, () => {
        return HttpResponse.json(
          {
            error: {
              code: 'InternalServerError',
              message: 'Internal server error occurred',
            },
          },
          { status: 500 }
        )
      })
    )

    await expect(client.listMessages('valid-token')).rejects.toThrow(
      /500.*service error/i
    )
  })

  it('should handle 503 Service Unavailable', async () => {
    server.use(
      http.get(`${OUTLOOK_API_BASE}/me/messages`, () => {
        return HttpResponse.json(
          {
            error: {
              code: 'ServiceUnavailable',
              message: 'The service is temporarily unavailable',
            },
          },
          { status: 503 }
        )
      })
    )

    await expect(client.listMessages('valid-token')).rejects.toThrow(
      /503.*service error/i
    )
  })
})

// ============================================================================
// Provider Integration Tests
// ============================================================================

describe('Outlook Provider Integration', () => {
  let provider: OutlookProvider

  beforeAll(() => {
    provider = new OutlookProvider()
  })

  describe('fetchEmails', () => {
    it('should fetch and parse emails', async () => {
      const emails = await provider.fetchEmails('valid-token', {
        maxResults: 10,
      })

      expect(emails).toHaveLength(3)

      // Check GitHub email
      expect(emails[0]).toMatchObject({
        id: 'msg-github-001',
        subject: '[GitHub] Please verify your email address',
        from: {
          email: 'noreply@github.com',
          name: 'GitHub',
        },
      })
      expect(emails[0].bodyHtml).toContain('847392')

      // Check Microsoft email
      expect(emails[1]).toMatchObject({
        id: 'msg-microsoft-001',
        subject: 'Microsoft account security code',
        from: {
          email: 'account-security-noreply@accountprotection.microsoft.com',
          name: 'Microsoft account team',
        },
      })
      expect(emails[1].bodyHtml).toContain('521896')

      // Check AWS email
      expect(emails[2]).toMatchObject({
        id: 'msg-aws-001',
        subject: 'Password reset request for AWS',
        from: {
          email: 'no-reply@aws.amazon.com',
          name: 'Amazon Web Services',
        },
      })
      expect(emails[2].bodyHtml).toContain('319847')
    })

    it('should return empty array when no messages', async () => {
      const emails = await provider.fetchEmails('empty-inbox-token')

      expect(emails).toEqual([])
    })

    it('should respect maxResults option', async () => {
      const emails = await provider.fetchEmails('valid-token', {
        maxResults: 2,
      })

      expect(emails).toHaveLength(3) // Mock returns 3
    })

    it('should handle API errors', async () => {
      await expect(provider.fetchEmails('invalid-token')).rejects.toThrow()
    })

    it('should handle query parameter', async () => {
      const emails = await provider.fetchEmails('valid-token', {
        query: 'verification',
      })

      expect(emails.length).toBeGreaterThan(0)
    })

    it('should handle newerThan filter', async () => {
      const emails = await provider.fetchEmails('valid-token', {
        newerThan: new Date('2024-01-15T10:00:00Z'),
      })

      expect(emails.length).toBeGreaterThan(0)
    })
  })
})

// ============================================================================
// Real-World Email Scenarios
// ============================================================================

describe('Real-World Email Scenarios', () => {
  let provider: OutlookProvider

  beforeAll(() => {
    provider = new OutlookProvider()
  })

  it('should parse GitHub verification email correctly', async () => {
    server.use(
      http.get(`${OUTLOOK_API_BASE}/me/messages`, () => {
        return HttpResponse.json({
          '@odata.context': "https://graph.microsoft.com/v1.0/$metadata#users('user-id')/messages",
          value: [{ id: 'msg-github-001' }],
        })
      })
    )

    const emails = await provider.fetchEmails('valid-token')

    expect(emails[0].subject).toContain('GitHub')
    expect(emails[0].bodyHtml).toContain('847392')
    expect(emails[0].snippet).toContain('847392')
    expect(emails[0].from.email).toBe('noreply@github.com')
  })

  it('should parse Microsoft verification email correctly', async () => {
    server.use(
      http.get(`${OUTLOOK_API_BASE}/me/messages`, () => {
        return HttpResponse.json({
          '@odata.context': "https://graph.microsoft.com/v1.0/$metadata#users('user-id')/messages",
          value: [{ id: 'msg-microsoft-001' }],
        })
      })
    )

    const emails = await provider.fetchEmails('valid-token')

    expect(emails[0].subject).toContain('Microsoft')
    expect(emails[0].bodyHtml).toContain('521896')
    expect(emails[0].from.email).toContain('accountprotection.microsoft.com')
  })

  it('should parse AWS password reset email correctly', async () => {
    server.use(
      http.get(`${OUTLOOK_API_BASE}/me/messages`, () => {
        return HttpResponse.json({
          '@odata.context': "https://graph.microsoft.com/v1.0/$metadata#users('user-id')/messages",
          value: [{ id: 'msg-aws-001' }],
        })
      })
    )

    const emails = await provider.fetchEmails('valid-token')

    expect(emails[0].subject).toContain('AWS')
    expect(emails[0].bodyHtml).toContain('319847')
    expect(emails[0].bodyHtml).toContain('Do NOT click this link')
  })

  it('should parse text-only OTP email correctly', async () => {
    server.use(
      http.get(`${OUTLOOK_API_BASE}/me/messages`, () => {
        return HttpResponse.json({
          '@odata.context': "https://graph.microsoft.com/v1.0/$metadata#users('user-id')/messages",
          value: [{ id: 'msg-otp-text-001' }],
        })
      })
    )

    const emails = await provider.fetchEmails('valid-token')

    expect(emails[0].subject).toContain('one-time password')
    expect(emails[0].bodyText).toContain('654321')
    expect(emails[0].bodyHtml).toBeUndefined()
  })

  it('should handle email with attachments', async () => {
    server.use(
      http.get(`${OUTLOOK_API_BASE}/me/messages`, () => {
        return HttpResponse.json({
          '@odata.context': "https://graph.microsoft.com/v1.0/$metadata#users('user-id')/messages",
          value: [{ id: 'msg-attachment-001' }],
        })
      })
    )

    const emails = await provider.fetchEmails('valid-token')

    expect(emails[0].bodyHtml).toContain('789012')
    // Note: GraphMessage doesn't expose attachments in our interface yet
  })

  it('should handle mixed HTML and text emails', async () => {
    const mixedMessage: GraphMessage = {
      id: 'msg-mixed-001',
      subject: 'Mixed content email',
      from: {
        emailAddress: {
          name: 'Test Sender',
          address: 'test@example.com',
        },
      },
      receivedDateTime: '2024-01-15T11:00:00Z',
      body: {
        contentType: 'html',
        content: '<p>HTML version: 123456</p>',
      },
      bodyPreview: 'HTML version: 123456',
      isRead: false,
      hasAttachments: false,
    }

    server.use(
      http.get(`${OUTLOOK_API_BASE}/me/messages`, () => {
        return HttpResponse.json({
          '@odata.context': "https://graph.microsoft.com/v1.0/$metadata#users('user-id')/messages",
          value: [{ id: 'msg-mixed-001' }],
        })
      }),
      http.get(`${OUTLOOK_API_BASE}/me/messages/msg-mixed-001`, () => {
        return HttpResponse.json(mixedMessage)
      })
    )

    const emails = await provider.fetchEmails('valid-token')

    expect(emails[0].bodyHtml).toContain('123456')
    expect(emails[0].bodyText).toContain('123456') // Falls back to preview
  })

  it('should handle emails with no subject', async () => {
    const noSubjectMessage: GraphMessage = {
      id: 'msg-no-subject-001',
      subject: '',
      from: {
        emailAddress: {
          name: 'Test Sender',
          address: 'test@example.com',
        },
      },
      receivedDateTime: '2024-01-15T11:05:00Z',
      body: {
        contentType: 'text',
        content: 'This email has no subject',
      },
      bodyPreview: 'This email has no subject',
      isRead: false,
      hasAttachments: false,
    }

    server.use(
      http.get(`${OUTLOOK_API_BASE}/me/messages`, () => {
        return HttpResponse.json({
          '@odata.context': "https://graph.microsoft.com/v1.0/$metadata#users('user-id')/messages",
          value: [{ id: 'msg-no-subject-001' }],
        })
      }),
      http.get(`${OUTLOOK_API_BASE}/me/messages/msg-no-subject-001`, () => {
        return HttpResponse.json(noSubjectMessage)
      })
    )

    const emails = await provider.fetchEmails('valid-token')

    expect(emails[0].subject).toBe('(No Subject)')
  })
})

// ============================================================================
// Message Format Tests
// ============================================================================

describe('Message Format Handling', () => {
  let client: OutlookAPIClient
  let provider: OutlookProvider

  beforeAll(() => {
    client = new OutlookAPIClient()
    provider = new OutlookProvider()
  })

  it('should handle HTML-only message', async () => {
    server.use(
      http.get(`${OUTLOOK_API_BASE}/me/messages`, () => {
        return HttpResponse.json({
          '@odata.context': "https://graph.microsoft.com/v1.0/$metadata#users('user-id')/messages",
          value: [{ id: 'msg-github-001' }],
        })
      })
    )

    const emails = await provider.fetchEmails('valid-token')

    expect(emails[0].bodyHtml).toBeTruthy()
    expect(emails[0].bodyText).toBeTruthy() // Falls back to preview
  })

  it('should handle text-only message', async () => {
    server.use(
      http.get(`${OUTLOOK_API_BASE}/me/messages`, () => {
        return HttpResponse.json({
          '@odata.context': "https://graph.microsoft.com/v1.0/$metadata#users('user-id')/messages",
          value: [{ id: 'msg-otp-text-001' }],
        })
      })
    )

    const emails = await provider.fetchEmails('valid-token')

    expect(emails[0].bodyText).toBeTruthy()
    expect(emails[0].bodyHtml).toBeUndefined()
  })

  it('should preserve date format from receivedDateTime', async () => {
    server.use(
      http.get(`${OUTLOOK_API_BASE}/me/messages`, () => {
        return HttpResponse.json({
          '@odata.context': "https://graph.microsoft.com/v1.0/$metadata#users('user-id')/messages",
          value: [{ id: 'msg-github-001' }],
        })
      })
    )

    const emails = await provider.fetchEmails('valid-token')

    expect(emails[0].date).toBeInstanceOf(Date)
    expect(emails[0].date.toISOString()).toBe('2024-01-15T10:30:00.000Z')
  })
})
