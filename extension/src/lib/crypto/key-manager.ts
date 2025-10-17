/**
 * Key Manager for Session Management
 *
 * Manages master key derivation, caching, and lock/unlock flows.
 * The master key is derived from user password using PBKDF2 and cached in memory.
 * On lock, the key is cleared from memory and must be re-derived on unlock.
 *
 * Security design:
 * - Master key never persisted to disk (memory only)
 * - Salt persisted to storage (required for key re-derivation)
 * - Auto-lock after configurable timeout
 * - Singleton pattern ensures one key instance per service worker
 */

import { deriveKey, encrypt, decrypt } from "./encryption"
import { KeyDerivationError, LockError } from "./errors"
import { saveSalt, setLocked, setLastUnlockedAt } from "./lock-state"

/**
 * PIN length (fixed) enforced by the key manager
 */
export const PIN_LENGTH = 6
export const MIN_PASSWORD_LENGTH = PIN_LENGTH
export const PIN_REGEX = /^\d{6}$/

/**
 * Default auto-lock timeout in minutes
 */
export const DEFAULT_AUTO_LOCK_TIMEOUT_MINUTES = 15

/**
 * Verification test value used to confirm correct password
 * This is a known plaintext that we encrypt/decrypt to verify the key
 */
const VERIFICATION_TEST_VALUE = "inboxkey-verification-v1"

/**
 * Storage key for the encrypted verification value
 */
const VERIFICATION_STORAGE_KEY = "keyVerification"

/**
 * KeyManager - Singleton class for managing encryption keys and lock state
 */
export class KeyManager {
  private static instance: KeyManager | null = null
  private masterKey: CryptoKey | null = null
  private salt: Uint8Array | null = null
  private unlockedAt: number | null = null
  private lockTimeout: NodeJS.Timeout | null = null
  private autoLockTimeoutMinutes: number = DEFAULT_AUTO_LOCK_TIMEOUT_MINUTES
  private isUnlocking: boolean = false // Prevents concurrent unlock attempts

  // New flags for proper lock state management
  private isPasswordProtected: boolean = false // true if password protection is enabled
  private isManuallyLocked: boolean = false    // true if user has manually locked OR auto-lock fired

  /**
   * Private constructor - use getInstance() instead
   */
  private constructor() {
    // Load initialization state asynchronously (don't block constructor)
    this.loadInitializationState().catch((error) => {
      console.error("[KeyManager] Failed to load initialization state:", error)
    })
  }

  /**
   * Get the singleton instance of KeyManager
   */
  static getInstance(): KeyManager {
    if (!KeyManager.instance) {
      KeyManager.instance = new KeyManager()
    }
    return KeyManager.instance
  }

  /**
   * Reset the singleton instance (for testing only)
   * @internal
   */
  static resetInstance(): void {
    if (KeyManager.instance) {
      KeyManager.instance.lock()
    }
    KeyManager.instance = null
  }

  /**
   * Initialize the key manager with a new password
   * This is called when the user first sets up lock mode
   *
   * @param password - User's master password
   * @returns Object containing the generated salt
   * @throws {KeyDerivationError} If password is invalid or key derivation fails
   */
  async initialize(password: string): Promise<{ salt: Uint8Array }> {
    // Validate password
    this.ensureValidPin(password)

    try {
      // Derive key with new random salt
      const { key, salt } = await deriveKey(password)

      // Store the key and salt in memory
      this.masterKey = key
      this.salt = salt
      this.unlockedAt = Date.now()

      // Set password protection flags
      this.isPasswordProtected = true
      this.isManuallyLocked = false // Extension starts unlocked after setting password

      // Persist salt to storage (needed for future unlocks)
      await saveSalt(salt)

      // Create and store verification data
      await this.createVerificationData(key, salt)

      // Mark as unlocked
      await setLocked(false)
      await setLastUnlockedAt(this.unlockedAt)

      // Start auto-lock timer
      this.resetAutoLockTimer()

      return { salt }
    } catch (error) {
      // Clean up on error
      this.masterKey = null
      this.salt = null
      this.unlockedAt = null

      throw new KeyDerivationError(
        "Failed to initialize key manager",
        error
      )
    }
  }

