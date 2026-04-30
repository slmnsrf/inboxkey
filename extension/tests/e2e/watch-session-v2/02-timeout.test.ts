/**
 * E2E Test: Watch Session V2 - Timeout Scenario
 *
 * Tests the timeout behavior when no code arrives within 15 seconds:
 * 1. Start watch session
 * 2. Wait 15+ seconds with no email
 * 3. Chip shows "No code received. Try resend or check popup."
 * 4. Badge shows no-code (orange exclamation)
 * 5. User can dismiss chip with ESC key
 */

import { test, expect } from '../fixtures/extension-fixture'
import { clearStorage, updateSettings } from '../utils/storage-helpers'
import {
  waitForSessionStart,
  waitForChipState,
  getChipText,
  dismissChipWithEsc,
  isChipVisible
} from './helpers/session-helpers'
import { BASIC_OTP_PAGE, loadTestPage } from './helpers/test-pages'

test.describe('Watch Session V2 - Timeout', () => {
  test.beforeEach(async ({ backgroundPage }) => {
    await clearStorage(backgroundPage)
    await updateSettings(backgroundPage, { watchSessionV2Enabled: true })
  })

  test('session times out after 15 seconds with no code', async ({
    page,
    backgroundPage
  }) => {
    // STEP 1: Load test page and start watch session
    await loadTestPage(page, BASIC_OTP_PAGE, 'https://example.com/verify')
    await page.focus('#otp')
    await waitForSessionStart(page)

    // STEP 2: Wait for session to time out (15+ seconds)
    // Session should poll at 0s, 5s, 10s and timeout after last poll
    await page.waitForTimeout(16000)

    // STEP 3: Verify chip shows timeout state
    await waitForChipState(page, 'timeout', 5000)

    // STEP 4: Verify chip text shows helpful message
    const chipText = await getChipText(page)
    expect(chipText).toContain('No code received')

    // STEP 5: Verify chip is visible and can be dismissed
    const visible = await isChipVisible(page)
    expect(visible).toBe(true)

    // STEP 6: Dismiss chip with ESC key
    await dismissChipWithEsc(page)

    // STEP 7: Verify chip is gone
    const visibleAfter = await isChipVisible(page)
    expect(visibleAfter).toBe(false)
  })

  test('timeout does not prevent manual code entry', async ({ page, backgroundPage }) => {
    await loadTestPage(page, BASIC_OTP_PAGE, 'https://example.com/verify')
    await page.focus('#otp')
    await waitForSessionStart(page)

    // Wait for timeout
    await page.waitForTimeout(16000)
    await waitForChipState(page, 'timeout', 5000)

    // User can still manually type code
    await page.fill('#otp', '999999')

    const fieldValue = await page.inputValue('#otp')
    expect(fieldValue).toBe('999999')
  })
})
