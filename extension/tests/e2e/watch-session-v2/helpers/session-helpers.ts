/**
 * Watch Session Helpers for E2E Tests
 *
 * Utilities for interacting with watch sessions, chip UI, badge state,
 * and session lifecycle in end-to-end tests.
 */

import type { Page } from '@playwright/test'

export type ChipState = 'listening' | 'filled' | 'copied' | 'timeout' | 'hidden'
export type BadgeState = 'idle' | 'listening' | 'success' | 'no-code'

/**
 * Wait for watch session to start
 */
export async function waitForSessionStart(
  page: Page,
  timeout = 5000
): Promise<void> {
  await page.waitForSelector('.inboxkey-chip', { timeout, state: 'visible' })
}

/**
 * Get current chip state
 */
export async function getChipState(page: Page): Promise<ChipState> {
  const isVisible = await page.isVisible('.inboxkey-chip')
  if (!isVisible) {
    return 'hidden'
  }

  const state = await page.getAttribute('.inboxkey-chip', 'data-state')
  if (!state) {
    return 'hidden'
  }

  return state as ChipState
}

/**
 * Wait for chip to transition to specific state
 */
export async function waitForChipState(
  page: Page,
  expectedState: ChipState,
  timeout = 10000
): Promise<void> {
  if (expectedState === 'hidden') {
    await page.waitForSelector('.inboxkey-chip', { state: 'hidden', timeout })
  } else {
    await page.waitForSelector(`.inboxkey-chip[data-state="${expectedState}"]`, {
      timeout,
      state: 'visible'
    })
  }
}

/**
 * Get chip text content
 */
export async function getChipText(page: Page): Promise<string | null> {
  const isVisible = await page.isVisible('.inboxkey-chip')
  if (!isVisible) {
    return null
  }

  const text = await page.textContent('.inboxkey-chip-text')
  return text
}

/**
 * Dismiss chip with ESC key
 */
export async function dismissChipWithEsc(page: Page): Promise<void> {
  await page.keyboard.press('Escape')
  await page.waitForSelector('.inboxkey-chip', { state: 'hidden', timeout: 2000 })
}

/**
 * Check if chip is visible
 */
export async function isChipVisible(page: Page): Promise<boolean> {
  return await page.isVisible('.inboxkey-chip')
}

/**
 * Get current badge state from extension
 */
export async function getBadgeState(
  backgroundPage: Page
): Promise<BadgeState> {
  const badgeText = await backgroundPage.evaluate(async () => {
    return new Promise<string>((resolve) => {
      chrome.action.getBadgeText({}, (text) => {
        resolve(text || '')
      })
    })
  })

  // Map badge text to state
  if (!badgeText || badgeText === '') {
    return 'idle'
  }

  if (badgeText === '·' || badgeText === '··' || badgeText === '···') {
    return 'listening'
  }

  if (badgeText === '✓') {
    return 'success'
  }

  if (badgeText === '!') {
    return 'no-code'
  }

  return 'idle'
}

/**
 * Wait for badge to transition to specific state
 */
