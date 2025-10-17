/**
 * Custom error types for crypto operations
 */

/**
 * Base error class for all crypto-related errors
 */
export class CryptoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CryptoError"
  }
}

/**
 * Error thrown when key derivation fails
 */
export class KeyDerivationError extends CryptoError {
  constructor(message: string, public readonly cause?: unknown) {
    super(message)
    this.name = "KeyDerivationError"
  }
}

/**
 * Error thrown when lock/unlock operations fail
 */
export class LockError extends CryptoError {
  constructor(message: string, public readonly cause?: unknown) {
    super(message)
    this.name = "LockError"
  }
}

/**
 * Error thrown when encryption/decryption fails
 */
export class EncryptionError extends CryptoError {
  constructor(message: string, public readonly cause?: unknown) {
    super(message)
    this.name = "EncryptionError"
  }
}
