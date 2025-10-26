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
  SETTINGS: "settings",
  SESSION_STATE: "session_state", // chrome.storage.session only
  DOMAIN_PREFERENCES: "domain_preferences",
  SYNC_ERROR_STATE: "sync_error_state",
} as const

/**
 * Main storage schema interface
 */
export interface StorageSchema {
  version: number
  mailboxes: Mailbox[]
  settings: Settings
  domainPreferences: DomainPreferences
}

/**
 * Provider types supported by InboxKey
 */
export type ProviderId = "gmail" | "outlook" | "imap-bridge"

/**
 * Mailbox account with OAuth tokens or IMAP credentials
 *
 * OAuth providers (Gmail, Outlook):
 * - accessToken: Required (encrypted before storage)
 * - refreshToken: Optional (encrypted before storage; Chrome Identity API handles refresh for Gmail)
 * - tokenExpiresAt: Required
 * - IMAP fields: Must be undefined
 *
 * IMAP provider (imap-bridge):
 * - OAuth fields: Must be undefined (credentials stored in OS keychain by native app)
 * - imapServer, imapPort, imapAccountId: Required
 * - imapUsername: Optional (defaults to email)
 */
export interface Mailbox {
  id: string // UUID v4
  providerId: ProviderId
  email: string // Email address

  // OAuth fields (required for 'gmail', 'outlook'; must be undefined for 'imap-bridge')
  accessToken?: string // Encrypted before storage
  refreshToken?: string // Encrypted before storage (optional for Gmail)
  tokenExpiresAt?: number // Unix timestamp (ms)

  // IMAP fields (required for 'imap-bridge'; must be undefined for OAuth providers)
  /** IMAP server hostname (e.g., "imap.mail.yahoo.com") */
  imapServer?: string
  /** IMAP server port (e.g., 993 for TLS) */
  imapPort?: number
  /** IMAP username (defaults to email if not specified) */
  imapUsername?: string
  /** Native app account ID (e.g., "acc_abc123") - reference to OS keychain entry */
  imapAccountId?: string

  addedAt: number // Unix timestamp (ms)
  lastSyncedAt: number // Unix timestamp (ms)

  // Sync state fields (for UI status indicators)
  /** True when actively polling/syncing emails */
  isSyncing?: boolean
  /** Last sync error message (undefined = no error) */
  lastSyncError?: string
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
  /** eTLD+1 of sender email (e.g., "example.com" from "noreply@example.com") */
  senderETLD?: string
  /** Unix timestamp (ms) when email was received */
  receivedAt?: number
  /** Optional domain affinity score for popup display prioritization */
  domainAffinity?: number
}

/**
 * Per-domain preferences for enabling/disabling InboxKey
 */
export interface DomainPreferences {
  /** Map of domain (eTLD+1) to enabled state */
  domains: Record<string, boolean>
}

/**
 * Sync error information for popup banner
 */
export interface SyncErrorInfo {
  type: 'auth-expired' | 'sync-failed' | 'network-offline'
  variant: 'error' | 'warning' | 'info'
  message: string
  timestamp: number
  mailboxId?: string  // Which mailbox failed
}

/**
 * Persistent sync error state
 */
export interface SyncErrorState {
  consecutiveFailures: number
  lastErrorTime: number | null
  currentError: SyncErrorInfo | null
  errorHistory: Array<{
    timestamp: number
    error: string
    mailboxId?: string
    errorType: SyncErrorInfo['type']
  }>
}

/**
 * Auto-submit failure telemetry entry
 */
export interface AutoSubmitFailure {
  timestamp: number
  urlDomain: string  // eTLD+1 only (privacy-preserving)
  reason: 'no_buttons' | 'no_safe_buttons' | 'score_too_low' | 'click_failed'
  buttonText?: string  // First 20 chars only, sanitized
  buttonCount: number
  topScore?: number
}

/**
 * Automation levels for verification code handling
 */
export type AutomationLevel = 'manual' | 'clipboard' | 'autofill' | 'full-automation'

/**
 * Beta feature usage telemetry entry
 */
export interface BetaFeatureUsage {
  timestamp: number
  feature: 'pseudo_button_detected' | 'pseudo_button_clicked'
  urlDomain: string
  metadata: {
    selector?: string
    score?: number
    tagName?: string
  }
}

/**
 * User settings
 */
