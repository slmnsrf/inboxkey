/**
 * Crypto Performance Benchmarks
 *
 * Validates that WebCrypto encryption/decryption meets performance targets:
 * - Key derivation: <500ms (p95)
 * - Encrypt/decrypt 10KB: <100ms (p95)
 * - Round-trip 10KB: <200ms (p95)
 * - Concurrent 10 emails: <1000ms (p95)
 */

import { describe, it, expect, beforeAll } from "vitest"
import {
  deriveKey,
  encrypt,
  decrypt,
  
  
  type EncryptedData,
  type DerivedKey,
} from "../../src/lib/crypto/encryption"

/**
 * Performance metrics calculation utilities
 */
interface BenchmarkStats {
  count: number
  min: number
  max: number
  avg: number
  p50: number
  p95: number
  p99: number
}

function calculateStats(times: number[]): BenchmarkStats {
  if (times.length === 0) {
    throw new Error("Cannot calculate stats on empty array")
  }

  const sorted = [...times].sort((a, b) => a - b)
  const sum = sorted.reduce((a, b) => a + b, 0)

  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: sum / sorted.length,
    p50: sorted[Math.floor(sorted.length * 0.5)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    p99: sorted[Math.floor(sorted.length * 0.99)],
  }
}

function formatStats(stats: BenchmarkStats): string {
  return (
    `count=${stats.count} ` +
    `min=${stats.min.toFixed(2)}ms ` +
    `max=${stats.max.toFixed(2)}ms ` +
    `avg=${stats.avg.toFixed(2)}ms ` +
    `p50=${stats.p50.toFixed(2)}ms ` +
    `p95=${stats.p95.toFixed(2)}ms ` +
    `p99=${stats.p99.toFixed(2)}ms`
  )
}

/**
 * Generate test payloads of various sizes
 */
function generatePayload(sizeBytes: number): string {
  // Generate realistic JSON-like data
  const chunkSize = 50 // ~50 bytes per "email field"
  const chunks = Math.ceil(sizeBytes / chunkSize)
  const parts: string[] = []

  for (let i = 0; i < chunks; i++) {
    parts.push(`"field${i}":"${"x".repeat(30)}"`)
  }

  return `{${parts.join(",")}}`
}

// Test payloads
const PAYLOADS = {
  tiny: generatePayload(100), // 100 bytes - short OTP email
  small: generatePayload(1024), // 1KB - typical email
  medium: generatePayload(10 * 1024), // 10KB - email with some content
  large: generatePayload(100 * 1024), // 100KB - email with attachments/images
}

// Test configuration
const BENCHMARK_ITERATIONS = 100
const TEST_PASSPHRASE = "test-passphrase-for-benchmarks"

