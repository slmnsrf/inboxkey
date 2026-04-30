/**
 * E2E tests for detection accuracy across all site fixtures
 * Tests the extension's ability to detect verification fields on real-world sites
 */

import { test, expect } from './fixtures/extension-fixture'
import { clearStorage } from './utils/storage-helpers'
import { waitForFieldDetection } from './utils/extension-helpers'
import * as path from 'path'
import * as fs from 'fs'

// Define site fixture categories
const SITE_CATEGORIES = {
  tech: [
    'google-2fa.html',
    'github-2fa.html',
    'microsoft-2fa.html',
    'amazon-2fa.html',
    'apple-2fa.html',
    'facebook-2fa.html',
    'twitter-2fa.html',
    'linkedin-2fa.html',
    'dropbox-2fa.html',
    'slack-2fa.html',
  ],
  banking: [
    'chase-mfa.html',
    'bankofamerica-mfa.html',
    'wellsfargo-mfa.html',
    'citi-mfa.html',
    'capitalone-mfa.html',
    'amex-mfa.html',
    'paypal-mfa.html',
    'venmo-mfa.html',
    'stripe-mfa.html',
    'square-mfa.html',
  ],
  crypto: [
    'coinbase-2fa.html',
    'binance-2fa.html',
    'kraken-2fa.html',
    'gemini-2fa.html',
    'cryptocom-2fa.html',
    'metamask-2fa.html',
    'ledger-2fa.html',
    'exodus-2fa.html',
    'trustwallet-2fa.html',
    'phantom-2fa.html',
  ],
}