export interface Settings {
  autoFillEnabled: boolean
  allowedDomains: string[] // Empty = all domains allowed
  deniedDomains: string[]
  notificationsEnabled: boolean
  /**
   * Enable Watch Sessions V2 scoring algorithm.
   * When enabled, uses domain affinity, recency boost, session boost, and shape matching.
   * When disabled, uses simplified matching without v2 enhancements.
   * @default false (initially), true (after v2.0 stable release)
   */
  watchSessionV2Enabled?: boolean
  /**
   * Show debug scoring breakdown in popup (development only).
   * @default false
   */
  debugScoringEnabled?: boolean
  /**
   * Automation level for code detection and filling.
   * - 'manual': User must click icon to detect codes (no auto-detection)
   * - 'clipboard': Auto-detect and copy to clipboard (no autofill)
   * - 'autofill': Auto-detect and autofill (current default behavior)
   * - 'full-automation': Auto-detect, autofill, and auto-submit
   * @default 'autofill'
   */
  automationLevel?: AutomationLevel
  /**
   * Whether new domains are enabled by default (when no explicit preference exists).
   * @default true
   */
  domainsEnabledByDefault?: boolean
  /**
   * Auto-submit failure telemetry (privacy-preserving, last 10 only)
   */
  autoSubmitFailures?: AutoSubmitFailure[]
  /**
   * BETA: Enable extended button detection for pseudo-buttons (opt-in).
   * When enabled, detects custom component buttons (e.g., <a>, [role="button"])
   * used by modern SPA frameworks (Vue, React).
   * @default false (opt-in)
   */
  extendedButtonDetection?: boolean
  /**
   * Beta feature usage telemetry (last 20 entries)
   */
  betaFeatureUsage?: BetaFeatureUsage[]
  /**
   * Show session status chips on web pages.
   * When enabled, displays in-page notifications for code detection status.
   * @default true
   */
  showSessionChips?: boolean
  /**
   * Disable InboxKey on known banking sites.
   * When enabled, InboxKey will be automatically disabled on 150+ major banks worldwide.
   * Users can still explicitly enable InboxKey for specific banks using per-domain toggle.
   * @default false (opt-in for MVP)
   */
  disableOnBankingSites?: boolean
  /**
   * Session timeout in seconds (maximum time to wait for codes).
   * Controls session duration and number of polls executed.
   *
   * Poll schedule:
   * - 0-20s: Every 5s (dense, for fast providers like Gmail/Outlook)
   * - 20-120s: Every 10s (sparse, for slow providers like IMAP)
   *
   * Examples:
   * - 10s → 3 polls [0, 5, 10]
   * - 30s → 6 polls [0, 5, 10, 15, 20, 30] (default)
   * - 60s → 9 polls [0, 5, 10, 15, 20, 30, 40, 50, 60]
   * - 120s → 15 polls [0, 5, 10, 15, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120] (maximum)
   *
   * @default 30
   */
  sessionTimeoutSeconds?: number
  /**
   * Blacklisted domains (hostname only, no protocol/path).
   * Blocks all pages on the domain and its subdomains.
   *
   * Examples:
   * - "example.com" → blocks example.com, www.example.com, sub.example.com
   * - "localhost" → blocks localhost
   *
   * Maximum 100 entries. Domains are stored in lowercase.
   * @default []
   */
  blacklistedDomains?: string[]
  /**
   * Blacklisted URLs (full URLs with protocol).
   * Blocks specific pages only (exact match after normalization).
   *
   * URLs are normalized before storage:
   * - Hostname lowercased
   * - Query string and hash removed
   * - Trailing slash removed from pathname
   *
   * Examples:
   * - "https://example.com/login" → blocks only /login page
   * - "https://example.com/" → blocks only homepage
   *
   * Maximum 100 entries.
   * @default []
   */
  blacklistedUrls?: string[]
}

/**
 * Session state (stored in chrome.storage.session, not encrypted)
 * This is ephemeral and cleared when the browser closes
 */
export interface SessionState {
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
  allowedDomains: [],
  deniedDomains: [],
  notificationsEnabled: true,
  watchSessionV2Enabled: false, // Conservative default: disabled for gradual rollout
  debugScoringEnabled: false,
  automationLevel: 'autofill', // Default: auto-detect and autofill (current behavior)
  domainsEnabledByDefault: true, // Default: enable on all domains
  showSessionChips: true, // Default: show session status chips
  disableOnBankingSites: false, // Opt-in: users must enable manually
  sessionTimeoutSeconds: 30, // Default: 30 seconds
  blacklistedDomains: [], // Default: no blacklisted domains
  blacklistedUrls: [], // Default: no blacklisted URLs
}

/**
 * Default session state
 */
