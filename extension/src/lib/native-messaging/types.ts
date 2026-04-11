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
 * How the bridge binary is laid out on disk. Drives the verb shown in the
 * uninstall modal ("delete this file" vs "delete this folder" vs "drag to
 * Trash"). See PROTOCOL.md § 3.1 for detection rules.
 */
export type InstallKind = 'single-binary' | 'directory' | 'app-bundle'

/**
 * Where the bridge binary lives and what the user should remove to
 * complete uninstalling it. Returned by bridge.ping in InboxBridge 1.1.0+.
 * Older bridges omit this field and the extension falls back to static
 * per-OS copy.
 */
export interface InstallInfo {
  /** Absolute, canonicalized path to the running executable. */
  executablePath: string
  /** Layout shape, drives the UI verb. */
  kind: InstallKind
  /**
   * The exact file or directory the user should remove. For single-binary
   * this equals executablePath. For directory this is the parent folder.
   * For app-bundle this is the enclosing .app path.
   */
  uninstallTarget: string
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
  /**
   * Install-shape metadata, added in InboxBridge 1.1.0. Optional for back-
   * compat: extensions treat an absent value as "unknown, fall back to
   * static per-OS copy in the uninstall modal."
   */
  installInfo?: InstallInfo
}

/**
 * Per-entry keychain cleanup failure returned by bridge.uninstall.
 */
export interface KeychainCleanupFailure {
  accountId: string
  service: string
  reason: string
}

/**
 * Result of bridge.uninstall method (InboxBridge 1.1.0+).
 *
 * The bridge attempts to wipe every keychain entry, delete accounts.json,
 * and best-effort remove accounts.lock. Partial keychain failures are data,
 * not errors -- they appear in keychainEntriesFailed and let the UI show
 * a warning without falling back to the legacy cleanup path.
 */
export interface UninstallResult {
  keychainEntriesRemoved: number
  keychainEntriesFailed: KeychainCleanupFailure[]
  /** True if accounts.json was deleted or never existed. */
  accountsFileDeleted: boolean
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

  // Uninstall cleanup errors (bridge.uninstall, added in 1.1.0)
  CLEANUP_SNAPSHOT_FAILED: 'CLEANUP_SNAPSHOT_FAILED',
  CLEANUP_STATE_DELETE_FAILED: 'CLEANUP_STATE_DELETE_FAILED',

  // Internal errors
  UNEXPECTED: 'UNEXPECTED',

  // Client-side errors (not from native app)
  PORT_DISCONNECTED: 'PORT_DISCONNECTED',
  TIMEOUT: 'TIMEOUT',
  INVALID_RESPONSE: 'INVALID_RESPONSE',
} as const

export type NativeErrorCodeType = (typeof NativeErrorCode)[keyof typeof NativeErrorCode]
