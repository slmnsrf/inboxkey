/**
 * Provider Types for InboxKey Reviewer
 * Simplified OAuth types for dev tool usage
 */

export interface OAuthTokens {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
  scope?: string
}

export interface IReviewerProvider {
  providerId: 'gmail' | 'outlook'
  startAuth(): Promise<{ authUrl: string; codeVerifier: string; state: string }>
  completeAuth(code: string, verifier: string, state: string): Promise<OAuthTokens>
  refreshTokens(refreshToken: string): Promise<OAuthTokens>
  revokeTokens(accessToken: string): Promise<void>
}

export interface StoredAccount {
  provider: 'gmail' | 'outlook'
  email: string
  tokens: OAuthTokens
  lastSync?: number
}
