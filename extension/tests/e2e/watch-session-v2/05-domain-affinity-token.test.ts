/**
 * E2E Test: Watch Session V2 - Domain Affinity (Token Overlap)
 *
 * Tests token overlap matching with affinity score 0.6:
 * 1. User on battlestategames.com
 * 2. Email from support@mail.com (no domain match)
 * 3. Subject: "Tarkov verification code" (token overlap with site)
 * 4. Verify code is matched via token overlap (affinity 0.6)
 */

import { test, expect } from '../fixtures/extension-fixture'
import { clearStorage, updateSettings } from '../utils/storage-helpers'
import {
  createTokenOverlapEmail,
  createNoMatchEmail,
  injectMockEmail,
  injectMockEmailBatch
} from './helpers/mock-email'
import { waitForSessionStart, waitForChipState } from './helpers/session-helpers'
import { TEST_SITES, loadTestPage, BASIC_OTP_PAGE } from './helpers/test-pages'

test.describe('Watch Session V2 - Domain Affinity (Token Overlap)', () => {
  test.beforeEach(async ({ backgroundPage }) => {
    await clearStorage(backgroundPage)
    await updateSettings(backgroundPage, { watchSessionV2Enabled: true })
  })

  test('matches code via subject token overlap', async ({ page, backgroundPage }) => {
    // STEP 1: Load Battlestate Games test page
    const site = TEST_SITES.battlestategames
    await loadTestPage(page, BASIC_OTP_PAGE, site.url)

    // STEP 2: Start watch session
    await page.focus('#otp')
    await waitForSessionStart(page)

    // STEP 3: Inject email with token overlap
    const tokenEmail = createTokenOverlapEmail(
      'battlestategames.com',
      '456789',
      'tarkov' // Token from site name
    )
    await injectMockEmail(backgroundPage, tokenEmail)

    // STEP 4: Verify code matched via token overlap
    await waitForChipState(page, 'filled', 8000)
    const fieldValue = await page.inputValue('#otp')
    expect(fieldValue).toBe('456789')
  })

  test('token overlap (0.6) beats no match (0.0)', async ({ page, backgroundPage }) => {
    await loadTestPage(page, BASIC_OTP_PAGE, 'https://www.battlestategames.com/verify')
    await page.focus('#otp')
    await waitForSessionStart(page)

    // Inject two codes - one with token overlap, one without
    const emails = [
      createNoMatchEmail('111111', 'Verification code'),
      createTokenOverlapEmail('battlestategames.com', '222222', 'tarkov')
    ]
    await injectMockEmailBatch(backgroundPage, emails, 500)

    // Verify token overlap wins
    await waitForChipState(page, 'filled', 8000)
    const fieldValue = await page.inputValue('#otp')
    expect(fieldValue).toBe('222222')
  })

  test('token in email sender domain also matches', async ({ page, backgroundPage }) => {
    await loadTestPage(page, BASIC_OTP_PAGE, 'https://github.com/login/verify')
    await page.focus('#otp')
    await waitForSessionStart(page)

    // Email from github-notifications.com should match via token
    const tokenEmail = createTokenOverlapEmail('github.com', '333333', 'github')
    await injectMockEmail(backgroundPage, tokenEmail)

    await waitForChipState(page, 'filled', 8000)
    const fieldValue = await page.inputValue('#otp')
    expect(fieldValue).toBe('333333')
  })
})
