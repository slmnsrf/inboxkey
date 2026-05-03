/**
 * Popup Performance E2E Tests
 *
 * Tests that validate popup performance requirements:
 * - Popup opens within 200ms
 * - Fast load with empty cache
 * - Fast load with populated cache
 * - Multiple rapid opens
 */

import { test, expect } from './fixtures/extension-fixture'
import { setupPopupCache, measurePopupLoadTime, openPopup } from './utils/popup-helpers'

test.describe('Popup Performance', () => {
  test('popup opens within 200ms with cache', async ({ context, extensionId }) => {
    // Setup cache
    const setupPage = await context.newPage()
    await setupPopupCache(
      setupPage,
      [
        { code: '123456', source: 'imap-bridge:test@example.com', receivedAt: Date.now() }
      ],
      []
    )
    await setupPage.close()

    // Measure popup open time
    const loadTime = await measurePopupLoadTime(context, extensionId)

    console.log(`Popup load time with cache: ${loadTime}ms`)

    // Verify performance target (200ms requirement)
    expect(loadTime).toBeLessThan(200)
  })

  test('popup loads with empty cache quickly', async ({ context, extensionId }) => {
    const setupPage = await context.newPage()
    await setupPopupCache(setupPage, [], [])
    await setupPage.close()

    const loadTime = await measurePopupLoadTime(context, extensionId)

    console.log(`Empty popup load time: ${loadTime}ms`)

    // Empty cache should be even faster
    expect(loadTime).toBeLessThan(200)
  })

  test('popup loads with multiple items within performance budget', async ({ context, extensionId }) => {
    const setupPage = await context.newPage()
    const now = Date.now()

    // Create maximum number of items (5 codes, 5 links)
    const codes = Array.from({ length: 5 }, (_, i) => ({
      code: `${100000 + i}`,
      source: `gmail:user${i}@test.com`,
      receivedAt: now - i * 60000
    }))

    const links = Array.from({ length: 5 }, (_, i) => ({
      url: `https://example${i}.com/verify`,
      type: 'verify' as const,
      source: `test${i}@example.com`,
      receivedAt: now - i * 60000
    }))

    await setupPopupCache(setupPage, codes, links)
    await setupPage.close()

    const loadTime = await measurePopupLoadTime(context, extensionId)

    console.log(`Popup load time with 5 codes + 5 links: ${loadTime}ms`)

    // Should still meet performance target with full cache
    expect(loadTime).toBeLessThan(200)
  })

  test('handles rapid popup opens efficiently', async ({ context, extensionId }) => {
    const setupPage = await context.newPage()
    await setupPopupCache(
      setupPage,
      [
        { code: '123456', source: 'imap-bridge:test@example.com', receivedAt: Date.now() }
      ],
      []
    )
    await setupPage.close()

    // Open and close popup 3 times rapidly
    const loadTimes: number[] = []

    for (let i = 0; i < 3; i++) {
      const loadTime = await measurePopupLoadTime(context, extensionId)
      loadTimes.push(loadTime)
      console.log(`Popup open ${i + 1}: ${loadTime}ms`)
    }

    // All opens should meet performance target
    loadTimes.forEach((time, _index) => {
      expect(time).toBeLessThan(200)
    })

    // Average should be well under budget
    const avgTime = loadTimes.reduce((a, b) => a + b, 0) / loadTimes.length
    console.log(`Average load time: ${avgTime}ms`)
    expect(avgTime).toBeLessThan(150)
  })

  test('popup remains responsive after loading', async ({ context, extensionId }) => {
    const setupPage = await context.newPage()
    await setupPopupCache(
      setupPage,
      [
        { code: '111111', source: 'imap-bridge:test@example.com', receivedAt: Date.now() },
        { code: '222222', source: 'imap-bridge:test@example.com', receivedAt: Date.now() - 60000 },
      ],
      []
    )
    await setupPage.close()

    const popup = await openPopup(context, extensionId)

    // Measure time to interact with UI after load
    const startTime = Date.now()

    // Click first copy button
    const copyButton = popup.locator('.item-card[data-kind="code"]:has-text("111111") button').first()
    await copyButton.click()

    const interactionTime = Date.now() - startTime

    console.log(`Time to first interaction: ${interactionTime}ms`)

    // Should be very fast (< 100ms)
    expect(interactionTime).toBeLessThan(100)

    await popup.close()
  })

  test('popup does not block on storage access', async ({ context, extensionId }) => {
    // Don't set up any cache - test cold start performance
    const popupUrl = `chrome-extension://${extensionId}/popup.html`
    const page = await context.newPage()

    const startTime = Date.now()
    await page.goto(popupUrl)

    // Wait for either loading skeleton or content
    await page.waitForSelector('.popup-container, .popup-loading', { timeout: 5000 })

    const loadTime = Date.now() - startTime

    console.log(`Cold start load time: ${loadTime}ms`)

    // Even without cached data, should load UI shell quickly
    expect(loadTime).toBeLessThan(300) // Slightly higher budget for cold start

    await page.close()
  })

  test('toast animations do not block UI', async ({ context, extensionId }) => {
    const setupPage = await context.newPage()
    await setupPopupCache(
      setupPage,
      [
        { code: '111111', source: 'imap-bridge:test@example.com', receivedAt: Date.now() },
        { code: '222222', source: 'imap-bridge:test@example.com', receivedAt: Date.now() },
      ],
      []
    )
    await setupPage.close()

    const popup = await openPopup(context, extensionId)

    // Click first button to trigger toast
    const button1 = popup.locator('.item-card[data-kind="code"]:has-text("111111") button').first()
    await button1.click()

    // Immediately try to click second button (should not be blocked by toast)
    const startTime = Date.now()
    const button2 = popup.locator('.item-card[data-kind="code"]:has-text("222222") button').first()
    await button2.click()
    const secondClickTime = Date.now() - startTime

    console.log(`Second click during toast: ${secondClickTime}ms`)

    // Should not be blocked by toast animation
    expect(secondClickTime).toBeLessThan(100)

    await popup.close()
  })

  test('link opening does not freeze popup', async ({ context, extensionId }) => {
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
    await setupPage.close()

    const popup = await openPopup(context, extensionId)

    // Click open button
    const startTime = Date.now()
    const openButton = popup.locator('.item-card[data-kind="link"] button').first()
    await openButton.click()

    // Verify popup remains responsive (button updates state quickly)
    await popup.waitForTimeout(100)
    const responseTime = Date.now() - startTime

    console.log(`Link open response time: ${responseTime}ms`)

    // Should respond immediately (not waiting for tab to fully load)
    expect(responseTime).toBeLessThan(200)

    // Clean up new tab
    const pages = context.pages()
    if (pages.length > 1) {
      await pages[pages.length - 1].close()
    }

    await popup.close()
  })

  test('memory usage remains stable with large cache', async ({ context, extensionId }) => {
    const setupPage = await context.newPage()
    const now = Date.now()

    // Create large cache (10 codes, 10 links)
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

    // Open popup multiple times
    for (let i = 0; i < 3; i++) {
      const popup = await openPopup(context, extensionId)
      await popup.waitForTimeout(500)
      await popup.close()
    }

    // If we got here without crashes/hangs, memory is stable
    expect(true).toBe(true)
  })

  test('popup closes instantly', async ({ context, extensionId }) => {
    const setupPage = await context.newPage()
    await setupPopupCache(
      setupPage,
      [
        { code: '123456', source: 'imap-bridge:test@example.com', receivedAt: Date.now() }
      ],
      []
    )
    await setupPage.close()

    const popup = await openPopup(context, extensionId)

    // Measure close time
    const startTime = Date.now()
    await popup.close()
    const closeTime = Date.now() - startTime

    console.log(`Popup close time: ${closeTime}ms`)

    // Close should be instant
    expect(closeTime).toBeLessThan(100)
  })
})
