/**
 * URL Pattern Validator
 *
 * Rejects authentication setup/configuration pages based on URL patterns.
 * Runs as Layer 3 in Tier 1 (after cooldown, password rejection, before attribute matching).
 *
 * Performance: ~0.01ms (single regex test per field detection)
 */

// Setup/configuration URL patterns
export const SETUP_URL_PATTERNS = [
  /\/setup(?:\/|$)/i,
  /\/configure(?:\/|$)/i,
  /\/enable(?:\/|$)/i,
  /\/add(?:\/|$)/i,
  /\/enroll(?:\/|$)/i,
  /\/register(?:\/|$)/i,
  /\/2fa\/setup/i,
  /\/two.factor.*setup/i,
  /\/mfa\/setup/i,
  /\/authenticator\/setup/i,
  /\/security\/setup/i,
  /\/settings.*2fa.*setup/i,
  /\/settings.*authenticator/i,
]

// Allowlist: URLs that contain "setup" but are actually login pages
export const SETUP_URL_ALLOWLIST = [
  /\/login/i,
  /\/signin/i,
  /\/auth\/verify/i,
  /\/verify/i,
  /\/2fa\/verify/i,
  /\/checkpoint/i,
]

export interface URLValidationResult {
  isSetupPage: boolean
  matchedPattern?: RegExp
  url: string
}

/**
 * Check if current URL indicates a setup/configuration page
 */
export function isSetupPage(
  url: string = window.location.href
): URLValidationResult {
  // Check allowlist first (higher priority)
  if (SETUP_URL_ALLOWLIST.some((pattern) => pattern.test(url))) {
    return { isSetupPage: false, url }
  }

  // Check setup patterns
  const matchedPattern = SETUP_URL_PATTERNS.find((pattern) => pattern.test(url))

  return {
    isSetupPage: !!matchedPattern,
    matchedPattern,
    url,
  }
}

/**
 * Validate that current page is NOT a setup page
 */
export function validateURL(): boolean {
  const result = isSetupPage()
  return !result.isSetupPage // true if NOT a setup page
}
