/**
 * Storage schema definitions for InboxKey
 *
 * Sensitive fields (tokens, codes) are encrypted before storage.
 * Non-sensitive metadata remains plaintext for indexing/filtering.
 */

/**
 * Current storage schema version
 * Increment this when making breaking changes to the schema
 */
export const CURRENT_SCHEMA_VERSION = 1

/**
 * Storage keys used in chrome.storage.local and chrome.storage.session
 */
export const STORAGE_KEYS = {
  VERSION: "version",
  MAILBOXES: "mailboxes",
  RECENT_CODES: "recent_codes",
  SETTINGS: "settings",
  SESSION_STATE: "session_state", // chrome.storage.session only
} as const

/**
 * Main storage schema interface
 */
export interface StorageSchema {
  version: number
  mailboxes: Mailbox[]
  recentCodes: StoredCode[]
  settings: Settings
}

/**
 * Provider types supported by InboxKey
 */
export type ProviderId = "gmail" | "outlook" | "imap-bridge"

/**
 * Mailbox account with OAuth tokens
 *
 * Note: refreshToken is optional for providers using Chrome Identity API (Gmail),
 * where Chrome manages token refresh internally. Required for PKCE providers (Outlook).
 */
export interface Mailbox {
  id: string // UUID v4
  providerId: ProviderId
  email: string // Email address
  accessToken: string // Encrypted before storage
  refreshToken?: string // Encrypted before storage (optional for Gmail)
  tokenExpiresAt: number // Unix timestamp (ms)
  addedAt: number // Unix timestamp (ms)
  lastSyncedAt: number // Unix timestamp (ms)
}

/**
 * Stored verification code with metadata
 */
export interface StoredCode {
  code: string // The actual code (encrypted before storage)
  timestamp: number // Unix timestamp (ms)
  source: string // Email subject or sender
  siteMatch?: string // Domain that was matched (if any)
  used: boolean // Whether code has been used
  mailboxId?: string // ID of the mailbox this code came from (for provider tracking)
}

/**
 * User settings
 */
export interface Settings {
  autoFillEnabled: boolean
  lockEnabled: boolean
  lockTimeoutMinutes: number
  allowedDomains: string[] // Empty = all domains allowed
  deniedDomains: string[]
  notificationsEnabled: boolean
}

/**
 * Session state (stored in chrome.storage.session, not encrypted)
 * This is ephemeral and cleared when the browser closes
 */
export interface SessionState {
  isLocked: boolean
  unlockedAt?: number // Unix timestamp (ms)
  activeWatchSessions: WatchSession[]
}

/**
 * Active watch session for polling emails
 */
export interface WatchSession {
  id: string // UUID v4
  startedAt: number // Unix timestamp (ms)
  tabId: number // Chrome tab ID
  url: string // URL being watched
  pollsRemaining: number // Number of polls left
}

/**
 * Default settings for new installations
 */
export const DEFAULT_SETTINGS: Settings = {
  autoFillEnabled: true,
  lockEnabled: false,
  lockTimeoutMinutes: 15,
  allowedDomains: [],
  deniedDomains: [],
  notificationsEnabled: true,
}

/**
 * Default session state
 */
export const DEFAULT_SESSION_STATE: SessionState = {
  isLocked: false,
  unlockedAt: undefined,
  activeWatchSessions: [],
}

/**
 * Validation utilities
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email)
}

export function isValidUUID(uuid: string): boolean {
  return UUID_REGEX.test(uuid)
}

export function isValidProviderId(id: string): id is ProviderId {
  return id === "gmail" || id === "outlook" || id === "imap-bridge"
}

export function isValidTimestamp(timestamp: number): boolean {
  // Allow 0 as a special value meaning "never" or "not yet"
  if (timestamp === 0) {
    return true
  }

  // Reasonable range: between 2020 and 2100
  const MIN_TIMESTAMP = new Date("2020-01-01").getTime()
  const MAX_TIMESTAMP = new Date("2100-01-01").getTime()
  return (
    typeof timestamp === "number" &&
    timestamp >= MIN_TIMESTAMP &&
    timestamp <= MAX_TIMESTAMP
  )
}

/**
 * Type guards
 */

export function isMailbox(obj: unknown): obj is Mailbox {
  if (typeof obj !== "object" || obj === null) return false
  const m = obj as Partial<Mailbox>
  return (
    typeof m.id === "string" &&
    isValidUUID(m.id) &&
    typeof m.providerId === "string" &&
    isValidProviderId(m.providerId) &&
    typeof m.email === "string" &&
    isValidEmail(m.email) &&
    typeof m.accessToken === "string" &&
    (m.refreshToken === undefined || typeof m.refreshToken === "string") &&
    typeof m.tokenExpiresAt === "number" &&
    isValidTimestamp(m.tokenExpiresAt) &&
    typeof m.addedAt === "number" &&
    isValidTimestamp(m.addedAt) &&
    typeof m.lastSyncedAt === "number" &&
    isValidTimestamp(m.lastSyncedAt)
  )
}

export function isStoredCode(obj: unknown): obj is StoredCode {
  if (typeof obj !== "object" || obj === null) return false
  const c = obj as Partial<StoredCode>
  return (
    typeof c.code === "string" &&
    c.code.length > 0 &&
    typeof c.timestamp === "number" &&
    isValidTimestamp(c.timestamp) &&
    typeof c.source === "string" &&
    c.source.length > 0 &&
    (c.siteMatch === undefined || typeof c.siteMatch === "string") &&
    typeof c.used === "boolean" &&
    (c.mailboxId === undefined || typeof c.mailboxId === "string")
  )
}

export function isSettings(obj: unknown): obj is Settings {
  if (typeof obj !== "object" || obj === null) return false
  const s = obj as Partial<Settings>
  return (
    typeof s.autoFillEnabled === "boolean" &&
    typeof s.lockEnabled === "boolean" &&
    typeof s.lockTimeoutMinutes === "number" &&
    s.lockTimeoutMinutes > 0 &&
    Array.isArray(s.allowedDomains) &&
    s.allowedDomains.every((d) => typeof d === "string") &&
    Array.isArray(s.deniedDomains) &&
    s.deniedDomains.every((d) => typeof d === "string") &&
    typeof s.notificationsEnabled === "boolean"
  )
}

export function isSessionState(obj: unknown): obj is SessionState {
  if (typeof obj !== "object" || obj === null) return false
  const s = obj as Partial<SessionState>
  return (
    typeof s.isLocked === "boolean" &&
    (s.unlockedAt === undefined ||
      (typeof s.unlockedAt === "number" && isValidTimestamp(s.unlockedAt))) &&
    Array.isArray(s.activeWatchSessions) &&
    s.activeWatchSessions.every(isWatchSession)
  )
}

export function isWatchSession(obj: unknown): obj is WatchSession {
  if (typeof obj !== "object" || obj === null) return false
  const w = obj as Partial<WatchSession>
  return (
    typeof w.id === "string" &&
    isValidUUID(w.id) &&
    typeof w.startedAt === "number" &&
    isValidTimestamp(w.startedAt) &&
    typeof w.tabId === "number" &&
    w.tabId >= 0 &&
    typeof w.url === "string" &&
    w.url.length > 0 &&
    typeof w.pollsRemaining === "number" &&
    w.pollsRemaining >= 0
  )
}
