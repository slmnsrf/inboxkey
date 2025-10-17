/**
 * Storage Capacity Tests
 *
 * Validates that chrome.storage.local has sufficient capacity for InboxKey's use case.
 *
 * Targets:
 * - Support 100+ emails cached locally
 * - Total encrypted storage < 5MB (chrome.storage.local limit: 10MB)
 * - Leave headroom for tokens, settings, and future growth
 */

import { describe, it, expect, beforeAll } from "vitest"
import {
  deriveKey,
  encrypt,
  type DerivedKey,
  type EncryptedData,
} from "../../src/lib/crypto/encryption"

/**
 * Mock email structure representing a typical email in our cache
 */
interface MockEmail {
  id: string
  from: string
  subject: string
  body: string // ~2KB typical
  receivedAt: number
  provider: "gmail" | "outlook" | "imap-bridge"
  hasAttachments: boolean
}

/**
 * Generate a realistic mock email for testing
 */
function generateMockEmail(index: number): MockEmail {
  // Generate realistic email body (~2KB)
  const bodyParagraphs = [
    "Thank you for signing up! Your verification code is: 123456",
    "To complete your registration, please confirm your email address.",
    "This code will expire in 10 minutes for your security.",
    "If you didn't request this code, please ignore this email.",
    "For support, contact us at support@example.com",
  ]

  // Repeat paragraphs to reach ~2KB
  const targetSize = 2000 // 2KB
  let body = ""
  while (body.length < targetSize) {
    body +=
      bodyParagraphs[Math.floor(Math.random() * bodyParagraphs.length)] + "\n\n"
  }

  return {
    id: `email-${index}-${Date.now()}`,
    from: `sender${index}@example.com`,
    subject: `Verification Code ${index} - Action Required`,
    body: body.slice(0, targetSize), // Ensure consistent size
    receivedAt: Date.now() - index * 60000, // Stagger timestamps
    provider: ["gmail", "outlook", "imap-bridge"][index % 3] as MockEmail["provider"],
    hasAttachments: index % 10 === 0, // 10% have attachments
  }
}

/**
 * Calculate the size of an object in bytes (as JSON)
 */
