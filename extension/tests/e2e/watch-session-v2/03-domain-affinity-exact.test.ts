/**
 * E2E Test: Watch Session V2 - Domain Affinity (Exact Match)
 *
 * Tests exact domain matching with affinity score 1.0:
 * 1. User on github.com
 * 2. Two emails arrive:
 *    - Code 111111 from noreply@notifications.com (generic, affinity 0.0)
 *    - Code 222222 from noreply@github.com (exact match, affinity 1.0)
 * 3. Verify 222222 is selected (domain affinity 1.0 vs 0.0)
 */

import { test, expect } from '../fixtures/extension-fixture'
import { clearStorage, updateSettings } from '../utils/storage-helpers'
import {
  createMockEmail,
  createExactDomainEmail,
  createNoMatchEmail,
  injectMockEmailBatch
} from './helpers/mock-email'
import {
  waitForSessionStart,
  waitForChipState
} from './helpers/session-helpers'
import { TEST_SITES, loadTestPage, BASIC_OTP_PAGE } from './helpers/test-pages'

test.describe('Watch Session V2 - Domain Affinity (Exact Match)', () => {
  test.beforeEach(async ({ backgroundPage }) => {
    await clearStorage(backgroundPage)
    await updateSettings(backgroundPage, { watchSessionV2Enabled: true })
  })

  test('prefers exact domain match over generic sender', async ({
    page,
    backgroundPage
  }) => {
    // STEP 1: Load GitHub test page
    const site = TEST_SITES.github
    await loadTestPage(page, BASIC_OTP_PAGE, site.url)

    // STEP 2: Start watch session
    await page.focus('#otp')
    await waitForSessionStart(page)

    // STEP 3: Inject two emails - generic first, exact match second
    const emails = [
      createNoMatchEmail('111111', 'Generic verification code'),
      createExactDomainEmail('github.com', '222222', 'GitHub verification code')
    ]
    await injectMockEmailBatch(backgroundPage, emails, 500)

    // STEP 4: Verify exact match code (222222) is selected
    await waitForChipState(page, 'filled', 8000)
    const fieldValue = await page.inputValue('#otp')
    expect(fieldValue).toBe('222222')
  })

  test('exact match wins even if older', async ({ page, backgroundPage }) => {
    await loadTestPage(page, BASIC_OTP_PAGE, 'https://github.com/login/verify')
    await page.focus('#otp')
    await waitForSessionStart(page)

    // Inject exact match (older)
    const exactMatch = createExactDomainEmail('github.com', '999999')
    exactMatch.receivedAt = Date.now() - 5000 // 5 seconds ago

    // Inject no match (newer)
    const noMatch = createNoMatchEmail('111111')
    noMatch.receivedAt = Date.now()

    await injectMockEmailBatch(backgroundPage, [exactMatch, noMatch], 500)

    // Exact match should win despite being older
    await waitForChipState(page, 'filled', 8000)
    const fieldValue = await page.inputValue('#otp')
    expect(fieldValue).toBe('999999')
  })
})
