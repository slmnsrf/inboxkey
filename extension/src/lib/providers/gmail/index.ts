/**
 * Gmail Provider Exports
 *
 * Central export point for all Gmail OAuth and authentication functionality
 */

// Core provider exports
export { GmailProvider } from './gmail-provider'
export { GmailAPIClient } from './gmail-api'
export { GmailParser } from './gmail-parser'
export { GmailAuth } from './gmail-auth'
export { GMAIL_CONFIG, GMAIL_API_BASE, isGmailConfigured } from './config'
export type { GmailMessage, GmailMessagePart } from './gmail-api'

// Chrome Identity integration
export {
  authenticateGmail,
  getGmailToken,
  clearGmailToken,
} from './chrome-auth'
