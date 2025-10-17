/**
 * Storage layer exports
 *
 * This module provides encrypted storage for InboxKey using Chrome Storage API.
 * All sensitive data (tokens, codes) is encrypted using AES-GCM.
 */

export { EncryptedStorage } from "./encrypted-storage"
export {
  initializeStorage,
  resetStorage,
  exportStorage,
  importStorage,
  migrateStorage,
  getDefaultSettings,
  getDefaultSessionState,
} from "./init"
export {
  StorageError,
  DecryptionError,
  ValidationError,
  MigrationError,
} from "./errors"
export type {
  StorageSchema,
  Mailbox,
  StoredCode,
  Settings,
  SessionState,
  WatchSession,
  ProviderId,
} from "./schema"
export {
  STORAGE_KEYS,
  CURRENT_SCHEMA_VERSION,
  DEFAULT_SETTINGS,
  DEFAULT_SESSION_STATE,
  isValidEmail,
  isValidUUID,
  isValidProviderId,
  isValidTimestamp,
  isMailbox,
  isStoredCode,
  isSettings,
  isSessionState,
  isWatchSession,
} from "./schema"
