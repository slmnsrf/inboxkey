/**
 * Chrome Identity API Integration for Outlook OAuth
 *
 * Integrates Outlook OAuth PKCE flow with Chrome's identity API.
 * Uses chrome.identity.launchWebAuthFlow to handle the OAuth redirect.
 *
 * Chrome's identity API provides:
 * - Automatic redirect URL generation
 * - Secure OAuth flow handling
 * - Automatic code extraction from callback
 */

import { OUTLOOK_CONFIG } from './config'
import { OutlookAuth } from './outlook-auth'
import type { OAuthTokens } from '../provider-interface'

/**
 * Result of launching Outlook authentication
 */
export interface LaunchAuthResult {
  code: string
  state: string
}

/**
 * Launch Outlook OAuth flow using Chrome Identity API
 *
 * This function:
 * 1. Generates PKCE parameters
 * 2. Stores code verifier and state temporarily in session storage
 * 3. Launches browser auth flow
 * 4. Extracts and validates authorization code
 * 5. Verifies state to prevent CSRF
 *
 * @returns Authorization code and state from OAuth callback
 * @throws Error if auth fails, user cancels, or state mismatch detected
 */
export async function launchOutlookAuth(): Promise<LaunchAuthResult> {
  const outlookAuth = new OutlookAuth(OUTLOOK_CONFIG)
  const { authUrl, codeVerifier, state } = await outlookAuth.startAuth()

  // Store PKCE parameters temporarily in session storage
  // Session storage is cleared when browser closes, providing security
  await chrome.storage.session.set({
    outlook_code_verifier: codeVerifier,
    outlook_state: state,
  })

  try {
    // Launch OAuth flow in browser window
    // Chrome handles the redirect and returns the callback URL
    const redirectUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl,
      interactive: true, // Show UI to user for authentication
    })

    if (!redirectUrl) {
      throw new Error('OAuth cancelled by user')
    }

    // Parse redirect URL to extract OAuth parameters
    const url = new URL(redirectUrl)
    const code = url.searchParams.get('code')
    const returnedState = url.searchParams.get('state')
    const error = url.searchParams.get('error')

    // Check for OAuth errors (user denied, etc.)
    if (error) {
      if (error === 'access_denied') {
        throw new Error('OAuth cancelled by user')
      }
      throw new Error(`OAuth error: ${error}`)
    }

    if (!code) {
      throw new Error('No authorization code received from OAuth callback')
    }

    if (!returnedState) {
      throw new Error('No state parameter received from OAuth callback')
    }

    // Verify state matches to prevent CSRF attacks
    if (returnedState !== state) {
      throw new Error('State mismatch - possible CSRF attack detected')
    }

    return { code, state: returnedState }
  } catch (error) {
    // Clean up stored PKCE parameters on error
    await chrome.storage.session.remove(['outlook_code_verifier', 'outlook_state'])

    // Enhance error messages
    if (error instanceof Error) {
      if (error.message.includes('canceled') || error.message.includes('closed')) {
        throw new Error('OAuth cancelled by user')
      }
      if (error.message.includes('network') || error.message.includes('fetch')) {
        throw new Error('Network error during OAuth')
      }
      if (error.message.includes('credentials') || error.message.includes('unauthorized')) {
        throw new Error('Authentication failed')
      }
    }

    throw error
  }
}

/**
 * Complete Outlook OAuth flow and retrieve tokens
 *
 * This function:
 * 1. Retrieves stored code verifier and state
 * 2. Exchanges authorization code for tokens
 * 3. Cleans up temporary storage
 *
 * @param code - Authorization code from OAuth callback
 * @param state - State parameter for CSRF verification
 * @returns OAuth tokens (access token, refresh token, etc.)
 * @throws Error if code verifier not found or token exchange fails
 */
export async function completeOutlookAuth(
  code: string,
  state: string
): Promise<OAuthTokens> {
  // Retrieve stored PKCE parameters from session storage
  const stored = await chrome.storage.session.get([
    'outlook_code_verifier',
    'outlook_state',
  ])

  const codeVerifier = stored.outlook_code_verifier
  const storedState = stored.outlook_state

  if (!codeVerifier) {
    throw new Error(
      'Code verifier not found in storage - OAuth flow may have expired'
    )
  }

  if (!storedState) {
    throw new Error(
      'State not found in storage - OAuth flow may have expired'
    )
  }

  // Verify state matches stored value
  if (state !== storedState) {
    throw new Error('State mismatch - possible CSRF attack detected')
  }

  try {
    // Exchange authorization code for tokens
    const outlookAuth = new OutlookAuth(OUTLOOK_CONFIG)
    const tokens = await outlookAuth.completeAuth({
      code,
      codeVerifier,
      state,
    })

    return tokens
  } catch (error) {
    // Enhance error messages for token exchange failures
    if (error instanceof Error) {
      if (error.message.includes('network') || error.message.includes('fetch')) {
        throw new Error('Network error during OAuth')
      }
      if (error.message.includes('invalid_grant') || error.message.includes('credentials')) {
        throw new Error('Authentication failed')
      }
    }
    throw error
  } finally {
    // Clean up temporary storage after token exchange
    await chrome.storage.session.remove([
      'outlook_code_verifier',
      'outlook_state',
    ])
  }
}

/**
 * Complete OAuth flow end-to-end (launch + token exchange)
 *
 * Convenience function that combines launchOutlookAuth and completeOutlookAuth
 * into a single call for simpler usage.
 *
 * @returns OAuth tokens ready for use
 * @throws Error if any step of the OAuth flow fails
 */
export async function authenticateOutlook(): Promise<OAuthTokens> {
  const { code, state } = await launchOutlookAuth()
  const tokens = await completeOutlookAuth(code, state)
  return tokens
}