  /**
   * Unlock the extension with the user's password
   * Derives the key and verifies it against stored verification data
   *
   * @param password - User's master password
   * @param salt - Salt to use for key derivation (from storage)
   * @returns true if unlock successful, false if password incorrect
   * @throws {LockError} If unlock operation fails for reasons other than wrong password
   */
  async unlock(password: string, salt: Uint8Array): Promise<boolean> {
    // Prevent concurrent unlock attempts
    if (this.isUnlocking) {
      throw new LockError("Unlock already in progress")
    }

    // Already unlocked
    if (this.isUnlocked()) {
      return true
    }

    this.isUnlocking = true

    try {
      // Validate inputs
      if (!PIN_REGEX.test(password)) {
        return false
      }

      if (!salt || salt.length === 0) {
        throw new LockError("Invalid salt provided")
      }

      // Derive key from password
      const { key } = await deriveKey(password, salt)

      // Verify the key is correct by attempting to decrypt verification data
      const isValid = await this.verifyKey(key)

      if (!isValid) {
        return false
      }

      // Store key in memory
      this.masterKey = key
      this.salt = salt
      this.unlockedAt = Date.now()

      // Update lock state
      this.isManuallyLocked = false

      // Update storage
      await setLocked(false)
      await setLastUnlockedAt(this.unlockedAt)

      // Start auto-lock timer
      this.resetAutoLockTimer()

      return true
    } catch (error) {
      // If error is KeyDerivationError or verification failed, return false
      if (error instanceof KeyDerivationError) {
        return false
      }

      // For other errors, throw LockError
      throw new LockError("Failed to unlock", error)
    } finally {
      this.isUnlocking = false
    }
  }

  /**
   * Validate PIN format (six numeric digits)
   */
  private ensureValidPin(password: string): void {
    if (!PIN_REGEX.test(password)) {
      throw new KeyDerivationError("Password must be exactly 6 digits (numbers only)")
    }
  }

  /**
   * Lock the extension
   * Clears the master key from memory and stops auto-lock timer
   * Only takes effect if password protection is enabled
   */
  lock(): void {
    // Only lock if password protection is enabled
    if (!this.isPasswordProtected) {
      console.warn("[KeyManager] Cannot lock - password protection not enabled")
      return
    }

    // Set manually locked flag
    this.isManuallyLocked = true

    // Clear master key from memory
    this.masterKey = null
    this.salt = null
    this.unlockedAt = null

    // Clear auto-lock timer
    this.clearAutoLockTimeout()

    // Update storage (async, but don't wait)
    setLocked(true).catch((error) => {
      console.error("[KeyManager] Failed to update lock state:", error)
    })
  }

  /**
   * Get the master key (if unlocked)
   * @returns The master key, or null if locked
   */
  getMasterKey(): CryptoKey | null {
    return this.masterKey
  }

  /**
   * Get the salt (if unlocked)
   * @returns The salt, or null if locked
   */
  getSalt(): Uint8Array | null {
    return this.salt
  }

  /**
   * Check if the extension is currently locked
   * Returns true only when password protection is enabled AND user has locked it
   */
  isLocked(): boolean {
    return this.isPasswordProtected && this.isManuallyLocked
  }

  /**
   * Check if the extension is currently unlocked
   * Returns true if: (1) no password protection, OR (2) password set but not locked
   */
  isUnlocked(): boolean {
    return !this.isLocked()
  }

  /**
   * Check if password protection is enabled (sync method for performance)
   */
  isPasswordProtectionEnabled(): boolean {
    return this.isPasswordProtected
  }

  /**
   * Check if the extension has been initialized with a password
   * This checks if verification data exists in storage.
   *
   * NOTE: This is used to determine if lock mode is active.
   * Until Phase 8 is implemented, extensions without passwords should work unlocked.
   *
   * @returns true if password has been set (verification data exists)
   */
  async isInitialized(): Promise<boolean> {
    try {
      const result = await chrome.storage.local.get(VERIFICATION_STORAGE_KEY)
      return !!result[VERIFICATION_STORAGE_KEY]
    } catch (error) {
      console.error("[KeyManager] Failed to check initialization status:", error)
      return false
    }
  }

