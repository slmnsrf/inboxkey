/**
 * Gmail PKCE Provider for Reviewer
 * Simplified Gmail OAuth using chrome.identity.getAuthToken
 */

import type { OAuthTokens, IReviewerProvider } from './types'

// Gmail OAuth config - Reviewer extension client ID
const GMAIL_CLIENT_ID = '63223580830-hogfiq2aue7urfjal2jrsj4biaussk3a.apps.googleusercontent.com'
const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly']

export class GmailPKCEProvider implements IReviewerProvider {
  public readonly providerId = 'gmail' as const

  /**
   * Start Gmail OAuth using chrome.identity.getAuthToken
   * Note: Gmail uses Chrome's built-in OAuth, not manual PKCE
   */
  async startAuth(): Promise<{ authUrl: string; codeVerifier: string; state: string }> {
    // For Gmail, chrome.identity.getAuthToken handles everything
    // This method is for interface compatibility
    throw new Error('Gmail uses chrome.identity.getAuthToken - call authenticateGmail() instead')
  }

  /**
   * Complete auth - not used for Gmail
   */
  async completeAuth(code: string, verifier: string, state: string): Promise<OAuthTokens> {
    throw new Error('Gmail uses chrome.identity.getAuthToken - call authenticateGmail() instead')
  }

  /**
   * Authenticate with Gmail using Chrome's built-in OAuth
   */
  async authenticate(): Promise<OAuthTokens> {
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

          console.log('Gmail token received:', typeof token, token.substring(0, 20) + '...')

          // Return in OAuthTokens format
          resolve({
            access_token: token,
            token_type: 'Bearer',
            expires_in: 3600, // Default 1 hour
            scope: GMAIL_SCOPES.join(' ')
          })
        }
      )
    })
  }

  /**
   * Refresh Gmail tokens
   */
  async refreshTokens(refreshToken: string): Promise<OAuthTokens> {
    // Chrome handles refresh automatically with getAuthToken
    return this.authenticate()
  }

  /**
   * Revoke Gmail tokens
   */
  async revokeTokens(accessToken: string): Promise<void> {
    try {
      await chrome.identity.removeCachedAuthToken({ token: accessToken })

      // Also revoke at Google's endpoint
      await fetch(`https://oauth2.googleapis.com/revoke?token=${accessToken}`, {
        method: 'POST'
      })
    } catch (error) {
      console.error('Gmail revoke error:', error)
      throw new Error(`Failed to revoke Gmail tokens: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Get user's email address
   */
  async getUserEmail(accessToken: string): Promise<string> {
    try {
      const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      })

      if (!response.ok) {
        // Get detailed error message from API
        let errorMessage = `HTTP ${response.status} ${response.statusText}`
        try {
          const errorData = await response.json()
          if (errorData.error) {
            errorMessage = `${errorMessage}: ${errorData.error.message || JSON.stringify(errorData.error)}`
          }
        } catch {
          // Ignore JSON parsing error, use basic error message
        }
        throw new Error(`Failed to get user profile: ${errorMessage}`)
      }

      const data = await response.json()
      return data.emailAddress
    } catch (error) {
      console.error('Failed to get Gmail user email:', error)
      throw error
    }
  }
}
