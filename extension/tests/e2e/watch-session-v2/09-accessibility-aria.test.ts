/**
 * E2E Test: Watch Session V2 - Accessibility (ARIA)
 *
 * Tests ARIA compliance for screen readers:
 * 1. Chip has proper role and aria-live
 * 2. State changes announced to screen readers
 * 3. Live region properly structured
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
  verifyAriaLiveRegion,
  getAriaLiveText
} from './helpers/session-helpers'
import { BASIC_OTP_PAGE, loadTestPage } from './helpers/test-pages'

test.describe('Watch Session V2 - Accessibility (ARIA)', () => {
  test.beforeEach(async ({ backgroundPage }) => {
    await clearStorage(backgroundPage)
    await updateSettings(backgroundPage, { watchSessionV2Enabled: true })
  })

  test('chip has proper ARIA attributes', async ({ page, backgroundPage }) => {
    // STEP 1: Start watch session
    await loadTestPage(page, BASIC_OTP_PAGE, 'https://github.com/login/verify')
    await page.focus('#otp')
    await waitForSessionStart(page)

    // STEP 2: Verify ARIA live region
    const ariaResult = await verifyAriaLiveRegion(page)
    expect(ariaResult.valid).toBe(true)
    expect(ariaResult.issues).toEqual([])
  })

  test('ARIA live region announces listening state', async ({ page, backgroundPage }) => {
    await loadTestPage(page, BASIC_OTP_PAGE, 'https://github.com/login/verify')
    await page.focus('#otp')
    await waitForSessionStart(page)

    // Read ARIA live region text
    const liveText = await getAriaLiveText(page)
    expect(liveText).toContain('Listening for code')
  })

  test('ARIA live region announces filled state', async ({ page, backgroundPage }) => {
    await loadTestPage(page, BASIC_OTP_PAGE, 'https://github.com/login/verify')
    await page.focus('#otp')
    await waitForSessionStart(page)

    // Inject code
    const email = createExactDomainEmail('github.com', '123456')
    await injectMockEmail(backgroundPage, email)
    await waitForChipState(page, 'filled', 8000)

    // Read ARIA live region for filled state
    const liveText = await getAriaLiveText(page)
    expect(liveText).toContain('Filled')
  })

  test('ARIA live region announces timeout state', async ({ page, backgroundPage }) => {
    await loadTestPage(page, BASIC_OTP_PAGE, 'https://example.com/verify')
    await page.focus('#otp')
    await waitForSessionStart(page)

    // Wait for timeout
    await page.waitForTimeout(16000)
    await waitForChipState(page, 'timeout', 5000)

    // Read ARIA live region for timeout state
    const liveText = await getAriaLiveText(page)
    expect(liveText).toContain('No new code')
  })
})
