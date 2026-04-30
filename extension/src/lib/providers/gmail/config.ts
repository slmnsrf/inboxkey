/**
 * Gmail OAuth Configuration
 *
 * With chrome.identity.getAuthToken(), scopes are defined in manifest.json.
 * Only clientId and revokeUrl are needed in code.
 */

export const GMAIL_CONFIG = {
  clientId: process.env.PLASMO_PUBLIC_GMAIL_CLIENT_ID || 'YOUR_CLIENT_ID.apps.googleusercontent.com',
  revokeUrl: 'https://oauth2.googleapis.com/revoke',
  // Note: scopes are now in manifest.json oauth2 field
  // Note: authUrl, tokenUrl, redirectUri handled by Chrome
}

export const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1'

/**
 * Validate that Gmail OAuth credentials are properly configured
 *
 * @returns true if credentials are configured, false otherwise
 */
export function isGmailConfigured(): boolean {
  const clientId = GMAIL_CONFIG.clientId
  return clientId !== 'YOUR_CLIENT_ID.apps.googleusercontent.com' &&
         clientId !== '' &&
         clientId !== undefined &&
         !clientId.includes('YOUR_CLIENT_ID')
}
