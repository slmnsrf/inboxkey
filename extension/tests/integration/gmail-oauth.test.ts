/**
 * Integration tests for Gmail Chrome Identity Authentication
 *
 * Tests full integration with chrome.identity API
 * No MSW needed - chrome.identity manages OAuth flow internally
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { authenticateGmail, getGmailToken, clearGmailToken } from '../../src/lib/providers/gmail/chrome-auth'

/**
 * Mock helper for chrome.identity API with realistic behavior
 */
function mockChromeIdentity() {
  let cachedToken: string | null = 'mock-cached-token'
  let mockError: { message: string } | null = null
  let isInteractive = false

  global.chrome = {
    identity: {
      getAuthToken: vi.fn((details, callback) => {
        isInteractive = details.interactive

        if (mockError) {
          // @ts-ignore
          chrome.runtime.lastError = mockError
          callback(undefined)
          // @ts-ignore
          chrome.runtime.lastError = null
          return
        }

        // Non-interactive fails if no cached token
        if (!isInteractive && !cachedToken) {
          // @ts-ignore
          chrome.runtime.lastError = { message: 'No cached token available' }
          callback(undefined)
          // @ts-ignore
          chrome.runtime.lastError = null
          return
        }

        callback(cachedToken || undefined)
      }),
      removeCachedAuthToken: vi.fn(({ token }, callback) => {
        if (mockError) {
          // @ts-ignore
          chrome.runtime.lastError = mockError
          callback()
          // @ts-ignore
          chrome.runtime.lastError = null
          return
        }

        // Clear the cached token
        if (token === cachedToken) {
          cachedToken = null
        }
        callback()
      }),
    },
    runtime: {
      lastError: null,
    },
  } as any

  return {
    setToken: (token: string | null) => { cachedToken = token },
    setError: (error: { message: string } | null) => { mockError = error },
    clearCache: () => { cachedToken = null },
    getToken: () => cachedToken,
    wasInteractive: () => isInteractive,
  }
}

