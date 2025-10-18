/**
 * Popup Algorithm Configuration
 *
 * Tunable constants for the popup cache pipeline:
 * - Display limits (MAX_CODES, MAX_LINKS)
 * - Freshness windows (TTLs for codes and links)
 * - Confidence thresholds (scoring gates)
 * - Cache staleness detection
 */

// =============================================================================
// DISPLAY LIMITS
// =============================================================================

/**
 * Maximum number of verification codes shown in popup
 */
export const MAX_CODES = 5

/**
 * Maximum number of magic links shown in popup
 */
export const MAX_LINKS = 3

// =============================================================================
// FRESHNESS WINDOWS (TTLs)
// =============================================================================

/**
 * Code Time-To-Live: Codes older than this are NOT shown in popup
 * Default: 30 minutes
 * Rationale: Most verification flows complete within 30 minutes
 */
export const CODE_TTL_MS = 30 * 60 * 1000 // 30 minutes

/**
 * Link Time-To-Live: Links older than this are NOT shown in popup
 * Default: 24 hours
 * Rationale: Magic links often have 24h expiration; UI can filter to 60min
 */
export const LINK_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

/**
 * Default UI filter for magic links (tighter than hard TTL)
 * Links older than this are grayed out or hidden by default filter
 */
export const LINK_UI_FILTER_MS = 60 * 60 * 1000 // 60 minutes

/**
 * Used items disappear after this time
 * Once a code/link is used, it's de-prioritized and hidden after 10min
 */
export const USED_ITEM_HIDE_MS = 10 * 60 * 1000 // 10 minutes

// =============================================================================
// CONFIDENCE THRESHOLDS
// =============================================================================

/**
 * Minimum score for auto-fill/auto-open (highest confidence)
 * Items with score >= 0.80 are automatically filled/opened
 */
export const SCORE_AUTOFILL = 0.80

/**
 * Minimum score for in-page prompt (medium confidence)
 * Items with 0.70 <= score < 0.80 trigger a user prompt
 */
export const SCORE_PROMPT = 0.70

/**
 * Minimum score to appear in popup (entry threshold)
 * Items with score < 0.60 are NOT shown in popup
 */
export const SCORE_POPUP = 0.60

// =============================================================================
// CACHE STALENESS
// =============================================================================

/**
 * Popup cache staleness threshold
 * If cache is older than 30s when popup opens, trigger async refresh
 * while showing cached data immediately
 */
export const POPUP_CACHE_STALE_MS = 30 * 1000 // 30 seconds

// =============================================================================
// PRIORITY SORTING WEIGHTS
// =============================================================================

/**
 * Priority formula weights (must sum to 1.0):
 * priority = WEIGHT_RECENCY * recencyScore
 *          + WEIGHT_DOMAIN * domainAffinity
 *          + WEIGHT_FORMAT * formatScore
 *          + WEIGHT_FRESHNESS * freshnessBonus
 */
export const WEIGHT_RECENCY = 0.55    // How recent the email is
export const WEIGHT_DOMAIN = 0.25     // Domain match with current tab
export const WEIGHT_FORMAT = 0.10     // Format match (length, charset)
export const WEIGHT_FRESHNESS = 0.10  // Unused items get small boost

/**
 * Recency scoring breakpoints (age in minutes)
 * - 0-2 min: score = 1.0 (very fresh)
 * - 2-5 min: score = 0.7 (fresh)
 * - 5-10 min: score = 0.4 (medium)
 * - 10-30 min: score = 0.0 (old but valid)
 * - >30 min: dropped by TTL
 */
export const RECENCY_BREAKPOINTS = {
  veryFresh: 2,   // minutes
  fresh: 5,       // minutes
  medium: 10,     // minutes
  old: 30,        // minutes
} as const

/**
 * Domain affinity scores
 * - Same eTLD+1: 1.0 (perfect match)
 * - Subdomain/alias: 0.6 (related)
 * - Different: 0.0 (no match)
 */
export const DOMAIN_AFFINITY = {
  perfect: 1.0,
  related: 0.6,
  none: 0.0,
} as const

// =============================================================================
// DEDUPLICATION
// =============================================================================

/**
 * Time bucket size for deduplication (in minutes)
 * Codes/links received within the same 10-minute bucket are considered duplicates
 * if they have the same normalized value and domain
 */
export const DEDUP_TIME_BUCKET_MINUTES = 10

// =============================================================================
// LINK SAFETY
// =============================================================================

/**
 * Denied hostname/path patterns for magic links
 * Links matching these patterns are filtered out for safety
 */
export const LINK_DENY_PATTERNS = [
  'unsubscribe',
  'preferences',
  'support',
  'help',
  'terms',
  'privacy',
  'password-reset',
  'password_reset',
  'reset-password',
  'reset_password',
] as const

/**
 * Link types hidden by default (require explicit user action)
 */
export const HIDDEN_LINK_TYPES: Array<'login' | 'verify' | 'reset'> = ['reset']

// =============================================================================
// VALIDATION
// =============================================================================

// Compile-time validation: weights must sum to 1.0
const totalWeight = WEIGHT_RECENCY + WEIGHT_DOMAIN + WEIGHT_FORMAT + WEIGHT_FRESHNESS
if (Math.abs(totalWeight - 1.0) > 0.001) {
  console.warn(`[PopupConfig] Priority weights sum to ${totalWeight}, expected 1.0`)
}
