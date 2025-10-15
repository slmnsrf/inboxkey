/**
 * Outlook PKCE Provider for Reviewer
 * Manual PKCE flow for Microsoft Graph API
 */

import type { OAuthTokens, IReviewerProvider } from './types'
import { generateCodeVerifier, generateCodeChallenge, generateState } from './pkce-utils'

// Outlook OAuth config
const OUTLOOK_CLIENT_ID = process.env.PLASMO_PUBLIC_OUTLOOK_CLIENT_ID || 'YOUR_CLIENT_ID'
const OUTLOOK_AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize'
const OUTLOOK_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
const OUTLOOK_LOGOUT_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/logout'
const OUTLOOK_SCOPES = [
  'https://graph.microsoft.com/Mail.Read',
  'https://graph.microsoft.com/User.Read',
  'offline_access'
]

export class OutlookPKCEProvider implements IReviewerProvider {
  public readonly providerId = 'outlook' as const
  private redirectUri: string

  constructor() {
    this.redirectUri = chrome.identity.getRedirectURL('oauth2')
  }

  /**
   * Start Outlook OAuth PKCE flow
   */
  async startAuth(): Promise<{ authUrl: string; codeVerifier: string; state: string }> {
    const codeVerifier = generateCodeVerifier()
    const codeChallenge = await generateCodeChallenge(codeVerifier)
    const state = generateState()

    const params = new URLSearchParams({
      client_id: OUTLOOK_CLIENT_ID,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: OUTLOOK_SCOPES.join(' '),
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
      response_mode: 'query'
    })

    const authUrl = `${OUTLOOK_AUTH_URL}?${params}`

    return { authUrl, codeVerifier, state }
  }

  /**
   * Complete Outlook OAuth by exchanging code for tokens
   */
  async completeAuth(code: string, codeVerifier: string, state: string): Promise<OAuthTokens> {
    try {
      const response = await fetch(OUTLOOK_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          client_id: OUTLOOK_CLIENT_ID,
          code,
          code_verifier: codeVerifier,
          grant_type: 'authorization_code',
          redirect_uri: this.redirectUri
        })
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'unknown' }))
        throw new Error(`Token exchange failed: ${error.error_description || error.error}`)
      }

      const data = await response.json()

      return {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in || 3600,
        token_type: data.token_type || 'Bearer',
        scope: data.scope
      }
    } catch (error) {
      console.error('Outlook token exchange error:', error)
      throw error
    }
  }

  /**
   * Authenticate with Outlook (launch flow + complete)
   */
  async authenticate(): Promise<OAuthTokens> {
    const { authUrl, codeVerifier, state } = await this.startAuth()

    // Store PKCE params in session storage
    await chrome.storage.session.set({
      reviewer_outlook_code_verifier: codeVerifier,
      reviewer_outlook_state: state
    })

    try {
      // Launch OAuth flow
      const redirectUrl = await chrome.identity.launchWebAuthFlow({
        url: authUrl,
        interactive: true
      })

      if (!redirectUrl) {
        throw new Error('OAuth cancelled by user')
      }

      // Parse callback URL
      const url = new URL(redirectUrl)
      const code = url.searchParams.get('code')
      const returnedState = url.searchParams.get('state')
      const error = url.searchParams.get('error')

      if (error) {
        throw new Error(`OAuth error: ${error}`)
      }

      if (!code || !returnedState) {
        throw new Error('No code or state in OAuth callback')
      }

      if (returnedState !== state) {
        throw new Error('State mismatch - possible CSRF attack')
      }

      // Exchange code for tokens
      const tokens = await this.completeAuth(code, codeVerifier, state)

      return tokens
    } finally {
      // Clean up session storage
      await chrome.storage.session.remove([
        'reviewer_outlook_code_verifier',
        'reviewer_outlook_state'
      ])
    }
  }

  /**
   * Refresh Outlook tokens
   */
  async refreshTokens(refreshToken: string): Promise<OAuthTokens> {
    if (!refreshToken) {
      throw new Error('Refresh token is required')
    }

    try {
      const response = await fetch(OUTLOOK_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          client_id: OUTLOOK_CLIENT_ID,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          scope: OUTLOOK_SCOPES.join(' ')
        })
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'unknown' }))
        throw new Error(`Token refresh failed: ${error.error_description || error.error}`)
      }

      const data = await response.json()

      return {
        access_token: data.access_token,
        refresh_token: data.refresh_token || refreshToken,
        expires_in: data.expires_in || 3600,
        token_type: data.token_type || 'Bearer',
        scope: data.scope
      }
    } catch (error) {
      console.error('Outlook token refresh error:', error)
      throw error
    }
  }

  /**
   * Revoke Outlook tokens
   */
  async revokeTokens(accessToken: string): Promise<void> {
    try {
      // Microsoft logout endpoint
      await fetch(OUTLOOK_LOGOUT_URL, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      })
    } catch (error) {
      console.error('Outlook revoke error:', error)
      // Don't throw - revoke is best effort
    }
  }

  /**
   * Get user's email address
   */
  async getUserEmail(accessToken: string): Promise<string> {
    try {
      const response = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      })

      if (!response.ok) {
        throw new Error(`Failed to get user profile: ${response.statusText}`)
      }

      const data = await response.json()
      return data.userPrincipalName || data.mail
    } catch (error) {
      console.error('Failed to get Outlook user email:', error)
      throw error
    }
  }
}