function calculateSizeBytes(obj: unknown): number {
  const json = JSON.stringify(obj)
  return new Blob([json]).size
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`
}

describe("Storage Capacity Tests", () => {
  let derivedKey: DerivedKey
  const TEST_PASSPHRASE = "test-passphrase-for-capacity-tests"

  beforeAll(async () => {
    // Derive key for encryption
    derivedKey = await deriveKey(TEST_PASSPHRASE)
    console.log("\nKey derived for storage capacity tests")
  })

  describe("Single Email Storage", () => {
    it("should measure typical email plaintext size", () => {
      const email = generateMockEmail(1)
      const plaintextSize = calculateSizeBytes(email)

      console.log(`\nTypical email plaintext size: ${formatBytes(plaintextSize)}`)
      console.log(`Email structure:`)
      console.log(`  - ID length: ${email.id.length} chars`)
      console.log(`  - From: ${email.from}`)
      console.log(`  - Subject length: ${email.subject.length} chars`)
      console.log(`  - Body length: ${email.body.length} chars`)

      // Verify it's around 2KB as designed
      expect(plaintextSize).toBeGreaterThan(1800)
      expect(plaintextSize).toBeLessThan(2500)
    })

    it("should measure encrypted email size and overhead", async () => {
      const email = generateMockEmail(1)
      const plaintextSize = calculateSizeBytes(email)

      const encrypted = await encrypt(
        JSON.stringify(email),
        derivedKey.key,
        derivedKey.salt
      )

      const encryptedSize = calculateSizeBytes(encrypted)
      const overhead = encryptedSize - plaintextSize
      const overheadPercent = (overhead / plaintextSize) * 100

      console.log(`\nEncryption overhead analysis:`)
      console.log(`  - Plaintext: ${formatBytes(plaintextSize)}`)
      console.log(`  - Encrypted: ${formatBytes(encryptedSize)}`)
      console.log(`  - Overhead: ${formatBytes(overhead)} (${overheadPercent.toFixed(1)}%)`)
      console.log(`\nEncrypted structure sizes:`)
      console.log(`  - Ciphertext: ${encrypted.ciphertext.length} chars`)
      console.log(`  - IV: ${encrypted.iv.length} chars`)
      console.log(`  - Salt: ${encrypted.salt.length} chars`)

      // Encryption overhead should be reasonable (typically 20-40% due to base64)
      expect(overheadPercent).toBeLessThan(50)
    })
  })

  describe("Bulk Email Storage (100 emails)", () => {
    let mockEmails: MockEmail[]
    let encryptedEmails: EncryptedData[]

    beforeAll(async () => {
      console.log("\nGenerating 100 mock emails...")
      mockEmails = Array.from({ length: 100 }, (_, i) => generateMockEmail(i))

      console.log("Encrypting 100 emails...")
      const startTime = performance.now()

      encryptedEmails = await Promise.all(
        mockEmails.map((email) =>
          encrypt(JSON.stringify(email), derivedKey.key, derivedKey.salt)
        )
      )

      const duration = performance.now() - startTime
      console.log(`Encryption completed in ${duration.toFixed(2)}ms`)
      console.log(`Average per email: ${(duration / 100).toFixed(2)}ms`)
    })

    it("should calculate total storage size for 100 emails", () => {
      // Calculate plaintext size
      const plaintextSize = mockEmails.reduce(
        (total, email) => total + calculateSizeBytes(email),
        0
      )

      // Calculate encrypted size
      const encryptedSize = encryptedEmails.reduce(
        (total, encrypted) => total + calculateSizeBytes(encrypted),
        0
      )

      const overhead = encryptedSize - plaintextSize
      const overheadPercent = (overhead / plaintextSize) * 100

      console.log(`\nStorage capacity analysis (100 emails):`)
      console.log(`  - Total plaintext: ${formatBytes(plaintextSize)}`)
      console.log(`  - Total encrypted: ${formatBytes(encryptedSize)}`)
      console.log(`  - Total overhead: ${formatBytes(overhead)} (${overheadPercent.toFixed(1)}%)`)
      console.log(`  - Average per email (plaintext): ${formatBytes(plaintextSize / 100)}`)
      console.log(`  - Average per email (encrypted): ${formatBytes(encryptedSize / 100)}`)

      // Assert: Total encrypted size should be well under 5MB target
      expect(encryptedSize).toBeLessThan(
        5 * 1024 * 1024,
        `Encrypted size (${formatBytes(encryptedSize)}) exceeds 5MB target`
      )

      // More specifically, it should be under 500KB for 100 emails
      expect(encryptedSize).toBeLessThan(
        500 * 1024,
        `Encrypted size (${formatBytes(encryptedSize)}) exceeds expected ~300KB`
      )
    })

    it("should verify headroom for chrome.storage.local limit", () => {
      const encryptedSize = encryptedEmails.reduce(
        (total, encrypted) => total + calculateSizeBytes(encrypted),
        0
      )

      const CHROME_STORAGE_LIMIT = 10 * 1024 * 1024 // 10MB
      const headroom = CHROME_STORAGE_LIMIT - encryptedSize
      const headroomPercent = (headroom / CHROME_STORAGE_LIMIT) * 100

      console.log(`\nChrome storage capacity analysis:`)
      console.log(`  - Storage limit: ${formatBytes(CHROME_STORAGE_LIMIT)}`)
      console.log(`  - Used (100 emails): ${formatBytes(encryptedSize)}`)
      console.log(`  - Available: ${formatBytes(headroom)} (${headroomPercent.toFixed(1)}%)`)

      // Calculate how many more emails we could store
      const avgEmailSize = encryptedSize / 100
      const maxEmails = Math.floor(CHROME_STORAGE_LIMIT / avgEmailSize)

      console.log(`  - Max emails (theoretical): ${maxEmails}`)
      console.log(`  - Emails per MB: ${Math.floor(1024 * 1024 / avgEmailSize)}`)

      // Should have at least 95% headroom remaining
      expect(headroomPercent).toBeGreaterThan(
        95,
        "Insufficient headroom in chrome.storage.local"
      )

      // Should support at least 1000+ emails theoretically
      expect(maxEmails).toBeGreaterThan(1000)
    })
  })

  describe("Storage with Additional Data (Realistic Scenario)", () => {
    it("should calculate total storage with emails + tokens + settings", async () => {
      // Generate 100 encrypted emails
      const mockEmails = Array.from({ length: 100 }, (_, i) =>
        generateMockEmail(i)
      )
      const encryptedEmails = await Promise.all(
        mockEmails.map((email) =>
          encrypt(JSON.stringify(email), derivedKey.key, derivedKey.salt)
        )
      )

      const emailsSize = encryptedEmails.reduce(
        (total, encrypted) => total + calculateSizeBytes(encrypted),
        0
      )

      // Mock OAuth tokens for 3 mailboxes
      const mockTokens = {
        gmail: {
          accessToken: "ya29.a0AfH6SMBx..." + "x".repeat(100),
          refreshToken: "1//0gQ..." + "x".repeat(80),
          expiresAt: Date.now() + 3600000,
          scope: ["email", "profile"],
        },
        outlook: {
          accessToken: "EwBwA8l6BAAURSN..." + "x".repeat(100),
          refreshToken: "M.R3_BAY..." + "x".repeat(80),
          expiresAt: Date.now() + 3600000,
          scope: ["mail.read"],
        },
        imap: {
          accessToken: "imap_token_" + "x".repeat(50),
          expiresAt: Date.now() + 3600000,
          scope: ["imap"],
        },
      }

      const encryptedTokens = await encrypt(
        JSON.stringify(mockTokens),
        derivedKey.key,
        derivedKey.salt
      )
      const tokensSize = calculateSizeBytes(encryptedTokens)

      // Mock settings and metadata
      const mockSettings = {
        version: 1,
        autoFillEnabled: true,
        magicLinkAutoOpen: false,
        pollingIntervals: [0, 5, 10],
        lockEnabled: true,
        lockTimeoutMinutes: 15,
        recentCodes: Array.from({ length: 20 }, (_, i) => ({
          code: `${100000 + i}`,
          timestamp: Date.now() - i * 60000,
          source: `example${i}.com`,
        })),
      }

      const settingsSize = calculateSizeBytes(mockSettings)

      // Calculate total
      const totalSize = emailsSize + tokensSize + settingsSize
      const CHROME_STORAGE_LIMIT = 10 * 1024 * 1024
      const headroom = CHROME_STORAGE_LIMIT - totalSize
      const usedPercent = (totalSize / CHROME_STORAGE_LIMIT) * 100

      console.log(`\nRealistic storage scenario:`)
      console.log(`  - Emails (100): ${formatBytes(emailsSize)}`)
      console.log(`  - OAuth tokens (3 mailboxes): ${formatBytes(tokensSize)}`)
      console.log(`  - Settings + metadata: ${formatBytes(settingsSize)}`)
      console.log(`  - Total used: ${formatBytes(totalSize)} (${usedPercent.toFixed(2)}%)`)
      console.log(`  - Available: ${formatBytes(headroom)} (${(100 - usedPercent).toFixed(2)}%)`)

      // Should use less than 5% of available storage
      expect(usedPercent).toBeLessThan(
        5,
        `Storage usage (${usedPercent.toFixed(2)}%) exceeds 5% of limit`
      )

      // Should have massive headroom (>95%)
      expect(headroom).toBeGreaterThan(9 * 1024 * 1024)
    })
  })

  describe("Scalability Projections", () => {
    it("should project storage needs for various email counts", async () => {
      console.log(`\nStorage scalability projections:`)

      const testCases = [10, 50, 100, 500, 1000, 5000]

      for (const count of testCases) {
        // Generate sample emails
        const sampleSize = Math.min(count, 10) // Use sample for large counts
        const mockEmails = Array.from({ length: sampleSize }, (_, i) =>
          generateMockEmail(i)
        )

        const encryptedEmails = await Promise.all(
          mockEmails.map((email) =>
            encrypt(JSON.stringify(email), derivedKey.key, derivedKey.salt)
          )
        )

        const avgEncryptedSize =
          encryptedEmails.reduce(
            (total, encrypted) => total + calculateSizeBytes(encrypted),
            0
          ) / sampleSize

        const projectedSize = avgEncryptedSize * count
        const CHROME_STORAGE_LIMIT = 10 * 1024 * 1024
        const usedPercent = (projectedSize / CHROME_STORAGE_LIMIT) * 100

        console.log(
          `  ${count.toString().padStart(5)} emails: ${formatBytes(projectedSize).padStart(10)} (${usedPercent.toFixed(2)}% of limit)`
        )
      }
    })

    it("should calculate maximum email capacity", async () => {
      // Sample a few emails to get average size
      const sampleEmails = Array.from({ length: 20 }, (_, i) =>
        generateMockEmail(i)
      )

      const encryptedSamples = await Promise.all(
        sampleEmails.map((email) =>
          encrypt(JSON.stringify(email), derivedKey.key, derivedKey.salt)
        )
      )

      const avgEncryptedSize =
        encryptedSamples.reduce(
          (total, encrypted) => total + calculateSizeBytes(encrypted),
          0
        ) / sampleEmails.length

      const CHROME_STORAGE_LIMIT = 10 * 1024 * 1024
      const RESERVE_FOR_TOKENS_AND_SETTINGS = 100 * 1024 // 100KB reserve

      const availableForEmails =
        CHROME_STORAGE_LIMIT - RESERVE_FOR_TOKENS_AND_SETTINGS
      const maxEmails = Math.floor(availableForEmails / avgEncryptedSize)

      console.log(`\nMaximum capacity calculation:`)
      console.log(`  - Storage limit: ${formatBytes(CHROME_STORAGE_LIMIT)}`)
      console.log(`  - Reserve for tokens/settings: ${formatBytes(RESERVE_FOR_TOKENS_AND_SETTINGS)}`)
      console.log(`  - Available for emails: ${formatBytes(availableForEmails)}`)
      console.log(`  - Average encrypted email: ${formatBytes(avgEncryptedSize)}`)
      console.log(`  - Maximum emails: ${maxEmails.toLocaleString()}`)

      // Should support well over 1000 emails
      expect(maxEmails).toBeGreaterThan(
        1000,
        "Maximum capacity should support 1000+ emails"
      )
    })
  })

  describe("Performance at Scale", () => {
    it("should measure encryption time for batch operations", async () => {
      const batchSizes = [10, 50, 100]

      console.log(`\nBatch encryption performance:`)

      for (const batchSize of batchSizes) {
        const mockEmails = Array.from({ length: batchSize }, (_, i) =>
          generateMockEmail(i)
        )

        const startTime = performance.now()

        await Promise.all(
          mockEmails.map((email) =>
            encrypt(JSON.stringify(email), derivedKey.key, derivedKey.salt)
          )
        )

        const duration = performance.now() - startTime
        const avgPerEmail = duration / batchSize

        console.log(
          `  ${batchSize.toString().padStart(3)} emails: ${duration.toFixed(2)}ms total, ${avgPerEmail.toFixed(2)}ms per email`
        )

        // Batch operations should complete in reasonable time
        if (batchSize === 100) {
          expect(duration).toBeLessThan(
            5000,
            "Batch encryption of 100 emails should complete in <5s"
          )
        }
      }
    })

    it("should measure decryption time for batch operations", async () => {
      const batchSizes = [10, 50, 100]

      console.log(`\nBatch decryption performance:`)

      for (const batchSize of batchSizes) {
        // Pre-encrypt emails
        const mockEmails = Array.from({ length: batchSize }, (_, i) =>
          generateMockEmail(i)
        )

        const encryptedEmails = await Promise.all(
          mockEmails.map((email) =>
            encrypt(JSON.stringify(email), derivedKey.key, derivedKey.salt)
          )
        )

        // Measure decryption
        const startTime = performance.now()

        await Promise.all(
          encryptedEmails.map((encrypted) => decrypt(encrypted, derivedKey.key))
        )

        const duration = performance.now() - startTime
        const avgPerEmail = duration / batchSize

        console.log(
          `  ${batchSize.toString().padStart(3)} emails: ${duration.toFixed(2)}ms total, ${avgPerEmail.toFixed(2)}ms per email`
        )

        // Batch operations should complete in reasonable time
        if (batchSize === 100) {
          expect(duration).toBeLessThan(
            5000,
            "Batch decryption of 100 emails should complete in <5s"
          )
        }
      }
    })
  })
})

// Helper function imported from encryption.ts (for decryption in tests)
async function decrypt(
  encryptedData: EncryptedData,
  key: CryptoKey
): Promise<string> {
  const { decrypt: decryptFn } = await import(
    "../../src/lib/crypto/encryption"
  )
  return decryptFn(encryptedData, key)
}
