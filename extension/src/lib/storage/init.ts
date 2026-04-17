/**
 * Storage initialization and migration utilities
 */

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
 * Initialize storage
 *
 * Ensures default values exist and runs migrations if needed.
 *
 * @example
 * ```typescript
 * await initializeStorage()
 * ```
 */
export async function initializeStorage(): Promise<void> {
  try {
    // Read the stored schema version FIRST - before ensureDefaults
    // seeds anything. ensureDefaults used to write the version key if
    // missing, which masked pre-versioning installs as already-on-
    // current and caused getStorageVersion's "?? 0" fallback to be
    // unreachable. Now version stamping is deferred until after any
    // migrations run.
    const currentVersion = await getStorageVersion()

    await ensureDefaults()

    if (currentVersion < CURRENT_SCHEMA_VERSION) {
      await migrateStorage(currentVersion, CURRENT_SCHEMA_VERSION)
    }

    // Stamp the current version after migrations succeed (or if we
    // were already current). This is the only place VERSION is written
    // for fresh installs - the migration path does its own writes.
    await chrome.storage.local.set({
      [STORAGE_KEYS.VERSION]: CURRENT_SCHEMA_VERSION,
    })
  } catch (error) {
    throw new StorageError("Failed to initialize storage", error)
  }
}

/**
 * Ensure default settings and session state exist.
 *
 * Note: does NOT seed STORAGE_KEYS.VERSION - initializeStorage() reads
 * the version before calling this function so the "pre-versioning" case
 * (0) is observable, then stamps the version after migrations.
 */
async function ensureDefaults(): Promise<void> {
  // Check if settings exist
  const settingsResult = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS)
  if (!settingsResult[STORAGE_KEYS.SETTINGS]) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.SETTINGS]: getDefaultSettings(),
    })
  }

  // Initialize empty arrays if they don't exist
  const mailboxesResult = await chrome.storage.local.get(STORAGE_KEYS.MAILBOXES)
  if (!mailboxesResult[STORAGE_KEYS.MAILBOXES]) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.MAILBOXES]: [],
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
  // 0 means "pre-versioning install" - forces migrations to run from
  // the start. Using || 1 previously masked those installs as already-
  // on-current, so any future v1 -> v2 migration would silently skip.
  return result[STORAGE_KEYS.VERSION] ?? 0
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

