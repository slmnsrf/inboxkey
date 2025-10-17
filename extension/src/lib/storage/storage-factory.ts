/**
 * Storage Factory
 *
 * Factory pattern for creating the appropriate storage implementation based on
 * password protection state. Automatically returns PlaintextStorage for passwordless
 * mode or EncryptedStorage for password-protected mode.
 *
 * Thread Safety:
 * - Safe for concurrent calls within the same service worker context
 * - KeyManager singleton ensures consistent state across multiple factory calls
 * - Not safe across multiple service worker instances (use message passing)
 *
 * Usage Guidelines:
 * - Prefer create() for most scenarios (async, safe)
 * - Use createSync() only when certain the extension is unlocked/passwordless
 * - Always handle lock state errors appropriately
 *
 * @example
 * // Async usage (recommended)
 * try {
 *   const storage = await StorageFactory.create()
 *   await storage.saveAllKeys([...])
 * } catch (error) {
 *   if (error.message.includes('locked')) {
 *     // Prompt user to unlock
 *   }
 * }
 *
 * @example
 * // Sync usage (use with caution)
 * try {
 *   const storage = StorageFactory.createSync()
 *   await storage.saveAllKeys([...])
 * } catch (error) {
 *   // Handle locked state
 * }
 */

import { KeyManager } from '../crypto/key-manager'
import type { IStorage } from './storage-interface'
import { EncryptedStorage } from './encrypted-storage'
import { PlaintextStorage } from './plaintext-storage'

export class StorageFactory {
  /**
   * Create the appropriate storage instance based on password protection state
   *
   * This is the recommended method for creating storage instances. It performs
   * an async check to determine if password protection is enabled and returns
   * the appropriate storage implementation.
   *
   * Behavior:
   * - If password protection is disabled -> returns PlaintextStorage
   * - If password protection is enabled and unlocked -> returns EncryptedStorage
   * - If password protection is enabled and locked -> throws Error
   *
   * Error Conditions:
   * - Throws if extension is password-protected but currently locked
   * - Throws if master key is not available despite being unlocked (inconsistent state)
   *
   * Thread Safety:
   * - Safe to call from multiple async contexts simultaneously
   * - Uses KeyManager singleton for consistent state
   * - No shared mutable state in factory itself
   *
   * @returns Promise resolving to IStorage implementation (PlaintextStorage or EncryptedStorage)
   * @throws {Error} If password protected but locked (user must unlock first)
   * @throws {Error} If master key not available despite being unlocked (internal error)
   *
   * @example
   * // Standard usage
   * const storage = await StorageFactory.create()
   * await storage.saveAllKeys(keys)
   *
   * @example
   * // With error handling
   * try {
   *   const storage = await StorageFactory.create()
   *   const keys = await storage.getAllKeys()
   * } catch (error) {
   *   if (error.message.includes('locked')) {
   *     // Extension is locked - show unlock UI
   *     showUnlockDialog()
   *   } else {
   *     // Other error - log and handle
   *     console.error('Storage creation failed:', error)
   *   }
   * }
   */
  static async create(): Promise<IStorage> {
    const keyManager = KeyManager.getInstance()

    // Check if password protection is enabled
    const isInit = await keyManager.isInitialized()

    if (!isInit) {
      // Passwordless mode - use plaintext storage
      return new PlaintextStorage()
    }

    // Password protected mode - check if unlocked
    if (keyManager.isLocked()) {
      throw new Error('Extension is locked. Please unlock to access storage.')
    }

    // Get encryption keys
    const masterKey = keyManager.getMasterKey()
    const salt = keyManager.getSalt()

    if (!masterKey || !salt) {
      throw new Error('Master key not available')
    }

    // Return encrypted storage
    return new EncryptedStorage(masterKey, salt)
  }

  /**
   * Create storage instance synchronously (only safe if already unlocked or passwordless)
   *
   * This method performs synchronous checks and should be used with caution.
   * It's only safe to use when you're certain the extension is either:
   * 1. Running in passwordless mode, OR
   * 2. Already unlocked and you need immediate access
   *
   * When to use:
   * - In synchronous event handlers where async is not possible
   * - When you've already verified unlock state in calling code
   * - In hot code paths where async overhead is problematic
   *
   * When NOT to use:
   * - During extension startup (lock state may not be loaded yet)
   * - After long periods of inactivity (auto-lock may have triggered)
   * - Prefer async create() method whenever possible
   *
   * Behavior:
   * - If password protection is disabled -> returns PlaintextStorage
   * - If password protection is enabled and unlocked -> returns EncryptedStorage
   * - If password protection is enabled and locked -> throws Error
   *
   * Error Conditions:
   * - Throws if extension is password-protected but currently locked
   * - Throws if master key is not available despite being unlocked
   *
   * Thread Safety:
   * - Safe to call from same service worker context
   * - Uses KeyManager singleton state (no async state loading)
   * - May throw if KeyManager state not yet initialized
   *
   * @returns IStorage implementation (PlaintextStorage or EncryptedStorage)
   * @throws {Error} If password protected and locked
   * @throws {Error} If master key not available
   *
   * @example
   * // Safe usage after verifying unlock state
   * const keyManager = KeyManager.getInstance()
   * if (keyManager.isUnlocked()) {
   *   const storage = StorageFactory.createSync()
   *   await storage.saveAllKeys(keys)
   * }
   *
   * @example
   * // Usage in sync event handler (with error handling)
   * function handleSyncEvent() {
   *   try {
   *     const storage = StorageFactory.createSync()
   *     // Use storage...
   *   } catch (error) {
   *     if (error.message.includes('locked')) {
   *       // Defer operation until unlocked
   *       deferOperation()
   *     }
   *   }
   * }
   */
  static createSync(): IStorage {
    const keyManager = KeyManager.getInstance()

    // Check if password protection is enabled (sync check)
    if (!keyManager.isPasswordProtectionEnabled()) {
      return new PlaintextStorage()
    }

    // Password protected - must be unlocked
    if (keyManager.isLocked()) {
      throw new Error('Extension is locked. Please unlock to access storage.')
    }

    const masterKey = keyManager.getMasterKey()
    const salt = keyManager.getSalt()

    if (!masterKey || !salt) {
      throw new Error('Master key not available')
    }

    return new EncryptedStorage(masterKey, salt)
  }
}
