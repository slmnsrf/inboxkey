/**
 * Design Tokens
 * Centralized design values for consistent UI/UX
 *
 * Reference: docs/ui-ux/font-and-colors.md, spacing-and-sizes.md, motion-and-feedback.md
 */

// Colors (synced with tokens.css - Eye Comfort Palette 2025)
export const COLOR_PRIMARY = '#2563EB' // Primary blue for actions and links
export const COLOR_SUCCESS = '#10B981' // Success green for positive feedback
export const COLOR_WARNING = '#F59E0B' // Warning amber for caution states
export const COLOR_ERROR = '#EF4444' // Error red for error states

// Banner/Toast Colors (WCAG AA compliant - synced with tokens.css)
export const COLOR_ERROR_BG = '#FEE2E2' // Light red background
export const COLOR_ERROR_TEXT = '#B91C1C' // Dark red text (synced with --color-error-dark)
export const COLOR_WARNING_BG = '#FEF3C7' // Light amber background
export const COLOR_WARNING_TEXT = '#B45309' // Dark amber text (synced with --color-warning-dark)
export const COLOR_INFO_BG = '#DBEAFE' // Light blue background
export const COLOR_INFO_TEXT = '#0B1324' // Dark text for high contrast (synced with --badge-fg)

// Success feedback (for autofill, notifications)
export const COLOR_SUCCESS_BG = '#D1FAE5' // Light green background (synced with --color-success-light)
export const COLOR_SUCCESS_TEXT = '#047857' // Dark green text (synced with --color-success-dark)

// Badge system (NEW)
export const BADGE_BG = '#DBEAFE' // Badge background (synced with --badge-bg)
export const BADGE_FG = '#0B1324' // Badge text (synced with --badge-fg)
export const BADGE_BORDER = '#C9DDFB' // Badge border (synced with --badge-border)

// Spacing (4px base grid)
export const SPACE_XS = '4px'
export const SPACE_SM = '8px'
export const SPACE_MD = '12px'
export const SPACE_LG = '16px'
export const SPACE_XL = '24px'

// Sizes
export const SIZE_TOUCH_MIN = '44px' // Minimum touch target size for accessibility

// Typography
export const FONT_FAMILY_UI = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', sans-serif"

// Motion (durations in milliseconds)
export const DURATION_FAST = 150 // Fast timing for hovers and focus states (100-200ms)
export const DURATION_NORMAL = 300 // Normal timing for toasts and modal transitions
export const DURATION_SLOW = 500 // Slow timing for complex animations

// Shimmer RGB channels (for use in rgba() inside CSS template strings)
// Light values match COLOR_PRIMARY (#2563EB), COLOR_SUCCESS (#10B981), COLOR_ERROR (#EF4444)
// Dark values match the dark theme palette from tokens.css
export const SHIMMER_BLUE = { light: '37, 99, 235', dark: '10, 132, 255' }
export const SHIMMER_GREEN = { light: '16, 185, 129', dark: '48, 209, 88' }
export const SHIMMER_RED = { light: '239, 68, 68', dark: '255, 69, 58' }
