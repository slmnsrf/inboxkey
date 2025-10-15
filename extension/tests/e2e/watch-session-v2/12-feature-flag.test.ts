/**
 * E2E Test: Watch Session V2 - Feature Flag
 *
 * Tests feature flag behavior:
 * 1. V2 disabled by default
 * 2. V2 features only active when enabled
 * 3. Fallback to V1 when disabled
 */

import { test, expect } from '../fixtures/extension-fixture'
import { clearStorage, updateSettings, getSettings } from '../utils/storage-helpers'
import {
  createExactDomainEmail,
  injectMockEmail
} from './helpers/mock-email'
import {
  waitForSessionStart,
  isChipVisible
} from './helpers/session-helpers'
import { BASIC_OTP_PAGE, loadTestPage } from './helpers/test-pages'

test.describe('Watch Session V2 - Feature Flag', () => {
  test.beforeEach(async ({ backgroundPage }) => {
    await clearStorage(backgroundPage)
  })

  test('V2 disabled by default', async ({ backgroundPage }) => {
    // Verify default settings
    const settings = await getSettings(backgroundPage)
    expect(settings.watchSessionV2Enabled).toBeFalsy()
  })

  test('V2 features active when enabled', async ({ page, backgroundPage }) => {
    // Enable V2
    await updateSettings(backgroundPage, { watchSessionV2Enabled: true })

    // Load page and start session
    await loadTestPage(page, BASIC_OTP_PAGE, 'https://github.com/login/verify')
    await page.focus('#otp')

    // Chip should appear (V2 feature)
    await waitForSessionStart(page)
    const chipVisible = await isChipVisible(page)
    expect(chipVisible).toBe(true)

    // Inject code
    const email = createExactDomainEmail('github.com', '123456')
    await injectMockEmail(backgroundPage, email)

    await page.waitForTimeout(8000)

    // Code should be filled
    const fieldValue = await page.inputValue('#otp')
    expect(fieldValue).toBe('123456')
  })

  test('feature flag can be toggled', async ({ backgroundPage }) => {
    // Start disabled
    let settings = await getSettings(backgroundPage)
    expect(settings.watchSessionV2Enabled).toBeFalsy()

    // Enable
    await updateSettings(backgroundPage, { watchSessionV2Enabled: true })
    settings = await getSettings(backgroundPage)
    expect(settings.watchSessionV2Enabled).toBe(true)

    // Disable again
    await updateSettings(backgroundPage, { watchSessionV2Enabled: false })
    settings = await getSettings(backgroundPage)
    expect(settings.watchSessionV2Enabled).toBe(false)
  })

  test('V2 scoring algorithm used when enabled', async ({ page, backgroundPage }) => {
    await updateSettings(backgroundPage, { watchSessionV2Enabled: true })

    await loadTestPage(page, BASIC_OTP_PAGE, 'https://github.com/login/verify')
    await page.focus('#otp')
    await waitForSessionStart(page)

    // Inject exact domain match - should score high with V2 algorithm
    const email = createExactDomainEmail('github.com', '999999')
    await injectMockEmail(backgroundPage, email)

    await page.waitForTimeout(8000)

    // Code should be filled using V2 scoring
    const fieldValue = await page.inputValue('#otp')
    expect(fieldValue).toBe('999999')
  })
})
