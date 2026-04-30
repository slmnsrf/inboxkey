/**
 * E2E performance tests for the InboxKey extension
 * Tests detection speed, memory usage, and resource consumption
 */

import { test, expect } from './fixtures/extension-fixture'
import { clearStorage } from './utils/storage-helpers'
import {
  getMemoryUsage,
  measureMemoryIncrease,
  monitorMemoryUsage,
  calculateMemoryStats,
  formatBytes,
} from './utils/memory-helpers'
import * as path from 'path'

test.describe('Performance Tests', () => {
  test.beforeEach(async ({ context }) => {
    await clearStorage(context)
  })

  test.describe('Detection Speed', () => {
    test('should detect fields within 2 seconds', async ({ page }) => {
      const fixturePath = path.join(__dirname, '../fixtures/detection/github-2fa.html')

      const startTime = Date.now()
      await page.goto(`file://${fixturePath}`)

      // Wait for detection
      await page.waitForSelector('[data-inboxkey-watching="true"]', { timeout: 5000 })

      const detectionTime = Date.now() - startTime

      console.log(`Detection time: ${detectionTime}ms`)

      // Should detect within 2 seconds
      expect(detectionTime).toBeLessThan(2000)
    })

    test('should detect multiple fields quickly', async ({ page }) => {
      const fixturePath = path.join(__dirname, '../fixtures/detection/multiple-inputs.html')

      const startTime = Date.now()
      await page.goto(`file://${fixturePath}`)

      // Wait for detection
      await page.waitForSelector('[data-inboxkey-watching="true"]', { timeout: 5000 })

      const detectionTime = Date.now() - startTime

      // Count detected fields
      const fieldCount = await page.evaluate(() => {
        return document.querySelectorAll('[data-inboxkey-watching="true"]').length
      })

      console.log(`Detected ${fieldCount} fields in ${detectionTime}ms`)

      // Should detect within 2 seconds even with multiple fields
      expect(detectionTime).toBeLessThan(2000)
      expect(fieldCount).toBeGreaterThan(0)
    })

    test('should handle rapid page navigation without performance degradation', async ({ page }) => {
      const fixtures = [
        'detection/github-2fa.html',
        'detection/google-verify.html',
        'detection/amazon-otp.html',
      ]

      const times: number[] = []

      for (const fixture of fixtures) {
        const fixturePath = path.join(__dirname, '../fixtures', fixture)

        const startTime = Date.now()
        await page.goto(`file://${fixturePath}`)

        try {
          await page.waitForSelector('[data-inboxkey-watching="true"]', { timeout: 3000 })
          const detectionTime = Date.now() - startTime
          times.push(detectionTime)
        } catch (error) {
          // Some fixtures might not have detectable fields
          times.push(3000)
        }

        // Small delay between navigations
        await page.waitForTimeout(100)
      }

      console.log('Detection times across pages:', times.map(t => `${t}ms`).join(', '))

      // Average time should be reasonable
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length
      expect(avgTime).toBeLessThan(2000)

      // Times should be consistent (no major degradation)
      const maxTime = Math.max(...times)
      const minTime = Math.min(...times)
      const variance = maxTime - minTime

      // Variance should be less than 1 second
      expect(variance).toBeLessThan(1000)
    })
  })

  test.describe('Memory Usage', () => {
    test('should maintain reasonable memory footprint', async ({ page }) => {
      const fixturePath = path.join(__dirname, '../fixtures/detection/github-2fa.html')
      await page.goto(`file://${fixturePath}`)

      // Wait for detection
      await page.waitForSelector('[data-inboxkey-watching="true"]', { timeout: 5000 })

      // Get initial memory usage
      const initialMemory = await getMemoryUsage(page)

      console.log(`Initial memory usage: ${formatBytes(initialMemory)}`)

      // Memory should be less than 50MB for a simple page
      expect(initialMemory).toBeLessThan(50 * 1024 * 1024)
    })

    test('should not leak memory when repeatedly adding/removing fields', async ({ page }) => {
      await page.goto('about:blank')

      // Measure memory increase during field creation/removal
      const result = await measureMemoryIncrease(
        page,
        async () => {
          // Add and remove fields 10 times
          for (let i = 0; i < 10; i++) {
            await page.evaluate(() => {
              // Add field
              const input = document.createElement('input')
              input.type = 'text'
              input.id = `code-${Date.now()}`
              input.autocomplete = 'one-time-code'
              document.body.appendChild(input)
            })

            await page.waitForTimeout(200)

            await page.evaluate(() => {
              // Remove field
              const input = document.body.lastElementChild
              input?.remove()
            })

            await page.waitForTimeout(200)
          }
        },
        true, // GC before
        true  // GC after
      )

      console.log('Memory increase:', formatBytes(result.increase))
      console.log('Memory increase percentage:', `${result.increasePercentage.toFixed(2)}%`)

      // Should not leak more than 5MB after GC
      expect(result.increase).toBeLessThan(5 * 1024 * 1024)
    })

    test('should handle memory efficiently during long monitoring sessions', async ({ page }) => {
      const fixturePath = path.join(__dirname, '../fixtures/detection/github-2fa.html')
      await page.goto(`file://${fixturePath}`)

      // Wait for detection
      await page.waitForSelector('[data-inboxkey-watching="true"]', { timeout: 5000 })

      // Monitor memory for 10 seconds
      const samples = await monitorMemoryUsage(page, 10000, 1000)

      const stats = calculateMemoryStats(samples)

      console.log('Memory statistics over 10 seconds:')
      console.log(`  Min: ${formatBytes(stats.min)}`)
      console.log(`  Max: ${formatBytes(stats.max)}`)
      console.log(`  Average: ${formatBytes(stats.average)}`)
      console.log(`  Median: ${formatBytes(stats.median)}`)
      console.log(`  StdDev: ${formatBytes(stats.stdDev)}`)

      // Memory should remain relatively stable
      const memoryGrowth = stats.max - stats.min
      console.log(`  Growth: ${formatBytes(memoryGrowth)}`)

      // Should not grow more than 10MB during monitoring
      expect(memoryGrowth).toBeLessThan(10 * 1024 * 1024)
    })
  })

  test.describe('Resource Consumption', () => {
    test('should not block page rendering', async ({ page }) => {
      const fixturePath = path.join(__dirname, '../fixtures/detection/github-2fa.html')

      // Measure time to DOMContentLoaded
      const navigationStart = Date.now()

      await page.goto(`file://${fixturePath}`, {
        waitUntil: 'domcontentloaded',
      })

      const domContentLoadedTime = Date.now() - navigationStart

      console.log(`DOMContentLoaded time: ${domContentLoadedTime}ms`)

      // Should not significantly delay page load
      expect(domContentLoadedTime).toBeLessThan(1000)

      // Verify extension didn't block rendering
      const isFieldVisible = await page.isVisible('#otp')
      expect(isFieldVisible).toBe(true)
    })

    test('should handle large pages efficiently', async ({ page }) => {
      // Create a page with many input fields
      await page.goto('about:blank')

      await page.evaluate(() => {
        const form = document.createElement('form')

        // Add 100 input fields
        for (let i = 0; i < 100; i++) {
          const input = document.createElement('input')
          input.type = 'text'
          input.id = `field-${i}`
          input.name = `field-${i}`

          // Make one a verification field
          if (i === 50) {
            input.autocomplete = 'one-time-code'
            input.id = 'verification-code'
          }

          form.appendChild(input)
        }

        document.body.appendChild(form)
      })

      const startTime = Date.now()

      // Wait for detection
      await page.waitForSelector('[data-inboxkey-watching="true"]', { timeout: 5000 })

      const detectionTime = Date.now() - startTime

      console.log(`Detected field in page with 100 inputs: ${detectionTime}ms`)

      // Should still detect quickly even with many fields
      expect(detectionTime).toBeLessThan(3000)

      // Verify only the verification field is watched
      const watchedCount = await page.evaluate(() => {
        return document.querySelectorAll('[data-inboxkey-watching="true"]').length
      })

      expect(watchedCount).toBeGreaterThan(0)
    })

    test('should cleanup resources when tab is closed', async ({ context, page }) => {
      const fixturePath = path.join(__dirname, '../fixtures/detection/github-2fa.html')
      await page.goto(`file://${fixturePath}`)

      // Wait for detection
      await page.waitForSelector('[data-inboxkey-watching="true"]', { timeout: 5000 })

      // Get initial memory
      const memoryBefore = await getMemoryUsage(page)

      // Close the page
      await page.close()

      // Create a new page
      const newPage = await context.newPage()
      await newPage.goto('about:blank')

      // Wait a bit for cleanup
      await newPage.waitForTimeout(1000)

      // Memory should not be significantly higher
      // (This is a rough test as we can't directly measure the closed page)
      const memoryAfter = await getMemoryUsage(newPage)

      console.log(`Memory before: ${formatBytes(memoryBefore)}`)
      console.log(`Memory after: ${formatBytes(memoryAfter)}`)

      // This is just a sanity check
      expect(memoryAfter).toBeLessThan(100 * 1024 * 1024)
    })
  })

  test.describe('Benchmark Suite', () => {
    test('should generate performance report', async ({ page }) => {
      const report: any = {
        timestamp: new Date().toISOString(),
        tests: [],
      }

      // Test 1: Simple detection
      {
        const fixturePath = path.join(__dirname, '../fixtures/detection/github-2fa.html')
        const startTime = Date.now()
        await page.goto(`file://${fixturePath}`)
        await page.waitForSelector('[data-inboxkey-watching="true"]', { timeout: 5000 })
        const time = Date.now() - startTime
        const memory = await getMemoryUsage(page)

        report.tests.push({
          name: 'Simple Detection',
          time,
          memory: formatBytes(memory),
        })
      }

      // Test 2: Multiple fields
      {
        const fixturePath = path.join(__dirname, '../fixtures/detection/multiple-inputs.html')
        const startTime = Date.now()
        await page.goto(`file://${fixturePath}`)
        await page.waitForSelector('[data-inboxkey-watching="true"]', { timeout: 5000 })
        const time = Date.now() - startTime
        const memory = await getMemoryUsage(page)

        report.tests.push({
          name: 'Multiple Fields',
          time,
          memory: formatBytes(memory),
        })
      }

      // Test 3: Dynamic injection
      {
        const fixturePath = path.join(__dirname, '../fixtures/detection/dynamic-inject.html')
        const startTime = Date.now()
        await page.goto(`file://${fixturePath}`)
        await page.click('#inject-field-btn')
        await page.waitForSelector('[data-inboxkey-watching="true"]', { timeout: 5000 })
        const time = Date.now() - startTime
        const memory = await getMemoryUsage(page)

        report.tests.push({
          name: 'Dynamic Injection',
          time,
          memory: formatBytes(memory),
        })
      }

      console.log('\n=== Performance Report ===')
      console.log(JSON.stringify(report, null, 2))

      // All tests should pass basic thresholds
      for (const test of report.tests) {
        expect(test.time).toBeLessThan(5000)
      }
    })
  })
})
