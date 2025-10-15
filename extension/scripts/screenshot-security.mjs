import { chromium } from 'playwright'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function captureSecurityScreenshots() {
  const extensionPath = path.join(__dirname, '../build/chrome-mv3-prod')

  console.log('Launching browser with extension from:', extensionPath)

  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ],
    viewport: { width: 1280, height: 900 },
    colorScheme: 'light',
  })

  try {
    const page = await context.newPage()

    // Navigate to chrome://extensions to get the extension ID
    console.log('Getting extension ID...')
    await page.goto('chrome://extensions/')
    await page.waitForTimeout(2000)

    // Enable developer mode to see extension IDs
    const devModeToggle = await page.locator('#devMode').elementHandle()
    if (devModeToggle) {
      await devModeToggle.click()
      await page.waitForTimeout(500)
    }

    // Get the extension ID from the page
    const extensionId = await page.evaluate(() => {
      const cards = document.querySelectorAll('extensions-item')
      for (const card of cards) {
        const name = card.shadowRoot?.querySelector('#name-and-version')?.textContent
        if (name?.includes('InboxKey')) {
          return card.getAttribute('id')
        }
      }
      return null
    })

    if (!extensionId) {
      console.log('Could not find extension ID, trying manifest approach...')
      // Read manifest to get the extension name and try a different approach
      const pages = await context.pages()
      for (const p of pages) {
        const url = p.url()
        if (url.startsWith('chrome-extension://')) {
          const match = url.match(/chrome-extension:\/\/([a-z]+)/)
          if (match) {
            console.log('Found extension ID from URL:', match[1])
            await navigateAndScreenshot(page, match[1])
            return
          }
        }
      }

      throw new Error('Could not determine extension ID')
    }

    console.log('Found extension ID:', extensionId)
    await navigateAndScreenshot(page, extensionId)

  } finally {
    await context.close()
  }
}

async function navigateAndScreenshot(page, extensionId) {
  // Navigate to options page using extension ID
  const optionsUrl = `chrome-extension://${extensionId}/options.html`
  console.log('Navigating to:', optionsUrl)
  await page.goto(optionsUrl)
  await page.waitForTimeout(2000)

  // Click on Security tab
  console.log('Clicking Security tab...')
  await page.click('text=Security')
  await page.waitForTimeout(1000)

  // Light mode screenshot
  console.log('Capturing light mode screenshot...')
  await page.screenshot({
    path: path.join(__dirname, '../../security-light.png'),
    fullPage: true
  })

  // Switch to dark mode
  console.log('Switching to dark mode...')
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.waitForTimeout(1000)

  // Dark mode screenshot
  console.log('Capturing dark mode screenshot...')
  await page.screenshot({
    path: path.join(__dirname, '../../security-dark.png'),
    fullPage: true
  })

  console.log('✅ Screenshots saved!')
  console.log('  - security-light.png')
  console.log('  - security-dark.png')
}

captureSecurityScreenshots().catch(console.error)
