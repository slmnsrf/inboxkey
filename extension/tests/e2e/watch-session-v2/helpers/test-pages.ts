/**
 * Test Page Configurations for Watch Session V2 E2E Tests
 *
 * Provides HTML templates and page utilities for creating test scenarios
 * with various field configurations and behaviors.
 */

import type { Page } from '@playwright/test'

/**
 * HTML template for a basic OTP input field
 */
export const BASIC_OTP_PAGE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Test - Basic OTP</title>
</head>
<body>
  <h1>Verification Code</h1>
  <form>
    <label for="otp">Enter your code:</label>
    <input
      type="text"
      id="otp"
      name="otp"
      autocomplete="one-time-code"
      inputmode="numeric"
      maxlength="6"
      placeholder="000000"
    />
    <button type="submit">Verify</button>
  </form>
</body>
</html>
`

/**
 * HTML template for a readonly OTP field (clipboard fallback test)
 */
export const READONLY_OTP_PAGE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Test - Readonly OTP</title>
</head>
<body>
  <h1>Verification Code (Readonly)</h1>
  <form>
    <label for="otp">Code:</label>
    <input
      type="text"
      id="otp"
      name="otp"
      autocomplete="one-time-code"
      inputmode="numeric"
      maxlength="6"
      readonly
    />
    <button type="submit">Verify</button>
  </form>
</body>
</html>
`

/**
 * HTML template for a disabled OTP field (should not trigger watch)
 */
export const DISABLED_OTP_PAGE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Test - Disabled OTP</title>
</head>
<body>
  <h1>Verification Code (Disabled)</h1>
  <form>
    <label for="otp">Code:</label>
    <input
      type="text"
      id="otp"
      name="otp"
      autocomplete="one-time-code"
      inputmode="numeric"
      maxlength="6"
      disabled
    />
    <button type="submit">Verify</button>
  </form>
</body>
</html>
`

/**
 * HTML template for alphanumeric OTP field (8-character code)
 */
export const ALPHANUMERIC_OTP_PAGE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Test - Alphanumeric OTP</title>
</head>
<body>
  <h1>Verification Code</h1>
  <form>
    <label for="otp">Enter your code:</label>
    <input
      type="text"
      id="otp"
      name="otp"
      autocomplete="one-time-code"
      maxlength="8"
      placeholder="ABC12345"
    />
    <button type="submit">Verify</button>
  </form>
</body>
</html>
`

/**
 * HTML template for dynamic field injection (appears after delay)
 */
