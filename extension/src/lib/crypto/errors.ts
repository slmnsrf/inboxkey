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
 * PRESERVED FOR MIGRATION: Phase 3 decryption needs this error type
 */
export class KeyDerivationError extends CryptoError {
  constructor(message: string, public readonly cause?: unknown) {
    super(message)
    this.name = "KeyDerivationError"
  }
}

/**
 * Error thrown when encryption/decryption fails
 * PRESERVED FOR MIGRATION: Phase 3 decryption needs this error type
 */
export class EncryptionError extends CryptoError {
  constructor(message: string, public readonly cause?: unknown) {
    super(message)
    this.name = "EncryptionError"
  }
}
