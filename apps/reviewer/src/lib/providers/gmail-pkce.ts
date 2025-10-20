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
    try {
      const token = await chrome.identity.getAuthToken({
        interactive: true,
        scopes: GMAIL_SCOPES
      })

      if (!token) {
        throw new Error('No token received from Gmail OAuth')
      }

      // Chrome's getAuthToken returns just the access token
      // We need to structure it as OAuthTokens
      return {
        access_token: token,
        token_type: 'Bearer',
        expires_in: 3600, // Default 1 hour
        scope: GMAIL_SCOPES.join(' ')
      }
    } catch (error) {
      console.error('Gmail auth error:', error)
      throw new Error(`Gmail authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
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
        throw new Error(`Failed to get user profile: ${response.statusText}`)
      }

      const data = await response.json()
      return data.emailAddress
    } catch (error) {
      console.error('Failed to get Gmail user email:', error)
      throw error
    }
  }
}
