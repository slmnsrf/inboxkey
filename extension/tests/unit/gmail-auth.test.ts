/**
 * Unit tests for Gmail Chrome Identity Authentication
 *
 * Tests cover:
 * - Chrome Identity API integration
 * - Token retrieval and caching
 * - Error handling
 * - User cancellation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { authenticateGmail, getGmailToken, clearGmailToken } from '../../src/lib/providers/gmail/chrome-auth'

/**
 * Mock helper for chrome.identity API
 */
function mockChromeIdentity() {
  let mockToken = 'mock-access-token'
  let mockError: { message: string } | null = null

  global.chrome = {
    identity: {
      getAuthToken: vi.fn((details, callback) => {
        if (mockError) {
          // @ts-ignore
          chrome.runtime.lastError = mockError
          callback(undefined)
          // @ts-ignore
          chrome.runtime.lastError = null
        } else {
          callback(mockToken)
        }
      }),
      removeCachedAuthToken: vi.fn(({ token }, callback) => {
        if (mockError) {
          // @ts-ignore
          chrome.runtime.lastError = mockError
          callback()
          // @ts-ignore
          chrome.runtime.lastError = null
        } else {
          callback()
        }
      }),
    },
    runtime: {
      lastError: null,
    },
  } as any

  return {
    setToken: (token: string) => { mockToken = token },
    setError: (error: { message: string } | null) => { mockError = error },
    clearToken: () => { mockToken = '' },
    clearError: () => { mockError = null },
  }
}