test.describe('Detection Accuracy', () => {
  test.beforeEach(async ({ context }) => {
    // Clear storage before each test
    await clearStorage(context)
  })

  test.describe('Tech Sites', () => {
    for (const fixture of SITE_CATEGORIES.tech) {
      test(`should detect verification field on ${fixture.replace('.html', '')}`, async ({ page }) => {
        const fixturePath = path.join(__dirname, '../fixtures/sites/tech', fixture)

        // Check if file exists
        if (!fs.existsSync(fixturePath)) {
          test.skip()
          return
        }

        await page.goto(`file://${fixturePath}`)

        // Wait for detection
        try {
          await waitForFieldDetection(page, 5000)
        } catch (error) {
          throw new Error(`Failed to detect verification field on ${fixture}`)
        }

        // Verify at least one field is being watched
        const watchedFields = await page.evaluate(() => {
          const fields = document.querySelectorAll('[data-inboxkey-watching="true"]')
          return fields.length
        })

        expect(watchedFields).toBeGreaterThan(0)

        // Get detection details from the page
        const detectionInfo = await page.evaluate(() => {
          const field = document.querySelector('[data-inboxkey-watching="true"]')
          return {
            tagName: field?.tagName,
            id: field?.id,
            name: field?.getAttribute('name'),
            type: field?.getAttribute('type'),
            autocomplete: field?.getAttribute('autocomplete'),
          }
        })

        console.log(`✓ ${fixture}: Detected field`, detectionInfo)
      })
    }
  })

  test.describe('Banking Sites', () => {
    for (const fixture of SITE_CATEGORIES.banking) {
      test(`should detect verification field on ${fixture.replace('.html', '')}`, async ({ page }) => {
        const fixturePath = path.join(__dirname, '../fixtures/sites/banking', fixture)

        if (!fs.existsSync(fixturePath)) {
          test.skip()
          return
        }

        await page.goto(`file://${fixturePath}`)

        try {
          await waitForFieldDetection(page, 5000)
        } catch (error) {
          throw new Error(`Failed to detect verification field on ${fixture}`)
        }

        const watchedFields = await page.evaluate(() => {
          const fields = document.querySelectorAll('[data-inboxkey-watching="true"]')
          return fields.length
        })

        expect(watchedFields).toBeGreaterThan(0)

        const detectionInfo = await page.evaluate(() => {
          const field = document.querySelector('[data-inboxkey-watching="true"]')
          return {
            tagName: field?.tagName,
            id: field?.id,
            name: field?.getAttribute('name'),
            type: field?.getAttribute('type'),
          }
        })

        console.log(`✓ ${fixture}: Detected field`, detectionInfo)
      })
    }
  })

  test.describe('Crypto Sites', () => {
    for (const fixture of SITE_CATEGORIES.crypto) {
      test(`should detect verification field on ${fixture.replace('.html', '')}`, async ({ page }) => {
        const fixturePath = path.join(__dirname, '../fixtures/sites/crypto', fixture)

        if (!fs.existsSync(fixturePath)) {
          test.skip()
          return
        }

        await page.goto(`file://${fixturePath}`)

        try {
          await waitForFieldDetection(page, 5000)
        } catch (error) {
          throw new Error(`Failed to detect verification field on ${fixture}`)
        }

        const watchedFields = await page.evaluate(() => {
          const fields = document.querySelectorAll('[data-inboxkey-watching="true"]')
          return fields.length
        })

        expect(watchedFields).toBeGreaterThan(0)

        const detectionInfo = await page.evaluate(() => {
          const field = document.querySelector('[data-inboxkey-watching="true"]')
          return {
            tagName: field?.tagName,
            id: field?.id,
            name: field?.getAttribute('name'),
            type: field?.getAttribute('type'),
          }
        })

        console.log(`✓ ${fixture}: Detected field`, detectionInfo)
      })
    }
  })

  test.describe('Detection Quality Metrics', () => {
    test('should measure overall detection success rate', async ({ page }) => {
      const results: { fixture: string; detected: boolean; time: number }[] = []

      // Test a sample of fixtures
      const sampleFixtures = [
        'sites/tech/github-2fa.html',
        'sites/tech/google-2fa.html',
        'sites/banking/chase-mfa.html',
        'sites/crypto/coinbase-2fa.html',
        'detection/github-2fa.html',
      ]

      for (const fixture of sampleFixtures) {
        const fixturePath = path.join(__dirname, '../fixtures', fixture)

        if (!fs.existsSync(fixturePath)) {
          continue
        }

        const startTime = Date.now()
        await page.goto(`file://${fixturePath}`)

        let detected = false
        try {
          await waitForFieldDetection(page, 5000)
          detected = true
        } catch (error) {
          detected = false
        }

        const endTime = Date.now()

        results.push({
          fixture,
          detected,
          time: endTime - startTime,
        })
      }

      const detectionRate = results.filter(r => r.detected).length / results.length
      const avgTime = results.reduce((sum, r) => sum + r.time, 0) / results.length

      console.log('\nDetection Quality Metrics:')
      console.log(`  Success Rate: ${(detectionRate * 100).toFixed(1)}%`)
      console.log(`  Average Detection Time: ${avgTime.toFixed(0)}ms`)
      console.log(`  Total Tested: ${results.length}`)
      console.log(`  Detected: ${results.filter(r => r.detected).length}`)
      console.log(`  Failed: ${results.filter(r => !r.detected).length}`)

      // Expect at least 80% detection rate
      expect(detectionRate).toBeGreaterThanOrEqual(0.8)
    })

    test('should not produce false positives on non-verification pages', async ({ page }) => {
      // Create a page without verification fields
      await page.goto('about:blank')

      await page.evaluate(() => {
        document.body.innerHTML = `
          <form>
            <label for="username">Username</label>
            <input type="text" id="username" name="username" />

            <label for="email">Email</label>
            <input type="email" id="email" name="email" />

            <label for="password">Password</label>
            <input type="password" id="password" name="password" />

            <button type="submit">Sign In</button>
          </form>
        `
      })

      // Wait a bit for the extension to scan
      await page.waitForTimeout(2000)

      // Verify no fields are being watched
      const watchedFields = await page.evaluate(() => {
        const fields = document.querySelectorAll('[data-inboxkey-watching="true"]')
        return fields.length
      })

      expect(watchedFields).toBe(0)
    })
  })
})
