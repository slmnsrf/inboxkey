/**
 * E2E Test: Watch Session V2 - Session Restart
 *
 * Tests watch session resilience to MV3 service worker restarts:
 * 1. Start watch session
 * 2. Simulate service worker restart
 * 3. Verify session resumes correctly
 * 4. Code can still be filled after restart
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
  simulateServiceWorkerRestart,
  getActiveAlarms
} from './helpers/session-helpers'
import { BASIC_OTP_PAGE, loadTestPage } from './helpers/test-pages'

test.describe('Watch Session V2 - Session Restart', () => {
  test.beforeEach(async ({ backgroundPage }) => {
    await clearStorage(backgroundPage)
    await updateSettings(backgroundPage, { watchSessionV2Enabled: true })
  })

  test('session survives service worker restart', async ({ page, backgroundPage }) => {
    // STEP 1: Load test page and start watch session
    await loadTestPage(page, BASIC_OTP_PAGE, 'https://github.com/login/verify')
    await page.focus('#otp')
    await waitForSessionStart(page)

    // STEP 2: Verify alarms are scheduled
    const alarmsBeforeRestart = await getActiveAlarms(backgroundPage)
    expect(alarmsBeforeRestart.length).toBeGreaterThan(0)

    // STEP 3: Simulate service worker restart
    await simulateServiceWorkerRestart(backgroundPage)

    // STEP 4: Verify session chip is still visible
    await page.waitForTimeout(2000)

    // STEP 5: Inject code after restart
    const email = createExactDomainEmail('github.com', '777777')
    await injectMockEmail(backgroundPage, email)

    // STEP 6: Verify code is still filled correctly
    await waitForChipState(page, 'filled', 8000)
    const fieldValue = await page.inputValue('#otp')
    expect(fieldValue).toBe('777777')
  })

  test('new session after restart works correctly', async ({ page, backgroundPage }) => {
    // Start first session
    await loadTestPage(page, BASIC_OTP_PAGE, 'https://example.com/verify')
    await page.focus('#otp')
    await waitForSessionStart(page)

    // Restart service worker
    await simulateServiceWorkerRestart(backgroundPage)

    // Blur and refocus to start new session
    await page.click('h1') // Click away from input
    await page.waitForTimeout(1000)
    await page.focus('#otp')
    await waitForSessionStart(page)

    // Inject code
    const email = createExactDomainEmail('example.com', '888888')
    await injectMockEmail(backgroundPage, email)

    // Verify autofill
    await waitForChipState(page, 'filled', 8000)
    const fieldValue = await page.inputValue('#otp')
    expect(fieldValue).toBe('888888')
  })
})
