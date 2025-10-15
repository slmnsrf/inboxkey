/**
 * Popup E2E Test Helpers
 *
 * Utility functions for testing the popup with real Chrome APIs.
 */

import type { Page, BrowserContext } from '@playwright/test'
import type { PopupCacheCode, PopupCacheMagicLink, PopupCache } from '../../../src/shared/popup-messages'

/**
 * Open the popup and return the popup page.
 */
export async function openPopup(
  context: BrowserContext,
  extensionId: string
): Promise<Page> {
  const popupUrl = `chrome-extension://${extensionId}/popup.html`
  const page = await context.newPage()
  await page.goto(popupUrl)

  // Wait for the popup container to be ready
  await page.waitForSelector('.popup-container, .popup-locked, .popup-loading', { timeout: 5000 })

  return page
}

/**
 * Set up mock popup cache data in chrome.storage.session.
 * This simulates data that the background worker would cache.
 */
export async function setupPopupCache(
  page: Page,
  codes: Array<{ code: string; source: string; receivedAt: number; usedAt?: number }>,
  links: Array<{ url: string; type: 'login' | 'verify' | 'reset'; source: string; receivedAt: number; openedAt?: number }>
): Promise<void> {
  await page.evaluate(
    ({ codes, links }) => {
      const cache = {
        codes: codes.map(c => ({
          code: c.code,
          source: c.source,
          receivedAt: c.receivedAt,
          usedAt: c.usedAt
        })),
        magicLinks: links.map(l => ({
          url: l.url,
          type: l.type,
          source: l.source,
          receivedAt: l.receivedAt,
          openedAt: l.openedAt
        })),
        lastSync: Date.now(),
        mailboxCount: 1
      }

      return chrome.storage.session.set({
        'inboxkey.popup_cache': cache
      })
    },
    { codes, links }
  )
}

/**
 * Get clipboard contents.
 * Note: This requires clipboard-read permission in the test context.
 */
export async function getClipboard(page: Page): Promise<string> {
  return page.evaluate(() => navigator.clipboard.readText())
}

/**
 * Wait for toast to appear with specific message.
 */
export async function waitForToast(page: Page, message: string, timeout = 5000): Promise<void> {
  await page.waitForSelector(`.toast-message:has-text("${message}")`, { timeout })
}

/**
 * Wait for toast to disappear.
 */
export async function waitForToastToDisappear(page: Page, timeout = 5000): Promise<void> {
  await page.waitForSelector('.toast-message', { state: 'hidden', timeout })
}

/**
 * Set lock status via chrome.storage.local.
 */
export async function setLockStatus(page: Page, locked: boolean): Promise<void> {
  await page.evaluate(
    (isLocked) => {
      return chrome.storage.local.set({
        'inboxkey.locked': isLocked
      })
    },
    locked
  )
}

/**
 * Get current popup cache from chrome.storage.session.
 */
export async function getPopupCache(page: Page): Promise<PopupCache | null> {
  return page.evaluate(() => {
    return chrome.storage.session.get('inboxkey.popup_cache').then(result => {
      return result['inboxkey.popup_cache'] || null
    })
  })
}

/**
 * Clear popup cache.
 */
export async function clearPopupCache(page: Page): Promise<void> {
  await page.evaluate(() => {
    return chrome.storage.session.remove('inboxkey.popup_cache')
  })
}

/**
 * Wait for a specific number of open tabs.
 */
export async function waitForTabCount(context: BrowserContext, count: number, timeout = 5000): Promise<void> {
  const startTime = Date.now()
  while (Date.now() - startTime < timeout) {
    const pages = context.pages()
    if (pages.length === count) {
      return
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`Timeout waiting for ${count} tabs. Current: ${context.pages().length}`)
}

/**
 * Get code button element by code value.
 */
export async function getCodeButton(page: Page, code: string) {
  return page.locator(`.item-card[data-kind="code"]:has-text("${code}") button`)
}

/**
 * Get link button element by URL.
 */
export async function getLinkButton(page: Page, urlFragment: string) {
  return page.locator(`.item-card[data-kind="link"]:has-text("${urlFragment}") button`)
}

/**
 * Check if popup shows empty state for codes.
 */
export async function hasEmptyCodesState(page: Page): Promise<boolean> {
  return page.locator('text=No verification codes yet').isVisible()
}

/**
 * Check if popup shows empty state for links.
 */
export async function hasEmptyLinksState(page: Page): Promise<boolean> {
  return page.locator('text=No magic links yet').isVisible()
}

/**
 * Get all visible code elements.
 */
export async function getVisibleCodes(page: Page) {
  return page.locator('.item-card[data-kind="code"]').all()
}

/**
 * Get all visible link elements.
 */
export async function getVisibleLinks(page: Page) {
  return page.locator('.item-card[data-kind="link"]').all()
}

/**
 * Measure popup load time.
 * Returns time in milliseconds from navigation to content visible.
 */
export async function measurePopupLoadTime(
  context: BrowserContext,
  extensionId: string
): Promise<number> {
  const popupUrl = `chrome-extension://${extensionId}/popup.html`
  const page = await context.newPage()

  const startTime = Date.now()
  await page.goto(popupUrl)

  // Wait for content to be visible (either popup container or loading skeleton)
  await page.waitForSelector('.popup-container, .popup-loading', { timeout: 5000 })

  const loadTime = Date.now() - startTime

  await page.close()

  return loadTime
}
