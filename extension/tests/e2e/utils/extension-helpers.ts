/**
 * Helper utilities for working with Chrome extensions in Playwright tests
 */

import type { BrowserContext, Page } from '@playwright/test'

/**
 * Get the extension ID from the loaded extension
 */
export async function getExtensionId(context: BrowserContext): Promise<string> {
  // Wait for service worker to be available
  let [background] = context.serviceWorkers()
  if (!background) {
    background = await context.waitForEvent('serviceworker', { timeout: 10000 })
  }

  // Extract extension ID from service worker URL
  // Format: chrome-extension://{extensionId}/background.js
  const extensionId = background.url().split('/')[2]

  if (!extensionId || extensionId.length === 0) {
    throw new Error('Failed to extract extension ID from service worker URL')
  }

  return extensionId
}

/**
 * Get a handle to the background service worker page
 */
export async function getBackgroundPage(
  context: BrowserContext,
  extensionId: string
): Promise<Page> {
  // Service worker doesn't have a page handle in MV3
  // We can evaluate code via chrome.runtime messages or by creating a dedicated page
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/_generated_background_page.html`, {
    waitUntil: 'domcontentloaded',
  })
  return page
}

/**
 * Get a handle to the extension popup page
 */
export async function getPopupPage(
  context: BrowserContext,
  extensionId: string
): Promise<Page> {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/popup.html`, {
    waitUntil: 'domcontentloaded',
  })
  return page
}

/**
 * Get console logs from a page
 * @param includeErrors - Include console.error messages
 * @param includeWarnings - Include console.warn messages
 */
export async function getConsoleLogs(
  page: Page,
  options?: { includeErrors?: boolean; includeWarnings?: boolean }
): Promise<string[]> {
  const logs: string[] = []

  page.on('console', msg => {
    const type = msg.type()
    const text = msg.text()

    if (type === 'log') {
      logs.push(text)
    } else if (type === 'error' && options?.includeErrors) {
      logs.push(`[ERROR] ${text}`)
    } else if (type === 'warning' && options?.includeWarnings) {
      logs.push(`[WARN] ${text}`)
    }
  })

  return logs
}

/**
 * Wait for a console log message that matches a pattern
 */
export async function waitForConsoleLog(
  page: Page,
  pattern: string | RegExp,
  timeout = 5000
): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Timeout waiting for console log matching: ${pattern}`))
    }, timeout)

    const handler = (msg: any) => {
      const text = msg.text()
      const matches = typeof pattern === 'string'
        ? text.includes(pattern)
        : pattern.test(text)

      if (matches) {
        clearTimeout(timeoutId)
        page.off('console', handler)
        resolve(text)
      }
    }

    page.on('console', handler)
  })
}

/**
 * Execute code in the extension's content script context
 */
export async function executeInContentScript<T>(
  page: Page,
  fn: () => T
): Promise<T> {
  return await page.evaluate(fn)
}

/**
 * Inject a verification code into the extension's storage
 * This simulates receiving a code from email
 */
export async function injectCodeViaStorage(
  page: Page,
  code: string,
  siteUrl: string
): Promise<void> {
  await page.evaluate(
    ({ code, siteUrl }) => {
      const storedCode = {
        code,
        timestamp: Date.now(),
        source: 'E2E Test',
        siteMatch: siteUrl,
        used: false,
      }

      // Store in chrome.storage.local
      chrome.storage.local.get(['recent_codes'], (result) => {
        const codes = result.recent_codes || []
        codes.unshift(storedCode)
        chrome.storage.local.set({ recent_codes: codes })
      })
    },
    { code, siteUrl }
  )
}

/**
 * Check if a field has the data-inboxkey-watching attribute
 */
export async function isFieldWatched(page: Page, selector: string): Promise<boolean> {
  return await page.evaluate((sel) => {
    const field = document.querySelector(sel)
    return field?.getAttribute('data-inboxkey-watching') === 'true'
  }, selector)
}

/**
 * Check if a field has been filled by InboxKey
 */
export async function isFieldFilled(page: Page, selector: string): Promise<boolean> {
  return await page.evaluate((sel) => {
    const field = document.querySelector(sel)
    return field?.getAttribute('data-inboxkey-filled') === 'true'
  }, selector)
}

/**
 * Get the timestamp when field was filled
 */
export async function getFieldFillTimestamp(
  page: Page,
  selector: string
): Promise<number | null> {
  return await page.evaluate((sel) => {
    const field = document.querySelector(sel)
    const timestamp = field?.getAttribute('data-inboxkey-timestamp')
    return timestamp ? parseInt(timestamp, 10) : null
  }, selector)
}

/**
 * Wait for the extension to detect a field
 */
export async function waitForFieldDetection(
  page: Page,
  timeout = 5000
): Promise<void> {
  await page.waitForSelector('[data-inboxkey-watching="true"]', { timeout })
}

/**
 * Wait for the extension to autofill a field
 */
export async function waitForFieldAutofill(
  page: Page,
  timeout = 10000
): Promise<void> {
  await page.waitForSelector('[data-inboxkey-filled="true"]', { timeout })
}

/**
 * Get all detection signals from console logs
 */
export async function getDetectionSignals(page: Page): Promise<string[]> {
  const logs = await getConsoleLogs(page)
  return logs.filter(log => log.includes('Detection') || log.includes('confidence'))
}
