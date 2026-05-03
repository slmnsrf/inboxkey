/**
 * E2E Test: Watch Session V2 - Multi-Account
 *
 * Tests behavior with multiple email accounts:
 * 1. Codes from multiple mailboxes
 * 2. Domain affinity works across accounts
 * 3. Most relevant code selected regardless of account
 */

import { test, expect } from '../fixtures/extension-fixture'
import { clearStorage, updateSettings } from '../utils/storage-helpers'
import {
  createMockEmail,
  createExactDomainEmail,
  injectMockEmailBatch
} from './helpers/mock-email'
import {
  waitForSessionStart,
  waitForChipState
} from './helpers/session-helpers'
import { BASIC_OTP_PAGE, loadTestPage } from './helpers/test-pages'

test.describe('Watch Session V2 - Multi-Account', () => {
  test.beforeEach(async ({ backgroundPage }) => {
    await clearStorage(backgroundPage)
    await updateSettings(backgroundPage, { watchSessionV2Enabled: true })
  })

  test('selects best code across multiple accounts', async ({ page, backgroundPage }) => {
    // STEP 1: Start watch session
    await loadTestPage(page, BASIC_OTP_PAGE, 'https://github.com/login/verify')
    await page.focus('#otp')
    await waitForSessionStart(page)

    // STEP 2: Inject codes from different accounts
    const emails = [
      // Account 1: Generic sender, older
      createMockEmail({
        from: 'noreply@mail.com',
        subject: 'Verification',
        code: '111111',
        receivedAt: Date.now() - 5000,
        provider: 'imap-bridge'
      }),
      // Account 2: Exact match, newer
      createExactDomainEmail('github.com', '222222', 'GitHub verification')
    ]
    emails[1].provider = 'outlook'
    await injectMockEmailBatch(backgroundPage, emails, 500)

    // STEP 3: Verify exact match wins (222222)
    await waitForChipState(page, 'filled', 8000)
    const fieldValue = await page.inputValue('#otp')
    expect(fieldValue).toBe('222222')
  })

  test('newer code from same account preferred when domain match equal', async ({ page, backgroundPage }) => {
    await loadTestPage(page, BASIC_OTP_PAGE, 'https://github.com/login/verify')
    await page.focus('#otp')
    await waitForSessionStart(page)

    // Two exact match codes from different accounts
    const email1 = createExactDomainEmail('github.com', '333333')
    email1.provider = 'imap-bridge'
    email1.receivedAt = Date.now() - 10000 // 10s ago

    const email2 = createExactDomainEmail('github.com', '444444')
    email2.provider = 'outlook'
    email2.receivedAt = Date.now() // Now

    await injectMockEmailBatch(backgroundPage, [email1, email2], 500)

    // Newer code (444444) should win
    await waitForChipState(page, 'filled', 8000)
    const fieldValue = await page.inputValue('#otp')
    expect(fieldValue).toBe('444444')
  })

  test('all accounts polled during session', async ({ page, backgroundPage }) => {
    await loadTestPage(page, BASIC_OTP_PAGE, 'https://example.com/verify')
    await page.focus('#otp')
    await waitForSessionStart(page)

    // Simulate codes arriving from multiple providers
    const emails = [
      createMockEmail({
        from: 'noreply@example.com',
        subject: 'Code from Gmail account',
        code: '555555',
        provider: 'imap-bridge'
      }),
      createMockEmail({
        from: 'noreply@example.com',
        subject: 'Code from Outlook account',
        code: '666666',
        provider: 'outlook',
        receivedAt: Date.now() + 1000 // Slightly newer
      })
    ]
    await injectMockEmailBatch(backgroundPage, emails, 500)

    // Newer code should be selected
    await waitForChipState(page, 'filled', 8000)
    const fieldValue = await page.inputValue('#otp')
    expect(fieldValue).toBe('666666')
  })
})