describe('Gmail Chrome Identity Integration', () => {
  let chromeMock: ReturnType<typeof mockChromeIdentity>

  beforeEach(() => {
    chromeMock = mockChromeIdentity()
  })

  describe('Complete authentication flow', () => {
    it('should authenticate with interactive flow', async () => {
      chromeMock.setToken('fresh-access-token')

      const tokens = await authenticateGmail()

      expect(tokens.accessToken).toBe('fresh-access-token')
      expect(tokens.refreshToken).toBe('')
      expect(tokens.expiresIn).toBe(3600)
      expect(chromeMock.wasInteractive()).toBe(true)
    })

    it('should use cached token when available', async () => {
      chromeMock.setToken('cached-token-123')

      const token = await getGmailToken()

      expect(token).toBe('cached-token-123')
      expect(chromeMock.wasInteractive()).toBe(false)
    })

    it('should handle full auth -> cache -> clear -> re-auth cycle', async () => {
      // Initial authentication
      chromeMock.setToken('initial-token')
      const tokens1 = await authenticateGmail()
      expect(tokens1.accessToken).toBe('initial-token')

      // Get cached token
      const cachedToken = await getGmailToken()
      expect(cachedToken).toBe('initial-token')

      // Clear cache
      await clearGmailToken(cachedToken)
      expect(chromeMock.getToken()).toBeNull()

      // Re-authenticate after cache clear
      chromeMock.setToken('new-token-after-clear')
      const tokens2 = await authenticateGmail()
      expect(tokens2.accessToken).toBe('new-token-after-clear')
    })
  })

  describe('Token caching behavior', () => {
    it('should return cached token without re-authentication', async () => {
      chromeMock.setToken('persistent-token')

      // First call
      const token1 = await getGmailToken()
      expect(token1).toBe('persistent-token')

      // Second call should use cache
      const token2 = await getGmailToken()
      expect(token2).toBe('persistent-token')

      expect(chrome.identity.getAuthToken).toHaveBeenCalledTimes(2)
    })

    it('should fail non-interactive request when no cache', async () => {
      chromeMock.clearCache()

      await expect(getGmailToken()).rejects.toThrow('Token fetch failed')
    })

    it('should succeed interactive request when no cache', async () => {
      chromeMock.clearCache()
      chromeMock.setToken('new-interactive-token')

      const tokens = await authenticateGmail()

      expect(tokens.accessToken).toBe('new-interactive-token')
    })
  })

  describe('Error handling scenarios', () => {
    it('should handle user cancellation gracefully', async () => {
      chromeMock.setError({ message: 'User canceled the authorization' })

      await expect(authenticateGmail()).rejects.toThrow('OAuth cancelled by user')

      // Verify state after error
      expect(chromeMock.getToken()).toBe('mock-cached-token')
    })

    it('should handle not signed in to Chrome', async () => {
      chromeMock.setError({ message: 'User is not signed in to Chrome' })

      await expect(authenticateGmail()).rejects.toThrow('Please sign in to Chrome')
    })

    it('should handle network errors during token fetch', async () => {
      chromeMock.setError({ message: 'Network error occurred' })

      await expect(getGmailToken()).rejects.toThrow('Token fetch failed: Network error occurred')
    })

    it('should handle token clear failure', async () => {
      chromeMock.setError({ message: 'Failed to remove token' })

      await expect(clearGmailToken('some-token')).rejects.toThrow('Token clear failed')
    })

    it('should recover after error', async () => {
      // First request fails
      chromeMock.setError({ message: 'Temporary error' })
      await expect(authenticateGmail()).rejects.toThrow()

      // Clear error and retry
      chromeMock.setError(null)
      chromeMock.setToken('recovery-token')
      const tokens = await authenticateGmail()

      expect(tokens.accessToken).toBe('recovery-token')
    })
  })

  describe('Token lifecycle management', () => {
    it('should handle token expiration and refresh', async () => {
      // Get initial token
      chromeMock.setToken('expiring-token')
      const token1 = await getGmailToken()
      expect(token1).toBe('expiring-token')

      // Simulate expiration by clearing cache
      await clearGmailToken(token1)

      // Get new token
      chromeMock.setToken('refreshed-token')
      const tokens = await authenticateGmail()
      expect(tokens.accessToken).toBe('refreshed-token')
    })

    it('should handle multiple token clears', async () => {
      chromeMock.setToken('token-1')
      await clearGmailToken('token-1')

      chromeMock.setToken('token-2')
      await clearGmailToken('token-2')

      chromeMock.setToken('token-3')
      await clearGmailToken('token-3')

      expect(chrome.identity.removeCachedAuthToken).toHaveBeenCalledTimes(3)
    })

    it('should handle concurrent token requests', async () => {
      chromeMock.setToken('concurrent-token')

      // Start multiple requests simultaneously
      const promises = [
        getGmailToken(),
        getGmailToken(),
        getGmailToken(),
      ]

      const results = await Promise.all(promises)

      // All should succeed with same token
      expect(results).toHaveLength(3)
      results.forEach(token => {
        expect(token).toBe('concurrent-token')
      })
    })
  })

  describe('Interactive vs Non-interactive modes', () => {
    it('should use interactive mode for authenticateGmail', async () => {
      chromeMock.setToken('interactive-token')

      await authenticateGmail()

      expect(chromeMock.wasInteractive()).toBe(true)
    })

    it('should use non-interactive mode for getGmailToken', async () => {
      chromeMock.setToken('non-interactive-token')

      await getGmailToken()

      expect(chromeMock.wasInteractive()).toBe(false)
    })

    it('should show different behavior between modes', async () => {
      chromeMock.clearCache()

      // Non-interactive should fail
      await expect(getGmailToken()).rejects.toThrow()

      // Interactive should succeed
      chromeMock.setToken('new-token')
      const tokens = await authenticateGmail()
      expect(tokens.accessToken).toBe('new-token')
    })
  })

  describe('Chrome identity API integration', () => {
    it('should call getAuthToken with correct parameters', async () => {
      chromeMock.setToken('test-token')

      await authenticateGmail()

      expect(chrome.identity.getAuthToken).toHaveBeenCalledWith(
        { interactive: true },
        expect.any(Function)
      )
    })

    it('should call removeCachedAuthToken with correct parameters', async () => {
      await clearGmailToken('specific-token')

      expect(chrome.identity.removeCachedAuthToken).toHaveBeenCalledWith(
        { token: 'specific-token' },
        expect.any(Function)
      )
    })

    it('should handle chrome.runtime.lastError correctly', async () => {
      chromeMock.setError({ message: 'Runtime error' })

      try {
        await authenticateGmail()
      } catch (e) {
        // Expected to throw
      }

      // lastError should be cleared
      expect(chrome.runtime.lastError).toBeNull()
    })
  })

  describe('Token format validation', () => {
    it('should return OAuthTokens format from authenticateGmail', async () => {
      chromeMock.setToken('format-test-token')

      const tokens = await authenticateGmail()

      expect(tokens).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: '',
        expiresIn: expect.any(Number),
        tokenType: 'Bearer',
        scope: expect.stringContaining('gmail.readonly'),
      })
    })

    it('should return string from getGmailToken', async () => {
      chromeMock.setToken('string-token')

      const token = await getGmailToken()

      expect(typeof token).toBe('string')
      expect(token.length).toBeGreaterThan(0)
    })

    it('should have consistent token values', async () => {
      chromeMock.setToken('consistent-token')

      const fullTokens = await authenticateGmail()
      const simpleToken = await getGmailToken()

      expect(fullTokens.accessToken).toBe(simpleToken)
    })
  })

  describe('Edge cases', () => {
    it('should handle empty token string', async () => {
      chromeMock.setToken('')

      await expect(authenticateGmail()).rejects.toThrow('No access token received')
    })

    it('should handle null token', async () => {
      chromeMock.setToken(null)

      await expect(authenticateGmail()).rejects.toThrow('No access token received')
    })

    it('should handle clearing empty token', async () => {
      await expect(clearGmailToken('')).resolves.toBeUndefined()

      expect(chrome.identity.removeCachedAuthToken).toHaveBeenCalledWith(
        { token: '' },
        expect.any(Function)
      )
    })

    it('should handle very long token strings', async () => {
      const longToken = 'a'.repeat(1000)
      chromeMock.setToken(longToken)

      const tokens = await authenticateGmail()

      expect(tokens.accessToken).toBe(longToken)
      expect(tokens.accessToken.length).toBe(1000)
    })
  })

  describe('Real-world usage patterns', () => {
    it('should simulate app startup with cached token', async () => {
      // App starts, tries to get cached token
      chromeMock.setToken('startup-cached-token')
      const token = await getGmailToken()

      expect(token).toBe('startup-cached-token')
      expect(chromeMock.wasInteractive()).toBe(false)
    })

    it('should simulate first-time authentication', async () => {
      // No cached token on first run
      chromeMock.clearCache()

      // Non-interactive fails
      await expect(getGmailToken()).rejects.toThrow()

      // User clicks "Sign In" button
      chromeMock.setToken('first-time-token')
      const tokens = await authenticateGmail()

      expect(tokens.accessToken).toBe('first-time-token')
      expect(chromeMock.wasInteractive()).toBe(true)
    })

    it('should simulate token expiration and re-auth', async () => {
      // User is authenticated
      chromeMock.setToken('valid-token')
      const token1 = await getGmailToken()

      // Token expires (API returns 401, app clears cache)
      await clearGmailToken(token1)
      expect(chromeMock.getToken()).toBeNull()

      // Re-authenticate
      chromeMock.setToken('new-valid-token')
      const tokens = await authenticateGmail()

      expect(tokens.accessToken).toBe('new-valid-token')
    })

    it('should simulate user logout', async () => {
      // User is authenticated
      chromeMock.setToken('logged-in-token')
      const token = await getGmailToken()

      // User clicks "Sign Out"
      await clearGmailToken(token)

      // Verify cache is cleared
      expect(chromeMock.getToken()).toBeNull()

      // Next request should fail
      await expect(getGmailToken()).rejects.toThrow()
    })
  })
})
