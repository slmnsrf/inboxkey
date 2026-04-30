/**
 * E2E Test: Watch Session V2 - Accessibility (Keyboard)
 *
 * Tests keyboard accessibility:
 * 1. Full keyboard navigation
 * 2. ESC key dismisses chip
 * 3. Tab key navigation works
 * 4. Focus management
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
  dismissChipWithEsc,
  isChipVisible
} from './helpers/session-helpers'
import { BASIC_OTP_PAGE, loadTestPage } from './helpers/test-pages'

test.describe('Watch Session V2 - Accessibility (Keyboard)', () => {
  test.beforeEach(async ({ backgroundPage }) => {
    await clearStorage(backgroundPage)
    await updateSettings(backgroundPage, { watchSessionV2Enabled: true })
  })

  test('ESC key dismisses chip', async ({ page, backgroundPage }) => {
    // STEP 1: Start watch session
    await loadTestPage(page, BASIC_OTP_PAGE, 'https://github.com/login/verify')
    await page.focus('#otp')
    await waitForSessionStart(page)

    // STEP 2: Verify chip is visible
    let visible = await isChipVisible(page)
    expect(visible).toBe(true)

    // STEP 3: Press ESC key
    await dismissChipWithEsc(page)

    // STEP 4: Verify chip dismissed
    visible = await isChipVisible(page)
    expect(visible).toBe(false)
  })

  test('chip dismissed with ESC after code filled', async ({ page, backgroundPage }) => {
    await loadTestPage(page, BASIC_OTP_PAGE, 'https://github.com/login/verify')
    await page.focus('#otp')
    await waitForSessionStart(page)

    // Inject code
    const email = createExactDomainEmail('github.com', '555555')
    await injectMockEmail(backgroundPage, email)
    await waitForChipState(page, 'filled', 8000)

    // Dismiss with ESC
    await dismissChipWithEsc(page)

    // Verify chip gone but code remains
    const visible = await isChipVisible(page)
    expect(visible).toBe(false)

    const fieldValue = await page.inputValue('#otp')
    expect(fieldValue).toBe('555555')
  })

  test('focus remains on OTP field during session', async ({ page, backgroundPage }) => {
    await loadTestPage(page, BASIC_OTP_PAGE, 'https://github.com/login/verify')
    await page.focus('#otp')
    await waitForSessionStart(page)

    // Verify focus stays on input
    const focusedElement = await page.evaluate(() => {
      return document.activeElement?.id
    })
    expect(focusedElement).toBe('otp')

    // Inject code
    const email = createExactDomainEmail('github.com', '123456')
    await injectMockEmail(backgroundPage, email)
    await waitForChipState(page, 'filled', 8000)

    // Verify focus still on input after autofill
    const focusedAfter = await page.evaluate(() => {
      return document.activeElement?.id
    })
    expect(focusedAfter).toBe('otp')
  })
})
