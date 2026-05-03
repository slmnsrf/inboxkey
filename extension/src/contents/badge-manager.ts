/**
 * Badge Manager
 *
 * Manages extension icon badge states for visual feedback.
 *
 * Badge Priority (highest to lowest):
 * 1. Watch Session States (listening, success, no-code) - active user flow
 * 2. Critical Errors (sync failure, auth expired) - requires immediate attention
 * 3. Informational (code count) - ambient awareness
 * 4. Idle (no badge) - default state
 *
 * States:
 * - listening: Animated dots (· → ·· → ···) indicating active polling
 * - success: 'OK' text indicating code found
 * - no-code: Orange exclamation (!) indicating timeout
 * - sync-error: 'X' text indicating persistent sync failure
 * - count: Number (1, 2, 3...) indicating available codes
 * - idle: No badge
 *
 * @module badge-manager
 */

export const config = {
  matches: ["https://*/*"],
}

import {
  COLOR_PRIMARY,
  COLOR_SUCCESS,
  COLOR_WARNING,
  COLOR_ERROR,
  DURATION_NORMAL,
} from '@/lib/design-tokens'

/**
 * Badge priority levels (higher = more important)
 */
export enum BadgePriority {
  IDLE = 0,
  COUNT = 1,
  SYNC_ERROR = 2,
  NO_CODE = 3,
  SUCCESS = 3,
  LISTENING = 3,
}

/**
 * Current badge state for priority management
 */
let currentBadgePriority: BadgePriority = BadgePriority.IDLE

/**
 * Badge state colors
 */
const COLORS = {
  listening: COLOR_PRIMARY, // Primary blue for progress indication
  success: COLOR_SUCCESS,   // Success green for completion
  noCode: COLOR_WARNING,    // Warning amber for timeout
  syncError: COLOR_ERROR,   // Error red for critical failures
  count: COLOR_PRIMARY,     // Primary blue for informational count
} as const

/**
 * Animation configuration for listening state
 */
const ANIMATION = {
  frames: ['·', '··', '···'],
  intervalMs: DURATION_NORMAL, // 300ms for consistent timing with design system
} as const

/**
 * Auto-dismiss timers (ms) -- badge clears itself after this delay.
 * Matches the chip auto-dismiss timings in field-feedback.ts.
 */
const AUTO_DISMISS_MS = {
  success: 3000,    // 3s -- matches chip filled dismiss
  noCode: 4000,     // 4s -- matches chip timeout dismiss
  syncError: 15000, // 15s -- actionable but shouldn't persist forever
} as const

/**
 * Global state for animation and auto-dismiss management
 */
let animationInterval: ReturnType<typeof setInterval> | null = null
let autoDismissTimer: ReturnType<typeof setTimeout> | null = null
let isAnimating = false // Track if listening animation is active

/**
 * Clear any running animation interval
 */
function stopAnimation(): void {
  if (animationInterval !== null) {
    clearInterval(animationInterval)
    animationInterval = null
  }
  isAnimating = false // Clear animation flag when stopping
}

/**
 * Schedule auto-dismiss: clears badge after a delay.
 * Cancels any previous auto-dismiss timer.
 */
function scheduleAutoDismiss(delayMs: number): void {
  if (autoDismissTimer !== null) {
    clearTimeout(autoDismissTimer)
  }
  autoDismissTimer = setTimeout(() => {
    autoDismissTimer = null
    clearBadge()
  }, delayMs)
}

/**
 * Check if chrome.action API is available
 *
 * @returns true if the API is available, false otherwise
 */
function isActionApiAvailable(): boolean {
  return (
    typeof chrome !== 'undefined' &&
    chrome.action !== undefined &&
    typeof chrome.action.setBadgeText === 'function' &&
    typeof chrome.action.setBadgeBackgroundColor === 'function'
  )
}

/**
 * Set badge text safely
 *
 * @param text - Badge text to display
 */
function setBadgeText(text: string): void {
  if (!isActionApiAvailable()) {
    console.warn('[BadgeManager] chrome.action API not available')
    return
  }

  try {
    chrome.action.setBadgeText({ text })
  } catch (error) {
    console.warn('[BadgeManager] Failed to set badge text:', error)
  }
}

/**
 * Set badge background color safely
 *
 * @param color - Badge background color (hex format)
 */
function setBadgeBackgroundColor(color: string): void {
  if (!isActionApiAvailable()) {
    console.warn('[BadgeManager] chrome.action API not available')
    return
  }

  try {
    chrome.action.setBadgeBackgroundColor({ color })
  } catch (error) {
    console.warn('[BadgeManager] Failed to set badge background color:', error)
  }
}

/**
 * Check if badge update is allowed based on priority
 *
 * @param requestedPriority - Priority of the badge being set
 * @returns true if update is allowed, false if blocked by higher priority badge
 */
function canSetBadge(requestedPriority: BadgePriority): boolean {
  return requestedPriority >= currentBadgePriority
}

/**
 * Set badge to listening state with animated dots
 *
 * Cycles through "·" → "··" → "···" every 300ms to indicate active polling.
 * Respects user's reduced-motion preference (WCAG 2.1 SC 2.3.3).
 * Stops any previous animation before starting new one.
 *
 * @public
 */
