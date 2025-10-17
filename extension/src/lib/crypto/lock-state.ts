/**
 * Lock state management utilities
 *
 * Handles persistence of lock state and salt in chrome.storage.local
 */

const STORAGE_KEYS = {
  LOCK_STATE: "lockState",
  SALT: "masterKeySalt",
  LAST_UNLOCKED_AT: "lastUnlockedAt",
} as const

/**
 * Check if the extension is currently locked
 */
export async function isLocked(): Promise<boolean> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.LOCK_STATE)
  return result[STORAGE_KEYS.LOCK_STATE] === true
}

/**
 * Set the locked state
 */
export async function setLocked(locked: boolean): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.LOCK_STATE]: locked,
  })
}

/**
 * Get the timestamp when the extension was last unlocked
 */
export async function getLastUnlockedAt(): Promise<number | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.LAST_UNLOCKED_AT)
  return result[STORAGE_KEYS.LAST_UNLOCKED_AT] ?? null
}

/**
 * Set the timestamp when the extension was unlocked
 */
export async function setLastUnlockedAt(timestamp: number): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.LAST_UNLOCKED_AT]: timestamp,
  })
}

/**
 * Get the saved salt from storage
 * Returns null if no salt has been saved (extension not initialized)
 */
export async function getSavedSalt(): Promise<Uint8Array | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SALT)
  const saltData = result[STORAGE_KEYS.SALT]

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
 * Save the salt to storage
 * Salt must be saved during initialization and persists across sessions
 */
export async function saveSalt(salt: Uint8Array): Promise<void> {
  // Convert Uint8Array to regular array for storage
  // chrome.storage can't serialize Uint8Array directly
  await chrome.storage.local.set({
    [STORAGE_KEYS.SALT]: Array.from(salt),
  })
}

/**
 * Clear all lock-related data from storage
 * Used when resetting the extension or changing password
 */
export async function clearLockData(): Promise<void> {
  await chrome.storage.local.remove([
    STORAGE_KEYS.LOCK_STATE,
    STORAGE_KEYS.SALT,
    STORAGE_KEYS.LAST_UNLOCKED_AT,
  ])
}
