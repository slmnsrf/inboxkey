/**
 * Crypto module exports
 *
 * This module exports utilities needed for Phase 3 data migration.
 * Lock/unlock state management has been removed in Phase 2.
 */

// Encryption utilities (from encryption.ts)
export {
  deriveKey,
  encrypt,
  decrypt,
  deriveAndEncrypt,
  deriveAndDecrypt,
  CRYPTO_CONFIG,
  type EncryptedData,
  type DerivedKey,
} from "./encryption"

// Migration utilities (from crypto-utils.ts)
export {
  getSavedSalt,
  clearSalt,
  PIN_LENGTH,
  MIN_PASSWORD_LENGTH,
  PIN_REGEX,
} from "./crypto-utils"

// Error types (from errors.ts)
export {
  CryptoError,
  KeyDerivationError,
  EncryptionError,
} from "./errors"
