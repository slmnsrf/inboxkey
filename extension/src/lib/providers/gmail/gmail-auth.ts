/**
 * Gmail OAuth 2.0 Authentication using chrome.identity.getAuthToken()
 *
 * Implements OAuth 2.0 authentication using Chrome's built-in identity API.
 * Chrome handles the OAuth flow, token refresh, and secure token storage
 * automatically.
 *
 * Flow:
 * 1. Call chrome.identity.getAuthToken() with interactive flag
 * 2. Chrome handles OAuth flow and returns access token
 * 3. Chrome automatically refreshes tokens when expired
 * 4. Revoke tokens to logout
 *
 * Security Features:
 * - Chrome manages OAuth flow securely (no PKCE needed)
 * - Automatic token refresh handled by Chrome
 * - Tokens stored securely by Chrome (not in extension storage)
 * - No client secrets in extension code
 */

import type { OAuthTokens } from '../provider-interface'
import { GMAIL_CONFIG } from './config'

/**
 * Gmail OAuth 2.0 Authentication Handler
 */
export class GmailAuth {
  constructor(private config: typeof GMAIL_CONFIG = GMAIL_CONFIG) {}

  /**
   * Refresh access token
   *
   * With getAuthToken(), Chrome handles refresh automatically.
   * This method is kept for API compatibility with the provider interface.
   *
   * @param refreshToken - Not used (Chrome manages refresh internally), but we use it to pass the old token for cache removal
   * @returns New OAuth tokens
   */
  async refreshTokens(oldToken: string): Promise<OAuthTokens> {
    // First, remove the old cached token to force Chrome to get a fresh one
    // This is important when the token becomes invalid before expiry
    if (oldToken) {
      await new Promise<void>((resolve) => {
        chrome.identity.removeCachedAuthToken(
          { token: oldToken },
          () => {
            // Ignore errors - best effort to clear cache
            if (chrome.runtime.lastError) {
              console.log('[GmailAuth] Could not remove cached token:', chrome.runtime.lastError.message)
            }
            resolve()
          }
        )
      })
    }

    // Now get a fresh token from Chrome
    return new Promise((resolve, reject) => {
      chrome.identity.getAuthToken(
        { interactive: false },
        (token) => {
          if (chrome.runtime.lastError) {
            reject(new Error(
              `Token refresh failed: ${chrome.runtime.lastError.message}`
            ))
            return
          }

          if (!token) {
            reject(new Error('Token refresh failed: No token received'))
            return
          }

          console.log('[GmailAuth] Successfully refreshed token')

          resolve({
            accessToken: token,
            refreshToken: '', // Not used with getAuthToken
            expiresIn: 3600,
            tokenType: 'Bearer',
            scope: 'https://www.googleapis.com/auth/gmail.readonly'
          })
        }
      )
    })
  }

  /**
   * Revoke OAuth tokens (logout)
   *
   * Revokes the access token with Google and clears Chrome's token cache.
   *
   * @param accessToken - The access token to revoke
   * @throws Error if revocation fails
   */
  async revokeTokens(accessToken: string): Promise<void> {
    if (!accessToken) {
      throw new Error('Access token is required for revocation')
    }

    // Step 1: Revoke with Google
    const response = await fetch(this.config.revokeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        token: accessToken,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Token revocation failed: ${error || 'Unknown error'}`)
    }

    // Step 2: Clear Chrome's token cache
    await new Promise<void>((resolve, _reject) => {
      chrome.identity.removeCachedAuthToken(
        { token: accessToken },
        () => {
          if (chrome.runtime.lastError) {
            console.warn('Failed to clear Chrome token cache:', chrome.runtime.lastError)
            // Don't reject - revocation succeeded, cache clear is best-effort
          }
          resolve()
        }
      )
    })
  }
}
