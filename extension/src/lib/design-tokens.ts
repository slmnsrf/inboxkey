/**
 * Design Tokens
 * Centralized design values for consistent UI/UX
 *
 * Reference: docs/ui-ux/font-and-colors.md, spacing-and-sizes.md, motion-and-feedback.md
 */

// Colors
export const COLOR_PRIMARY = '#3B82F6' // Primary blue for actions and links
export const COLOR_SUCCESS = '#10B981' // Success green for positive feedback
export const COLOR_WARNING = '#FF9800' // Warning amber for caution states
export const COLOR_ERROR = '#EF4444' // Error red for error states

// Error Banner Colors (WCAG AA compliant)
export const COLOR_ERROR_BG = '#FEE2E2' // Light red background for error banner
export const COLOR_ERROR_TEXT = '#7F1D1D' // Dark red text (4.6:1 contrast with bg)
export const COLOR_WARNING_BG = '#FEF3C7' // Light amber background for warning banner
export const COLOR_WARNING_TEXT = '#78350F' // Dark amber text (7.8:1 contrast with bg)
export const COLOR_INFO_BG = '#DBEAFE' // Light blue background for info banner
export const COLOR_INFO_TEXT = '#1E3A8A' // Dark blue text (8.2:1 contrast with bg)

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