describe('Chrome Identity Gmail Authentication', () => {
  let chromeMock: ReturnType<typeof mockChromeIdentity>

  beforeEach(() => {
    chromeMock = mockChromeIdentity()
  })

  describe('authenticateGmail', () => {
    it('should authenticate successfully with getAuthToken', async () => {
      chromeMock.setToken('test-access-token')

      const tokens = await authenticateGmail()

      expect(tokens.accessToken).toBe('test-access-token')
      expect(tokens.refreshToken).toBe('') // Not used with chrome.identity
      expect(tokens.expiresIn).toBe(3600)
      expect(tokens.tokenType).toBe('Bearer')
      expect(tokens.scope).toBe('https://www.googleapis.com/auth/gmail.readonly')

      expect(chrome.identity.getAuthToken).toHaveBeenCalledWith(
        { interactive: true },
        expect.any(Function)
      )
    })

    it('should request interactive authentication', async () => {
      chromeMock.setToken('test-token')

      await authenticateGmail()

      expect(chrome.identity.getAuthToken).toHaveBeenCalledWith(
        { interactive: true },
        expect.any(Function)
      )
    })

    it('should handle user cancellation', async () => {
      chromeMock.setError({ message: 'User canceled the authorization' })

      await expect(authenticateGmail()).rejects.toThrow('OAuth cancelled by user')
    })

    it('should handle user cancellation with "canceled" variant', async () => {
      chromeMock.setError({ message: 'Authorization canceled by user' })

      await expect(authenticateGmail()).rejects.toThrow('OAuth cancelled by user')
    })

    it('should handle not signed in to Chrome error', async () => {
      chromeMock.setError({ message: 'User is not signed in' })

      await expect(authenticateGmail()).rejects.toThrow('Please sign in to Chrome with your Google account')
    })

    it('should handle user did not approve error', async () => {
      chromeMock.setError({ message: 'The user did not approve access.' })

      await expect(authenticateGmail()).rejects.toThrow('Gmail authentication failed: The user did not approve access.')
    })

    it('should handle OAuth2 not granted error', async () => {
      chromeMock.setError({ message: 'OAuth2 not granted or revoked.' })

      await expect(authenticateGmail()).rejects.toThrow('Gmail authentication failed')
    })

    it('should handle generic error', async () => {
      chromeMock.setError({ message: 'Some unknown error occurred' })

      await expect(authenticateGmail()).rejects.toThrow('Gmail authentication failed: Some unknown error occurred')
    })

    it('should handle missing token in response', async () => {
      chromeMock.clearToken()

      await expect(authenticateGmail()).rejects.toThrow('No access token received')
    })

    it('should return tokens in correct format', async () => {
      chromeMock.setToken('valid-token-123')

      const tokens = await authenticateGmail()

      expect(tokens).toHaveProperty('accessToken')
      expect(tokens).toHaveProperty('refreshToken')
      expect(tokens).toHaveProperty('expiresIn')
      expect(tokens).toHaveProperty('tokenType')
      expect(tokens).toHaveProperty('scope')
    })
  })

  describe('getGmailToken', () => {
    it('should get cached token without user interaction', async () => {
      chromeMock.setToken('cached-token')

      const token = await getGmailToken()

      expect(token).toBe('cached-token')
      expect(chrome.identity.getAuthToken).toHaveBeenCalledWith(
        { interactive: false },
        expect.any(Function)
      )
    })

    it('should use non-interactive mode', async () => {
      chromeMock.setToken('test-token')

      await getGmailToken()

      const call = (chrome.identity.getAuthToken as any).mock.calls[0]
      expect(call[0].interactive).toBe(false)
    })

    it('should throw error if no cached token available', async () => {
      chromeMock.clearToken()

      await expect(getGmailToken()).rejects.toThrow('No cached token available')
    })

    it('should handle token fetch error', async () => {
      chromeMock.setError({ message: 'No token in cache' })

      await expect(getGmailToken()).rejects.toThrow('Token fetch failed: No token in cache')
    })

    it('should return string token', async () => {
      chromeMock.setToken('my-token-123')

      const token = await getGmailToken()

      expect(typeof token).toBe('string')
      expect(token.length).toBeGreaterThan(0)
    })
  })

  describe('clearGmailToken', () => {
    it('should clear cached token successfully', async () => {
      await clearGmailToken('token-to-clear')

      expect(chrome.identity.removeCachedAuthToken).toHaveBeenCalledWith(
        { token: 'token-to-clear' },
        expect.any(Function)
      )
    })

    it('should handle token clear error', async () => {
      chromeMock.setError({ message: 'Failed to clear token' })

      await expect(clearGmailToken('test-token')).rejects.toThrow('Token clear failed: Failed to clear token')
    })

    it('should complete successfully when no error', async () => {
      chromeMock.clearError()

      await expect(clearGmailToken('test-token')).resolves.toBeUndefined()
    })

    it('should accept any token string', async () => {
      await clearGmailToken('any-token-value')

      expect(chrome.identity.removeCachedAuthToken).toHaveBeenCalledWith(
        { token: 'any-token-value' },
        expect.any(Function)
      )
    })
  })

  describe('Token caching behavior', () => {
    it('should reuse cached token on successive calls', async () => {
      chromeMock.setToken('cached-token')

      const token1 = await getGmailToken()
      const token2 = await getGmailToken()

      expect(token1).toBe(token2)
      expect(chrome.identity.getAuthToken).toHaveBeenCalledTimes(2)
    })

    it('should get new token after clearing cache', async () => {
      chromeMock.setToken('old-token')
      const oldToken = await getGmailToken()

      await clearGmailToken(oldToken)

      chromeMock.setToken('new-token')
      const newToken = await getGmailToken()

      expect(newToken).toBe('new-token')
      expect(chrome.identity.removeCachedAuthToken).toHaveBeenCalledWith(
        { token: 'old-token' },
        expect.any(Function)
      )
    })
  })

  describe('Error message variations', () => {
    it('should handle "cancelled" spelling', async () => {
      chromeMock.setError({ message: 'User cancelled the request' })

      await expect(authenticateGmail()).rejects.toThrow('OAuth cancelled by user')
    })

    it('should handle "canceled" spelling', async () => {
      chromeMock.setError({ message: 'User canceled the request' })

      await expect(authenticateGmail()).rejects.toThrow('OAuth cancelled by user')
    })

    it('should handle various "not signed in" messages', async () => {
      const messages = [
        'User is not signed in',
        'not signed in to Chrome',
        'Please sign in first',
      ]

      for (const message of messages) {
        chromeMock.setError({ message })
        await expect(authenticateGmail()).rejects.toThrow()
        chromeMock.clearError()
      }
    })
  })

  describe('Chrome runtime integration', () => {
    it('should check chrome.runtime.lastError for errors', async () => {
      chromeMock.setError({ message: 'Test error' })

      await expect(authenticateGmail()).rejects.toThrow('Gmail authentication failed: Test error')
    })

    it('should clear lastError after reading', async () => {
      chromeMock.setError({ message: 'Temporary error' })

      try {
        await authenticateGmail()
      } catch (e) {
        // Expected to throw
      }

      // Verify lastError is null after processing
      expect(chrome.runtime.lastError).toBeNull()
    })
  })
})
