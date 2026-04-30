/**
 * Native Messaging Module
 *
 * Exports client and types for InboxBridge Native Messaging integration.
 */

import { NativeMessagingClient } from './client'

export { NativeMessagingClient, NativeMessagingError, isMethodNotFound } from './client'
export type {
  NativeRequest,
  NativeResponse,
  PingResult,
  IMAPMessage,
  FetchRecentResult,
  NativeErrorCodeType,
  InstallInfo,
  InstallKind,
  UninstallResult,
  KeychainCleanupFailure,
} from './types'
export { NativeErrorCode } from './types'

/**
 * Get singleton NativeMessagingClient instance.
 * Convenience wrapper for backward compatibility.
 */
export function getNativeClient(): NativeMessagingClient {
  return NativeMessagingClient.getInstance()
}
