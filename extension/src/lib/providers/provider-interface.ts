/**
 * Email Provider Interface
 *
 * Defines the contract for email provider adapters (Gmail, Outlook, etc.)
 * Each provider implements OAuth authentication and email fetching.
 */

export type ProviderId = 'gmail' | 'outlook' | 'imap-bridge'

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
 * Email Provider Adapter Interface
 *
 * All email providers must implement these methods.
 */
export interface IEmailProvider {
  readonly providerId: ProviderId
  readonly displayName: string

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

  /**
   * Refresh access token using refresh token
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
 * Provider Factory
 */
export interface IProviderFactory {
  createProvider(
    providerId: ProviderId,
    config: ProviderConfig
  ): IEmailProvider
}
