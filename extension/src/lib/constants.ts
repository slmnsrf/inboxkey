/**
 * Global constants for InboxKey
 */

/**
 * GitHub repository URL
 * Used for InboxBridge downloads and source code links
 */
export const GITHUB_REPO_URL = 'https://github.com/slmnsrf/inboxkey'

/**
 * Marketing website URL (linked from About page only).
 */
export const INBOXKEY_WEBSITE_URL = 'https://inboxkey.net'

/**
 * InboxBridge releases URL
 */
export const INBOXBRIDGE_RELEASES_URL = `${GITHUB_REPO_URL}/releases`

/**
 * Maximum number of IMAP accounts supported
 */
export const MAX_IMAP_ACCOUNTS = 10

/**
 * InboxBridge protocol compatibility range
 * Extension blocks IMAP operations if native app protocol is outside this range
 */
export const EXTENSION_MIN_PROTOCOL = 1
export const EXTENSION_MAX_PROTOCOL = 1

/**
 * Recommended InboxBridge app version
 * Shows non-blocking "update available" if native app is older (but protocol-compatible)
 */
export const RECOMMENDED_INBOXBRIDGE_VERSION = '1.1.4'

/**
 * Phase 2 — Positive-Signal Channel Eligibility Gate (2026-05-04).
 *
 * When true, sessions started without a positive channel signal from the
 * field-level classifier require a strict domain match (sender eTLD+1
 * exact or audited alias) before the listening chip or autofill chip
 * is shown. Suppresses TOTP false positives at the cost of latency on
 * legitimate email-OTP screens whose copy doesn't include explicit
 * channel keywords AND whose sender is on an unrelated domain.
 *
 * Default: true. Compiled constant — flip in source and re-release as
 * a kill switch.
 */
export const POSITIVE_SIGNAL_GATE_ENABLED = true

/**
 * Shared-hosting suffixes that the Mozilla Public Suffix List does NOT
 * mark as private. tldts returns "github.io" as the registrable domain
 * for both `victim.github.io` and `attacker.github.io`, so eTLD+1
 * matching is unsafe on these hosts.
 *
 * For the Phase 2 strict-affinity gate, treat pages on these hosts as
 * ineligible for the domain-match path; they fall through to positive
 * channel evidence only.
 *
 * Maintenance rule: every entry needs a unit test in eligibility.test.ts
 * verifying two distinct subdomains collapse to the same eTLD+1.
 */
export const SHARED_HOST_BLOCKLIST = new Set<string>([
  'github.io',
  'vercel.app',
  'pages.dev',
  'appspot.com',
  'netlify.app',
  'surge.sh',
  'firebaseapp.com',
  'web.app',
  'azurestaticapps.net',
])