export async function waitForBadgeState(
  backgroundPage: Page,
  expectedState: BadgeState,
  timeout = 5000
): Promise<void> {
  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    const currentState = await getBadgeState(backgroundPage)
    if (currentState === expectedState) {
      return
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  throw new Error(`Badge did not reach state "${expectedState}" within ${timeout}ms`)
}

/**
 * Verify chip auto-dismisses after timeout
 */
export async function verifyChipAutoDismiss(
  page: Page,
  expectedDismissTimeMs = 5000,
  tolerance = 1000
): Promise<void> {
  const startTime = Date.now()

  // Wait for chip to disappear
  await page.waitForSelector('.inboxkey-chip', {
    state: 'hidden',
    timeout: expectedDismissTimeMs + tolerance + 1000
  })

  const elapsed = Date.now() - startTime

  // Verify timing is within tolerance
  const lowerBound = expectedDismissTimeMs - tolerance
  const upperBound = expectedDismissTimeMs + tolerance

  if (elapsed < lowerBound || elapsed > upperBound) {
    throw new Error(
      `Chip dismissed at ${elapsed}ms, expected ${expectedDismissTimeMs}ms ± ${tolerance}ms`
    )
  }
}

/**
 * Get ARIA live region text
 */
export async function getAriaLiveText(page: Page): Promise<string | null> {
  const text = await page.textContent('.inboxkey-chip [role="status"]')
  return text
}

/**
 * Verify ARIA live region attributes
 */
export async function verifyAriaLiveRegion(
  page: Page
): Promise<{ valid: boolean; issues: string[] }> {
  const issues: string[] = []

  // Check for role="status"
  const roleStatus = await page.getAttribute('.inboxkey-chip [role="status"]', 'role')
  if (roleStatus !== 'status') {
    issues.push('Missing role="status" on live region')
  }

  // Check for aria-live="polite"
  const ariaLive = await page.getAttribute('.inboxkey-chip [role="status"]', 'aria-live')
  if (ariaLive !== 'polite') {
    issues.push('Missing aria-live="polite" on live region')
  }

  // Check main chip has role and aria-live
  const chipRole = await page.getAttribute('.inboxkey-chip', 'role')
  if (!chipRole) {
    issues.push('Missing role attribute on chip')
  }

  const chipAriaLive = await page.getAttribute('.inboxkey-chip', 'aria-live')
  if (!chipAriaLive) {
    issues.push('Missing aria-live attribute on chip')
  }

  return {
    valid: issues.length === 0,
    issues
  }
}

/**
 * Enable reduced motion preference
 */
export async function enableReducedMotion(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' })
}

/**
 * Disable reduced motion preference
 */
export async function disableReducedMotion(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
}

/**
 * Verify chip animation respects reduced motion
 */
export async function verifyReducedMotionCompliance(
  page: Page
): Promise<boolean> {
  const chip = await page.$('.inboxkey-chip')
  if (!chip) {
    return false
  }

  const animationDuration = await page.evaluate((el) => {
    const styles = window.getComputedStyle(el)
    return styles.animationDuration
  }, chip)

  // Animation should be 0s or very short for reduced motion
  return animationDuration === '0s' || animationDuration === '0.1s'
}

/**
 * Start watch session by focusing field
 */
export async function startWatchByFocusing(
  page: Page,
  fieldSelector: string
): Promise<void> {
  await page.focus(fieldSelector)
  await waitForSessionStart(page)
}

/**
 * Simulate service worker restart
 */
export async function simulateServiceWorkerRestart(
  backgroundPage: Page
): Promise<void> {
  // Reload the extension to restart service worker
  await backgroundPage.evaluate(async () => {
    return new Promise<void>((resolve) => {
      chrome.runtime.reload()
      // Wait a bit for reload to complete
      setTimeout(() => resolve(), 1000)
    })
  })

  // Wait for service worker to reinitialize
  await new Promise(resolve => setTimeout(resolve, 2000))
}

/**
 * Verify session alarms are scheduled
 */
export async function getActiveAlarms(
  backgroundPage: Page
): Promise<string[]> {
  const alarms = await backgroundPage.evaluate(async () => {
    return new Promise<string[]>((resolve) => {
      chrome.alarms.getAll((alarms) => {
        resolve(alarms.map(a => a.name))
      })
    })
  })

  return alarms
}

/**
 * Wait for session to complete (filled or timeout)
 */
export async function waitForSessionComplete(
  page: Page,
  timeout = 20000
): Promise<'filled' | 'timeout'> {
  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    const state = await getChipState(page)

    if (state === 'filled') {
      return 'filled'
    }

    if (state === 'timeout') {
      return 'timeout'
    }

    await new Promise(resolve => setTimeout(resolve, 200))
  }

  throw new Error(`Session did not complete within ${timeout}ms`)
}
