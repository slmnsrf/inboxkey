/**
 * E2E Test: Watch Session V2 - Happy Path
 *
 * Tests the complete happy path flow for Watch Sessions V2:
 * 1. Focus OTP field → chip appears "InboxKey"
 * 2. Badge animates (listening state)
 * 3. Mock email arrives with code
 * 4. Code is autofilled
 * 5. Chip shows "Code filled ✓"
 * 6. Badge shows success (green checkmark)
 * 7. Chip auto-dismisses after 5s
 */

import { test, expect } from '../fixtures/extension-fixture'
import { clearStorage, updateSettings } from '../utils/storage-helpers'
import {
  createMockEmail,
  injectMockEmail,
  createExactDomainEmail
} from './helpers/mock-email'
import {
  waitForSessionStart,
  getChipState,
  waitForChipState,
  getChipText,
  verifyChipAutoDismiss
} from './helpers/session-helpers'
import { BASIC_OTP_PAGE, loadTestPage } from './helpers/test-pages'

test.describe('Watch Session V2 - Happy Path', () => {
  test.beforeEach(async ({ backgroundPage }) => {
    await clearStorage(backgroundPage)
    await updateSettings(backgroundPage, { watchSessionV2Enabled: true })
  })

  test('complete happy path flow with autofill and success feedback', async ({
    page,
    backgroundPage,
    extensionId
  }) => {
    // STEP 1: Load test page with OTP field
    await loadTestPage(page, BASIC_OTP_PAGE, 'https://github.com/login/verify')

    // STEP 2: Focus OTP field to start watch session
    await page.focus('#otp')

    // STEP 3: Wait for watch session to start
    await waitForSessionStart(page)

    // STEP 4: Verify chip state is "listening"
    const chipState = await getChipState(page)
    expect(chipState).toBe('listening')

    // STEP 5: Verify chip text
    const chipText = await getChipText(page)
    expect(chipText).toContain('InboxKey')

    // STEP 6: Wait a moment to simulate user waiting for email
    await page.waitForTimeout(1000)

    // STEP 7: Inject mock email with verification code
    const mockEmail = createExactDomainEmail('github.com', '123456', 'GitHub verification code')
    await injectMockEmail(backgroundPage, mockEmail)

    // STEP 8: Wait for code to be autofilled (chip transitions to "filled")
    await waitForChipState(page, 'filled', 8000)

    // STEP 9: Verify field contains the code
    const fieldValue = await page.inputValue('#otp')
    expect(fieldValue).toBe('123456')

    // STEP 10: Verify chip shows "Code filled ✓" message
    const filledChipText = await getChipText(page)
    expect(filledChipText).toContain('Code filled')

    // STEP 11: Verify field is marked as filled with data attributes
    const isFilled = await page.evaluate(() => {
      const field = document.querySelector('#otp') as HTMLInputElement
      return field?.getAttribute('data-inboxkey-filled') === 'true'
    })
    expect(isFilled).toBe(true)

    // STEP 12: Verify chip auto-dismisses after 3 seconds (filled state)
    await verifyChipAutoDismiss(page, 3000, 1500)
  })

  test('happy path with domain affinity boost (exact match)', async ({
    page,
    backgroundPage
  }) => {
    await loadTestPage(page, BASIC_OTP_PAGE, 'https://github.com/login/verify')
    await page.focus('#otp')
    await waitForSessionStart(page)

    // Inject email from exact domain match
    const email = createExactDomainEmail('github.com', '456789')
    await injectMockEmail(backgroundPage, email)

    // Wait for autofill
    await waitForChipState(page, 'filled', 8000)

    // Verify code was filled
    const fieldValue = await page.inputValue('#otp')
    expect(fieldValue).toBe('456789')
  })

  test('happy path with recency boost', async ({ page, backgroundPage }) => {
    await loadTestPage(page, BASIC_OTP_PAGE, 'https://example.com/verify')
    await page.focus('#otp')
    await waitForSessionStart(page)

    // Inject older code (2 minutes ago)
    const olderEmail = createMockEmail({
      from: 'noreply@example.com',
      subject: 'Older code',
      code: '111111',
      receivedAt: Date.now() - 120000 // 2 minutes ago
    })
    await injectMockEmail(backgroundPage, olderEmail)

    await page.waitForTimeout(500)

    // Inject newer code (now)
    const newerEmail = createMockEmail({
      from: 'noreply@example.com',
      subject: 'Newer code',
      code: '222222',
      receivedAt: Date.now()
    })
    await injectMockEmail(backgroundPage, newerEmail)

    // Wait for autofill
    await waitForChipState(page, 'filled', 8000)

    // Verify newer code was selected due to recency boost
    const fieldValue = await page.inputValue('#otp')
    expect(fieldValue).toBe('222222')
  })

  test('happy path with shape matching boost', async ({ page, backgroundPage }) => {
    await loadTestPage(page, BASIC_OTP_PAGE, 'https://example.com/verify')
    await page.focus('#otp')
    await waitForSessionStart(page)

    // Inject 8-character code (mismatches expected shape of 6 numeric)
    const mismatchEmail = createMockEmail({
      from: 'noreply@example.com',
      subject: 'Wrong shape',
      code: 'ABC12345', // 8 alphanumeric
      receivedAt: Date.now() - 1000
    })
    await injectMockEmail(backgroundPage, mismatchEmail)

    await page.waitForTimeout(500)

    // Inject 6-digit code (matches expected shape)
    const matchEmail = createMockEmail({
      from: 'noreply@example.com',
      subject: 'Right shape',
      code: '999999', // 6 numeric - matches maxlength="6" inputmode="numeric"
      receivedAt: Date.now()
    })
    await injectMockEmail(backgroundPage, matchEmail)

    // Wait for autofill
    await waitForChipState(page, 'filled', 8000)

    // Verify 6-digit code selected due to shape boost
    const fieldValue = await page.inputValue('#otp')
    expect(fieldValue).toBe('999999')
  })
})
