/**
 * E2E Test: Watch Session V2 - Domain Affinity (Alias Match)
 *
 * Tests alias domain matching with affinity score 0.9:
 * 1. User on dropbox.com
 * 2. Email arrives from no-reply@dropboxmail.com (known alias)
 * 3. Verify code is matched with domain affinity 0.9
 */

import { test, expect } from '../fixtures/extension-fixture'
import { clearStorage, updateSettings } from '../utils/storage-helpers'
import {
  createAliasDomainEmail,
  createNoMatchEmail,
  injectMockEmail,
  injectMockEmailBatch
} from './helpers/mock-email'
import { waitForSessionStart, waitForChipState } from './helpers/session-helpers'
import { TEST_SITES, loadTestPage, BASIC_OTP_PAGE } from './helpers/test-pages'

test.describe('Watch Session V2 - Domain Affinity (Alias)', () => {
  test.beforeEach(async ({ backgroundPage }) => {
    await clearStorage(backgroundPage)
    await updateSettings(backgroundPage, { watchSessionV2Enabled: true })
  })

  test('recognizes dropboxmail.com as alias for dropbox.com', async ({
    page,
    backgroundPage
  }) => {
    // STEP 1: Load Dropbox test page
    const site = TEST_SITES.dropbox
    await loadTestPage(page, BASIC_OTP_PAGE, site.url)

    // STEP 2: Start watch session
    await page.focus('#otp')
    await waitForSessionStart(page)

    // STEP 3: Inject email from alias domain
    const aliasEmail = createAliasDomainEmail('dropbox.com', '789012')
    await injectMockEmail(backgroundPage, aliasEmail)

    // STEP 4: Verify code is recognized and filled
    await waitForChipState(page, 'filled', 8000)
    const fieldValue = await page.inputValue('#otp')
    expect(fieldValue).toBe('789012')
  })

  test('alias match (0.9) beats generic (0.0)', async ({ page, backgroundPage }) => {
    await loadTestPage(page, BASIC_OTP_PAGE, 'https://www.dropbox.com/login/verify')
    await page.focus('#otp')
    await waitForSessionStart(page)

    const emails = [
      createNoMatchEmail('111111', 'Generic code'),
      createAliasDomainEmail('dropbox.com', '222222', 'Dropbox verification')
    ]
    await injectMockEmailBatch(backgroundPage, emails, 500)

    await waitForChipState(page, 'filled', 8000)
    const fieldValue = await page.inputValue('#otp')
    expect(fieldValue).toBe('222222')
  })

  test('github.github.io recognized as alias for github.com', async ({ page, backgroundPage }) => {
    await loadTestPage(page, BASIC_OTP_PAGE, 'https://github.com/login/verify')
    await page.focus('#otp')
    await waitForSessionStart(page)

    const aliasEmail = createAliasDomainEmail('github.com', '555555')
    await injectMockEmail(backgroundPage, aliasEmail)

    await waitForChipState(page, 'filled', 8000)
    const fieldValue = await page.inputValue('#otp')
    expect(fieldValue).toBe('555555')
  })
})
