/**
 * Native Messaging Module
 *
 * Exports client and types for InboxBridge Native Messaging integration.
 */

export { NativeMessagingClient, NativeMessagingError } from './client'
export type {
  NativeRequest,
  NativeResponse,
  PingResult,
  IMAPMessage,
  FetchRecentResult,
  NativeErrorCodeType,
} from './types'
export { NativeErrorCode } from './types'
