/**
 * PKCE Utilities for Reviewer OAuth
 * Copied from main extension for reviewer use
 */

/**
 * Base64 URL encode without padding
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
 */
export function generateCodeVerifier(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return base64UrlEncode(array)
}

/**
 * Generate code challenge from verifier
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return base64UrlEncode(new Uint8Array(hash))
}

/**
 * Generate random state parameter
 */
export function generateState(): string {
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  return base64UrlEncode(array)
}
