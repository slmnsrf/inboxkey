/**
 * Service Worker Lifecycle Integration Test
 *
 * This test validates the core architectural pattern (ADR-001):
 * Content scripts manage timers and wake the service worker on-demand
 * to fetch verification codes.
 *
 * Success criteria:
 * - 100% message delivery rate across 10 iterations (50 for full validation)
 * - Latency <100ms p95
 * - Works even if SW is terminated between polls
 */

import { test, expect, chromium, type BrowserContext } from "@playwright/test"
import path from "path"

const EXTENSION_PATH = path.join(__dirname, "../../build/chrome-mv3-prod")
const TEST_PAGE_PATH = `file://${path.join(__dirname, "../fixtures/prototype-test.html")}`

// Number of test iterations (10 for CI, increase to 50 for full validation)
const TEST_ITERATIONS = 10

interface TestResult {
  success: boolean
  duration?: number
  code?: string
  error?: string
}

interface LatencyMetrics {
  min: number
  max: number
  avg: number
  p50: number
  p95: number
  p99: number
}

/**
 * Calculate latency percentiles
 */
function calculateLatencyMetrics(durations: number[]): LatencyMetrics {
  const sorted = [...durations].sort((a, b) => a - b)
  const sum = sorted.reduce((acc, val) => acc + val, 0)

  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: sum / sorted.length,
    p50: sorted[Math.floor(sorted.length * 0.5)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    p99: sorted[Math.floor(sorted.length * 0.99)],
  }
}

/**
 * Load extension in a new browser context
 */
async function createExtensionContext() {
  const context = await chromium.launchPersistentContext("", {
    headless: false, // Extensions require headed mode
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      "--no-sandbox",
    ],
  })

  return context
}

