/**
 * Passwordless Page Detector
 *
 * Detects "check your inbox" interstitial pages that appear after a user
 * requests a magic link / passwordless sign-in. These are waiting screens
 * with NO input fields, asking the user to open their email.
 *
 * Returns true ONLY when ALL FOUR gates pass:
 *   1. Positive URL gate   — pathname looks like a sign-in route
 *   2. Negative URL gate   — pathname is NOT a reset/destructive action
 *   3. Field gate          — page has NO visible relevant text inputs
 *   4. Copy gate           — page text contains passwordless-page phrasing
 *
 * Strict failure mode: any exception returns false (NOT true).
 * Rationale: false positives surface UI on wrong pages; false negatives
 * just miss one trigger opportunity.
 */

import {
  RESET_LINK_PATH_PATTERNS,
  DESTRUCTIVE_ACTION_PATH_PATTERNS,
  PASSWORDLESS_PAGE_KEYWORDS_BY_LANG,
} from '@inboxkey/extraction-core'
import { getFilteredText } from './dom-text-scanner'
import { getVisibleRelevantInputFields } from './field-detector'

// ---------------------------------------------------------------------------
// Gate 1: Positive URL patterns
// ---------------------------------------------------------------------------

/**
 * Pathname segments that indicate a sign-in / auth route.
 * Match is anchored at path-segment boundaries:
 *   - /login, /login/foo           → match
 *   - /loginpage, /mylogin         → no match
 *   - /auth (bare) or /auth/login  → match
 *   - /auth/dashboard              → no match (authenticated route, not a sign-in interstitial)
 *
 * Two alternations:
 *   1. Unambiguous sign-in segments: login, signin, sign-in, sso, passwordless,
 *      magic, verify-email — allowed with any subpath.
 *   2. /auth — only matched when terminal OR followed by a known sign-in
 *      subpath (login, signin, sign-in, callback, magic, magic-link,
 *      passwordless, sso, verify-email). This prevents matching authenticated
 *      pages like /auth/dashboard or /auth/settings.
 */
const SIGN_IN_PATH_REGEX =
  /\/(?:login|signin|sign-in|sso|passwordless|magic|verify-email)(?:\/|$)|\/auth(?:\/?$|\/(?:login|signin|sign-in|callback|magic(?:-link)?|passwordless|sso|verify-email)(?:\/|$))/i

/**
 * Gate 1 — true when the URL pathname looks like a sign-in route.
 */
function hasSignInUrlPath(pathname: string): boolean {
  return SIGN_IN_PATH_REGEX.test(pathname)
}

// ---------------------------------------------------------------------------
// Gate 2: Negative URL patterns (defense-in-depth)
// ---------------------------------------------------------------------------

/**
 * Gate 2 — true when the URL pathname matches a dangerous/destructive pattern.
 * Returns true = "danger found" so the caller can return false early.
 */
function hasDangerousUrlPath(pathname: string): boolean {
  for (const pattern of RESET_LINK_PATH_PATTERNS) {
    if (pattern.test(pathname)) return true
  }
  for (const pattern of DESTRUCTIVE_ACTION_PATH_PATTERNS) {
    if (pattern.test(pathname)) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Gate 3: Field gate
// ---------------------------------------------------------------------------

/**
 * Gate 3 — true when no visible user-fillable input fields are present.
 * Passwordless waiting screens have no inputs; sign-in forms do.
 *
 * Two-part check:
 *   a) OTP/code-type inputs via getVisibleRelevantInputFields (strict mode:
 *      getComputedStyle + getBoundingClientRect). Production only — layout
 *      APIs return zero dimensions in test environments, so this part is
 *      effectively a no-op in happy-dom/jsdom.
 *   b) Sign-in form inputs: email and password — excluded from the OTP helper
 *      because they're not verification code fields, but they absolutely mark
 *      this page as an email-submission form rather than a waiting screen.
 *      Visibility is checked via both inline styles and getComputedStyle
 *      (wrapped in try/catch for test-env robustness).
 */
function hasNoRelevantInputs(): boolean {
  // Part (a): OTP/code-type inputs — strict visibility (production path)
  if (getVisibleRelevantInputFields(true).length > 0) return false

  // Part (b): email or password inputs — common on sign-in forms, never on
  // "check your inbox" waiting screens.
  const signInInputs = document.querySelectorAll<HTMLInputElement>(
    'input[type="email"], input[type="password"]'
  )
  for (const inp of signInInputs) {
    if (inp.disabled || inp.hidden || inp.readOnly) continue

    // Inline-style visibility check
    const inlineStyle = (inp.getAttribute('style') ?? '').toLowerCase()
    if (/display\s*:\s*none|visibility\s*:\s*hidden/.test(inlineStyle)) continue

    // Computed-style visibility check (wrapping in try/catch for test-env
    // robustness — if getComputedStyle throws, treat input as visible so we
    // err on the side of returning false from the detector).
    try {
      const computed = window.getComputedStyle(inp)
      if (computed.display === 'none' || computed.visibility === 'hidden') continue
    } catch {
      // getComputedStyle unavailable (rare jsdom edge case) — treat as visible
    }

    return false
  }

  return true
}

// ---------------------------------------------------------------------------
// Gate 4: Copy gate
// ---------------------------------------------------------------------------

/**
 * Flat list of all passwordless-page phrases across all languages.
 * Built once at module load time.
 */
const ALL_PASSWORDLESS_PHRASES: ReadonlyArray<string> = Object.freeze(
  Object.values(PASSWORDLESS_PAGE_KEYWORDS_BY_LANG).flat()
)

/**
 * Gate 4 — true when the filtered page text contains at least one
 * passwordless-page phrase from any supported language.
 */
function hasPasswordlessCopy(): boolean {
  const body = document.body
  if (!body) return false

  const text = getFilteredText(body).toLowerCase()
  if (!text) return false

  for (const phrase of ALL_PASSWORDLESS_PHRASES) {
    if (text.includes(phrase)) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect whether the current page is a passwordless sign-in waiting screen.
 *
 * All four gates must pass:
 *   1. URL pathname is a sign-in route
 *   2. URL pathname is NOT a reset/destructive route
 *   3. Page has no visible relevant input fields
 *   4. Page text contains passwordless-page copy
 *
 * Strict failure mode: returns false on any exception (never throws).
 *
 * All DOM access uses the global `document`. Gate 3 uses
 * `getVisibleRelevantInputFields` which is hardcoded to global `document`
 * inside field-detector.ts, making a `doc` parameter misleading — the
 * contract is honest: this function inspects the current page document.
 *
 * @param url  - The page URL (full string, e.g. window.location.href)
 * @returns true only when all four gates pass
 */
export function detectPasswordlessPage(url: string): boolean {
  try {
    const parsed = new URL(url)
    const pathname = parsed.pathname.toLowerCase()

    // Gate 1: must look like a sign-in route
    if (!hasSignInUrlPath(pathname)) return false

    // Gate 2: must NOT be a reset or destructive-action route
    if (hasDangerousUrlPath(pathname)) return false

    // Gate 3: must have no visible relevant inputs
    if (!hasNoRelevantInputs()) return false

    // Gate 4: must have passwordless-page copy
    if (!hasPasswordlessCopy()) return false

    return true
  } catch {
    // Strict failure mode — malformed URL, jsdom issue, etc.
    return false
  }
}
