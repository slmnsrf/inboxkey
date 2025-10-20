/**
 * Badge Manager
 *
 * Manages extension icon badge states for visual feedback during watch sessions.
 *
 * States:
 * - idle: No badge (default state)
 * - listening: Animated dots (· → ·· → ···) indicating active polling
 * - success: Green checkmark (✓) indicating code found
 * - no_code: Orange exclamation (!) indicating timeout/no code found
 *
 * @module badge-manager
 */

/**
 * Badge state colors
 */
const COLORS = {
  listening: '#2196F3', // Blue
  success: '#4CAF50',   // Green
  noCode: '#FF9800',    // Orange
} as const

/**
 * Animation configuration for listening state
 */
const ANIMATION = {
  frames: ['·', '··', '···'],
  intervalMs: 400,
} as const

/**
 * Global state for animation management
 */
let animationInterval: ReturnType<typeof setInterval> | null = null

/**
 * Clear any running animation interval
 */
function stopAnimation(): void {
  if (animationInterval !== null) {
    clearInterval(animationInterval)
    animationInterval = null
  }
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
    console.error('[BadgeManager] Failed to set badge text:', error)
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
    console.error('[BadgeManager] Failed to set badge background color:', error)
  }
}

/**
 * Set badge to listening state with animated dots
 *
 * Cycles through "·" → "··" → "···" every 400ms to indicate active polling.
 * Stops any previous animation before starting new one.
 *
 * @public
 */
export function setBadgeListening(): void {
  stopAnimation()

  if (!isActionApiAvailable()) {
    console.warn('[BadgeManager] chrome.action API not available for listening badge')
    return
  }

  // Set initial state
  setBadgeBackgroundColor(COLORS.listening)

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
 * Displays a green checkmark (✓) to indicate code was found successfully.
 * Stops any running animation.
 *
 * @public
 */
export function setBadgeSuccess(): void {
  stopAnimation()

  if (!isActionApiAvailable()) {
    console.warn('[BadgeManager] chrome.action API not available for success badge')
    return
  }

  setBadgeBackgroundColor(COLORS.success)
  setBadgeText('✓')
}

/**
 * Set badge to no-code state
 *
 * Displays an orange exclamation mark (!) to indicate timeout or no code found.
 * Stops any running animation.
 *
 * @public
 */
export function setBadgeNoCode(): void {
  stopAnimation()

  if (!isActionApiAvailable()) {
    console.warn('[BadgeManager] chrome.action API not available for no-code badge')
    return
  }

  setBadgeBackgroundColor(COLORS.noCode)
  setBadgeText('!')
}

/**
 * Clear badge back to idle state
 *
 * Removes badge text and stops any running animation.
 * Returns extension icon to default appearance.
 *
 * @public
 */
export function clearBadge(): void {
  stopAnimation()

  if (!isActionApiAvailable()) {
    console.warn('[BadgeManager] chrome.action API not available for clearing badge')
    return
  }

  setBadgeText('')
}