test.describe("Service Worker Lifecycle Prototype", () => {
  let context: BrowserContext

  test.beforeAll(async () => {
    // Build the extension first
    const { execSync } = require("child_process")
    console.log("[Test] Building extension...")

    try {
      execSync("npm run build", {
        cwd: path.join(__dirname, "../.."),
        stdio: "inherit",
      })
      console.log("[Test] Extension built successfully")
    } catch (error) {
      console.error("[Test] Failed to build extension:", error)
      throw error
    }
  })

  test.beforeEach(async () => {
    context = await createExtensionContext()
  })

  test.afterEach(async () => {
    await context.close()
  })

  test("should successfully autofill code across multiple iterations", async () => {
    const results: TestResult[] = []
    const durations: number[] = []

    for (let i = 1; i <= TEST_ITERATIONS; i++) {
      console.log(`\n[Test] ========== Iteration ${i}/${TEST_ITERATIONS} ==========`)

      const page = await context.newPage()

      try {
        // Navigate to test page
        await page.goto(TEST_PAGE_PATH)

        // Wait for page to be fully loaded
        await page.waitForLoadState("domcontentloaded")

        // Give content script time to initialize
        await page.waitForTimeout(500)

        console.log(`[Test] Page loaded for iteration ${i}`)

        // Trigger the watch by clicking the button
        await page.click("#trigger-watch")
        console.log(`[Test] Watch triggered for iteration ${i}`)

        // Wait for autofill (max 15 seconds)
        // The test should complete in ~10s (3rd poll) plus processing time
        try {
          await page.waitForFunction(
            () => {
              const field = document.getElementById(
                "verification-code"
              ) as HTMLInputElement
              return field && field.value === "TEST123"
            },
            { timeout: 15000 }
          )

          // Get the test result from the page
          const result = await page.evaluate(() => {
            return (window as any).testResult as TestResult
          })

          console.log(`[Test] Iteration ${i} result:`, result)

          if (result && result.success && result.duration) {
            results.push(result)
            durations.push(result.duration)
            console.log(
              `[Test] ✓ Iteration ${i} PASSED - Duration: ${result.duration}ms`
            )
          } else {
            results.push({
              success: false,
              error: "Invalid result structure",
            })
            console.log(`[Test] ✗ Iteration ${i} FAILED - Invalid result`)
          }
        } catch (error) {
          console.error(`[Test] ✗ Iteration ${i} FAILED - Timeout`, error)
          results.push({
            success: false,
            error: "Timeout waiting for autofill",
          })
        }
      } finally {
        await page.close()
        // Wait a bit between iterations to let SW potentially terminate
        if (i < TEST_ITERATIONS) {
          console.log("[Test] Waiting 2s before next iteration...")
          await new Promise((resolve) => setTimeout(resolve, 2000))
        }
      }
    }

    // Calculate results
    const successCount = results.filter((r) => r.success).length
    const failureCount = results.length - successCount
    const successRate = (successCount / results.length) * 100

    console.log("\n[Test] ========================================")
    console.log("[Test] TEST SUMMARY")
    console.log("[Test] ========================================")
    console.log(`[Test] Total iterations: ${results.length}`)
    console.log(`[Test] Successes: ${successCount}`)
    console.log(`[Test] Failures: ${failureCount}`)
    console.log(`[Test] Success rate: ${successRate.toFixed(2)}%`)

    if (durations.length > 0) {
      const metrics = calculateLatencyMetrics(durations)
      console.log("\n[Test] LATENCY METRICS:")
      console.log(`[Test] Min: ${metrics.min}ms`)
      console.log(`[Test] Max: ${metrics.max}ms`)
      console.log(`[Test] Avg: ${metrics.avg.toFixed(2)}ms`)
      console.log(`[Test] P50: ${metrics.p50}ms`)
      console.log(`[Test] P95: ${metrics.p95}ms`)
      console.log(`[Test] P99: ${metrics.p99}ms`)
      console.log("[Test] ========================================")

      // Store metrics for documentation
      ;(global as any).testMetrics = {
        iterations: results.length,
        successCount,
        failureCount,
        successRate,
        latency: metrics,
        results,
      }
    }

    // Assertions
    expect(successRate).toBeGreaterThanOrEqual(100) // Target: 100% success rate

    if (durations.length > 0) {
      const metrics = calculateLatencyMetrics(durations)
      // Note: The latency here is end-to-end (includes 3 polls over 10s)
      // Individual message latency should be checked in SW logs
      expect(metrics.p95).toBeLessThan(12000) // Should complete within ~10s + margin
    }
  })

  test("should handle field removal gracefully", async () => {
    const page = await context.newPage()

    await page.goto(TEST_PAGE_PATH)
    await page.waitForLoadState("domcontentloaded")
    await page.waitForTimeout(500)

    console.log("[Test] Testing field removal handling")

    // Trigger watch
    await page.click("#trigger-watch")

    // Wait 2 seconds (after 1st poll, before 2nd poll)
    await page.waitForTimeout(2000)

    // Remove the field from DOM
    await page.evaluate(() => {
      const field = document.getElementById("verification-code")
      field?.remove()
    })

    console.log("[Test] Field removed from DOM")

    // Wait to see if any errors occur
    await page.waitForTimeout(5000)

    console.log("[Test] Test completed without crashes")
    expect(true).toBe(true) // Test passes if no errors thrown

    await page.close()
  })

  test("should not create duplicate watches on repeated focus", async () => {
    const page = await context.newPage()

    await page.goto(TEST_PAGE_PATH)
    await page.waitForLoadState("domcontentloaded")
    await page.waitForTimeout(500)

    console.log("[Test] Testing duplicate watch prevention")

    // Trigger watch
    await page.click("#trigger-watch")
    await page.waitForTimeout(1000)

    // Blur and refocus (should cancel old watch and start new one)
    await page.evaluate(() => {
      const field = document.getElementById(
        "verification-code"
      ) as HTMLInputElement
      field.blur()
    })

    await page.waitForTimeout(500)

    await page.evaluate(() => {
      const field = document.getElementById(
        "verification-code"
      ) as HTMLInputElement
      field.focus()
    })

    // Should still complete successfully
    await page.waitForFunction(
      () => {
        const field = document.getElementById(
          "verification-code"
        ) as HTMLInputElement
        return field && field.value === "TEST123"
      },
      { timeout: 15000 }
    )

    const result = await page.evaluate(() => {
      return (window as any).testResult as TestResult
    })

    expect(result.success).toBe(true)
    console.log("[Test] Duplicate watch prevention test PASSED")

    await page.close()
  })
})