export const DEFAULT_SESSION_STATE: SessionState = {
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

  // Basic fields validation
  const basicValid =
    typeof m.id === "string" &&
    isValidUUID(m.id) &&
    typeof m.providerId === "string" &&
    isValidProviderId(m.providerId) &&
    typeof m.email === "string" &&
    isValidEmail(m.email) &&
    typeof m.addedAt === "number" &&
    isValidTimestamp(m.addedAt) &&
    typeof m.lastSyncedAt === "number" &&
    isValidTimestamp(m.lastSyncedAt)

  if (!basicValid) return false

  // Provider-specific validation
  if (m.providerId === "imap-bridge") {
    // IMAP provider: require IMAP fields, OAuth fields must be undefined
    return (
      m.accessToken === undefined &&
      m.refreshToken === undefined &&
      m.tokenExpiresAt === undefined &&
      typeof m.imapServer === "string" &&
      m.imapServer.length > 0 &&
      typeof m.imapPort === "number" &&
      m.imapPort > 0 &&
      m.imapPort <= 65535 &&
      (m.imapUsername === undefined || typeof m.imapUsername === "string") &&
      typeof m.imapAccountId === "string" &&
      m.imapAccountId.length > 0
    )
  } else {
    // OAuth provider: require accessToken and tokenExpiresAt, IMAP fields must be undefined
    return (
      typeof m.accessToken === "string" &&
      m.accessToken.length > 0 &&
      (m.refreshToken === undefined || typeof m.refreshToken === "string") &&
      typeof m.tokenExpiresAt === "number" &&
      isValidTimestamp(m.tokenExpiresAt) &&
      m.imapServer === undefined &&
      m.imapPort === undefined &&
      m.imapUsername === undefined &&
      m.imapAccountId === undefined
    )
  }
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
    (c.mailboxId === undefined || typeof c.mailboxId === "string") &&
    (c.senderETLD === undefined || typeof c.senderETLD === "string") &&
    (c.receivedAt === undefined ||
      (typeof c.receivedAt === "number" && isValidTimestamp(c.receivedAt))) &&
    (c.domainAffinity === undefined || typeof c.domainAffinity === "number")
  )
}

export function isSettings(obj: unknown): obj is Settings {
  if (typeof obj !== "object" || obj === null) return false
  const s = obj as Partial<Settings>
  return (
    typeof s.autoFillEnabled === "boolean" &&
    Array.isArray(s.allowedDomains) &&
    s.allowedDomains.every((d) => typeof d === "string") &&
    Array.isArray(s.deniedDomains) &&
    s.deniedDomains.every((d) => typeof d === "string") &&
    typeof s.notificationsEnabled === "boolean" &&
    (s.watchSessionV2Enabled === undefined || typeof s.watchSessionV2Enabled === "boolean") &&
    (s.debugScoringEnabled === undefined || typeof s.debugScoringEnabled === "boolean") &&
    (s.automationLevel === undefined || ['manual', 'clipboard', 'autofill', 'full-automation'].includes(s.automationLevel)) &&
    (s.domainsEnabledByDefault === undefined || typeof s.domainsEnabledByDefault === "boolean") &&
    (s.extendedButtonDetection === undefined || typeof s.extendedButtonDetection === "boolean") &&
    (s.showSessionChips === undefined || typeof s.showSessionChips === "boolean") &&
    (s.disableOnBankingSites === undefined || typeof s.disableOnBankingSites === "boolean") &&
    (s.sessionTimeoutSeconds === undefined || (typeof s.sessionTimeoutSeconds === "number" && s.sessionTimeoutSeconds >= 10 && s.sessionTimeoutSeconds <= 120)) &&
    (s.blacklistedDomains === undefined || (Array.isArray(s.blacklistedDomains) && s.blacklistedDomains.every((d) => typeof d === "string"))) &&
    (s.blacklistedUrls === undefined || (Array.isArray(s.blacklistedUrls) && s.blacklistedUrls.every((u) => typeof u === "string")))
  )
}

export function isSessionState(obj: unknown): obj is SessionState {
  if (typeof obj !== "object" || obj === null) return false
  const s = obj as Partial<SessionState>
  return (
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

export function isDomainPreferences(obj: unknown): obj is DomainPreferences {
  if (typeof obj !== "object" || obj === null) return false
  const d = obj as Partial<DomainPreferences>
  if (typeof d.domains !== "object" || d.domains === null) return false
  // Validate all values are boolean
  return Object.values(d.domains).every((v) => typeof v === "boolean")
}
