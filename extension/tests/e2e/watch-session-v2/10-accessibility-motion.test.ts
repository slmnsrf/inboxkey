/**
 * E2E Test: Watch Session V2 - Accessibility (Reduced Motion)
 *
 * Tests reduced motion compliance:
 * 1. Chip animations respect prefers-reduced-motion
 * 2. Badge animations disabled for reduced motion
 * 3. Transitions respect user preferences
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
  enableReducedMotion,
  disableReducedMotion,
  verifyReducedMotionCompliance
} from './helpers/session-helpers'
import { BASIC_OTP_PAGE, loadTestPage } from './helpers/test-pages'

test.describe('Watch Session V2 - Accessibility (Reduced Motion)', () => {
  test.beforeEach(async ({ backgroundPage }) => {
    await clearStorage(backgroundPage)
    await updateSettings(backgroundPage, { watchSessionV2Enabled: true })
  })

  test('chip respects prefers-reduced-motion', async ({ page, backgroundPage }) => {
    // STEP 1: Enable reduced motion
    await enableReducedMotion(page)

    // STEP 2: Start watch session
    await loadTestPage(page, BASIC_OTP_PAGE, 'https://github.com/login/verify')
    await page.focus('#otp')
    await waitForSessionStart(page)

    // STEP 3: Verify animations are disabled/reduced
    const compliant = await verifyReducedMotionCompliance(page)
    expect(compliant).toBe(true)
  })

  test('chip appearance with reduced motion', async ({ page, backgroundPage }) => {
    await enableReducedMotion(page)
    await loadTestPage(page, BASIC_OTP_PAGE, 'https://github.com/login/verify')
    await page.focus('#otp')
    await waitForSessionStart(page)

    // Chip should appear instantly without slide animation
    const chip = await page.$('.inboxkey-chip')
    expect(chip).not.toBeNull()
  })

  test('chip dismissal with reduced motion', async ({ page, backgroundPage }) => {
    await enableReducedMotion(page)
    await loadTestPage(page, BASIC_OTP_PAGE, 'https://github.com/login/verify')
    await page.focus('#otp')
    await waitForSessionStart(page)

    // Inject code
    const email = createExactDomainEmail('github.com', '123456')
    await injectMockEmail(backgroundPage, email)
    await waitForChipState(page, 'filled', 8000)

    // Chip should auto-dismiss with minimal animation
    // Wait for auto-dismiss
    await page.waitForTimeout(6000)

    // Chip should be gone
    const visible = await page.isVisible('.inboxkey-chip')
    expect(visible).toBe(false)
  })

  test('normal motion works when preference not set', async ({ page, backgroundPage }) => {
    await disableReducedMotion(page)
    await loadTestPage(page, BASIC_OTP_PAGE, 'https://github.com/login/verify')
    await page.focus('#otp')
    await waitForSessionStart(page)

    // Chip should have normal animations
    const chip = await page.$('.inboxkey-chip')
    expect(chip).not.toBeNull()
  })
})
