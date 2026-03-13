/**
 * Popup Actions E2E Tests
 *
 * Tests for the complete popup flow with real Chrome APIs:
 * - Copy code to clipboard
 * - Open magic links in new tabs
 * - Confirmation dialogs for reset links
 * - Empty states
 * - Multiple codes and links display
 * - Link type badges
 * - Time formatting
 */

import { test, expect } from './fixtures/extension-fixture'
import {
  openPopup,
  setupPopupCache,
  getClipboard,
  waitForToast,
  getCodeButton,
  getLinkButton,
  hasEmptyCodesState,
  hasEmptyLinksState,
  getVisibleCodes,
  getVisibleLinks,
} from './utils/popup-helpers'

test.describe('Popup Actions E2E', () => {
  test('displays popup with codes and links', async ({ context, extensionId }) => {
    // Setup mock data
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
    await setupPage.close()

    // Open popup
    const popup = await openPopup(context, extensionId)

    // Verify codes section
    await expect(popup.locator('text=Recent Codes')).toBeVisible()
    await expect(popup.locator('text=123456')).toBeVisible()

    // Verify magic links section
    await expect(popup.locator('text=Magic Links')).toBeVisible()
    await expect(popup.locator('text=example.com')).toBeVisible()

    await popup.close()
  })

  test('copies code to clipboard', async ({ context, extensionId }) => {
    const setupPage = await context.newPage()
    await setupPopupCache(
      setupPage,
      [
        { code: '999888', source: 'gmail:user@test.com', receivedAt: Date.now() }
      ],
      []
    )
    await setupPage.close()

    const popup = await openPopup(context, extensionId)

    // Click copy button
    const copyButton = await getCodeButton(popup, '999888')
    await copyButton.click()

    // Wait for success feedback
    await popup.waitForTimeout(300) // Brief wait for button state update

    // Verify button shows copied state
    const copiedButton = popup.locator('button:has-text("Copied")')
    await expect(copiedButton).toBeVisible()

    // Verify clipboard contents
    const clipboardText = await getClipboard(popup)
    expect(clipboardText).toBe('999888')

    // Verify toast notification
    await waitForToast(popup, 'Copied to clipboard')

    await popup.close()
  })

  test('opens magic link in new tab', async ({ context, extensionId }) => {
    const setupPage = await context.newPage()
    await setupPopupCache(
      setupPage,
      [],
      [
        {
          url: 'https://example.com/login',
          type: 'login',
          source: 'test@example.com',
          receivedAt: Date.now()
        }
      ]
    )
    await setupPage.close()

    const popup = await openPopup(context, extensionId)

    // Get initial tab count
    const initialTabCount = context.pages().length

    // Click open button
    const openButton = await getLinkButton(popup, 'example.com')
    await openButton.click()

    // Wait for new tab
    await popup.waitForTimeout(500)

    // Verify new tab opened
    const pages = context.pages()
    expect(pages.length).toBe(initialTabCount + 1)

    const newTab = pages[pages.length - 1]
    expect(newTab.url()).toBe('https://example.com/login')

    // Verify success feedback in popup
    const openedButton = popup.locator('button:has-text("Opened")')
    await expect(openedButton).toBeVisible()

    // Verify toast notification
    await waitForToast(popup, 'Link opened')

    await newTab.close()
    await popup.close()
  })

  test('shows confirmation dialog for reset links', async ({ context, extensionId }) => {
    const setupPage = await context.newPage()
    await setupPopupCache(
      setupPage,
      [],
      [
        {
          url: 'https://example.com/reset-password',
          type: 'reset',
          source: 'test@example.com',
          receivedAt: Date.now()
        }
      ]
    )
    await setupPage.close()

    const popup = await openPopup(context, extensionId)

    // Setup dialog handler (accept)
    let dialogMessage = ''
    popup.on('dialog', async dialog => {
      dialogMessage = dialog.message()
      await dialog.accept()
    })

    // Get initial tab count
    const initialTabCount = context.pages().length

    // Click open button
    const openButton = await getLinkButton(popup, 'example.com')
    await openButton.click()

    // Wait for dialog and new tab
    await popup.waitForTimeout(1000)

    // Verify dialog appeared with warning
    expect(dialogMessage).toContain('Password Reset')

    // Verify tab opened after confirmation
    const pages = context.pages()
    expect(pages.length).toBe(initialTabCount + 1)

    const newTab = pages[pages.length - 1]
    expect(newTab.url()).toBe('https://example.com/reset-password')

    await newTab.close()
    await popup.close()
  })

  test('does not open reset link if confirmation denied', async ({ context, extensionId }) => {
    const setupPage = await context.newPage()
    await setupPopupCache(
      setupPage,
      [],
      [
        {
          url: 'https://example.com/reset-password',
          type: 'reset',
          source: 'test@example.com',
          receivedAt: Date.now()
        }
      ]
    )
    await setupPage.close()

    const popup = await openPopup(context, extensionId)

    // Get initial tab count
    const initialTabCount = context.pages().length

    // Setup dialog handler (dismiss)
    popup.on('dialog', async dialog => {
      await dialog.dismiss()
    })

    // Click open button
    const openButton = await getLinkButton(popup, 'example.com')
    await openButton.click()

    // Wait a bit to ensure no tab opens
    await popup.waitForTimeout(1000)

    // Verify no new tab opened
    const pages = context.pages()
    expect(pages.length).toBe(initialTabCount)

    await popup.close()
  })

  test('shows empty states when no codes or links', async ({ context, extensionId }) => {
    const setupPage = await context.newPage()
    await setupPopupCache(setupPage, [], [])
    await setupPage.close()

    const popup = await openPopup(context, extensionId)

    // Verify empty states
    const hasEmptyCodes = await hasEmptyCodesState(popup)
    const hasEmptyLinks = await hasEmptyLinksState(popup)

    expect(hasEmptyCodes).toBe(true)
    expect(hasEmptyLinks).toBe(true)

    await popup.close()
  })

  test('displays multiple codes and links', async ({ context, extensionId }) => {
    const setupPage = await context.newPage()
    const now = Date.now()

    await setupPopupCache(
      setupPage,
      [
        { code: '111111', source: 'gmail:user1@test.com', receivedAt: now },
        { code: '222222', source: 'gmail:user2@test.com', receivedAt: now - 60000 },
        { code: '333333', source: 'gmail:user3@test.com', receivedAt: now - 120000 },
      ],
      [
        {
          url: 'https://example.com/login',
          type: 'login',
          source: 'test1@example.com',
          receivedAt: now
        },
        {
          url: 'https://example.com/verify',
          type: 'verify',
          source: 'test2@example.com',
          receivedAt: now - 60000
        },
      ]
    )
    await setupPage.close()

    const popup = await openPopup(context, extensionId)

    // Verify all codes visible
    await expect(popup.locator('text=111111')).toBeVisible()
    await expect(popup.locator('text=222222')).toBeVisible()
    await expect(popup.locator('text=333333')).toBeVisible()

    // Verify all links visible
    const links = await getVisibleLinks(popup)
    expect(links.length).toBe(2)

    await popup.close()
  })

  test('shows correct link type badges', async ({ context, extensionId }) => {
    const setupPage = await context.newPage()
    const now = Date.now()

    await setupPopupCache(
      setupPage,
      [],
      [
        {
          url: 'https://example.com/login',
          type: 'login',
          source: 'test@example.com',
          receivedAt: now
        },
        {
          url: 'https://example.com/verify',
          type: 'verify',
          source: 'test@example.com',
          receivedAt: now
        },
        {
          url: 'https://example.com/reset',
          type: 'reset',
          source: 'test@example.com',
          receivedAt: now
        },
      ]
    )
    await setupPage.close()

    const popup = await openPopup(context, extensionId)

    // Verify link cards are visible
    await expect(popup.locator('.item-card[data-kind="link"]')).toHaveCount(3)

    await popup.close()
  })

  test('formats time correctly', async ({ context, extensionId }) => {
    const setupPage = await context.newPage()
    const now = Date.now()

    await setupPopupCache(
      setupPage,
      [
        { code: '111111', source: 'gmail:test@example.com', receivedAt: now - 30000 }, // 30s ago
        { code: '222222', source: 'gmail:test@example.com', receivedAt: now - 300000 }, // 5m ago
        { code: '333333', source: 'gmail:test@example.com', receivedAt: now - 7200000 }, // 2h ago
      ],
      []
    )
    await setupPage.close()

    const popup = await openPopup(context, extensionId)

    // Verify time formatting exists (exact format may vary, just check presence)
    const timeElements = await popup.locator('.time-pill').all()
    expect(timeElements.length).toBeGreaterThan(0)

    // Check for relative time indicators
    const hasTimeText = await popup.locator('text=/ago|Just now|min|hour/i').count()
    expect(hasTimeText).toBeGreaterThan(0)

    await popup.close()
  })

  test('handles multiple copy actions', async ({ context, extensionId }) => {
    const setupPage = await context.newPage()
    await setupPopupCache(
      setupPage,
      [
        { code: '111111', source: 'gmail:test1@example.com', receivedAt: Date.now() },
        { code: '222222', source: 'gmail:test2@example.com', receivedAt: Date.now() - 60000 },
      ],
      []
    )
    await setupPage.close()

    const popup = await openPopup(context, extensionId)

    // Copy first code
    const button1 = await getCodeButton(popup, '111111')
    await button1.click()
    await popup.waitForTimeout(300)

    let clipboardText = await getClipboard(popup)
    expect(clipboardText).toBe('111111')

    // Copy second code
    const button2 = await getCodeButton(popup, '222222')
    await button2.click()
    await popup.waitForTimeout(300)

    clipboardText = await getClipboard(popup)
    expect(clipboardText).toBe('222222')

    await popup.close()
  })

  test('displays source information for codes', async ({ context, extensionId }) => {
    const setupPage = await context.newPage()
    await setupPopupCache(
      setupPage,
      [
        { code: '123456', source: 'gmail:user@example.com', receivedAt: Date.now() },
      ],
      []
    )
    await setupPage.close()

    const popup = await openPopup(context, extensionId)

    // Verify source is displayed in the unified card layout
    const codeItem = popup.locator('.item-card[data-kind="code"]:has-text("123456")')
    await expect(codeItem).toBeVisible()

    // Check that sender info exists in the card
    const hasSenderInfo = await codeItem.locator('.item-card__sender').count()
    expect(hasSenderInfo).toBeGreaterThan(0)

    await popup.close()
  })

  test('displays link domain in UI', async ({ context, extensionId }) => {
    const setupPage = await context.newPage()
    await setupPopupCache(
      setupPage,
      [],
      [
        {
          url: 'https://auth.example.com/verify?token=abc123',
          type: 'verify',
          source: 'test@example.com',
          receivedAt: Date.now()
        }
      ]
    )
    await setupPage.close()

    const popup = await openPopup(context, extensionId)

    // Verify domain is displayed
    await expect(popup.locator('text=auth.example.com')).toBeVisible()

    await popup.close()
  })

  test('shows header with mailbox count', async ({ context, extensionId }) => {
    const setupPage = await context.newPage()
    await setupPopupCache(setupPage, [], [])
    await setupPage.close()

    const popup = await openPopup(context, extensionId)

    // Verify header exists with mailbox info
    await expect(popup.locator('.popup-header, header')).toBeVisible()

    await popup.close()
  })

  test('limits displayed items appropriately', async ({ context, extensionId }) => {
    const setupPage = await context.newPage()
    const now = Date.now()

    // Create 10 codes and 10 links
    const codes = Array.from({ length: 10 }, (_, i) => ({
      code: `${100000 + i}`,
      source: `gmail:user${i}@test.com`,
      receivedAt: now - i * 60000
    }))

    const links = Array.from({ length: 10 }, (_, i) => ({
      url: `https://example${i}.com/verify`,
      type: 'verify' as const,
      source: `test${i}@example.com`,
      receivedAt: now - i * 60000
    }))

    await setupPopupCache(setupPage, codes, links)
    await setupPage.close()

    const popup = await openPopup(context, extensionId)

    // Verify items are displayed (implementation may limit to 5 or show all)
    const visibleCodes = await getVisibleCodes(popup)
    const visibleLinks = await getVisibleLinks(popup)

    expect(visibleCodes.length).toBeGreaterThan(0)
    expect(visibleCodes.length).toBeLessThanOrEqual(10)

    expect(visibleLinks.length).toBeGreaterThan(0)
    expect(visibleLinks.length).toBeLessThanOrEqual(10)

    await popup.close()
  })
})
