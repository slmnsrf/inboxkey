/**
 * Chrome Identity API Integration for Gmail OAuth
 *
 * Uses chrome.identity.getAuthToken() for simplified OAuth flow.
 * Chrome manages token caching, refresh, and PKCE security automatically.
 */

import type { OAuthTokens } from '../provider-interface'

/**
 * Authenticate with Gmail using Chrome Identity API
 *
 * Shows interactive login UI if user not authenticated.
 * Returns cached token if available and valid.
 *
 * @returns OAuth tokens (only accessToken is populated)
 * @throws Error if authentication fails or user cancels
 */
export async function authenticateGmail(): Promise<OAuthTokens> {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken(
      { interactive: true },
      (token) => {
        if (chrome.runtime.lastError) {
          const error = chrome.runtime.lastError.message || 'Unknown error'

          // Handle specific errors
          if (error.includes('canceled') || error.includes('cancelled')) {
            reject(new Error('OAuth cancelled by user'))
          } else if (error.includes('not signed in')) {
            reject(new Error('Please sign in to Chrome with your Google account'))
          } else {
            reject(new Error(`Gmail authentication failed: ${error}`))
          }
          return
        }

        if (!token) {
          reject(new Error('No access token received'))
          return
        }

        // Return in OAuthTokens format for compatibility
        resolve({
          accessToken: token,
          refreshToken: '', // Not used with getAuthToken
          expiresIn: 3600, // Default 1 hour
          tokenType: 'Bearer',
          scope: 'https://www.googleapis.com/auth/gmail.readonly'
        })
      }
    )
  })
}

/**
 * Get cached Gmail token (non-interactive)
 *
 * Returns cached token without showing UI.
 * Use for background token refresh.
 *
 * @returns Access token string
 * @throws Error if no cached token available
 */
export async function getGmailToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken(
      { interactive: false },
      (token) => {
        if (chrome.runtime.lastError) {
          reject(new Error(`Token fetch failed: ${chrome.runtime.lastError.message}`))
          return
        }

        if (!token) {
          reject(new Error('No cached token available'))
          return
        }

        resolve(token)
      }
    )
  })
}

/**
 * Clear cached Gmail token
 *
 * Removes token from Chrome's cache.
 * Should be called before revokeTokens() for complete logout.
 *
 * @param token - The access token to remove from cache
 */
export async function clearGmailToken(token: string): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.identity.removeCachedAuthToken(
      { token },
      () => {
        if (chrome.runtime.lastError) {
          reject(new Error(`Token clear failed: ${chrome.runtime.lastError.message}`))
          return
        }
        resolve()
      }
    )
  })
}
