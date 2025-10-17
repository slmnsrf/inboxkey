/**
 * Outlook Provider Exports
 *
 * Central export point for all Outlook OAuth and authentication functionality
 */

// Provider
export { OutlookProvider } from './outlook-provider'

// API Client
export { OutlookAPIClient } from './outlook-api'
export type {
  GraphMessage,
  GraphMessageList,
  OutlookMessageBody,
  OutlookEmailAddress,
  OutlookRecipient,
} from './outlook-api'

// Config
export { OUTLOOK_CONFIG, OUTLOOK_API_BASE } from './config'

// PKCE utilities (Outlook-specific)
export {
  base64UrlEncode,
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  isValidCodeVerifier,
} from './pkce-utils'
