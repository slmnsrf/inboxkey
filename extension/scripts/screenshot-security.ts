import { chromium } from 'playwright'
import path from 'path'

async function captureSecurityScreenshots() {
  const extensionPath = path.join(__dirname, '../build/chrome-mv3-prod')

  const browser = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
    viewport: { width: 1280, height: 900 },
  })

  const page = await browser.newPage()

  // Navigate to options page
  await page.goto('chrome-extension://your-extension-id/options.html')

  // Wait for page to load
  await page.waitForTimeout(2000)

  // Click on Security tab
  const securityTab = page.locator('text=Security').first()
  await securityTab.click()
  await page.waitForTimeout(1000)

  // Light mode screenshot
  console.log('Capturing light mode screenshot...')
  await page.screenshot({
    path: 'security-light.png',
    fullPage: true
  })

  // Switch to dark mode by emulating color scheme
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.waitForTimeout(1000)

  // Dark mode screenshot
  console.log('Capturing dark mode screenshot...')
  await page.screenshot({
    path: 'security-dark.png',
    fullPage: true
  })

  console.log('Screenshots saved: security-light.png, security-dark.png')

  await browser.close()
}

captureSecurityScreenshots().catch(console.error)
