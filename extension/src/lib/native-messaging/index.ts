/**
 * Native Messaging Module
 *
 * Exports client and types for InboxBridge Native Messaging integration.
 */

import { NativeMessagingClient } from './client'

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

/**
 * Get singleton NativeMessagingClient instance.
 * Convenience wrapper for backward compatibility.
 */
export function getNativeClient(): NativeMessagingClient {
  return NativeMessagingClient.getInstance()
}
