/**
 * Detection patterns and keywords for verification code field identification
 * Used by both Tier 1 and Tier 2 detection heuristics
 */

/**
 * Tier 1: Fast attribute patterns (name/id matching)
 * High confidence when found
 */
export const ATTRIBUTE_PATTERNS = {
  // Exact matches (highest priority)
  exact: /^(code|otp|token|pin|mfa|2fa|twofa|verify|verification)$/i,

  // Contains matches (still high confidence)
  contains: /(?:code|otp|verify|token|pin|mfa|2fa|twofa|auth|sms)/i,
} as const

/**
 * Tier 2: Label and nearby text patterns
 * Used for deep scanning when Tier 1 fails
 */
export const LABEL_PATTERNS = {
  // High confidence phrases
  verification: /verification\s*code/i,
  enterCode: /enter\s*(?:the\s*)?code/i,
  digitCode: /\d+[-\s]digit\s*code/i,
  smsCode: /sms\s*code/i,
  textCode: /text\s*(?:message\s*)?code/i,
  securityCode: /security\s*code/i,
  authCode: /auth(?:entication)?\s*code/i,

  // Medium confidence phrases
  otp: /\b(?:otp|one[-\s]time\s*pass(?:word|code)?)\b/i,
  twoFactor: /\b(?:2fa|two[-\s]factor|mfa|multi[-\s]factor)\b/i,
  verify: /verify\s*(?:your\s*)?(?:account|identity|email|phone)/i,

  // Lower confidence (generic)
  code: /\b(?:enter|input|provide)\s*(?:your\s*)?code\b/i,
} as const

/**
 * Placeholder text patterns
 */
export const PLACEHOLDER_PATTERNS = {
  codeFormat: /^\d{4,8}$|^[\d\s-]{4,12}$/,
  codeWords: /(?:code|otp|verify|token|pin)/i,
  examples: /(?:123456|000000|enter.*code)/i,
} as const

/**
 * Pattern attribute matching (HTML5 pattern attribute)
 */
export const HTML_PATTERN_DETECTION = {
  digits: /^\[?\\?d\]?\{\s*(\d+)\s*\}$/,  // [0-9]{6}, \d{6}
  range: /^\[?\\?d\]?\{\s*(\d+)\s*,\s*(\d+)\s*\}$/,  // [0-9]{4,8}
} as const

/**
 * Autocomplete attribute values that indicate verification codes
 */
export const AUTOCOMPLETE_VALUES = [
  'one-time-code',
  'one-time-password',
  'otp',
] as const

/**
 * Input types that commonly contain verification codes
 */
export const RELEVANT_INPUT_TYPES = [
  'text',
  'tel',
  'number',
] as const

/**
 * Inputmode values that suggest verification codes
 */
export const NUMERIC_INPUT_MODES = [
  'numeric',
  'tel',
  'decimal',
] as const

/**
 * Max length values typical for verification codes
 */
export const TYPICAL_CODE_LENGTHS = {
  min: 4,
  max: 8,
} as const

/**
 * Keywords to exclude (false positives)
 * These patterns suggest the field is NOT a verification code
 */
export const EXCLUSION_PATTERNS = {
  password: /password/i,
  email: /e[-\s]?mail/i,
  username: /user[-\s]?name/i,
  search: /search/i,
  name: /^(?:first|last|full)[-\s]?name$/i,
  address: /address/i,
  phone: /phone.*number/i,  // Full phone number, not just verification
  zip: /zip[-\s]?code/i,
  postal: /postal/i,
  card: /card.*number/i,
  cvv: /cvv/i,
  ssn: /ssn|social.*security/i,
} as const

/**
 * Check if a string matches any exclusion pattern
 */
export function isExcluded(text: string): boolean {
  return Object.values(EXCLUSION_PATTERNS).some(pattern => pattern.test(text))
}

/**
 * Get the strength of a label match (for scoring)
 */
export function getLabelMatchStrength(text: string): number {
  if (LABEL_PATTERNS.verification.test(text)) return 35
  if (LABEL_PATTERNS.enterCode.test(text)) return 30
  if (LABEL_PATTERNS.digitCode.test(text)) return 30
  if (LABEL_PATTERNS.smsCode.test(text)) return 28
  if (LABEL_PATTERNS.textCode.test(text)) return 28
  if (LABEL_PATTERNS.securityCode.test(text)) return 25
  if (LABEL_PATTERNS.authCode.test(text)) return 25
  if (LABEL_PATTERNS.otp.test(text)) return 20
  if (LABEL_PATTERNS.twoFactor.test(text)) return 20
  if (LABEL_PATTERNS.verify.test(text)) return 15
  if (LABEL_PATTERNS.code.test(text)) return 10
  return 0
}

/**
 * Get the strength of a placeholder match
 */
export function getPlaceholderMatchStrength(placeholder: string): number {
  if (PLACEHOLDER_PATTERNS.codeFormat.test(placeholder)) return 25
  if (PLACEHOLDER_PATTERNS.codeWords.test(placeholder)) return 20
  if (PLACEHOLDER_PATTERNS.examples.test(placeholder)) return 15
  return 0
}
