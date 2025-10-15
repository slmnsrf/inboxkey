/**
 * E2E Test: Watch Session V2 - Clipboard Fallback
 *
 * Tests clipboard fallback when field is readonly:
 * 1. Readonly OTP field detected
 * 2. Code arrives
 * 3. Code copied to clipboard instead of autofilled
 * 4. Chip shows "Code copied to clipboard"
 */

import { test, expect } from '../fixtures/extension-fixture'
import { clearStorage, updateSettings } from '../utils/storage-helpers'
import {
  createExactDomainEmail,
  injectMockEmail
} from './helpers/mock-email'
import {
  waitForSessionStart,
  waitForChipState,
  getChipText
} from './helpers/session-helpers'
import { READONLY_OTP_PAGE, loadTestPage } from './helpers/test-pages'

test.describe('Watch Session V2 - Clipboard Fallback', () => {
  test.beforeEach(async ({ backgroundPage }) => {
    await clearStorage(backgroundPage)
    await updateSettings(backgroundPage, { watchSessionV2Enabled: true })
  })

  test('copies code to clipboard for readonly field', async ({ page, backgroundPage }) => {
    // STEP 1: Load page with readonly OTP field
    await loadTestPage(page, READONLY_OTP_PAGE, 'https://example.com/verify')
    await page.focus('#otp')
    await waitForSessionStart(page)

    // STEP 2: Inject code
    const email = createExactDomainEmail('example.com', '123456')
    await injectMockEmail(backgroundPage, email)

    // STEP 3: Verify chip shows "copied" state
    await waitForChipState(page, 'copied', 8000)

    // STEP 4: Verify chip text
    const chipText = await getChipText(page)
    expect(chipText).toContain('copied to clipboard')

    // STEP 5: Verify clipboard contains the code
    const clipboardText = await page.evaluate(async () => {
      return await navigator.clipboard.readText()
    })
    expect(clipboardText).toBe('123456')

    // STEP 6: Field should remain empty (readonly)
    const fieldValue = await page.inputValue('#otp')
    expect(fieldValue).toBe('')
  })

  test('user can manually paste from clipboard', async ({ page, backgroundPage }) => {
    await loadTestPage(page, READONLY_OTP_PAGE, 'https://example.com/verify')
    await page.focus('#otp')
    await waitForSessionStart(page)

    // Inject code
    const email = createExactDomainEmail('example.com', '999999')
    await injectMockEmail(backgroundPage, email)

    // Wait for clipboard copy
    await waitForChipState(page, 'copied', 8000)

    // Note: We can't test actual pasting into readonly field
    // but we verified clipboard has the code
    const clipboardText = await page.evaluate(async () => {
      return await navigator.clipboard.readText()
    })
    expect(clipboardText).toBe('999999')
  })
})
