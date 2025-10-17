/**
 * PKCE (Proof Key for Code Exchange) Utilities for Outlook OAuth
 *
 * Implements RFC 7636 PKCE for secure OAuth 2.0 authorization in Chrome extensions.
 * PKCE prevents authorization code interception attacks without requiring client secrets.
 *
 * Note: Gmail uses chrome.identity.getAuthToken() which handles PKCE automatically.
 * Outlook still uses launchWebAuthFlow with manual PKCE implementation.
 */

/**
 * Base64 URL encode without padding
 *
 * Converts a Uint8Array to base64url encoding (RFC 4648 §5)
 * Used for PKCE code verifier and code challenge encoding.
 *
 * @param array - The bytes to encode
 * @returns Base64url encoded string (no padding)
 */
export function base64UrlEncode(array: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...array))
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

/**
 * Generate cryptographically secure code verifier
 *
 * Creates a random 32-byte code verifier per RFC 7636 §4.1.
 * Results in 43 characters when base64url encoded.
 *
 * @returns Base64url encoded code verifier (43 characters)
 */
export function generateCodeVerifier(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return base64UrlEncode(array)
}

/**
 * Generate code challenge from verifier
 *
 * Hashes the code verifier using SHA-256 per RFC 7636 §4.2.
 * Used in the authorization request to prove possession of the verifier.
 *
 * @param verifier - The code verifier to hash
 * @returns Base64url encoded SHA-256 hash of the verifier
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return base64UrlEncode(new Uint8Array(hash))
}

/**
 * Generate random state parameter
 *
 * Creates a cryptographically secure random state for CSRF protection.
 * Per RFC 6749 §10.12, state should be unguessable.
 *
 * @returns Base64url encoded state (22 characters from 16 bytes)
 */
export function generateState(): string {
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  return base64UrlEncode(array)
}

/**
 * Validate code verifier format
 *
 * Per RFC 7636 §4.1:
 * - Minimum length: 43 characters
 * - Maximum length: 128 characters
 * - Characters: [A-Z] [a-z] [0-9] - . _ ~
 *
 * @param verifier - The code verifier to validate
 * @returns true if valid format, false otherwise
 */
export function isValidCodeVerifier(verifier: string): boolean {
  if (verifier.length < 43 || verifier.length > 128) {
    return false
  }

  const validChars = /^[A-Za-z0-9\-._~]+$/
  return validChars.test(verifier)
}
