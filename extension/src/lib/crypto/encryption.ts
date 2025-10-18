/**
 * WebCrypto-based encryption utilities for InboxKey
 *
 * Uses AES-GCM with 256-bit keys for authenticated encryption.
 * Keys are derived from user passphrase using PBKDF2 with 100,000 iterations.
 *
 * Performance characteristics:
 * - Key derivation: ~300-500ms (one-time per session)
 * - Encryption/decryption: <10ms for typical payloads (<10KB)
 * - All operations use browser's native WebCrypto API
 */

/**
 * Configuration constants for encryption
 */
export const CRYPTO_CONFIG = {
  // AES-GCM parameters
  KEY_LENGTH: 256, // bits
  IV_LENGTH: 12, // bytes (96 bits, recommended for GCM)
  TAG_LENGTH: 128, // bits (GCM authentication tag)

  // PBKDF2 parameters (OWASP 2024 recommendations)
  PBKDF2_ITERATIONS: 100_000,
  SALT_LENGTH: 32, // bytes (256 bits)
  HASH_ALGORITHM: "SHA-256",
} as const

/**
 * Encrypted data structure for storage serialization
 */
export interface EncryptedData {
  ciphertext: string // Base64 encoded encrypted data
  iv: string // Base64 encoded initialization vector
  salt: string // Base64 encoded salt (for key re-derivation)
}

/**
 * Result of key derivation operation
 */
export interface DerivedKey {
  key: CryptoKey // WebCrypto key object
  salt: Uint8Array // Salt used for derivation (needed for re-derivation)
}

/**
 * Convert ArrayBuffer or Uint8Array to Base64 string for JSON serialization
 */
function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  let binary = ""
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * Convert Base64 string to ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

/**
 * Generate cryptographically secure random bytes
 */
function generateRandomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length))
}

/**
 * Derive a cryptographic key from a passphrase using PBKDF2
 *
 * This operation is intentionally slow (~300-500ms) to resist brute-force attacks.
 * Should be called once per session when the user unlocks the extension.
 *
 * @param passphrase - User's master passphrase
 * @param salt - Optional salt (if re-deriving existing key). If not provided, generates new random salt.
 * @returns Promise resolving to derived key and salt
 *
 * @example
 * ```typescript
 * // First time: generate new salt
 * const { key, salt } = await deriveKey("user-passphrase")
 * // Store salt for later...
 *
 * // Later: re-derive using same salt
 * const { key } = await deriveKey("user-passphrase", salt)
 * ```
 */
export async function deriveKey(
  passphrase: string,
  salt?: Uint8Array
): Promise<DerivedKey> {
  if (!passphrase || passphrase.length === 0) {
    throw new Error("Passphrase cannot be empty")
  }

  // Generate or use provided salt
  const actualSalt = salt ?? generateRandomBytes(CRYPTO_CONFIG.SALT_LENGTH)

  try {
    // Convert passphrase to key material
    const encoder = new TextEncoder()
    const passphraseKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode(passphrase),
      "PBKDF2",
      false,
      ["deriveBits", "deriveKey"]
    )

    // Derive AES-GCM key using PBKDF2
    const derivedKey = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: actualSalt as BufferSource,
        iterations: CRYPTO_CONFIG.PBKDF2_ITERATIONS,
        hash: CRYPTO_CONFIG.HASH_ALGORITHM,
      },
      passphraseKey,
      {
        name: "AES-GCM",
        length: CRYPTO_CONFIG.KEY_LENGTH,
      },
      false, // not extractable (security best practice)
      ["encrypt", "decrypt"]
    )

    return {
      key: derivedKey,
      salt: actualSalt,
    }
  } catch (error) {
    throw new Error(
      `Key derivation failed: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * Encrypt plaintext data using AES-GCM
 *
 * Generates a random IV for each encryption operation (required for security).
 * Returns encrypted data with IV and salt for storage.
 *
 * @param plaintext - String data to encrypt
 * @param key - CryptoKey from deriveKey()
 * @param salt - Salt used to derive the key (needed for decryption)
 * @returns Promise resolving to encrypted data structure
 *
 * @example
 * ```typescript
 * const { key, salt } = await deriveKey("passphrase")
 * const encrypted = await encrypt(JSON.stringify(myData), key, salt)
 * // Store encrypted.ciphertext, encrypted.iv, encrypted.salt
 * ```
 */
export async function encrypt(
  plaintext: string,
  key: CryptoKey,
  salt: Uint8Array
): Promise<EncryptedData> {
  if (!plaintext) {
    throw new Error("Plaintext cannot be empty")
  }

  try {
    // Generate random IV for this encryption operation
    const iv = generateRandomBytes(CRYPTO_CONFIG.IV_LENGTH)

    // Convert plaintext to bytes
    const encoder = new TextEncoder()
    const plaintextBytes = encoder.encode(plaintext)

    // Encrypt using AES-GCM
    const ciphertextBuffer = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv as BufferSource,
        tagLength: CRYPTO_CONFIG.TAG_LENGTH,
      },
      key,
      plaintextBytes
    )

    // Convert to base64 for JSON serialization
    return {
      ciphertext: arrayBufferToBase64(ciphertextBuffer),
      iv: arrayBufferToBase64(iv),
      salt: arrayBufferToBase64(salt),
    }
  } catch (error) {
    throw new Error(
      `Encryption failed: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * Decrypt ciphertext using AES-GCM
 *
 * @param encryptedData - Encrypted data structure from encrypt()
 * @param key - CryptoKey (must be derived with same passphrase and salt)
 * @returns Promise resolving to decrypted plaintext string
 *
 * @example
 * ```typescript
 * const { key } = await deriveKey("passphrase", storedSalt)
 * const plaintext = await decrypt(encryptedData, key)
 * const myData = JSON.parse(plaintext)
 * ```
 */
export async function decrypt(
  encryptedData: EncryptedData,
  key: CryptoKey
): Promise<string> {
  if (!encryptedData.ciphertext || !encryptedData.iv) {
    throw new Error("Invalid encrypted data: missing ciphertext or IV")
  }

  try {
    // Convert base64 back to ArrayBuffer
    const ciphertextBuffer = base64ToArrayBuffer(encryptedData.ciphertext)
    const iv = base64ToArrayBuffer(encryptedData.iv)

    // Decrypt using AES-GCM
    const plaintextBuffer = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: new Uint8Array(iv),
        tagLength: CRYPTO_CONFIG.TAG_LENGTH,
      },
      key,
      ciphertextBuffer
    )

    // Convert bytes back to string
    const decoder = new TextDecoder()
    return decoder.decode(plaintextBuffer)
  } catch (error) {
    // Decryption failures usually mean wrong key or corrupted data
    throw new Error(
      `Decryption failed: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * Convenience function: derive key and encrypt in one operation
 * Useful for testing, but in production you should cache the derived key.
 */
export async function deriveAndEncrypt(
  plaintext: string,
  passphrase: string,
  salt?: Uint8Array
): Promise<EncryptedData> {
  const { key, salt: actualSalt } = await deriveKey(passphrase, salt)
  return encrypt(plaintext, key, actualSalt)
}

/**
 * Convenience function: derive key and decrypt in one operation
 * Useful for testing, but in production you should cache the derived key.
 */
export async function deriveAndDecrypt(
  encryptedData: EncryptedData,
  passphrase: string
): Promise<string> {
  const saltBytes = base64ToArrayBuffer(encryptedData.salt)
  const { key } = await deriveKey(passphrase, new Uint8Array(saltBytes))
  return decrypt(encryptedData, key)
}
