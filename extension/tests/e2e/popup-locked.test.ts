/**
 * Popup Locked State E2E Tests
 *
 * Tests for popup behavior when the extension is locked:
 * - Shows locked state UI
 * - Hides sensitive data
 * - Prevents actions
 * - Responds to unlock
 */

import { test, expect } from './fixtures/extension-fixture'
import { openPopup, setupPopupCache, setLockStatus } from './utils/popup-helpers'

test.describe('Popup Locked State', () => {
  test('shows locked state when extension is locked', async ({ context, extensionId }) => {
    // Setup lock status
    const setupPage = await context.newPage()
    await setLockStatus(setupPage, true)
    await setupPage.close()

    const popup = await openPopup(context, extensionId)

    // Verify locked state displayed
    await expect(popup.locator('text=InboxKey is Locked')).toBeVisible()

    // Verify unlock message
    const unlockMessage = popup.locator('text=/unlock|locked/i')
    await expect(unlockMessage).toBeVisible()

    await popup.close()
  })

  test('hides codes and links when locked', async ({ context, extensionId }) => {
    // Setup cache with data
    const setupPage = await context.newPage()
    await setupPopupCache(
      setupPage,
      [
        { code: '123456', source: 'gmail:test@example.com', receivedAt: Date.now() }
      ],
      [
        {
          url: 'https://example.com/verify',
          type: 'verify',
          source: 'test@example.com',
          receivedAt: Date.now()
        }
      ]
    )
    await setLockStatus(setupPage, true)
    await setupPage.close()

    const popup = await openPopup(context, extensionId)

    // Verify sensitive data is hidden
    await expect(popup.locator('text=123456')).not.toBeVisible()
    await expect(popup.locator('text=example.com')).not.toBeVisible()

    // Verify sections are hidden
    await expect(popup.locator('text=Recent Codes')).not.toBeVisible()
    await expect(popup.locator('text=Magic Links')).not.toBeVisible()

    await popup.close()
  })

  test('prevents copy actions when locked', async ({ context, extensionId }) => {
    const setupPage = await context.newPage()
    await setupPopupCache(
      setupPage,
      [
        { code: '123456', source: 'gmail:test@example.com', receivedAt: Date.now() }
      ],
      []
    )
    await setLockStatus(setupPage, true)
    await setupPage.close()

    const popup = await openPopup(context, extensionId)

    // Verify no copy buttons are visible
    const copyButtons = await popup.locator('button:has-text("Copy")').count()
    expect(copyButtons).toBe(0)

    await popup.close()
  })

  test('prevents link opens when locked', async ({ context, extensionId }) => {
    const setupPage = await context.newPage()
    await setupPopupCache(
      setupPage,
      [],
      [
        {
          url: 'https://example.com/verify',
          type: 'verify',
          source: 'test@example.com',
          receivedAt: Date.now()
        }
      ]
    )
    await setLockStatus(setupPage, true)
    await setupPage.close()

    const popup = await openPopup(context, extensionId)

    // Verify no open buttons are visible
    const openButtons = await popup.locator('button:has-text("Open")').count()
    expect(openButtons).toBe(0)

    await popup.close()
  })

  test('shows unlocked state when not locked', async ({ context, extensionId }) => {
    const setupPage = await context.newPage()
    await setupPopupCache(
      setupPage,
      [
        { code: '123456', source: 'gmail:test@example.com', receivedAt: Date.now() }
      ],
      []
    )
    await setLockStatus(setupPage, false)
    await setupPage.close()

    const popup = await openPopup(context, extensionId)

    // Verify unlocked state (codes visible, no lock message)
    await expect(popup.locator('text=123456')).toBeVisible()
    await expect(popup.locator('text=InboxKey is Locked')).not.toBeVisible()

    await popup.close()
  })

  test('locked state loads quickly', async ({ context, extensionId }) => {
    const setupPage = await context.newPage()
    await setLockStatus(setupPage, true)
    await setupPage.close()

    const popupUrl = `chrome-extension://${extensionId}/popup.html`
    const page = await context.newPage()

    const startTime = Date.now()
    await page.goto(popupUrl)

    // Wait for locked state to appear
    await page.waitForSelector('text=InboxKey is Locked', { timeout: 5000 })

    const loadTime = Date.now() - startTime

    console.log(`Locked state load time: ${loadTime}ms`)

    // Should load quickly even when locked
    expect(loadTime).toBeLessThan(200)

    await page.close()
  })

  test('locked state shows InboxKey branding', async ({ context, extensionId }) => {
    const setupPage = await context.newPage()
    await setLockStatus(setupPage, true)
    await setupPage.close()

    const popup = await openPopup(context, extensionId)

    // Verify InboxKey name is visible
    await expect(popup.locator('text=InboxKey')).toBeVisible()

    // Verify lock icon or indicator
    const lockIndicator = popup.locator('.lock-icon, [class*="lock"], svg')
    const hasLockIndicator = await lockIndicator.count()
    expect(hasLockIndicator).toBeGreaterThan(0)

    await popup.close()
  })

  test('locked popup has minimal height', async ({ context, extensionId }) => {
    const setupPage = await context.newPage()
    await setLockStatus(setupPage, true)
    await setupPage.close()

    const popup = await openPopup(context, extensionId)

    // Get popup container dimensions
    const container = popup.locator('.popup-locked, .popup-container')
    const box = await container.boundingBox()

    expect(box).not.toBeNull()
    if (box) {
      console.log(`Locked popup height: ${box.height}px`)

      // Locked state should be compact
      expect(box.height).toBeLessThan(400)
    }

    await popup.close()
  })

  test('no error messages in locked state', async ({ context, extensionId }) => {
    const setupPage = await context.newPage()
    await setLockStatus(setupPage, true)
    await setupPage.close()

    const popup = await openPopup(context, extensionId)

    // Verify no error state shown
    await expect(popup.locator('.popup-error')).not.toBeVisible()
    await expect(popup.locator('text=Error Loading Data')).not.toBeVisible()

    await popup.close()
  })

  test('locked state persists across popup reopens', async ({ context, extensionId }) => {
    const setupPage = await context.newPage()
    await setLockStatus(setupPage, true)
    await setupPage.close()

    // Open popup first time
    let popup = await openPopup(context, extensionId)
    await expect(popup.locator('text=InboxKey is Locked')).toBeVisible()
    await popup.close()

    // Open popup second time
    popup = await openPopup(context, extensionId)
    await expect(popup.locator('text=InboxKey is Locked')).toBeVisible()
    await popup.close()
  })

  test('transition from unlocked to locked state', async ({ context, extensionId }) => {
    // Start unlocked with data
    const setupPage = await context.newPage()
    await setupPopupCache(
      setupPage,
      [
        { code: '123456', source: 'gmail:test@example.com', receivedAt: Date.now() }
      ],
      []
    )
    await setLockStatus(setupPage, false)
    await setupPage.close()

    // Open popup while unlocked
    let popup = await openPopup(context, extensionId)
    await expect(popup.locator('text=123456')).toBeVisible()
    await popup.close()

    // Lock the extension
    const lockPage = await context.newPage()
    await setLockStatus(lockPage, true)
    await lockPage.close()

    // Reopen popup - should now be locked
    popup = await openPopup(context, extensionId)
    await expect(popup.locator('text=InboxKey is Locked')).toBeVisible()
    await expect(popup.locator('text=123456')).not.toBeVisible()

    await popup.close()
  })

  test('transition from locked to unlocked state', async ({ context, extensionId }) => {
    // Start locked
    const setupPage = await context.newPage()
    await setupPopupCache(
      setupPage,
      [
        { code: '123456', source: 'gmail:test@example.com', receivedAt: Date.now() }
      ],
      []
    )
    await setLockStatus(setupPage, true)
    await setupPage.close()

    // Open popup while locked
    let popup = await openPopup(context, extensionId)
    await expect(popup.locator('text=InboxKey is Locked')).toBeVisible()
    await popup.close()

    // Unlock the extension
    const unlockPage = await context.newPage()
    await setLockStatus(unlockPage, false)
    await unlockPage.close()

    // Reopen popup - should now show data
    popup = await openPopup(context, extensionId)
    await expect(popup.locator('text=123456')).toBeVisible()
    await expect(popup.locator('text=InboxKey is Locked')).not.toBeVisible()

    await popup.close()
  })

  test('locked state with no cache data', async ({ context, extensionId }) => {
    // Lock with empty cache
    const setupPage = await context.newPage()
    await setupPopupCache(setupPage, [], [])
    await setLockStatus(setupPage, true)
    await setupPage.close()

    const popup = await openPopup(context, extensionId)

    // Should show locked state regardless of cache
    await expect(popup.locator('text=InboxKey is Locked')).toBeVisible()

    await popup.close()
  })
})
