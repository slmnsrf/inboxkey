/**
 * Email Provider Interface
 *
 * Defines the contract for email provider adapters (Gmail, IMAP Bridge, etc.)
 * Each provider implements OAuth authentication and email fetching.
 */

export type ProviderId = 'imap-bridge'

export interface ProviderConfig {
  clientId: string
  redirectUri: string
  scopes: string[]
}

export interface OAuthTokens {
  accessToken: string
  refreshToken: string
  expiresIn: number // seconds
  tokenType: string
  scope?: string
}

export interface EmailMessage {
  id: string
  from: {
    email: string
    name?: string
  }
  /**
   * The effective top-level domain (eTLD+1) extracted from the sender's email address.
   * Used for domain affinity matching in watch sessions.
   *
   * @example
   * // "user@mail.example.com" → "example.com"
   * // "noreply@example.com" → "example.com"
   */
  senderETLD: string
  subject: string
  date: Date
  bodyText?: string
  bodyHtml?: string
  snippet?: string
}

export interface FetchOptions {
  maxResults?: number
  newerThan?: Date
  query?: string
}

/**
 * Base Email Provider Interface
 *
 * Common contract shared by all email providers regardless of auth method.
 * Providers must implement email fetching and token management.
 */
export interface IEmailProvider {
  readonly providerId: ProviderId
  readonly displayName: string

  /**
   * Refresh access token using refresh token
   *
   * Note: For Chrome Identity providers, the refreshToken parameter
   * may be the old access token (Chrome manages refresh internally)
   */
  refreshTokens(refreshToken: string): Promise<OAuthTokens>

  /**
   * Fetch recent emails
   */
  fetchEmails(
    accessToken: string,
    options?: FetchOptions
  ): Promise<EmailMessage[]>

  /**
   * Revoke tokens (logout)
   */
  revokeTokens?(accessToken: string): Promise<void>
}

/**
 * PKCE OAuth Provider Interface
 *
 * For providers that use OAuth 2.0 PKCE flow (IMAP Bridge, etc.)
 * Requires explicit startAuth/completeAuth methods to handle the OAuth flow.
 */
export interface IPKCEProvider extends IEmailProvider {
  /**
   * Start OAuth PKCE authorization flow
   * Returns the authorization URL to open in browser
   */
  startAuth(): Promise<{
    authUrl: string
    codeVerifier: string
    state: string
  }>

  /**
   * Complete OAuth flow by exchanging authorization code for tokens
   */
  completeAuth(params: {
    code: string
    codeVerifier: string
    state: string
  }): Promise<OAuthTokens>
}

/**
 * Provider Factory
 */
export interface IProviderFactory {
  createProvider(
    providerId: ProviderId,
    config: ProviderConfig
  ): IEmailProvider
}
