/**
 * Outlook/Microsoft OAuth Configuration
 *
 * Configures OAuth 2.0 PKCE flow for Microsoft Graph API access.
 * Client ID must be registered in Azure AD/Microsoft Entra ID.
 *
 * Reference: specifications.md section 4.2 (Outlook)
 */

export const OUTLOOK_CONFIG = {
  clientId: process.env.PLASMO_PUBLIC_OUTLOOK_CLIENT_ID || 'YOUR_CLIENT_ID',
  authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
  tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
  revokeUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/logout',
  redirectUri: typeof chrome !== 'undefined' && chrome.identity
    ? chrome.identity.getRedirectURL('oauth2')
    : 'https://placeholder.chromiumapp.org/oauth2',
  scopes: [
    'https://graph.microsoft.com/Mail.Read',
    'offline_access', // Required for refresh token
  ],
}

export const OUTLOOK_API_BASE = 'https://graph.microsoft.com/v1.0'

/**
 * Validate that Outlook OAuth credentials are properly configured
 *
 * @returns true if credentials are configured, false otherwise
 */
export function isOutlookConfigured(): boolean {
  const clientId = OUTLOOK_CONFIG.clientId
  return clientId !== 'YOUR_CLIENT_ID' &&
         clientId !== '' &&
         clientId !== undefined &&
         !clientId.includes('YOUR_CLIENT_ID')
}
