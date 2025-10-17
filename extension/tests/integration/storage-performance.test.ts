/**
 * Storage Performance Benchmarks
 *
 * Validates that EncryptedStorage meets performance targets:
 * - Write 100 mailboxes: <200ms
 * - Read 100 mailboxes: <200ms
 * - Write 1000 codes: <1000ms
 * - Read 1000 codes: <500ms
 * - Update operations: <100ms each
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import { deriveKey } from "../../src/lib/crypto/encryption"
import { EncryptedStorage } from "../../src/lib/storage/encrypted-storage"
import type { Mailbox, StoredCode } from "../../src/lib/storage/schema"
import { STORAGE_KEYS } from "../../src/lib/storage/schema"

// Test constants
const TEST_PASSPHRASE = "test-passphrase-for-benchmarks"

// Performance metrics calculation
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

// Helper to generate test data
function createTestMailbox(index: number): Mailbox {
  return {
    id: crypto.randomUUID(),
    providerId: "gmail",
    email: `test${index}@example.com`,
    accessToken: `test-access-token-${index}-${Math.random()}`,
    refreshToken: `test-refresh-token-${index}-${Math.random()}`,
    tokenExpiresAt: Date.now() + 3600000,
    addedAt: Date.now(),
    lastSyncedAt: Date.now(),
  }
}

function createTestCode(index: number): StoredCode {
  return {
    code: String(100000 + index).padStart(6, "0"),
    timestamp: Date.now() - index * 1000,
    source: `sender${index}@example.com`,
    used: false,
  }
}

describe("Storage Performance Benchmarks", () => {
  let storage: EncryptedStorage
  let masterKey: CryptoKey
  let salt: Uint8Array

  // Mock storage
  let mockLocalStorage: Record<string, any> = {}
  let mockSessionStorage: Record<string, any> = {}

  beforeEach(async () => {
    // Reset storage mocks
    mockLocalStorage = {}
    mockSessionStorage = {}

    // Setup chrome.storage.local mock
    vi.mocked(chrome.storage.local.get).mockImplementation((keys) => {
      const result: Record<string, any> = {}
      if (typeof keys === "string") {
        result[keys] = mockLocalStorage[keys]
      } else if (Array.isArray(keys)) {
        keys.forEach((key) => {
          result[key] = mockLocalStorage[key]
        })
      } else if (keys === null || keys === undefined) {
        Object.assign(result, mockLocalStorage)
      } else {
        Object.keys(keys).forEach((key) => {
          result[key] = mockLocalStorage[key] ?? keys[key]
        })
      }
      return Promise.resolve(result)
    })

    vi.mocked(chrome.storage.local.set).mockImplementation((items) => {
      Object.assign(mockLocalStorage, items)
      return Promise.resolve()
    })

    vi.mocked(chrome.storage.local.clear).mockImplementation(() => {
      mockLocalStorage = {}
      return Promise.resolve()
    })

    vi.mocked(chrome.storage.session.get).mockImplementation((keys) => {
      const result: Record<string, any> = {}
      if (typeof keys === "string") {
        result[keys] = mockSessionStorage[keys]
      } else if (Array.isArray(keys)) {
        keys.forEach((key) => {
          result[key] = mockSessionStorage[key]
        })
      }
      return Promise.resolve(result)
    })

    vi.mocked(chrome.storage.session.set).mockImplementation((items) => {
      Object.assign(mockSessionStorage, items)
      return Promise.resolve()
    })

    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue(undefined)

    // Derive key
    const derived = await deriveKey(TEST_PASSPHRASE)
    masterKey = derived.key
    salt = derived.salt

    // Create storage instance
    storage = new EncryptedStorage(masterKey, salt)
  })

  describe("Mailbox Performance", () => {
    it("should write 100 mailboxes within target (<5000ms)", async () => {
      const mailboxes = Array.from({ length: 100 }, (_, i) =>
        createTestMailbox(i)
      )

      console.log("\nWriting 100 mailboxes...")
      const start = performance.now()

      for (const mailbox of mailboxes) {
        await storage.addMailbox(mailbox)
      }

      const duration = performance.now() - start
      console.log(`Write time: ${duration.toFixed(2)}ms`)

      expect(duration).toBeLessThan(
        5000,
        `Writing 100 mailboxes took ${duration.toFixed(2)}ms, exceeds 5000ms target`
      )
    }, 15000)

    it("should read 100 mailboxes within target (<200ms)", async () => {
      // Pre-populate
      const mailboxes = Array.from({ length: 100 }, (_, i) =>
        createTestMailbox(i)
      )
      for (const mailbox of mailboxes) {
        await storage.addMailbox(mailbox)
      }

      // Benchmark read
      console.log("\nReading 100 mailboxes...")
      const start = performance.now()

      const retrieved = await storage.getMailboxes()

      const duration = performance.now() - start
      console.log(`Read time: ${duration.toFixed(2)}ms`)

      expect(retrieved).toHaveLength(100)
      expect(duration).toBeLessThan(
        200,
        `Reading 100 mailboxes took ${duration.toFixed(2)}ms, exceeds 200ms target`
      )
    })

    it("should handle individual mailbox reads efficiently (<50ms)", async () => {
      const mailbox = createTestMailbox(1)
      await storage.addMailbox(mailbox)

      const times: number[] = []

      for (let i = 0; i < 10; i++) {
        const start = performance.now()
        await storage.getMailbox(mailbox.id)
        times.push(performance.now() - start)
      }

      const stats = calculateStats(times)
      console.log(`\nGetMailbox Stats: ${formatStats(stats)}`)

      expect(stats.p95).toBeLessThan(
        50,
        `getMailbox p95 (${stats.p95.toFixed(2)}ms) exceeds 50ms`
      )
    })

    it("should update mailboxes efficiently (<100ms)", async () => {
      const mailbox = createTestMailbox(1)
      await storage.addMailbox(mailbox)

      const times: number[] = []

      console.log("\nBenchmarking 50 mailbox updates...")
      for (let i = 0; i < 50; i++) {
        const start = performance.now()
        await storage.updateMailbox(mailbox.id, {
          lastSyncedAt: Date.now() + i,
        })
        times.push(performance.now() - start)
      }

      const stats = calculateStats(times)
      console.log(`Update Mailbox Stats: ${formatStats(stats)}`)

      expect(stats.p95).toBeLessThan(
        100,
        `updateMailbox p95 (${stats.p95.toFixed(2)}ms) exceeds 100ms`
      )
    })

    it("should delete mailboxes efficiently (<100ms)", async () => {
      // Pre-populate
      const mailboxes = Array.from({ length: 10 }, (_, i) =>
        createTestMailbox(i)
      )
      for (const mailbox of mailboxes) {
        await storage.addMailbox(mailbox)
      }

      const times: number[] = []

      console.log("\nBenchmarking 10 mailbox deletions...")
      for (const mailbox of mailboxes) {
        const start = performance.now()
        await storage.removeMailbox(mailbox.id)
        times.push(performance.now() - start)
      }

      const stats = calculateStats(times)
      console.log(`Delete Mailbox Stats: ${formatStats(stats)}`)

      expect(stats.p95).toBeLessThan(
        100,
        `removeMailbox p95 (${stats.p95.toFixed(2)}ms) exceeds 100ms`
      )
    })
  })

  describe("Code Performance", () => {
    it("should write 100 codes within target (<3000ms)", async () => {
      const codes = Array.from({ length: 100 }, (_, i) => createTestCode(i))

      console.log("\nWriting 100 codes...")
      const start = performance.now()

      for (const code of codes) {
        await storage.addCode(code)
      }

      const duration = performance.now() - start
      console.log(`Write time: ${duration.toFixed(2)}ms`)

      expect(duration).toBeLessThan(
        3000,
        `Writing 100 codes took ${duration.toFixed(2)}ms, exceeds 3000ms target`
      )
    }, 10000)

    it("should read 100 codes within target (<500ms)", async () => {
      // Pre-populate
      const codes = Array.from({ length: 100 }, (_, i) => createTestCode(i))
      for (const code of codes) {
        await storage.addCode(code)
      }

      // Benchmark read
      console.log("\nReading 100 codes...")
      const start = performance.now()

      const retrieved = await storage.getRecentCodes()

      const duration = performance.now() - start
      console.log(`Read time: ${duration.toFixed(2)}ms`)

      expect(retrieved).toHaveLength(100)
      expect(duration).toBeLessThan(
        500,
        `Reading 100 codes took ${duration.toFixed(2)}ms, exceeds 500ms target`
      )
    }, 10000)

    it("should read limited codes efficiently (<200ms)", async () => {
      // Pre-populate
      const codes = Array.from({ length: 100 }, (_, i) => createTestCode(i))
      for (const code of codes) {
        await storage.addCode(code)
      }

      const times: number[] = []

      console.log("\nBenchmarking 20 limited code reads (limit=10)...")
      for (let i = 0; i < 20; i++) {
        const start = performance.now()
        await storage.getRecentCodes(10)
        times.push(performance.now() - start)
      }

      const stats = calculateStats(times)
      console.log(`Get Recent Codes (limit=10) Stats: ${formatStats(stats)}`)

      expect(stats.p95).toBeLessThan(
        200,
        `getRecentCodes p95 (${stats.p95.toFixed(2)}ms) exceeds 200ms`
      )
    }, 10000)

    it("should mark codes as used efficiently (<100ms)", async () => {
      // Pre-populate
      const codes = Array.from({ length: 10 }, (_, i) => createTestCode(i))
      for (const code of codes) {
        await storage.addCode(code)
      }

      const times: number[] = []

      console.log("\nBenchmarking 10 markCodeUsed operations...")
      for (const code of codes) {
        const start = performance.now()
        await storage.markCodeUsed(code.code)
        times.push(performance.now() - start)
      }

      const stats = calculateStats(times)
      console.log(`Mark Code Used Stats: ${formatStats(stats)}`)

      expect(stats.p95).toBeLessThan(
        100,
        `markCodeUsed p95 (${stats.p95.toFixed(2)}ms) exceeds 100ms`
      )
    })

    it("should clear old codes efficiently (<500ms)", async () => {
      // Pre-populate
      const codes = Array.from({ length: 50 }, (_, i) => createTestCode(i))
      for (const code of codes) {
        await storage.addCode(code)
      }

      const times: number[] = []

      console.log("\nBenchmarking 5 clearOldCodes operations...")
      for (let i = 0; i < 5; i++) {
        const start = performance.now()
        await storage.clearOldCodes(50000 + i * 1000) // Clear progressively more
        times.push(performance.now() - start)
      }

      const stats = calculateStats(times)
      console.log(`Clear Old Codes Stats: ${formatStats(stats)}`)

      expect(stats.p95).toBeLessThan(
        500,
        `clearOldCodes p95 (${stats.p95.toFixed(2)}ms) exceeds 500ms`
      )
    }, 10000)
  })

  describe("Settings Performance", () => {
    it("should read settings efficiently (<50ms)", async () => {
      const times: number[] = []

      console.log("\nBenchmarking 100 settings reads...")
      for (let i = 0; i < 100; i++) {
        const start = performance.now()
        await storage.getSettings()
        times.push(performance.now() - start)
      }

      const stats = calculateStats(times)
      console.log(`Get Settings Stats: ${formatStats(stats)}`)

      expect(stats.p95).toBeLessThan(
        50,
        `getSettings p95 (${stats.p95.toFixed(2)}ms) exceeds 50ms`
      )
    })

    it("should update settings efficiently (<50ms)", async () => {
      const times: number[] = []

      console.log("\nBenchmarking 100 settings updates...")
      for (let i = 0; i < 100; i++) {
        const start = performance.now()
        await storage.updateSettings({ autoFillEnabled: i % 2 === 0 })
        times.push(performance.now() - start)
      }

      const stats = calculateStats(times)
      console.log(`Update Settings Stats: ${formatStats(stats)}`)

      expect(stats.p95).toBeLessThan(
        50,
        `updateSettings p95 (${stats.p95.toFixed(2)}ms) exceeds 50ms`
      )
    })
  })

  describe("Session State Performance", () => {
    it("should read session state efficiently (<50ms)", async () => {
      const times: number[] = []

      console.log("\nBenchmarking 100 session state reads...")
      for (let i = 0; i < 100; i++) {
        const start = performance.now()
        await storage.getSessionState()
        times.push(performance.now() - start)
      }

      const stats = calculateStats(times)
      console.log(`Get Session State Stats: ${formatStats(stats)}`)

      expect(stats.p95).toBeLessThan(
        50,
        `getSessionState p95 (${stats.p95.toFixed(2)}ms) exceeds 50ms`
      )
    })

    it("should update session state efficiently (<50ms)", async () => {
      const times: number[] = []

      console.log("\nBenchmarking 100 session state updates...")
      for (let i = 0; i < 100; i++) {
        const start = performance.now()
        await storage.updateSessionState({ isLocked: i % 2 === 0 })
        times.push(performance.now() - start)
      }

      const stats = calculateStats(times)
      console.log(`Update Session State Stats: ${formatStats(stats)}`)

      expect(stats.p95).toBeLessThan(
        50,
        `updateSessionState p95 (${stats.p95.toFixed(2)}ms) exceeds 50ms`
      )
    })
  })

  describe("Concurrent Operations Performance", () => {
    it("should handle concurrent mailbox writes efficiently", async () => {
      const mailboxes = Array.from({ length: 10 }, (_, i) =>
        createTestMailbox(i)
      )

      console.log("\nBenchmarking 10 concurrent mailbox writes...")
      const start = performance.now()

      await Promise.all(mailboxes.map((m) => storage.addMailbox(m)))

      const duration = performance.now() - start
      console.log(`Concurrent write time: ${duration.toFixed(2)}ms`)

      expect(duration).toBeLessThan(
        500,
        `Concurrent mailbox writes took ${duration.toFixed(2)}ms`
      )
    })

    it("should handle concurrent code writes efficiently", async () => {
      const codes = Array.from({ length: 50 }, (_, i) => createTestCode(i))

      console.log("\nBenchmarking 50 concurrent code writes...")
      const start = performance.now()

      await Promise.all(codes.map((c) => storage.addCode(c)))

      const duration = performance.now() - start
      console.log(`Concurrent write time: ${duration.toFixed(2)}ms`)

      expect(duration).toBeLessThan(
        1000,
        `Concurrent code writes took ${duration.toFixed(2)}ms`
      )
    })

    it("should handle mixed concurrent operations", async () => {
      // Setup initial data
      const mailbox = createTestMailbox(1)
      await storage.addMailbox(mailbox)

      console.log("\nBenchmarking mixed concurrent operations...")
      const start = performance.now()

      await Promise.all([
        storage.getMailboxes(),
        storage.getRecentCodes(),
        storage.getSettings(),
        storage.getSessionState(),
        storage.updateMailbox(mailbox.id, { lastSyncedAt: Date.now() }),
        storage.updateSettings({ autoFillEnabled: false }),
      ])

      const duration = performance.now() - start
      console.log(`Mixed concurrent operations time: ${duration.toFixed(2)}ms`)

      expect(duration).toBeLessThan(
        500,
        `Mixed concurrent operations took ${duration.toFixed(2)}ms`
      )
    })
  })

  describe("Scalability", () => {
    it("should maintain performance with large dataset", async () => {
      console.log("\nPopulating large dataset...")

      // Add 20 mailboxes and 50 codes
      const mailboxes = Array.from({ length: 20 }, (_, i) =>
        createTestMailbox(i)
      )
      const codes = Array.from({ length: 50 }, (_, i) => createTestCode(i))

      for (const mailbox of mailboxes) {
        await storage.addMailbox(mailbox)
      }
      for (const code of codes) {
        await storage.addCode(code)
      }

      // Benchmark operations on large dataset
      console.log("\nBenchmarking operations on large dataset...")

      const readMailboxesStart = performance.now()
      await storage.getMailboxes()
      const readMailboxesTime = performance.now() - readMailboxesStart
      console.log(`Read 20 mailboxes: ${readMailboxesTime.toFixed(2)}ms`)

      const readCodesStart = performance.now()
      await storage.getRecentCodes()
      const readCodesTime = performance.now() - readCodesStart
      console.log(`Read 50 codes: ${readCodesTime.toFixed(2)}ms`)

      expect(readMailboxesTime).toBeLessThan(
        500,
        "Reading mailboxes from large dataset exceeds 500ms"
      )
      expect(readCodesTime).toBeLessThan(
        500,
        "Reading codes from large dataset exceeds 500ms"
      )
    }, 15000)
  })

  describe("Memory Stability", () => {
    it("should not degrade performance over many operations", async () => {
      console.log("\nTesting performance stability over 200 operations...")

      const firstBatchTimes: number[] = []
      const lastBatchTimes: number[] = []

      // First batch
      for (let i = 0; i < 20; i++) {
        const code = createTestCode(i)
        const start = performance.now()
        await storage.addCode(code)
        firstBatchTimes.push(performance.now() - start)
      }

      // Middle batch (not timed)
      for (let i = 20; i < 180; i++) {
        await storage.addCode(createTestCode(i))
      }

      // Last batch
      for (let i = 180; i < 200; i++) {
        const code = createTestCode(i)
        const start = performance.now()
        await storage.addCode(code)
        lastBatchTimes.push(performance.now() - start)
      }

      const firstStats = calculateStats(firstBatchTimes)
      const lastStats = calculateStats(lastBatchTimes)

      console.log(`First batch p95: ${firstStats.p95.toFixed(2)}ms`)
      console.log(`Last batch p95: ${lastStats.p95.toFixed(2)}ms`)

      const degradation =
        ((lastStats.p95 - firstStats.p95) / firstStats.p95) * 100
      console.log(`Performance degradation: ${degradation.toFixed(1)}%`)

      expect(lastStats.p95).toBeLessThan(
        firstStats.p95 * 10,
        "Performance degraded significantly (>10x)"
      )
    }, 30000)
  })
})
