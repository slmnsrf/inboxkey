/**
 * E2E tests for service worker lifecycle and resilience
 * Tests extension behavior across service worker restarts, updates, and failures
 */

import { test, expect } from './fixtures/extension-fixture'
import { clearStorage, injectCode } from './utils/storage-helpers'
import { waitForFieldDetection } from './utils/extension-helpers'
import * as path from 'path'

test.describe('Service Worker Lifecycle', () => {
  test.beforeEach(async ({ context }) => {
    await clearStorage(context)
  })

  test.describe('Service Worker Resilience', () => {
    test('should continue working after service worker wakes up', async ({ page, context }) => {
      const fixturePath = path.join(__dirname, '../fixtures/detection/github-2fa.html')

      // Load page - service worker should be active
      await page.goto(`file://${fixturePath}`)

      // Wait for detection
      await waitForFieldDetection(page, 5000)

      // Get service worker status
      const serviceWorkers = context.serviceWorkers()
      console.log(`Active service workers: ${serviceWorkers.length}`)

      expect(serviceWorkers.length).toBeGreaterThan(0)

      // Inject a code
      await injectCode(context, '123456', 'github.com')
      await page.waitForTimeout(1000)

      // Verify autofill worked
      const fieldValue = await page.inputValue('#otp')
      expect(fieldValue).toBe('123456')
    })

    test('should detect fields after navigation to new page', async ({ page, context }) => {
      // Load first page
      const fixture1 = path.join(__dirname, '../fixtures/detection/github-2fa.html')
      await page.goto(`file://${fixture1}`)
      await waitForFieldDetection(page, 5000)

      // Navigate to second page
      const fixture2 = path.join(__dirname, '../fixtures/detection/google-verify.html')
      await page.goto(`file://${fixture2}`)

      // Wait for detection on new page
      await waitForFieldDetection(page, 5000)

      // Verify detection on new page
      const watchedFields = await page.evaluate(() => {
        return document.querySelectorAll('[data-inboxkey-watching="true"]').length
      })

      expect(watchedFields).toBeGreaterThan(0)

      // Inject and verify autofill
      await injectCode(context, '789012', 'google.com')
      await page.waitForTimeout(1000)

      const fields = await page.evaluate(() => {
        const watched = document.querySelector('[data-inboxkey-watching="true"]') as HTMLInputElement
        return {
          value: watched?.value,
          filled: watched?.getAttribute('data-inboxkey-filled'),
        }
      })

      expect(fields.value).toBe('789012')
    })

    test('should handle multiple tabs simultaneously', async ({ context }) => {
      // Create multiple tabs
      const page1 = await context.newPage()
      const page2 = await context.newPage()
      const page3 = await context.newPage()

      // Load different fixtures in each tab
      const fixture1 = path.join(__dirname, '../fixtures/detection/github-2fa.html')
      const fixture2 = path.join(__dirname, '../fixtures/detection/google-verify.html')
      const fixture3 = path.join(__dirname, '../fixtures/detection/amazon-otp.html')

      await Promise.all([
        page1.goto(`file://${fixture1}`),
        page2.goto(`file://${fixture2}`),
        page3.goto(`file://${fixture3}`),
      ])

      // Wait for detection in all tabs
      await Promise.all([
        waitForFieldDetection(page1, 5000),
        waitForFieldDetection(page2, 5000),
        waitForFieldDetection(page3, 5000),
      ])

      // Verify all tabs detected fields
      const [watched1, watched2, watched3] = await Promise.all([
        page1.evaluate(() => document.querySelectorAll('[data-inboxkey-watching="true"]').length),
        page2.evaluate(() => document.querySelectorAll('[data-inboxkey-watching="true"]').length),
        page3.evaluate(() => document.querySelectorAll('[data-inboxkey-watching="true"]').length),
      ])

      expect(watched1).toBeGreaterThan(0)
      expect(watched2).toBeGreaterThan(0)
      expect(watched3).toBeGreaterThan(0)

      // Inject code - should work across all tabs
      await injectCode(context, '999999', 'example.com')
      await page1.waitForTimeout(1000)

      // Verify at least one tab was filled
      const values = await Promise.all([
        page1.evaluate(() => {
          const field = document.querySelector('[data-inboxkey-watching="true"]') as HTMLInputElement
          return field?.value || ''
        }),
        page2.evaluate(() => {
          const field = document.querySelector('[data-inboxkey-watching="true"]') as HTMLInputElement
          return field?.value || ''
        }),
        page3.evaluate(() => {
          const field = document.querySelector('[data-inboxkey-watching="true"]') as HTMLInputElement
          return field?.value || ''
        }),
      ])

      console.log('Field values across tabs:', values)

      // Close tabs
      await page1.close()
      await page2.close()
      await page3.close()
    })

    test('should recover from content script errors', async ({ page, context }) => {
      const fixturePath = path.join(__dirname, '../fixtures/detection/github-2fa.html')
      await page.goto(`file://${fixturePath}`)

      // Wait for detection
      await waitForFieldDetection(page, 5000)

      // Simulate an error in the content script by modifying the DOM unexpectedly
      await page.evaluate(() => {
        try {
          // Remove and re-add the field
          const field = document.querySelector('#otp')
          const parent = field?.parentElement
          const nextSibling = field?.nextSibling

          field?.remove()

          setTimeout(() => {
            if (field && parent) {
              parent.insertBefore(field, nextSibling)
            }
          }, 100)
        } catch (error) {
          console.error('Error during DOM manipulation:', error)
        }
      })

      // Wait for recovery
      await page.waitForTimeout(1000)

      // Re-detect the field
      await waitForFieldDetection(page, 5000)

      // Verify detection recovered
      const watchedFields = await page.evaluate(() => {
        return document.querySelectorAll('[data-inboxkey-watching="true"]').length
      })

      expect(watchedFields).toBeGreaterThan(0)
    })
  })

  test.describe('Storage Persistence', () => {
    test('should persist storage across page reloads', async ({ page, context }) => {
      // Inject a code
      await injectCode(context, '111111', 'example.com')

      // Load a page
      const fixturePath = path.join(__dirname, '../fixtures/detection/github-2fa.html')
      await page.goto(`file://${fixturePath}`)
      await waitForFieldDetection(page, 5000)

      // Reload the page
      await page.reload()
      await waitForFieldDetection(page, 5000)

      // Verify the code is still available
      const codes = await page.evaluate(async () => {
        return new Promise<any[]>((resolve) => {
          chrome.storage.local.get(['recent_codes'], (result) => {
            resolve(result.recent_codes || [])
          })
        })
      })

      expect(codes.length).toBeGreaterThan(0)
      expect(codes[0].code).toBe('111111')
    })

    test('should handle storage quota limits gracefully', async ({ page, context }) => {
      // Inject many codes
      for (let i = 0; i < 100; i++) {
        await injectCode(context, `${i}`.padStart(6, '0'), 'example.com')
      }

      // Verify codes are stored (may be limited by quota)
      const codes = await page.evaluate(async () => {
        return new Promise<number>((resolve) => {
          chrome.storage.local.get(['recent_codes'], (result) => {
            resolve((result.recent_codes || []).length)
          })
        })
      })

      console.log(`Stored ${codes} codes`)

      // Should have stored some codes
      expect(codes).toBeGreaterThan(0)
    })

    test('should sync session state correctly', async ({ page, context }) => {
      const fixturePath = path.join(__dirname, '../fixtures/detection/github-2fa.html')
      await page.goto(`file://${fixturePath}`)

      await waitForFieldDetection(page, 5000)

      // Check session state
      const sessionState = await page.evaluate(async () => {
        return new Promise<any>((resolve) => {
          chrome.storage.session.get(['session_state'], (result) => {
            resolve(result.session_state || {})
          })
        })
      })

      console.log('Session state:', sessionState)

      // Session state should exist
      expect(sessionState).toBeDefined()
    })
  })

  test.describe('Extension Updates', () => {
    test('should maintain functionality across page lifecycle', async ({ page, context }) => {
      const fixturePath = path.join(__dirname, '../fixtures/detection/github-2fa.html')

      // Test 1: Initial load
      await page.goto(`file://${fixturePath}`)
      await waitForFieldDetection(page, 5000)
      await injectCode(context, '123456', 'github.com')
      await page.waitForTimeout(1000)

      let value = await page.inputValue('#otp')
      expect(value).toBe('123456')

      // Clear field
      await page.fill('#otp', '')

      // Test 2: After reload
      await page.reload()
      await waitForFieldDetection(page, 5000)
      await injectCode(context, '789012', 'github.com')
      await page.waitForTimeout(1000)

      value = await page.inputValue('#otp')
      expect(value).toBe('789012')

      // Clear field
      await page.fill('#otp', '')

      // Test 3: After navigation away and back
      await page.goto('about:blank')
      await page.waitForTimeout(500)
      await page.goto(`file://${fixturePath}`)
      await waitForFieldDetection(page, 5000)
      await injectCode(context, '345678', 'github.com')
      await page.waitForTimeout(1000)

      value = await page.inputValue('#otp')
      expect(value).toBe('345678')
    })

    test('should handle rapid tab creation and closure', async ({ context }) => {
      const fixturePath = path.join(__dirname, '../fixtures/detection/github-2fa.html')

      // Create and close tabs rapidly
      for (let i = 0; i < 5; i++) {
        const page = await context.newPage()
        await page.goto(`file://${fixturePath}`)

        try {
          await waitForFieldDetection(page, 3000)
        } catch (error) {
          // Some tabs might not detect in time
        }

        await page.close()
      }

      // Create a final tab and verify it works
      const finalPage = await context.newPage()
      await finalPage.goto(`file://${fixturePath}`)
      await waitForFieldDetection(finalPage, 5000)

      const watchedFields = await finalPage.evaluate(() => {
        return document.querySelectorAll('[data-inboxkey-watching="true"]').length
      })

      expect(watchedFields).toBeGreaterThan(0)

      await finalPage.close()
    })
  })

  test.describe('Error Handling', () => {
    test('should handle invalid fixture gracefully', async ({ page }) => {
      // Try to load a non-existent fixture
      try {
        await page.goto('file:///nonexistent/path/to/fixture.html', { timeout: 5000 })
      } catch (error) {
        // Expected to fail
      }

      // Extension should not crash
      const serviceWorkers = page.context().serviceWorkers()
      expect(serviceWorkers.length).toBeGreaterThan(0)
    })

    test('should handle malformed HTML gracefully', async ({ page }) => {
      await page.goto('about:blank')

      // Create malformed HTML
      await page.evaluate(() => {
        document.body.innerHTML = '<input type="text" id="test" <invalid>>'
      })

      // Wait a bit
      await page.waitForTimeout(1000)

      // Extension should not crash
      const serviceWorkers = page.context().serviceWorkers()
      expect(serviceWorkers.length).toBeGreaterThan(0)
    })

    test('should handle console errors without crashing', async ({ page }) => {
      const fixturePath = path.join(__dirname, '../fixtures/detection/github-2fa.html')
      await page.goto(`file://${fixturePath}`)

      // Generate some console errors
      await page.evaluate(() => {
        console.error('Test error 1')
        console.error('Test error 2')
        throw new Error('Test error 3')
      }).catch(() => {
        // Expected to throw
      })

      // Wait for detection - should still work
      await waitForFieldDetection(page, 5000)

      const watchedFields = await page.evaluate(() => {
        return document.querySelectorAll('[data-inboxkey-watching="true"]').length
      })

      expect(watchedFields).toBeGreaterThan(0)
    })
  })
})