export function setBadgeListening(): void {
  if (!canSetBadge(BadgePriority.LISTENING)) {
    return // Higher priority badge is active
  }

  // Skip if already animating to prevent restart
  if (isAnimating) {
    console.log('[BadgeManager] Already listening, animation continues')
    return
  }

  stopAnimation()

  if (!isActionApiAvailable()) {
    console.warn('[BadgeManager] chrome.action API not available for listening badge')
    return
  }

  currentBadgePriority = BadgePriority.LISTENING
  isAnimating = true // Set flag before animation starts

  // Set color
  setBadgeBackgroundColor(COLORS.listening)

  // Check reduced-motion preference for accessibility
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  if (prefersReducedMotion) {
    // Static badge for users who prefer reduced motion
    setBadgeText('···')
    return
  }

  // Animated badge for users without motion preference
  let frameIndex = 0
  setBadgeText(ANIMATION.frames[frameIndex])

  // Start animation
  animationInterval = setInterval(() => {
    frameIndex = (frameIndex + 1) % ANIMATION.frames.length
    setBadgeText(ANIMATION.frames[frameIndex])
  }, ANIMATION.intervalMs)
}

/**
 * Set badge to success state
 *
 * Displays 'OK' text to indicate code was found successfully.
 * Stops any running animation.
 *
 * @public
 */
export function setBadgeSuccess(): void {
  if (!canSetBadge(BadgePriority.SUCCESS)) {
    return // Higher priority badge is active
  }

  stopAnimation()
  isAnimating = false // Explicit flag clear

  if (!isActionApiAvailable()) {
    console.warn('[BadgeManager] chrome.action API not available for success badge')
    return
  }

  currentBadgePriority = BadgePriority.SUCCESS

  setBadgeBackgroundColor(COLORS.success)
  setBadgeText('OK')
  scheduleAutoDismiss(AUTO_DISMISS_MS.success)
}

/**
 * Set badge to no-code state
 *
 * Displays an amber exclamation mark (!) to indicate timeout or no code found.
 * Stops any running animation.
 *
 * @public
 */
export function setBadgeNoCode(): void {
  if (!canSetBadge(BadgePriority.NO_CODE)) {
    return // Higher priority badge is active
  }

  stopAnimation()
  isAnimating = false // Explicit flag clear

  if (!isActionApiAvailable()) {
    console.warn('[BadgeManager] chrome.action API not available for no-code badge')
    return
  }

  currentBadgePriority = BadgePriority.NO_CODE

  setBadgeBackgroundColor(COLORS.noCode)
  setBadgeText('!')
  scheduleAutoDismiss(AUTO_DISMISS_MS.noCode)
}

/**
 * Set badge to code count
 *
 * Displays a numeric count (1, 2, 3...) indicating available unread codes.
 * Lower priority than watch session states and errors.
 *
 * @param count - Number of unseen codes (0 clears badge)
 * @public
 */
export function setBadgeCount(count: number): void {
  if (count === 0) {
    // If current badge is count badge, clear it
    if (currentBadgePriority === BadgePriority.COUNT) {
      clearBadge()
    }
    return
  }

  if (!canSetBadge(BadgePriority.COUNT)) {
    return // Higher priority badge is active
  }

  stopAnimation()
  isAnimating = false // Explicit flag clear

  if (!isActionApiAvailable()) {
    console.warn('[BadgeManager] chrome.action API not available for count badge')
    return
  }

  currentBadgePriority = BadgePriority.COUNT

  setBadgeBackgroundColor(COLORS.count)
  setBadgeText(count.toString())
}

/**
 * Set badge to sync error state
 *
 * Displays 'X' text to indicate persistent sync failure.
 * Higher priority than count badge, lower than watch session states.
 *
 * @public
 */
export function setBadgeSyncError(): void {
  if (!canSetBadge(BadgePriority.SYNC_ERROR)) {
    return // Higher priority badge is active (watch session)
  }

  stopAnimation()
  isAnimating = false // Explicit flag clear

  if (!isActionApiAvailable()) {
    console.warn('[BadgeManager] chrome.action API not available for sync error badge')
    return
  }

  currentBadgePriority = BadgePriority.SYNC_ERROR

  setBadgeBackgroundColor(COLORS.syncError)
  setBadgeText('X')
  scheduleAutoDismiss(AUTO_DISMISS_MS.syncError)
}

/**
 * Clear badge back to idle state
 *
 * Removes badge text and stops any running animation.
 * Returns extension icon to default appearance.
 * Resets priority to IDLE, allowing any badge to be set.
 *
 * @public
 */
export function clearBadge(): void {
  stopAnimation()
  isAnimating = false // Explicit flag clear
  if (autoDismissTimer !== null) {
    clearTimeout(autoDismissTimer)
    autoDismissTimer = null
  }

  // Always reset priority to IDLE, even if API unavailable
  // This ensures tests can reset state properly
  currentBadgePriority = BadgePriority.IDLE

  if (!isActionApiAvailable()) {
    console.warn('[BadgeManager] chrome.action API not available for clearing badge')
    return
  }

  setBadgeText('')
}
