/**
 * Native Messaging Protocol Types
 *
 * Type definitions for InboxBridge Native Messaging protocol v1.
 * See inboxbridge/PROTOCOL.md for full specification.
 */

/**
 * Request message sent from extension to native app
 */
export interface NativeRequest {
  /** Protocol version (always 1 for v1) */
  v: number
  /** Unique request ID for correlation (UUID v4) */
  id: string
  /** RPC method name (e.g., 'bridge.ping', 'mail.fetchRecent') */
  method: string
  /** Method parameters (optional) */
  params?: unknown
}

/**
 * Response message sent from native app to extension
 */
export interface NativeResponse<T = unknown> {
  /** Protocol version */
  v: number
  /** Request ID this response correlates to */
  id: string
  /** Result data (present on success) */
  result?: T
  /** Error details (present on failure) */
  error?: {
    /** Error code (see PROTOCOL.md § 5) */
    code: string
    /** Human-readable error message */
    message: string
    /** Additional error context (optional) */
    details?: unknown
  }
}

/**
 * Result of bridge.ping method
 */
export interface PingResult {
  /** Always true if ping succeeds */
  ok: boolean
  /** InboxBridge semantic version (e.g., "1.0.0") */
  version: string
  /** Current protocol version supported by native app */
  protocolVersion: number
  /** Minimum protocol version required by native app (optional) */
  minProtocolVersion?: number
  /** Optional capability flags (optional) */
  features?: {
    idle?: boolean
    tls13?: boolean
    [key: string]: unknown
  }
}

/**
 * IMAP message format from native app (mail.fetchRecent response)
 */
export interface IMAPMessage {
  /** IMAP UID (unique within mailbox) */
  uid: number
  /** Mailbox name (e.g., "INBOX") */
  mailbox?: string
  /** ISO 8601 date string */
  date: string
  /** Sender email address */
  from: string
  /** Email subject */
  subject: string
  /** First ~200 chars of plain text body */
  snippet: string
}

/**
 * Result of mail.fetchRecent method
 */
export interface FetchRecentResult {
  /** Array of recent messages */
  messages: IMAPMessage[]
}

/**
 * Error codes from InboxBridge (PROTOCOL.md § 5)
 */
export const NativeErrorCode = {
  // Protocol errors
  INVALID_JSON: 'INVALID_JSON',
  METHOD_NOT_FOUND: 'METHOD_NOT_FOUND',
  INVALID_PARAMS: 'INVALID_PARAMS',

  // IMAP errors
  IMAP_AUTH: 'IMAP_AUTH',
  IMAP_NETWORK: 'IMAP_NETWORK',
  IMAP_CAPABILITY: 'IMAP_CAPABILITY',

  // Keychain errors
  KEYCHAIN_UNAVAILABLE: 'KEYCHAIN_UNAVAILABLE',

  // Connection errors
  TLS_HANDSHAKE: 'TLS_HANDSHAKE',
  ACCOUNT_NOT_FOUND: 'ACCOUNT_NOT_FOUND',
  WATCH_NOT_FOUND: 'WATCH_NOT_FOUND',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  MESSAGE_TOO_LARGE: 'MESSAGE_TOO_LARGE',
  WATCH_EXPIRED: 'WATCH_EXPIRED',
  CONNECTION_LIMIT: 'CONNECTION_LIMIT',

  // Internal errors
  UNEXPECTED: 'UNEXPECTED',

  // Client-side errors (not from native app)
  PORT_DISCONNECTED: 'PORT_DISCONNECTED',
  TIMEOUT: 'TIMEOUT',
  INVALID_RESPONSE: 'INVALID_RESPONSE',
} as const

export type NativeErrorCodeType = (typeof NativeErrorCode)[keyof typeof NativeErrorCode]
