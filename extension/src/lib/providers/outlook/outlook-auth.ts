/**
 * Outlook/Microsoft OAuth 2.0 PKCE Authentication
 *
 * Implements OAuth 2.0 with PKCE (Proof Key for Code Exchange) for secure
 * authentication in Chrome extensions without requiring a client secret.
 *
 * Flow:
 * 1. Generate code verifier and challenge (PKCE)
 * 2. Redirect user to Microsoft's authorization endpoint
 * 3. Exchange authorization code for access/refresh tokens
 * 4. Refresh tokens when expired
 *
 * Security Features:
 * - PKCE prevents authorization code interception attacks
 * - State parameter prevents CSRF attacks
 * - Tokens stored securely in Chrome storage (encrypted per spec section 4.8)
 * - No client secrets in extension code
 *
 * Reference: specifications.md section 4.2 (Outlook)
 */

import type { OAuthTokens } from '../provider-interface'
import { OUTLOOK_CONFIG } from './config'
import {
  generateCodeChallenge,
  generateCodeVerifier,
  generateState,
} from './pkce-utils' // Outlook-specific PKCE utilities

export interface AuthStartResult {
  authUrl: string
  codeVerifier: string
  state: string
}

export interface CompleteAuthParams {
  code: string
  codeVerifier: string
  state: string
}

/**
 * Outlook/Microsoft OAuth 2.0 PKCE Authentication Handler
 */
export class OutlookAuth {
  constructor(private config: typeof OUTLOOK_CONFIG = OUTLOOK_CONFIG) {}

  /**
   * Start OAuth PKCE authorization flow
   *
   * Generates PKCE parameters and constructs the Microsoft authorization URL.
   * The caller must store the codeVerifier and state for later verification.
   *
   * @returns Authorization URL and PKCE parameters
   */
  async startAuth(): Promise<AuthStartResult> {
    // 1. Generate code verifier (random 32 bytes = 43 chars base64url)
    const codeVerifier = generateCodeVerifier()

    // 2. Generate code challenge (SHA-256 hash of verifier)
    const codeChallenge = await generateCodeChallenge(codeVerifier)

    // 3. Generate state for CSRF protection (random 16 bytes = 22 chars)
    const state = generateState()

    // 4. Build Microsoft authorization URL with OAuth parameters
    // NOTE: Microsoft uses different parameters than Google:
    // - No 'access_type' parameter (always gets refresh token with offline_access scope)
    // - No 'prompt' parameter needed (handles consent automatically)
    // - Uses 'response_mode' to specify query parameter return
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: this.config.scopes.join(' '),
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
      response_mode: 'query', // Microsoft-specific: return code via query params
    })

    const authUrl = `${this.config.authUrl}?${params}`

    return { authUrl, codeVerifier, state }
  }

  /**
   * Complete OAuth by exchanging authorization code for tokens
   *
   * Exchanges the authorization code received from the redirect for
   * access and refresh tokens using the PKCE code verifier.
   *
   * Microsoft endpoints return refresh tokens when 'offline_access' scope
   * is included in the initial authorization request.
   *
   * @param params - Authorization code and PKCE verifier
   * @returns OAuth tokens (access, refresh, expiry)
   * @throws Error if token exchange fails or state doesn't match
   */
  async completeAuth(params: CompleteAuthParams): Promise<OAuthTokens> {
    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        code: params.code,
        code_verifier: params.codeVerifier,
        grant_type: 'authorization_code',
        redirect_uri: this.config.redirectUri,
        // NOTE: Microsoft doesn't require client_secret for public clients (Chrome extensions)
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'unknown' }))
      throw new Error(
        `Token exchange failed: ${error.error_description || error.error || 'Unknown error'}`
      )
    }

    const data = await response.json()

    // Validate response contains required fields
    if (!data.access_token) {
      throw new Error('Token exchange failed: No access token received')
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || '', // May not always be present
      expiresIn: data.expires_in || 3600,
      tokenType: data.token_type || 'Bearer',
      scope: data.scope,
    }
  }

  /**
   * Refresh access token using refresh token
   *
   * Obtains a new access token when the current one expires.
   * The refresh token is long-lived and reusable.
   *
   * NOTE: Microsoft requires the 'scope' parameter in refresh requests,
   * unlike Google which makes it optional.
   *
   * @param refreshToken - The refresh token from initial authorization
   * @returns New OAuth tokens
   * @throws Error if refresh fails (e.g., token revoked)
   */
  async refreshTokens(refreshToken: string): Promise<OAuthTokens> {
    if (!refreshToken) {
      throw new Error('Refresh token is required')
    }

    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        scope: this.config.scopes.join(' '), // Microsoft requires scope in refresh
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'unknown' }))
      throw new Error(
        `Token refresh failed: ${error.error_description || error.error || 'Unknown error'}`
      )
    }

    const data = await response.json()

    if (!data.access_token) {
      throw new Error('Token refresh failed: No access token received')
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken, // Reuse old if not provided
      expiresIn: data.expires_in || 3600,
      tokenType: data.token_type || 'Bearer',
      scope: data.scope,
    }
  }

  /**
   * Revoke OAuth tokens (logout)
   *
   * Logs out the user from Microsoft, invalidating the current session.
   * Note: Microsoft's logout endpoint doesn't revoke tokens directly,
   * but ends the user's session in the browser.
   *
   * For complete token revocation, remove tokens from storage and
   * optionally call this endpoint to clear session cookies.
   *
   * @param accessToken - The access token (used for context, not required by endpoint)
   * @throws Error if logout fails
   */
  async revokeTokens(accessToken: string): Promise<void> {
    if (!accessToken) {
      throw new Error('Access token is required for revocation')
    }

    // Microsoft's logout endpoint is different from Google's revoke endpoint
    // It primarily clears session cookies rather than revoking tokens
    // For Chrome extensions, simply removing tokens from storage is sufficient
    // This method is provided for consistency with the provider interface

    const response = await fetch(this.config.revokeUrl, {
      method: 'GET', // Microsoft logout uses GET
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Token revocation failed: ${error || 'Unknown error'}`)
    }
  }
}