describe("Crypto Performance Benchmarks", () => {
  let derivedKey: DerivedKey

  beforeAll(async () => {
    // Pre-derive key for encryption/decryption tests (simulates cached key)
    derivedKey = await deriveKey(TEST_PASSPHRASE)
    console.log("\nKey derivation completed for benchmark setup")
  })

  describe("Key Derivation (PBKDF2)", () => {
    it("should derive key within performance target (<500ms p95)", async () => {
      const times: number[] = []

      console.log(
        `\nRunning ${BENCHMARK_ITERATIONS} key derivation operations...`
      )

      for (let i = 0; i < BENCHMARK_ITERATIONS; i++) {
        const start = performance.now()
        await deriveKey(TEST_PASSPHRASE)
        const duration = performance.now() - start
        times.push(duration)

        // Log progress every 10 iterations
        if ((i + 1) % 10 === 0) {
          console.log(`  Progress: ${i + 1}/${BENCHMARK_ITERATIONS}`)
        }
      }

      const stats = calculateStats(times)
      console.log(`\nKey Derivation Stats: ${formatStats(stats)}`)

      // Assert performance target: p95 < 500ms
      expect(stats.p95).toBeLessThan(
        500,
        `Key derivation p95 (${stats.p95.toFixed(2)}ms) exceeds target of 500ms`
      )

      // Also check p99 isn't completely out of bounds
      expect(stats.p99).toBeLessThan(
        1000,
        `Key derivation p99 (${stats.p99.toFixed(2)}ms) exceeds 1000ms`
      )
    })

    it("should produce consistent timing (not wildly variable)", async () => {
      const times: number[] = []

      for (let i = 0; i < 20; i++) {
        const start = performance.now()
        await deriveKey(TEST_PASSPHRASE)
        times.push(performance.now() - start)
      }

      const stats = calculateStats(times)
      const variance = stats.max - stats.min

      console.log(
        `\nKey derivation variance: ${variance.toFixed(2)}ms (min=${stats.min.toFixed(2)}ms, max=${stats.max.toFixed(2)}ms)`
      )

      // Variance should be reasonable (not more than 2x the average)
      expect(variance).toBeLessThan(
        stats.avg * 2,
        "Key derivation timing is too variable"
      )
    })
  })

  describe("Encryption Performance", () => {
    it("should encrypt 100B payload within target (<50ms p95)", async () => {
      const times: number[] = []

      console.log(
        `\nRunning ${BENCHMARK_ITERATIONS} encryption operations (100B payload)...`
      )

      for (let i = 0; i < BENCHMARK_ITERATIONS; i++) {
        const start = performance.now()
        await encrypt(PAYLOADS.tiny, derivedKey.key, derivedKey.salt)
        times.push(performance.now() - start)
      }

      const stats = calculateStats(times)
      console.log(`\nEncryption (100B) Stats: ${formatStats(stats)}`)

      expect(stats.p95).toBeLessThan(
        50,
        `Encryption p95 (${stats.p95.toFixed(2)}ms) exceeds 50ms for 100B`
      )
    })

    it("should encrypt 1KB payload within target (<50ms p95)", async () => {
      const times: number[] = []

      console.log(
        `\nRunning ${BENCHMARK_ITERATIONS} encryption operations (1KB payload)...`
      )

      for (let i = 0; i < BENCHMARK_ITERATIONS; i++) {
        const start = performance.now()
        await encrypt(PAYLOADS.small, derivedKey.key, derivedKey.salt)
        times.push(performance.now() - start)
      }

      const stats = calculateStats(times)
      console.log(`\nEncryption (1KB) Stats: ${formatStats(stats)}`)

      expect(stats.p95).toBeLessThan(
        50,
        `Encryption p95 (${stats.p95.toFixed(2)}ms) exceeds 50ms for 1KB`
      )
    })

    it("should encrypt 10KB payload within target (<100ms p95)", async () => {
      const times: number[] = []

      console.log(
        `\nRunning ${BENCHMARK_ITERATIONS} encryption operations (10KB payload)...`
      )

      for (let i = 0; i < BENCHMARK_ITERATIONS; i++) {
        const start = performance.now()
        await encrypt(PAYLOADS.medium, derivedKey.key, derivedKey.salt)
        times.push(performance.now() - start)
      }

      const stats = calculateStats(times)
      console.log(`\nEncryption (10KB) Stats: ${formatStats(stats)}`)

      expect(stats.p95).toBeLessThan(
        100,
        `Encryption p95 (${stats.p95.toFixed(2)}ms) exceeds target of 100ms for 10KB`
      )
    })

    it("should encrypt 100KB payload reasonably fast (<500ms p95)", async () => {
      const times: number[] = []

      console.log(
        `\nRunning ${BENCHMARK_ITERATIONS} encryption operations (100KB payload)...`
      )

      for (let i = 0; i < BENCHMARK_ITERATIONS; i++) {
        const start = performance.now()
        await encrypt(PAYLOADS.large, derivedKey.key, derivedKey.salt)
        times.push(performance.now() - start)
      }

      const stats = calculateStats(times)
      console.log(`\nEncryption (100KB) Stats: ${formatStats(stats)}`)

      expect(stats.p95).toBeLessThan(
        500,
        `Encryption p95 (${stats.p95.toFixed(2)}ms) exceeds 500ms for 100KB`
      )
    })
  })

  describe("Decryption Performance", () => {
    let encryptedPayloads: {
      tiny: EncryptedData
      small: EncryptedData
      medium: EncryptedData
      large: EncryptedData
    }

    beforeAll(async () => {
      // Pre-encrypt payloads for decryption benchmarks
      encryptedPayloads = {
        tiny: await encrypt(PAYLOADS.tiny, derivedKey.key, derivedKey.salt),
        small: await encrypt(PAYLOADS.small, derivedKey.key, derivedKey.salt),
        medium: await encrypt(PAYLOADS.medium, derivedKey.key, derivedKey.salt),
        large: await encrypt(PAYLOADS.large, derivedKey.key, derivedKey.salt),
      }
      console.log("\nPre-encrypted payloads for decryption benchmarks")
    })

    it("should decrypt 100B payload within target (<50ms p95)", async () => {
      const times: number[] = []

      console.log(
        `\nRunning ${BENCHMARK_ITERATIONS} decryption operations (100B payload)...`
      )

      for (let i = 0; i < BENCHMARK_ITERATIONS; i++) {
        const start = performance.now()
        await decrypt(encryptedPayloads.tiny, derivedKey.key)
        times.push(performance.now() - start)
      }

      const stats = calculateStats(times)
      console.log(`\nDecryption (100B) Stats: ${formatStats(stats)}`)

      expect(stats.p95).toBeLessThan(
        50,
        `Decryption p95 (${stats.p95.toFixed(2)}ms) exceeds 50ms for 100B`
      )
    })

    it("should decrypt 1KB payload within target (<50ms p95)", async () => {
      const times: number[] = []

      console.log(
        `\nRunning ${BENCHMARK_ITERATIONS} decryption operations (1KB payload)...`
      )

      for (let i = 0; i < BENCHMARK_ITERATIONS; i++) {
        const start = performance.now()
        await decrypt(encryptedPayloads.small, derivedKey.key)
        times.push(performance.now() - start)
      }

      const stats = calculateStats(times)
      console.log(`\nDecryption (1KB) Stats: ${formatStats(stats)}`)

      expect(stats.p95).toBeLessThan(
        50,
        `Decryption p95 (${stats.p95.toFixed(2)}ms) exceeds 50ms for 1KB`
      )
    })

    it("should decrypt 10KB payload within target (<100ms p95)", async () => {
      const times: number[] = []

      console.log(
        `\nRunning ${BENCHMARK_ITERATIONS} decryption operations (10KB payload)...`
      )

      for (let i = 0; i < BENCHMARK_ITERATIONS; i++) {
        const start = performance.now()
        await decrypt(encryptedPayloads.medium, derivedKey.key)
        times.push(performance.now() - start)
      }

      const stats = calculateStats(times)
      console.log(`\nDecryption (10KB) Stats: ${formatStats(stats)}`)

      expect(stats.p95).toBeLessThan(
        100,
        `Decryption p95 (${stats.p95.toFixed(2)}ms) exceeds target of 100ms for 10KB`
      )
    })

    it("should decrypt 100KB payload reasonably fast (<500ms p95)", async () => {
      const times: number[] = []

      console.log(
        `\nRunning ${BENCHMARK_ITERATIONS} decryption operations (100KB payload)...`
      )

      for (let i = 0; i < BENCHMARK_ITERATIONS; i++) {
        const start = performance.now()
        await decrypt(encryptedPayloads.large, derivedKey.key)
        times.push(performance.now() - start)
      }

      const stats = calculateStats(times)
      console.log(`\nDecryption (100KB) Stats: ${formatStats(stats)}`)

      expect(stats.p95).toBeLessThan(
        500,
        `Decryption p95 (${stats.p95.toFixed(2)}ms) exceeds 500ms for 100KB`
      )
    })
  })

  describe("Round-trip Performance (Encrypt + Decrypt)", () => {
    it("should complete round-trip for 10KB within target (<200ms p95)", async () => {
      const times: number[] = []

      console.log(
        `\nRunning ${BENCHMARK_ITERATIONS} round-trip operations (10KB payload)...`
      )

      for (let i = 0; i < BENCHMARK_ITERATIONS; i++) {
        const start = performance.now()

        // Encrypt
        const encrypted = await encrypt(
          PAYLOADS.medium,
          derivedKey.key,
          derivedKey.salt
        )

        // Decrypt
        const decrypted = await decrypt(encrypted, derivedKey.key)

        const duration = performance.now() - start
        times.push(duration)

        // Verify correctness
        expect(decrypted).toBe(PAYLOADS.medium)
      }

      const stats = calculateStats(times)
      console.log(`\nRound-trip (10KB) Stats: ${formatStats(stats)}`)

      expect(stats.p95).toBeLessThan(
        200,
        `Round-trip p95 (${stats.p95.toFixed(2)}ms) exceeds target of 200ms for 10KB`
      )
    })

    it("should maintain data integrity over 100 round-trips", async () => {
      console.log("\nVerifying data integrity over 100 round-trips...")

      for (let i = 0; i < 100; i++) {
        const encrypted = await encrypt(
          PAYLOADS.medium,
          derivedKey.key,
          derivedKey.salt
        )
        const decrypted = await decrypt(encrypted, derivedKey.key)
        expect(decrypted).toBe(PAYLOADS.medium)
      }

      console.log("Data integrity verified: 100/100 successful round-trips")
    })
  })

  describe("Concurrent Operations (Real-world Simulation)", () => {
    it("should handle 10 concurrent encryptions within target (<1000ms p95)", async () => {
      const times: number[] = []

      console.log(
        `\nRunning ${BENCHMARK_ITERATIONS} batches of 10 concurrent encryptions (1KB each)...`
      )

      for (let i = 0; i < BENCHMARK_ITERATIONS; i++) {
        const start = performance.now()

        // Simulate encrypting 10 emails concurrently
        const promises = Array.from({ length: 10 }, () =>
          encrypt(PAYLOADS.small, derivedKey.key, derivedKey.salt)
        )

        await Promise.all(promises)

        const duration = performance.now() - start
        times.push(duration)

        if ((i + 1) % 10 === 0) {
          console.log(`  Progress: ${i + 1}/${BENCHMARK_ITERATIONS}`)
        }
      }

      const stats = calculateStats(times)
      console.log(
        `\nConcurrent 10x Encryption (1KB) Stats: ${formatStats(stats)}`
      )

      expect(stats.p95).toBeLessThan(
        1000,
        `Concurrent encryption p95 (${stats.p95.toFixed(2)}ms) exceeds target of 1000ms`
      )
    })

    it("should handle 10 concurrent decryptions within target (<1000ms p95)", async () => {
      // Pre-encrypt 10 payloads
      const encryptedPayloads = await Promise.all(
        Array.from({ length: 10 }, () =>
          encrypt(PAYLOADS.small, derivedKey.key, derivedKey.salt)
        )
      )

      const times: number[] = []

      console.log(
        `\nRunning ${BENCHMARK_ITERATIONS} batches of 10 concurrent decryptions (1KB each)...`
      )

      for (let i = 0; i < BENCHMARK_ITERATIONS; i++) {
        const start = performance.now()

        // Simulate decrypting 10 emails concurrently
        const promises = encryptedPayloads.map((encrypted) =>
          decrypt(encrypted, derivedKey.key)
        )

        await Promise.all(promises)

        const duration = performance.now() - start
        times.push(duration)

        if ((i + 1) % 10 === 0) {
          console.log(`  Progress: ${i + 1}/${BENCHMARK_ITERATIONS}`)
        }
      }

      const stats = calculateStats(times)
      console.log(
        `\nConcurrent 10x Decryption (1KB) Stats: ${formatStats(stats)}`
      )

      expect(stats.p95).toBeLessThan(
        1000,
        `Concurrent decryption p95 (${stats.p95.toFixed(2)}ms) exceeds target of 1000ms`
      )
    })
  })

  describe("Memory and Stability", () => {
    it("should not degrade performance over 1000 operations", async () => {
      console.log("\nRunning 1000 operations to check for performance degradation...")

      const firstBatchTimes: number[] = []
      const lastBatchTimes: number[] = []

      // First batch (operations 1-100)
      for (let i = 0; i < 100; i++) {
        const start = performance.now()
        const encrypted = await encrypt(
          PAYLOADS.medium,
          derivedKey.key,
          derivedKey.salt
        )
        await decrypt(encrypted, derivedKey.key)
        firstBatchTimes.push(performance.now() - start)
      }

      // Middle operations (101-900) - not timed
      for (let i = 0; i < 800; i++) {
        const encrypted = await encrypt(
          PAYLOADS.medium,
          derivedKey.key,
          derivedKey.salt
        )
        await decrypt(encrypted, derivedKey.key)
      }

      // Last batch (operations 901-1000)
      for (let i = 0; i < 100; i++) {
        const start = performance.now()
        const encrypted = await encrypt(
          PAYLOADS.medium,
          derivedKey.key,
          derivedKey.salt
        )
        await decrypt(encrypted, derivedKey.key)
        lastBatchTimes.push(performance.now() - start)
      }

      const firstBatchStats = calculateStats(firstBatchTimes)
      const lastBatchStats = calculateStats(lastBatchTimes)

      console.log(
        `\nFirst batch (ops 1-100) p95: ${firstBatchStats.p95.toFixed(2)}ms`
      )
      console.log(
        `Last batch (ops 901-1000) p95: ${lastBatchStats.p95.toFixed(2)}ms`
      )
      console.log(
        `Performance difference: ${((lastBatchStats.p95 - firstBatchStats.p95) / firstBatchStats.p95 * 100).toFixed(1)}%`
      )

      // Performance should not degrade by more than 50%
      expect(lastBatchStats.p95).toBeLessThan(
        firstBatchStats.p95 * 1.5,
        "Performance degraded significantly over 1000 operations"
      )
    })
  })

  describe("Edge Cases and Error Handling", () => {
    it("should handle empty string encryption/decryption", async () => {
      await expect(
        encrypt("", derivedKey.key, derivedKey.salt)
      ).rejects.toThrow("Plaintext cannot be empty")
    })

    it("should handle invalid passphrase", async () => {
      await expect(deriveKey("")).rejects.toThrow("Passphrase cannot be empty")
    })

    it("should fail decryption with wrong key", async () => {
      const encrypted = await encrypt(
        PAYLOADS.small,
        derivedKey.key,
        derivedKey.salt
      )

      // Derive a different key
      const wrongKey = await deriveKey("wrong-passphrase")

      await expect(decrypt(encrypted, wrongKey.key)).rejects.toThrow(
        "Decryption failed"
      )
    })

    it("should handle corrupted ciphertext", async () => {
      const encrypted = await encrypt(
        PAYLOADS.small,
        derivedKey.key,
        derivedKey.salt
      )

      // Corrupt the ciphertext
      const corrupted = {
        ...encrypted,
        ciphertext: encrypted.ciphertext.slice(0, -10) + "XXXXXXXXXX",
      }

      await expect(decrypt(corrupted, derivedKey.key)).rejects.toThrow(
        "Decryption failed"
      )
    })
  })
})
