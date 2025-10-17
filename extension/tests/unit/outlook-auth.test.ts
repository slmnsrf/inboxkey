/**
 * Unit tests for Outlook/Microsoft OAuth PKCE Authentication
 *
 * Tests cover:
 * - PKCE utility functions reuse (imported from gmail/pkce-utils)
 * - OutlookAuth class methods
 * - OAuth flow steps with Microsoft-specific parameters
 * - Error handling
 * - Security validations
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { OutlookAuth } from '../../src/lib/providers/outlook/outlook-auth'
import { OUTLOOK_CONFIG } from '../../src/lib/providers/outlook/config'

describe('OutlookAuth', () => {
  let outlookAuth: OutlookAuth

  beforeEach(() => {
    outlookAuth = new OutlookAuth(OUTLOOK_CONFIG)
    // Reset fetch mock
    global.fetch = vi.fn()
  })

  describe('startAuth', () => {
    it('should generate authorization URL with PKCE parameters', async () => {
      const result = await outlookAuth.startAuth()

      expect(result).toHaveProperty('authUrl')
      expect(result).toHaveProperty('codeVerifier')
      expect(result).toHaveProperty('state')

      expect(typeof result.authUrl).toBe('string')
      expect(typeof result.codeVerifier).toBe('string')
      expect(typeof result.state).toBe('string')
    })

    it('should include all required OAuth parameters in URL', async () => {
      const result = await outlookAuth.startAuth()
      const url = new URL(result.authUrl)

      expect(url.searchParams.get('client_id')).toBe(OUTLOOK_CONFIG.clientId)
      expect(url.searchParams.get('redirect_uri')).toBe(
        OUTLOOK_CONFIG.redirectUri
      )
      expect(url.searchParams.get('response_type')).toBe('code')
      expect(url.searchParams.get('scope')).toBe(
        OUTLOOK_CONFIG.scopes.join(' ')
      )
      expect(url.searchParams.get('code_challenge_method')).toBe('S256')
      expect(url.searchParams.get('response_mode')).toBe('query')
    })

    it('should NOT include access_type or prompt parameters (Microsoft-specific)', async () => {
      const result = await outlookAuth.startAuth()
      const url = new URL(result.authUrl)

      // Microsoft doesn't use these Google-specific parameters
      expect(url.searchParams.get('access_type')).toBeNull()
      expect(url.searchParams.get('prompt')).toBeNull()
    })

    it('should include code_challenge in URL', async () => {
      const result = await outlookAuth.startAuth()
      const url = new URL(result.authUrl)

      const codeChallenge = url.searchParams.get('code_challenge')
      expect(codeChallenge).toBeTruthy()
      expect(codeChallenge?.length).toBe(43) // SHA-256 base64url
    })

    it('should include state in URL', async () => {
      const result = await outlookAuth.startAuth()
      const url = new URL(result.authUrl)

      const state = url.searchParams.get('state')
      expect(state).toBe(result.state)
    })

    it('should generate different values on each call', async () => {
      const result1 = await outlookAuth.startAuth()
      const result2 = await outlookAuth.startAuth()

      expect(result1.codeVerifier).not.toBe(result2.codeVerifier)
      expect(result1.state).not.toBe(result2.state)
    })

    it('should use Microsoft authorization endpoint', async () => {
      const result = await outlookAuth.startAuth()

      expect(result.authUrl).toContain('login.microsoftonline.com')
      expect(result.authUrl).toContain('/oauth2/v2.0/authorize')
    })

    it('should include offline_access scope for refresh tokens', async () => {
      const result = await outlookAuth.startAuth()
      const url = new URL(result.authUrl)

      const scope = url.searchParams.get('scope')
      expect(scope).toContain('offline_access')
    })
  })

  describe('completeAuth', () => {
    const mockTokenResponse = {
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      expires_in: 3600,
      token_type: 'Bearer',
      scope: 'https://graph.microsoft.com/Mail.Read offline_access',
    }

    it('should exchange authorization code for tokens', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockTokenResponse,
      })

      const result = await outlookAuth.completeAuth({
        code: 'test-code',
        codeVerifier: 'test-verifier',
        state: 'test-state',
      })

      expect(result.accessToken).toBe(mockTokenResponse.access_token)
      expect(result.refreshToken).toBe(mockTokenResponse.refresh_token)
      expect(result.expiresIn).toBe(mockTokenResponse.expires_in)
      expect(result.tokenType).toBe(mockTokenResponse.token_type)
    })

    it('should make POST request to token endpoint', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockTokenResponse,
      })

      await outlookAuth.completeAuth({
        code: 'test-code',
        codeVerifier: 'test-verifier',
        state: 'test-state',
      })

      expect(fetch).toHaveBeenCalledWith(
        OUTLOOK_CONFIG.tokenUrl,
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        })
      )
    })

    it('should include PKCE verifier in token request', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockTokenResponse,
      })

      await outlookAuth.completeAuth({
        code: 'test-code',
        codeVerifier: 'test-verifier',
        state: 'test-state',
      })

      const fetchCall = (fetch as any).mock.calls[0]
      const body = fetchCall[1].body.toString()

      expect(body).toContain('code_verifier=test-verifier')
      expect(body).toContain('code=test-code')
      expect(body).toContain('grant_type=authorization_code')
    })

    it('should NOT include client_secret (public client)', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockTokenResponse,
      })

      await outlookAuth.completeAuth({
        code: 'test-code',
        codeVerifier: 'test-verifier',
        state: 'test-state',
      })

      const fetchCall = (fetch as any).mock.calls[0]
      const body = fetchCall[1].body.toString()

      expect(body).not.toContain('client_secret')
    })

    it('should throw error on failed token exchange', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: 'invalid_grant',
          error_description: 'Invalid authorization code',
        }),
      })

      await expect(
        outlookAuth.completeAuth({
          code: 'invalid-code',
          codeVerifier: 'test-verifier',
          state: 'test-state',
        })
      ).rejects.toThrow('Token exchange failed')
    })

    it('should handle missing access token in response', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ refresh_token: 'token' }),
      })

      await expect(
        outlookAuth.completeAuth({
          code: 'test-code',
          codeVerifier: 'test-verifier',
          state: 'test-state',
        })
      ).rejects.toThrow('No access token received')
    })

    it('should handle missing refresh token gracefully', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'test-token',
          expires_in: 3600,
        }),
      })

      const result = await outlookAuth.completeAuth({
        code: 'test-code',
        codeVerifier: 'test-verifier',
        state: 'test-state',
      })

      expect(result.refreshToken).toBe('')
    })

    it('should use Microsoft token endpoint', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockTokenResponse,
      })

      await outlookAuth.completeAuth({
        code: 'test-code',
        codeVerifier: 'test-verifier',
        state: 'test-state',
      })

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('login.microsoftonline.com'),
        expect.any(Object)
      )
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/oauth2/v2.0/token'),
        expect.any(Object)
      )
    })
  })

  describe('refreshTokens', () => {
    const mockRefreshResponse = {
      access_token: 'new-access-token',
      expires_in: 3600,
      token_type: 'Bearer',
      scope: 'https://graph.microsoft.com/Mail.Read offline_access',
    }

    it('should refresh access token', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockRefreshResponse,
      })

      const result = await outlookAuth.refreshTokens('test-refresh-token')

      expect(result.accessToken).toBe(mockRefreshResponse.access_token)
      expect(result.expiresIn).toBe(mockRefreshResponse.expires_in)
    })

    it('should reuse refresh token if not provided in response', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockRefreshResponse,
      })

      const result = await outlookAuth.refreshTokens('old-refresh-token')

      expect(result.refreshToken).toBe('old-refresh-token')
    })

    it('should throw error if refresh token is empty', async () => {
      await expect(outlookAuth.refreshTokens('')).rejects.toThrow(
        'Refresh token is required'
      )
    })

    it('should make POST request with refresh_token grant type', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockRefreshResponse,
      })

      await outlookAuth.refreshTokens('test-refresh-token')

      const fetchCall = (fetch as any).mock.calls[0]
      const body = fetchCall[1].body.toString()

      expect(body).toContain('grant_type=refresh_token')
      expect(body).toContain('refresh_token=test-refresh-token')
    })

    it('should include scope parameter in refresh request (Microsoft requirement)', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockRefreshResponse,
      })

      await outlookAuth.refreshTokens('test-refresh-token')

      const fetchCall = (fetch as any).mock.calls[0]
      const body = fetchCall[1].body.toString()

      expect(body).toContain('scope=')
      expect(body).toContain(encodeURIComponent('https://graph.microsoft.com/Mail.Read'))
    })

    it('should throw error on failed refresh', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: 'invalid_grant',
          error_description: 'Token has been revoked',
        }),
      })

      await expect(
        outlookAuth.refreshTokens('invalid-token')
      ).rejects.toThrow('Token refresh failed')
    })

    it('should handle missing access token in refresh response', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ expires_in: 3600 }),
      })

      await expect(
        outlookAuth.refreshTokens('test-token')
      ).rejects.toThrow('No access token received')
    })
  })

  describe('revokeTokens', () => {
    it('should revoke access token', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        text: async () => '',
      })

      await expect(
        outlookAuth.revokeTokens('test-token')
      ).resolves.toBeUndefined()
    })

    it('should make GET request to logout endpoint (Microsoft-specific)', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        text: async () => '',
      })

      await outlookAuth.revokeTokens('test-token')

      expect(fetch).toHaveBeenCalledWith(
        OUTLOOK_CONFIG.revokeUrl,
        expect.objectContaining({
          method: 'GET',
        })
      )
    })

    it('should include Authorization header with Bearer token', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        text: async () => '',
      })

      await outlookAuth.revokeTokens('test-token')

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token',
          }),
        })
      )
    })

    it('should throw error if token is empty', async () => {
      await expect(outlookAuth.revokeTokens('')).rejects.toThrow(
        'Access token is required'
      )
    })

    it('should throw error on failed revocation', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        text: async () => 'Invalid token',
      })

      await expect(outlookAuth.revokeTokens('invalid-token')).rejects.toThrow(
        'Token revocation failed'
      )
    })

    it('should use Microsoft logout endpoint', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        text: async () => '',
      })

      await outlookAuth.revokeTokens('test-token')

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('login.microsoftonline.com'),
        expect.any(Object)
      )
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/oauth2/v2.0/logout'),
        expect.any(Object)
      )
    })
  })
})
