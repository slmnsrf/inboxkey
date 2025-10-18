/**
 * Unit tests for encryption module
 *
 * Tests all encryption functionality including:
 * - Key derivation with PBKDF2
 * - AES-GCM encryption/decryption
 * - Base64 encoding/decoding helpers
 * - Random byte generation (salts, IVs)
 * - Error handling and edge cases
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  deriveKey,
  encrypt,
  decrypt,
  deriveAndEncrypt,
  deriveAndDecrypt,
  CRYPTO_CONFIG,
  type EncryptedData,
  type DerivedKey,
} from '@/lib/crypto/encryption'

describe('encryption', () => {
  describe('CRYPTO_CONFIG', () => {
    it('should have correct security parameters', () => {
      expect(CRYPTO_CONFIG.KEY_LENGTH).toBe(256)
      expect(CRYPTO_CONFIG.IV_LENGTH).toBe(12)
      expect(CRYPTO_CONFIG.TAG_LENGTH).toBe(128)
      expect(CRYPTO_CONFIG.PBKDF2_ITERATIONS).toBe(100_000)
      expect(CRYPTO_CONFIG.SALT_LENGTH).toBe(32)
      expect(CRYPTO_CONFIG.HASH_ALGORITHM).toBe('SHA-256')
    })
  })

  describe('deriveKey()', () => {
    it('should derive a key from a valid passphrase', async () => {
      const passphrase = 'test-passphrase-123'
      const result = await deriveKey(passphrase)

      expect(result).toHaveProperty('key')
      expect(result).toHaveProperty('salt')
      expect(result.key).toBeInstanceOf(CryptoKey)
      expect(result.salt).toBeInstanceOf(Uint8Array)
      expect(result.salt.length).toBe(CRYPTO_CONFIG.SALT_LENGTH)
    })

    it('should throw on empty passphrase', async () => {
      await expect(deriveKey('')).rejects.toThrow('Passphrase cannot be empty')
    })

    it('should accept whitespace-only passphrase', async () => {
      // Note: The implementation does not trim whitespace, so '   ' is a valid passphrase
      const result = await deriveKey('   ')
      expect(result).toHaveProperty('key')
      expect(result).toHaveProperty('salt')
    })

    it('should produce different keys for different passphrases', async () => {
      const passphrase1 = 'passphrase-one'
      const passphrase2 = 'passphrase-two'

      const result1 = await deriveKey(passphrase1)
      const result2 = await deriveKey(passphrase2)

      // Keys should be different objects
      expect(result1.key).not.toBe(result2.key)

      // Salts should be different (random generation)
      expect(result1.salt).not.toEqual(result2.salt)
    })

    it('should produce same key for same passphrase with same salt', async () => {
      const passphrase = 'test-passphrase'

      // First derivation
      const result1 = await deriveKey(passphrase)

      // Second derivation with same salt
      const result2 = await deriveKey(passphrase, result1.salt)

      // Salts should be the same
      expect(result2.salt).toEqual(result1.salt)

      // Test that the keys work the same by encrypting/decrypting
      const testData = 'test message'
      const encrypted1 = await encrypt(testData, result1.key, result1.salt)
      const decrypted2 = await decrypt(encrypted1, result2.key)

      expect(decrypted2).toBe(testData)
    })

    it('should accept provided salt', async () => {
      const passphrase = 'test-passphrase'
      const customSalt = new Uint8Array(32)
      customSalt.fill(42) // Fill with specific value

      const result = await deriveKey(passphrase, customSalt)

      expect(result.salt).toEqual(customSalt)
    })

    it('should generate random salt when not provided', async () => {
      const passphrase = 'test-passphrase'

      const result1 = await deriveKey(passphrase)
      const result2 = await deriveKey(passphrase)

      // Without providing salt, each call should generate different salt
      expect(result1.salt).not.toEqual(result2.salt)
    })

    it('should create non-extractable key', async () => {
      const passphrase = 'test-passphrase'
      const result = await deriveKey(passphrase)

      expect(result.key.extractable).toBe(false)
    })

    it('should create key with correct algorithm', async () => {
      const passphrase = 'test-passphrase'
      const result = await deriveKey(passphrase)

      expect(result.key.type).toBe('secret')
      expect(result.key.algorithm.name).toBe('AES-GCM')
      expect((result.key.algorithm as AesKeyAlgorithm).length).toBe(CRYPTO_CONFIG.KEY_LENGTH)
    })

    it('should create key with correct usages', async () => {
      const passphrase = 'test-passphrase'
      const result = await deriveKey(passphrase)

      expect(result.key.usages).toContain('encrypt')
      expect(result.key.usages).toContain('decrypt')
      expect(result.key.usages.length).toBe(2)
    })

    it('should handle very long passphrase', async () => {
      const longPassphrase = 'a'.repeat(10000)
      const result = await deriveKey(longPassphrase)

      expect(result.key).toBeInstanceOf(CryptoKey)
      expect(result.salt).toBeInstanceOf(Uint8Array)
    })

    it('should handle special characters in passphrase', async () => {
      const specialPassphrase = 'p@ss!#$%^&*()_+-=[]{}|;:\',.<>?/~`'
      const result = await deriveKey(specialPassphrase)

      expect(result.key).toBeInstanceOf(CryptoKey)
      expect(result.salt).toBeInstanceOf(Uint8Array)
    })

    it('should handle unicode characters in passphrase', async () => {
      const unicodePassphrase = 'пароль密码🔐パスワード'
      const result = await deriveKey(unicodePassphrase)

      expect(result.key).toBeInstanceOf(CryptoKey)
      expect(result.salt).toBeInstanceOf(Uint8Array)
    })

    it('should produce different salt on each call without provided salt', async () => {
      const passphrase = 'test-passphrase'
      const salts = new Set<string>()

      // Generate multiple salts
      for (let i = 0; i < 10; i++) {
        const result = await deriveKey(passphrase)
        salts.add(Array.from(result.salt).join(','))
      }

      // All salts should be unique
      expect(salts.size).toBe(10)
    })
  })

  describe('encrypt()', () => {
    let testKey: CryptoKey
    let testSalt: Uint8Array

    beforeEach(async () => {
      const derived = await deriveKey('test-passphrase')
      testKey = derived.key
      testSalt = derived.salt
    })

    it('should encrypt data successfully', async () => {
      const plaintext = 'Hello, World!'
      const encrypted = await encrypt(plaintext, testKey, testSalt)

      expect(encrypted).toHaveProperty('ciphertext')
      expect(encrypted).toHaveProperty('iv')
      expect(encrypted).toHaveProperty('salt')
      expect(typeof encrypted.ciphertext).toBe('string')
      expect(typeof encrypted.iv).toBe('string')
      expect(typeof encrypted.salt).toBe('string')
      expect(encrypted.ciphertext.length).toBeGreaterThan(0)
      expect(encrypted.iv.length).toBeGreaterThan(0)
      expect(encrypted.salt.length).toBeGreaterThan(0)
    })

    it('should produce different ciphertext for same plaintext', async () => {
      const plaintext = 'Same message'

      const encrypted1 = await encrypt(plaintext, testKey, testSalt)
      const encrypted2 = await encrypt(plaintext, testKey, testSalt)

      // IVs should be different (random)
      expect(encrypted1.iv).not.toBe(encrypted2.iv)

      // Ciphertexts should be different (different IVs)
      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext)

      // Salts should be the same (we're using the same salt)
      expect(encrypted1.salt).toBe(encrypted2.salt)
    })

    it('should throw on empty plaintext', async () => {
      await expect(encrypt('', testKey, testSalt)).rejects.toThrow('Plaintext cannot be empty')
    })

    it('should handle unicode characters', async () => {
      const unicodeText = 'Hello 世界 🌍 مرحبا мир'
      const encrypted = await encrypt(unicodeText, testKey, testSalt)

      expect(encrypted.ciphertext).toBeDefined()
      expect(encrypted.iv).toBeDefined()

      // Verify it can be decrypted back
      const decrypted = await decrypt(encrypted, testKey)
      expect(decrypted).toBe(unicodeText)
    })

    it('should handle very long strings', async () => {
      const longText = 'a'.repeat(100000) // 100KB of text
      const encrypted = await encrypt(longText, testKey, testSalt)

      expect(encrypted.ciphertext).toBeDefined()
      expect(encrypted.iv).toBeDefined()

      // Verify it can be decrypted back
      const decrypted = await decrypt(encrypted, testKey)
      expect(decrypted).toBe(longText)
    })

    it('should handle JSON strings', async () => {
      const jsonData = JSON.stringify({
        name: 'Test User',
        email: 'test@example.com',
        nested: { key: 'value' },
      })

      const encrypted = await encrypt(jsonData, testKey, testSalt)
      const decrypted = await decrypt(encrypted, testKey)

      expect(decrypted).toBe(jsonData)
      expect(JSON.parse(decrypted)).toEqual(JSON.parse(jsonData))
    })

    it('should handle special characters', async () => {
      const specialChars = '!@#$%^&*()_+-=[]{}|;:\',.<>?/~`"\\'
      const encrypted = await encrypt(specialChars, testKey, testSalt)
      const decrypted = await decrypt(encrypted, testKey)

      expect(decrypted).toBe(specialChars)
    })

    it('should handle newlines and whitespace', async () => {
      const textWithWhitespace = 'Line 1\nLine 2\r\nLine 3\t\tTabbed'
      const encrypted = await encrypt(textWithWhitespace, testKey, testSalt)
      const decrypted = await decrypt(encrypted, testKey)

      expect(decrypted).toBe(textWithWhitespace)
    })

    it('should produce base64-encoded output', async () => {
      const plaintext = 'test message'
      const encrypted = await encrypt(plaintext, testKey, testSalt)

      // Base64 regex pattern
      const base64Pattern = /^[A-Za-z0-9+/]*={0,2}$/

      expect(encrypted.ciphertext).toMatch(base64Pattern)
      expect(encrypted.iv).toMatch(base64Pattern)
      expect(encrypted.salt).toMatch(base64Pattern)
    })

    it('should include authentication tag in ciphertext', async () => {
      const plaintext = 'authenticated message'
      const encrypted = await encrypt(plaintext, testKey, testSalt)

      // GCM authentication tag should make ciphertext longer than plaintext
      // Tag is 128 bits (16 bytes), which becomes ~22 chars in base64
      const plaintextBytes = new TextEncoder().encode(plaintext).length
      const ciphertextBytes = atob(encrypted.ciphertext).length

      // Ciphertext should include plaintext + authentication tag
      expect(ciphertextBytes).toBeGreaterThan(plaintextBytes)
    })
  })

  describe('decrypt()', () => {
    let testKey: CryptoKey
    let testSalt: Uint8Array

    beforeEach(async () => {
      const derived = await deriveKey('test-passphrase')
      testKey = derived.key
      testSalt = derived.salt
    })

    it('should decrypt encrypted data correctly', async () => {
      const plaintext = 'Secret message'
      const encrypted = await encrypt(plaintext, testKey, testSalt)
      const decrypted = await decrypt(encrypted, testKey)

      expect(decrypted).toBe(plaintext)
    })

    it('should handle round-trip encrypt/decrypt', async () => {
      const originalText = 'Round trip test message with special chars: 你好 🎉'

      const encrypted = await encrypt(originalText, testKey, testSalt)
      const decrypted = await decrypt(encrypted, testKey)

      expect(decrypted).toBe(originalText)
    })

    it('should throw on corrupted ciphertext', async () => {
      const plaintext = 'test message'
      const encrypted = await encrypt(plaintext, testKey, testSalt)

      // Corrupt the ciphertext
      const corrupted: EncryptedData = {
        ...encrypted,
        ciphertext: encrypted.ciphertext.slice(0, -4) + 'XXXX',
      }

      await expect(decrypt(corrupted, testKey)).rejects.toThrow('Decryption failed')
    })

    it('should throw on wrong key', async () => {
      const plaintext = 'test message'
      const encrypted = await encrypt(plaintext, testKey, testSalt)

      // Create a different key
      const wrongKey = (await deriveKey('different-passphrase')).key

      await expect(decrypt(encrypted, wrongKey)).rejects.toThrow('Decryption failed')
    })

    it('should throw on missing IV', async () => {
      const plaintext = 'test message'
      const encrypted = await encrypt(plaintext, testKey, testSalt)

      const noIV: EncryptedData = {
        ...encrypted,
        iv: '',
      }

      await expect(decrypt(noIV, testKey)).rejects.toThrow('Invalid encrypted data')
    })

    it('should throw on missing ciphertext', async () => {
      const plaintext = 'test message'
      const encrypted = await encrypt(plaintext, testKey, testSalt)

      const noCiphertext: EncryptedData = {
        ...encrypted,
        ciphertext: '',
      }

      await expect(decrypt(noCiphertext, testKey)).rejects.toThrow('Invalid encrypted data')
    })

    it('should throw on tampered IV', async () => {
      const plaintext = 'test message'
      const encrypted = await encrypt(plaintext, testKey, testSalt)

      // Tamper with IV
      const tamperedIV: EncryptedData = {
        ...encrypted,
        iv: encrypted.iv.slice(0, -4) + 'XXXX',
      }

      await expect(decrypt(tamperedIV, testKey)).rejects.toThrow('Decryption failed')
    })

    it('should detect authentication failure on tampered data', async () => {
      const plaintext = 'authenticated message'
      const encrypted = await encrypt(plaintext, testKey, testSalt)

      // Flip a bit in the ciphertext
      const ciphertextBytes = atob(encrypted.ciphertext)
      const modifiedBytes = ciphertextBytes.slice(0, 5) +
        String.fromCharCode(ciphertextBytes.charCodeAt(5) ^ 1) +
        ciphertextBytes.slice(6)

      const tampered: EncryptedData = {
        ...encrypted,
        ciphertext: btoa(modifiedBytes),
      }

      // GCM authentication should fail
      await expect(decrypt(tampered, testKey)).rejects.toThrow('Decryption failed')
    })

    it('should handle very long encrypted data', async () => {
      const longText = 'x'.repeat(50000) // 50KB
      const encrypted = await encrypt(longText, testKey, testSalt)
      const decrypted = await decrypt(encrypted, testKey)

      expect(decrypted).toBe(longText)
      expect(decrypted.length).toBe(50000)
    })

    it('should preserve exact byte content', async () => {
      // Test with binary-like data represented as string
      const binaryLikeData = '\x00\x01\x02\x03\x04\x05\x06\x07'
      const encrypted = await encrypt(binaryLikeData, testKey, testSalt)
      const decrypted = await decrypt(encrypted, testKey)

      expect(decrypted).toBe(binaryLikeData)
    })
  })

  describe('deriveAndEncrypt()', () => {
    it('should derive key and encrypt in one operation', async () => {
      const passphrase = 'test-passphrase'
      const plaintext = 'test message'

      const encrypted = await deriveAndEncrypt(plaintext, passphrase)

      expect(encrypted).toHaveProperty('ciphertext')
      expect(encrypted).toHaveProperty('iv')
      expect(encrypted).toHaveProperty('salt')
    })

    it('should use provided salt if given', async () => {
      const passphrase = 'test-passphrase'
      const plaintext = 'test message'
      const customSalt = new Uint8Array(32)
      customSalt.fill(99)

      const encrypted = await deriveAndEncrypt(plaintext, passphrase, customSalt)

      // Convert salt back from base64 and verify
      const saltBytes = new Uint8Array(atob(encrypted.salt).split('').map(c => c.charCodeAt(0)))
      expect(saltBytes).toEqual(customSalt)
    })

    it('should generate new salt if not provided', async () => {
      const passphrase = 'test-passphrase'
      const plaintext = 'test message'

      const encrypted1 = await deriveAndEncrypt(plaintext, passphrase)
      const encrypted2 = await deriveAndEncrypt(plaintext, passphrase)

      // Salts should be different
      expect(encrypted1.salt).not.toBe(encrypted2.salt)
    })
  })

  describe('deriveAndDecrypt()', () => {
    it('should derive key and decrypt in one operation', async () => {
      const passphrase = 'test-passphrase'
      const plaintext = 'test message'

      const encrypted = await deriveAndEncrypt(plaintext, passphrase)
      const decrypted = await deriveAndDecrypt(encrypted, passphrase)

      expect(decrypted).toBe(plaintext)
    })

    it('should fail with wrong passphrase', async () => {
      const passphrase = 'test-passphrase'
      const wrongPassphrase = 'wrong-passphrase'
      const plaintext = 'test message'

      const encrypted = await deriveAndEncrypt(plaintext, passphrase)

      await expect(deriveAndDecrypt(encrypted, wrongPassphrase)).rejects.toThrow('Decryption failed')
    })

    it('should handle round-trip with convenience functions', async () => {
      const passphrase = 'my-secret-passphrase'
      const originalData = {
        username: 'user@example.com',
        privateKey: 'very-secret-key',
        metadata: { created: Date.now() },
      }

      const plaintext = JSON.stringify(originalData)
      const encrypted = await deriveAndEncrypt(plaintext, passphrase)
      const decrypted = await deriveAndDecrypt(encrypted, passphrase)
      const recoveredData = JSON.parse(decrypted)

      expect(recoveredData).toEqual(originalData)
    })
  })

  describe('Base64 Encoding/Decoding', () => {
    it('should handle round-trip for various data types', async () => {
      const testCases = [
        'Simple text',
        'Text with 中文',
        '🎉 Emojis 🎊',
        '\x00\x01\x02\x03', // Binary-like data
        'a'.repeat(1000), // Long text
        '', // Edge case: empty string will fail encrypt, but we can test the encoding directly
      ]

      for (const testCase of testCases) {
        if (testCase === '') continue // Skip empty for encrypt test

        const { key, salt } = await deriveKey('test-pass')
        const encrypted = await encrypt(testCase, key, salt)
        const decrypted = await decrypt(encrypted, key)

        expect(decrypted).toBe(testCase)
      }
    })
  })

  describe('Random Byte Generation', () => {
    it('should generate unique salts', async () => {
      const salts = new Set<string>()

      for (let i = 0; i < 20; i++) {
        const { salt } = await deriveKey('test-pass')
        salts.add(Array.from(salt).join(','))
      }

      // All salts should be unique
      expect(salts.size).toBe(20)
    })

    it('should generate unique IVs', async () => {
      const { key, salt } = await deriveKey('test-pass')
      const ivs = new Set<string>()

      for (let i = 0; i < 20; i++) {
        const encrypted = await encrypt('test', key, salt)
        ivs.add(encrypted.iv)
      }

      // All IVs should be unique
      expect(ivs.size).toBe(20)
    })

    it('should generate correct salt length', async () => {
      for (let i = 0; i < 5; i++) {
        const { salt } = await deriveKey('test-pass')
        expect(salt.length).toBe(CRYPTO_CONFIG.SALT_LENGTH)
      }
    })

    it('should generate correct IV length', async () => {
      const { key, salt } = await deriveKey('test-pass')

      for (let i = 0; i < 5; i++) {
        const encrypted = await encrypt('test', key, salt)
        // IV is base64 encoded, decode to check byte length
        const ivBytes = atob(encrypted.iv)
        expect(ivBytes.length).toBe(CRYPTO_CONFIG.IV_LENGTH)
      }
    })
  })

  describe('Error Handling', () => {
    it('should provide meaningful error messages for decryption failures', async () => {
      const { key, salt } = await deriveKey('test-pass')
      const encrypted = await encrypt('test', key, salt)

      // Use wrong key
      const wrongKey = (await deriveKey('wrong-pass')).key

      try {
        await decrypt(encrypted, wrongKey)
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toContain('Decryption failed')
      }
    })

    it('should provide meaningful error messages for key derivation failures', async () => {
      try {
        await deriveKey('')
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toContain('Passphrase cannot be empty')
      }
    })

    it('should provide meaningful error messages for encryption failures', async () => {
      const { key, salt } = await deriveKey('test-pass')

      try {
        await encrypt('', key, salt)
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toContain('Plaintext cannot be empty')
      }
    })
  })

  describe('Security Properties', () => {
    it('should use non-extractable keys', async () => {
      const { key } = await deriveKey('test-passphrase')

      expect(key.extractable).toBe(false)

      // Verify we cannot export the key
      await expect(
        crypto.subtle.exportKey('raw', key)
      ).rejects.toThrow()
    })

    it('should use AES-GCM for authenticated encryption', async () => {
      const { key } = await deriveKey('test-passphrase')

      expect(key.algorithm.name).toBe('AES-GCM')
    })

    it('should use 256-bit keys', async () => {
      const { key } = await deriveKey('test-passphrase')

      expect((key.algorithm as AesKeyAlgorithm).length).toBe(256)
    })

    it('should use 100,000 PBKDF2 iterations', () => {
      expect(CRYPTO_CONFIG.PBKDF2_ITERATIONS).toBe(100_000)
    })

    it('should use SHA-256 for PBKDF2', () => {
      expect(CRYPTO_CONFIG.HASH_ALGORITHM).toBe('SHA-256')
    })

    it('should use 128-bit authentication tags', () => {
      expect(CRYPTO_CONFIG.TAG_LENGTH).toBe(128)
    })

    it('should use 96-bit IVs (recommended for GCM)', () => {
      expect(CRYPTO_CONFIG.IV_LENGTH).toBe(12) // 12 bytes = 96 bits
    })

    it('should prevent IV reuse with same key', async () => {
      const { key, salt } = await deriveKey('test-pass')
      const message = 'test message'

      // Encrypt same message multiple times
      const encrypted1 = await encrypt(message, key, salt)
      const encrypted2 = await encrypt(message, key, salt)
      const encrypted3 = await encrypt(message, key, salt)

      // All IVs must be different
      expect(encrypted1.iv).not.toBe(encrypted2.iv)
      expect(encrypted2.iv).not.toBe(encrypted3.iv)
      expect(encrypted1.iv).not.toBe(encrypted3.iv)
    })
  })
})
