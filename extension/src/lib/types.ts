/**
 * Core type definitions for InboxKey
 */

export type ProviderId = "gmail" | "outlook" | "imap-bridge"

export interface WatchSession {
  id: string
  startedAt: number // epoch ms
  tabId: number
  url: string
  expected: { length?: number; charset?: "digits" | "alnum" }
  polls: number // 0..3
  status: "active" | "filled" | "timedout" | "canceled"
}

export interface CandidateBase {
  provider: ProviderId
  messageId: string
  sender: string
  received: number // epoch ms
  subject: string
  score: number // 0..1
}

export interface OTPCandidate extends CandidateBase {
  kind: "otp"
  code: string // normalized
}

export interface LinkCandidate extends CandidateBase {
  kind: "magic-link"
  href: string
  display: string // anchor text or source label
  domain: string
}

export type Candidate = OTPCandidate | LinkCandidate

export interface OAuthToken {
  accessToken: string
  refreshToken?: string
  expiresAt: number // epoch ms
  scope: string[]
}

export interface EncryptedBlob {
  ciphertext: Uint8Array
  iv: Uint8Array
  algorithm: "AES-GCM"
}

/**
 * Encrypted data structure for storage serialization
 * Used by crypto utilities for base64-encoded encrypted data
 */
export interface EncryptedData {
  ciphertext: string // Base64 encoded encrypted data
  iv: string // Base64 encoded initialization vector
  salt: string // Base64 encoded salt (for PBKDF2 key derivation)
}

export interface Mailbox {
  id: string
  provider: ProviderId
  email: string
  displayName: string
  enabled: boolean
  tokens?: OAuthToken
}

export interface StorageSchema {
  version: number
  mailboxes: Mailbox[]
  recentCodes: Array<{
    code: string
    timestamp: number
    source: string
    siteMatch?: string
  }>
  recentMagicLinks: Array<{
    url: string
    timestamp: number
    description: string
  }>
  settings: {
    autoFillEnabled: boolean
    magicLinkAutoOpen: boolean
    pollingIntervals: [number, number, number] // [0, 5, 10]
    lockEnabled: boolean
    lockTimeoutMinutes: number
  }
}

/**
 * Detection engine result
 */
export interface DetectionResult {
  field: HTMLInputElement
  confidence: number // 0-100
  tier: 1 | 2
  signals: string[] // Which heuristics matched
  executionTime: number // ms
}

/**
 * Lock state stored in chrome.storage.local
 */
export interface LockState {
  isLocked: boolean
  lastUnlockedAt: number | null
  masterKeySalt: number[] // Stored as array, converted to Uint8Array on load
}
