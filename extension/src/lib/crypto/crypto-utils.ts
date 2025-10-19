/**
 * Crypto utilities for data migration (Phase 3)
 *
 * IMPORTANT: These utilities are preserved for migrating existing encrypted data.
 * DO NOT DELETE - user data recovery depends on these functions.
 *
 * This module will be used in Phase 3 to decrypt existing encrypted data
 * before the encryption feature is fully removed.
 */

/**
 * PIN constants (preserved for UI validation until Phase 5)
 * TODO: Phase 5 - Remove these when UI no longer needs them
 */
export const PIN_LENGTH = 6
export const MIN_PASSWORD_LENGTH = PIN_LENGTH
export const PIN_REGEX = /^\d{6}$/

/**
 * Storage key for the salt (legacy)
 */
const STORAGE_KEY_SALT = "masterKeySalt"

/**
 * Get the saved salt from storage
 * Returns null if no salt has been saved (extension not initialized with password)
 *
 * PRESERVED FOR MIGRATION: Phase 3 needs this to decrypt existing data
 */
export async function getSavedSalt(): Promise<Uint8Array | null> {
  const result = await chrome.storage.local.get(STORAGE_KEY_SALT)
  const saltData = result[STORAGE_KEY_SALT]

  if (!saltData) {
    return null
  }

  // Salt is stored as an array of numbers, convert back to Uint8Array
  if (Array.isArray(saltData)) {
    return new Uint8Array(saltData)
  }

  // Handle case where it might already be a Uint8Array
  if (saltData instanceof Uint8Array) {
    return saltData
  }

  return null
}

/**
 * Clear the saved salt from storage
 * Used during migration cleanup after data has been decrypted
 */
export async function clearSalt(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY_SALT)
}
