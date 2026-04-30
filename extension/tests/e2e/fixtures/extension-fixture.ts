/**
 * Playwright fixtures for loading the InboxKey extension
 */

import { test as base, chromium, type BrowserContext, type Page } from '@playwright/test'
import * as path from 'path'

interface ExtensionFixtures {
  context: BrowserContext
  extensionId: string
  backgroundPage: Page
  popupPage: Page
}

/**
 * Extended test fixture that loads the InboxKey extension
 */
export const test = base.extend<ExtensionFixtures>({
  // Override context to load extension
  context: async ({}, use) => {
    const pathToExtension = path.join(__dirname, '../../../build/chrome-mv3-prod')

    // Launch browser with extension loaded
    const context = await chromium.launchPersistentContext('', {
      headless: false, // Extensions don't work in headless mode
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
      // Disable some security features for testing
      bypassCSP: true,
    })

    await use(context)
    await context.close()
  },

  // Get the extension ID
  extensionId: async ({ context }, use) => {
    // Give extension time to load
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Get all service workers
    let [background] = context.serviceWorkers()
    if (!background) {
      // Wait for service worker to be ready
      background = await context.waitForEvent('serviceworker')
    }

    const extensionId = background.url().split('/')[2]
    console.log('[ExtensionFixture] Extension ID:', extensionId)

    await use(extensionId)
  },

  // Get the background service worker page
  // For MV3, we create an offscreen document page to access chrome APIs
  backgroundPage: async ({ context, extensionId }, use) => {
    // Wait for service worker to be ready
    let [background] = context.serviceWorkers()
    if (!background) {
      background = await context.waitForEvent('serviceworker')
    }

    // Create a simple HTML page in extension context to access chrome APIs
    // We'll use a blank page that navigates to the extension's context
    const bgPage = await context.newPage()

    // Navigate to extension's options page or create a minimal HTML page
    // For now, we'll use the popup page which has access to chrome APIs
    await bgPage.goto(`chrome-extension://${extensionId}/popup.html`)

    await use(bgPage)
    await bgPage.close()
  },

  // Get the popup page
  popupPage: async ({ context, extensionId }, use) => {
    const popupPage = await context.newPage()
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`)

    await use(popupPage)
    await popupPage.close()
  },
})

export { expect } from '@playwright/test'