  /**
   * Get the timestamp when the extension was unlocked
   */
  getUnlockedAt(): number | null {
    return this.unlockedAt
  }

  /**
   * Set the auto-lock timeout duration
   * @param minutes - Timeout in minutes (0 = disabled)
   */
  setAutoLockTimeout(minutes: number): void {
    this.autoLockTimeoutMinutes = minutes

    // If currently unlocked, restart the timer with new timeout
    if (this.isUnlocked()) {
      this.resetAutoLockTimer()
    }
  }

  /**
   * Clear the auto-lock timeout
   */
  clearAutoLockTimeout(): void {
    if (this.lockTimeout) {
      clearTimeout(this.lockTimeout)
      this.lockTimeout = null
    }
  }

  /**
   * Reset the auto-lock timer
   * Called on user activity to延 postpone auto-lock
   */
  resetAutoLockTimer(): void {
    this.clearAutoLockTimeout()

    // If timeout is 0, don't set a timer (auto-lock disabled)
    if (this.autoLockTimeoutMinutes === 0) {
      return
    }

    // Set new timer
    const timeoutMs = this.autoLockTimeoutMinutes * 60 * 1000
    this.lockTimeout = setTimeout(() => {
      console.log("[KeyManager] Auto-lock timeout triggered")
      this.lock()
    }, timeoutMs)
  }

  /**
   * Verify a password against the stored verification data
   * @param password - Password to verify
   * @param salt - Salt for key derivation
   * @returns true if password is correct, false otherwise
   */
  async verifyPassword(password: string, salt: Uint8Array): Promise<boolean> {
    try {
      const { key } = await deriveKey(password, salt)
      return await this.verifyKey(key)
    } catch {
      return false
    }
  }

  /**
   * Load initialization state from storage on startup
   * Sets isPasswordProtected flag based on verification data existence
   * @private
   */
  private async loadInitializationState(): Promise<void> {
    try {
      const isInit = await this.isInitialized()
      this.isPasswordProtected = isInit

      // If password protected, start in locked state (security default)
      if (this.isPasswordProtected) {
        this.isManuallyLocked = true
      }
    } catch (error) {
      console.error("[KeyManager] Failed to load initialization state:", error)
      // Default to unlocked/no-password on error
      this.isPasswordProtected = false
      this.isManuallyLocked = false
    }
  }

  /**
   * Clear password protection (called when disabling password)
   * Resets all lock state flags to passwordless mode
   */
  clearPasswordProtection(): void {
    this.isPasswordProtected = false
    this.isManuallyLocked = false
    this.masterKey = null
    this.salt = null
    this.unlockedAt = null
    this.clearAutoLockTimeout()
  }

  /**
   * Create verification data for password verification
   * Encrypts a known value that can be decrypted to verify the key
   * @private
   */
  private async createVerificationData(
    key: CryptoKey,
    salt: Uint8Array
  ): Promise<void> {
    try {
      const encrypted = await encrypt(VERIFICATION_TEST_VALUE, key, salt)

      // Store encrypted verification data
      await chrome.storage.local.set({
        [VERIFICATION_STORAGE_KEY]: encrypted,
      })
    } catch (error) {
      throw new KeyDerivationError(
        "Failed to create verification data",
        error
      )
    }
  }

  /**
   * Verify a key by attempting to decrypt verification data
   * @private
   */
  private async verifyKey(key: CryptoKey): Promise<boolean> {
    try {
      // Load verification data from storage
      const result = await chrome.storage.local.get(VERIFICATION_STORAGE_KEY)
      const verificationData = result[VERIFICATION_STORAGE_KEY]

      if (!verificationData) {
        // No verification data means extension not initialized
        throw new LockError("Extension not initialized")
      }

      // Attempt to decrypt
      const decrypted = await decrypt(verificationData, key)

      // Check if decrypted value matches
      return decrypted === VERIFICATION_TEST_VALUE
    } catch {
      // Decryption failure means wrong password
      return false
    }
  }
}

/**
 * Convenience function to get the KeyManager instance
 */
export function getKeyManager(): KeyManager {
  return KeyManager.getInstance()
}