export const DYNAMIC_OTP_PAGE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Test - Dynamic OTP</title>
</head>
<body>
  <h1>2FA Verification</h1>
  <button id="request-code">Request Code</button>
  <div id="otp-container"></div>

  <script>
    document.getElementById('request-code').addEventListener('click', () => {
      setTimeout(() => {
        const container = document.getElementById('otp-container')
        container.innerHTML = \`
          <form>
            <label for="otp">Enter code:</label>
            <input
              type="text"
              id="otp"
              name="otp"
              autocomplete="one-time-code"
              inputmode="numeric"
              maxlength="6"
            />
            <button type="submit">Verify</button>
          </form>
        \`
      }, 500)
    })
  </script>
</body>
</html>
`

/**
 * HTML template for multiple OTP fields (confidence scoring test)
 */
export const MULTIPLE_OTP_PAGE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Test - Multiple Fields</title>
</head>
<body>
  <h1>Multiple Input Fields</h1>

  <!-- High confidence: explicit OTP field -->
  <form>
    <label for="verification-code">Verification Code:</label>
    <input
      type="text"
      id="verification-code"
      name="code"
      autocomplete="one-time-code"
      inputmode="numeric"
      maxlength="6"
    />
  </form>

  <!-- Low confidence: generic text field -->
  <form>
    <label for="regular-input">Regular Input:</label>
    <input
      type="text"
      id="regular-input"
      name="text"
      maxlength="50"
    />
  </form>
</body>
</html>
`

/**
 * HTML template with Shadow DOM OTP field
 */
export const SHADOW_DOM_OTP_PAGE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Test - Shadow DOM OTP</title>
</head>
<body>
  <h1>Shadow DOM Verification</h1>
  <div id="shadow-host"></div>

  <script>
    const host = document.getElementById('shadow-host')
    const shadow = host.attachShadow({ mode: 'open' })
    shadow.innerHTML = \`
      <form>
        <label for="otp">Verification Code:</label>
        <input
          type="text"
          id="otp"
          name="otp"
          autocomplete="one-time-code"
          inputmode="numeric"
          maxlength="6"
        />
        <button type="submit">Verify</button>
      </form>
    \`
  </script>
</body>
</html>
`

/**
 * Site configurations for domain affinity testing
 */
export interface TestSite {
  domain: string
  url: string
  pageTemplate: string
  exactMatchSender: string
  aliasSender?: string
  tokenKeywords?: string[]
}

export const TEST_SITES: Record<string, TestSite> = {
  github: {
    domain: 'github.com',
    url: 'https://github.com/login/verify',
    pageTemplate: BASIC_OTP_PAGE,
    exactMatchSender: 'noreply@github.com',
    aliasSender: 'noreply@github.github.io',
    tokenKeywords: ['github', 'verification'],
  },
  dropbox: {
    domain: 'dropbox.com',
    url: 'https://www.dropbox.com/login/verify',
    pageTemplate: BASIC_OTP_PAGE,
    exactMatchSender: 'no-reply@dropbox.com',
    aliasSender: 'no-reply@dropboxmail.com',
    tokenKeywords: ['dropbox', 'security'],
  },
  battlestategames: {
    domain: 'battlestategames.com',
    url: 'https://www.battlestategames.com/verify',
    pageTemplate: BASIC_OTP_PAGE,
    exactMatchSender: 'noreply@battlestategames.com',
    tokenKeywords: ['tarkov', 'escape', 'eft', 'battlestate'],
  },
  generic: {
    domain: 'example.com',
    url: 'https://example.com/verify',
    pageTemplate: BASIC_OTP_PAGE,
    exactMatchSender: 'noreply@example.com',
  },
}

/**
 * Load a test page with specific configuration
 */
export async function loadTestPage(
  page: Page,
  htmlTemplate: string,
  siteUrl?: string
): Promise<void> {
  // Set content using data URL for proper context
  const dataUrl = `data:text/html,${encodeURIComponent(htmlTemplate)}`
  await page.goto(dataUrl, { waitUntil: 'load' })

  // If siteUrl provided, override the location for domain affinity testing
  if (siteUrl) {
    await page.evaluate((url) => {
      // Override location.href for domain detection
      Object.defineProperty(window.location, 'href', {
        value: url,
        writable: true,
        configurable: true
      })
      Object.defineProperty(window.location, 'hostname', {
        value: new URL(url).hostname,
        writable: true,
        configurable: true
      })
    }, siteUrl)
  }

  // Wait for page to be fully ready
  await page.waitForLoadState('domcontentloaded')
}

/**
 * Create a test page with custom field attributes
 */
export function createCustomOtpPage(config: {
  id?: string
  maxLength?: number
  inputMode?: string
  type?: string
  pattern?: string
  readonly?: boolean
  disabled?: boolean
}): string {
  const {
    id = 'otp',
    maxLength,
    inputMode,
    type = 'text',
    pattern,
    readonly = false,
    disabled = false
  } = config

  const attrs: string[] = [
    `type="${type}"`,
    `id="${id}"`,
    `name="${id}"`,
    'autocomplete="one-time-code"'
  ]

  if (maxLength) attrs.push(`maxlength="${maxLength}"`)
  if (inputMode) attrs.push(`inputmode="${inputMode}"`)
  if (pattern) attrs.push(`pattern="${pattern}"`)
  if (readonly) attrs.push('readonly')
  if (disabled) attrs.push('disabled')

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Test - Custom OTP</title>
</head>
<body>
  <h1>Verification Code</h1>
  <form>
    <label for="${id}">Enter your code:</label>
    <input ${attrs.join(' ')} />
    <button type="submit">Verify</button>
  </form>
</body>
</html>
  `
}
