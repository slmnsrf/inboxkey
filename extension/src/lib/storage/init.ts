/**
 * Storage initialization and migration utilities
 */

import { EncryptedStorage } from "./encrypted-storage"
import { MigrationError, StorageError } from "./errors"
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_SESSION_STATE,
  DEFAULT_SETTINGS,
  STORAGE_KEYS,
  type SessionState,
  type Settings,
  type StorageSchema,
} from "./schema"

/**
 * Initialize storage with a master key
 *
 * This should be called once per session after the user unlocks the extension.
 * It creates an EncryptedStorage instance and ensures the schema is up to date.
 *
 * @param masterKey - Derived CryptoKey from user passphrase
 * @param salt - Salt used to derive the master key
 * @returns Promise resolving to EncryptedStorage instance
 *
 * @example
 * ```typescript
 * const { key, salt } = await deriveKey("user-passphrase")
 * const storage = await initializeStorage(key, salt)
 * ```
 */
export async function initializeStorage(
  masterKey: CryptoKey,
  salt: Uint8Array
): Promise<EncryptedStorage> {
  try {
    // Create storage instance
    const storage = new EncryptedStorage(masterKey, salt)

    // Ensure default values exist
    await ensureDefaults()

    // Check and run migrations if needed
    const currentVersion = await getStorageVersion()
    if (currentVersion < CURRENT_SCHEMA_VERSION) {
      await migrateStorage(currentVersion, CURRENT_SCHEMA_VERSION)
    }

    return storage
  } catch (error) {
    throw new StorageError("Failed to initialize storage", error)
  }
}

/**
 * Ensure default settings and session state exist
 */
async function ensureDefaults(): Promise<void> {
  // Check if settings exist
  const settingsResult = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS)
  if (!settingsResult[STORAGE_KEYS.SETTINGS]) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.SETTINGS]: getDefaultSettings(),
    })
  }

  // Check if version exists
  const versionResult = await chrome.storage.local.get(STORAGE_KEYS.VERSION)
  if (!versionResult[STORAGE_KEYS.VERSION]) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.VERSION]: CURRENT_SCHEMA_VERSION,
    })
  }

  // Initialize empty arrays if they don't exist
  const mailboxesResult = await chrome.storage.local.get(STORAGE_KEYS.MAILBOXES)
  if (!mailboxesResult[STORAGE_KEYS.MAILBOXES]) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.MAILBOXES]: [],
    })
  }

  const codesResult = await chrome.storage.local.get(STORAGE_KEYS.RECENT_CODES)
  if (!codesResult[STORAGE_KEYS.RECENT_CODES]) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.RECENT_CODES]: [],
    })
  }

  // Ensure session state exists
  const sessionResult = await chrome.storage.session.get(
    STORAGE_KEYS.SESSION_STATE
  )
  if (!sessionResult[STORAGE_KEYS.SESSION_STATE]) {
    await chrome.storage.session.set({
      [STORAGE_KEYS.SESSION_STATE]: getDefaultSessionState(),
    })
  }
}

/**
 * Get current storage schema version
 */
async function getStorageVersion(): Promise<number> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.VERSION)
  return result[STORAGE_KEYS.VERSION] || 1
}

/**
 * Migrate storage from one version to another
 *
 * @param fromVersion - Current schema version
 * @param toVersion - Target schema version
 *
 * @example
 * ```typescript
 * await migrateStorage(1, 2)
 * ```
 */
export async function migrateStorage(
  fromVersion: number,
  toVersion: number
): Promise<void> {
  if (fromVersion === toVersion) {
    return // No migration needed
  }

  if (fromVersion > toVersion) {
    throw new MigrationError(
      "Cannot downgrade storage version",
      fromVersion,
      toVersion
    )
  }

  try {
    // Run migrations sequentially
    for (let version = fromVersion; version < toVersion; version++) {
      await runMigration(version, version + 1)
    }

    // Update version
    await chrome.storage.local.set({
      [STORAGE_KEYS.VERSION]: toVersion,
    })
  } catch (error) {
    throw new MigrationError(
      `Migration failed from v${fromVersion} to v${toVersion}`,
      fromVersion,
      toVersion,
      error
    )
  }
}

/**
 * Run a specific migration
 */
async function runMigration(fromVersion: number, toVersion: number): Promise<void> {
  // Currently only v1 exists, but this structure allows for future migrations
  switch (fromVersion) {
    case 1:
      if (toVersion === 2) {
        await migrateV1ToV2()
      }
      break
    // Add more migrations here as schema evolves
    default:
      throw new MigrationError(
        `No migration path from v${fromVersion} to v${toVersion}`,
        fromVersion,
        toVersion
      )
  }
}

/**
 * Example migration from v1 to v2 (placeholder for future use)
 */
async function migrateV1ToV2(): Promise<void> {
  // This is a placeholder for when we need to migrate to v2
  // For now, v1 is the current schema, so this does nothing

  // Example migration logic:
  // const data = await chrome.storage.local.get(null)
  // const updated = transformData(data)
  // await chrome.storage.local.set(updated)
}

/**
 * Get default settings
 */
export function getDefaultSettings(): Settings {
  return { ...DEFAULT_SETTINGS }
}

/**
 * Get default session state
 */
export function getDefaultSessionState(): SessionState {
  return {
    ...DEFAULT_SESSION_STATE,
    activeWatchSessions: [],
  }
}

/**
 * Reset storage to factory defaults (useful for testing or troubleshooting)
 */
export async function resetStorage(): Promise<void> {
  await chrome.storage.local.clear()
  await chrome.storage.session.clear()
  await ensureDefaults()
}

/**
 * Export all storage data (for backup purposes)
 * NOTE: This exports encrypted data, not plaintext
 */
export async function exportStorage(): Promise<StorageSchema> {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.VERSION,
    STORAGE_KEYS.MAILBOXES,
    STORAGE_KEYS.RECENT_CODES,
    STORAGE_KEYS.SETTINGS,
  ])

  return {
    version: result[STORAGE_KEYS.VERSION] || CURRENT_SCHEMA_VERSION,
    mailboxes: result[STORAGE_KEYS.MAILBOXES] || [],
    recentCodes: result[STORAGE_KEYS.RECENT_CODES] || [],
    settings: result[STORAGE_KEYS.SETTINGS] || getDefaultSettings(),
  }
}

/**
 * Import storage data (for restore purposes)
 * NOTE: This expects encrypted data in the correct format
 */
export async function importStorage(data: StorageSchema): Promise<void> {
  // Validate schema version
  if (data.version > CURRENT_SCHEMA_VERSION) {
    throw new StorageError(
      `Cannot import data from newer schema version (v${data.version})`
    )
  }

  // Import data
  await chrome.storage.local.set({
    [STORAGE_KEYS.VERSION]: data.version,
    [STORAGE_KEYS.MAILBOXES]: data.mailboxes,
    [STORAGE_KEYS.RECENT_CODES]: data.recentCodes,
    [STORAGE_KEYS.SETTINGS]: data.settings,
  })

  // Run migrations if needed
  if (data.version < CURRENT_SCHEMA_VERSION) {
    await migrateStorage(data.version, CURRENT_SCHEMA_VERSION)
  }
}
