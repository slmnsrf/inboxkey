/**
 * Storage layer exports
 *
 * This module provides plaintext storage for InboxKey using Chrome Storage API.
 */

export { PlaintextStorage } from "./plaintext-storage"
export { StorageFactory } from "./storage-factory"
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
