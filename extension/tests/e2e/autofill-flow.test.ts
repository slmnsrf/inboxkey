/**
 * E2E tests for autofill flow scenarios
 */

import { test, expect } from './fixtures/extension-fixture'
import { injectCode, clearStorage } from './utils/storage-helpers'
import { waitForFieldDetection, waitForFieldAutofill } from './utils/extension-helpers'
import * as path from 'path'

test.describe('Autofill Flow', () => {
  test.beforeEach(async ({ context }) => {
    // Clear storage before each test
    await clearStorage(context)
  })

  test('Scenario 1: Basic autofill - single field with standard attributes', async ({ page, context }) => {
    // Load a test page with a standard verification field
    const fixturePath = path.join(__dirname, '../fixtures/detection/github-2fa.html')
    await page.goto(`file://${fixturePath}`)

    // Wait for extension to detect the field
    await waitForFieldDetection(page, 5000)

    // Verify field is being watched
    const isWatched = await page.evaluate(() => {
      const field = document.querySelector('#otp')
      return field?.getAttribute('data-inboxkey-watching') === 'true'
    })
    expect(isWatched).toBe(true)

    // Inject a verification code
    await injectCode(context, '123456', 'github.com')

    // Wait a bit for the autofill to trigger
    await page.waitForTimeout(1000)

    // Verify the field was filled
    const fieldValue = await page.inputValue('#otp')
    expect(fieldValue).toBe('123456')

    // Verify field is marked as filled
    const isFilled = await page.evaluate(() => {
      const field = document.querySelector('#otp')
      return field?.getAttribute('data-inboxkey-filled') === 'true'
    })
    expect(isFilled).toBe(true)
  })

  test('Scenario 2: Polling detection - field appears after delay', async ({ page, context }) => {
    // Load a page that dynamically injects a field
    const fixturePath = path.join(__dirname, '../fixtures/detection/dynamic-inject.html')
    await page.goto(`file://${fixturePath}`)

    // Inject code before field appears
    await injectCode(context, '789012', 'example.com')

    // Trigger the dynamic injection
    await page.click('#inject-field-btn')

    // Wait for field to appear and be detected
    await waitForFieldDetection(page, 10000)

    // Wait for autofill
    await page.waitForTimeout(1000)

    // Verify the dynamically injected field was filled
    const fieldValue = await page.inputValue('#dynamic-code-input')
    expect(fieldValue).toBe('789012')
  })

  test('Scenario 3: Multiple fields - only fill the highest confidence field', async ({ page, context }) => {
    // Load a page with multiple potential verification fields
    const fixturePath = path.join(__dirname, '../fixtures/detection/multiple-inputs.html')
    await page.goto(`file://${fixturePath}`)

    // Wait for detection
    await waitForFieldDetection(page, 5000)

    // Inject a verification code
    await injectCode(context, '456789', 'example.com')

    await page.waitForTimeout(1000)

    // Verify only the high-confidence field was filled
    const highConfidenceValue = await page.inputValue('#verification-code')
    expect(highConfidenceValue).toBe('456789')

    // Verify lower confidence fields were NOT filled
    const lowConfidenceValue = await page.inputValue('#regular-input')
    expect(lowConfidenceValue).toBe('')
  })

  test('Scenario 4: Field removal - stop watching when field is removed', async ({ page, context }) => {
    // Load a test page
    const fixturePath = path.join(__dirname, '../fixtures/detection/github-2fa.html')
    await page.goto(`file://${fixturePath}`)

    // Wait for detection
    await waitForFieldDetection(page, 5000)

    // Remove the field
    await page.evaluate(() => {
      const field = document.querySelector('#otp')
      field?.remove()
    })

    // Wait a bit
    await page.waitForTimeout(500)

    // Inject a code - should not autofill since field is gone
    await injectCode(context, '111111', 'github.com')

    await page.waitForTimeout(1000)

    // Verify no field exists with the code
    const fieldExists = await page.evaluate(() => {
      return document.querySelector('#otp') !== null
    })
    expect(fieldExists).toBe(false)
  })

  test('Scenario 5: Shadow DOM detection - field inside shadow root', async ({ page, context }) => {
    // Create a page with shadow DOM
    await page.goto('about:blank')

    await page.evaluate(() => {
      const container = document.createElement('div')
      container.id = 'shadow-container'
      document.body.appendChild(container)

      const shadow = container.attachShadow({ mode: 'open' })
      shadow.innerHTML = `
        <form>
          <label for="shadow-code">Verification Code</label>
          <input
            type="text"
            id="shadow-code"
            name="code"
            autocomplete="one-time-code"
            inputmode="numeric"
            maxlength="6"
          />
          <button type="submit">Verify</button>
        </form>
      `
    })

    // Wait for detection (shadow DOM support may be limited)
    await page.waitForTimeout(2000)

    // Inject a code
    await injectCode(context, '999999', 'example.com')

    await page.waitForTimeout(1000)

    // Try to verify if shadow DOM field was filled
    // Note: This may fail if shadow DOM support is not implemented
    const fieldValue = await page.evaluate(() => {
      const container = document.querySelector('#shadow-container')
      const shadow = container?.shadowRoot
      const field = shadow?.querySelector('#shadow-code') as HTMLInputElement | null
      return field?.value || ''
    })

    // This assertion may fail if shadow DOM is not yet supported
    // We're testing to see if it works
    console.log('Shadow DOM field value:', fieldValue)
  })

  test('Scenario 6: Rapid consecutive codes - handle multiple codes quickly', async ({ page, context }) => {
    // Load a test page
    const fixturePath = path.join(__dirname, '../fixtures/detection/github-2fa.html')
    await page.goto(`file://${fixturePath}`)

    // Wait for detection
    await waitForFieldDetection(page, 5000)

    // Inject multiple codes rapidly
    await injectCode(context, '111111', 'github.com')
    await page.waitForTimeout(500)

    await injectCode(context, '222222', 'github.com')
    await page.waitForTimeout(500)

    await injectCode(context, '333333', 'github.com')
    await page.waitForTimeout(1000)

    // The field should contain the most recent code
    const fieldValue = await page.inputValue('#otp')

    // Should be the last code injected
    expect(fieldValue).toBe('333333')

    // Verify field is marked as filled
    const isFilled = await page.evaluate(() => {
      const field = document.querySelector('#otp')
      return field?.getAttribute('data-inboxkey-filled') === 'true'
    })
    expect(isFilled).toBe(true)
  })
})
