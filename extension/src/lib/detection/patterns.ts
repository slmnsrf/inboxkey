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

  // Contains matches (still high confidence).
  // Substring match - word boundaries break camelCase identifiers
  // (e.g. verificationCode, authCode), which are very common. The
  // false-positive risk on substrings like "barcode" / "oauth_state"
  // is accepted; Tier 2 label/context validation catches most of
  // those cases. "token" stays excluded - too broad.
  contains: /(?:code|otp|verify|pin|mfa|2fa|twofa|auth|sms)/i,
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
  digits: /^(?:\\d|\[0-9\]|\[\\d\])\{\s*(\d+)\s*\}$/,  // [0-9]{6}, \d{6}
  range: /^(?:\\d|\[0-9\]|\[\\d\])\{\s*(\d+)\s*,\s*(\d+)\s*\}$/,  // [0-9]{4,8}
} as const

export function getCodeLengthRangeFromPattern(pattern: string): { min: number; max: number } | null {
  const normalized = pattern.trim().replace(/^\^/, '').replace(/\$$/, '')
  const exact = normalized.match(HTML_PATTERN_DETECTION.digits)
  if (exact) {
    const length = parseInt(exact[1], 10)
    return { min: length, max: length }
  }

  const range = normalized.match(HTML_PATTERN_DETECTION.range)
  if (range) {
    return {
      min: parseInt(range[1], 10),
      max: parseInt(range[2], 10),
    }
  }

  return null
}

/**
 * Autocomplete attribute values that indicate verification codes
 */
export const AUTOCOMPLETE_VALUES = [
  'one-time-code',
  'one-time-password',
  'otp',
] as const

/**
 * Input types that can plausibly hold a verification code.
 *
 * Anything outside this set (radio, checkbox, button, submit, reset,
 * file, image, color, date, time, range, hidden, password, email,
 * search, url) is rejected up front: a single radio named "otp" or a
 * checkbox with autocomplete="one-time-code" is still not a code field,
 * and 5+ same-type radios in distinct label parents otherwise sneak
 * through split-input grouping (Microsoft codeEntry maxLength=-1 path).
 *
 * Password is intentionally excluded - tier1 layer 2 already rejects
 * type=password before this check would matter.
 */
export const RELEVANT_INPUT_TYPES = [
  'text',
  'tel',
  'number',
] as const

const RELEVANT_INPUT_TYPE_SET: Set<string> = new Set(RELEVANT_INPUT_TYPES)

/**
 * True if the input's type can plausibly hold a verification code.
 * Use this at every entry point that collects candidate fields so a
 * radio/checkbox can never reach the scoring or split-grouping paths.
 */
export function isRelevantInputType(input: HTMLInputElement): boolean {
  return RELEVANT_INPUT_TYPE_SET.has(input.type)
}

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
 *
 * IMPORTANT: Use [\s\-_] for field identifier patterns to catch:
 * - snake_case (Python, Ruby, REST APIs, Salesforce)
 * - kebab-case (HTML attributes)
 * - space-separated (rare but valid)
 *
 * Examples:
 * - zip_code, zip-code, zip code → zip[\s\-_]?code
 * - user_name, user-name, username → user[\s\-_]?name
 * - first_name, first-name, firstname → ^(?:first|last|full)[\s\-_]?name$
 */
export const EXCLUSION_PATTERNS = {
  captcha: /captcha|re[\s\-_]?captcha|hcaptcha|turnstile/i,
  password: /password/i,
  email: /^e[\s\-_]?mail$/i,  // Exact match only - don't exclude "email_code"
  username: /user[\s\-_]?name/i,
  search: /search/i,
  name: /^(?:first|last|full)[\s\-_]?name$/i,
  address: /address/i,
  phone: /phone.*number/i,  // Full phone number, not just verification
  zip: /zip[\s\-_]?code/i,
  postcode: /post[\s\-_]?code/i,
  postal: /postal/i,
  card: /card.*number/i,
  card_security: /card[\s\-_]?security[\s\-_]?code/i,
  cvv: /cvv/i,
  ssn: /ssn|social.*security/i,

  // Commercial & E-commerce
  discount: /discount[\s\-_]?code/i,
  promo: /promo(tional)?[\s\-_]?code/i,
  coupon: /coupon[\s\-_]?code/i,
  voucher: /voucher[\s\-_]?code/i,

  // Developer & API
  api_key: /api[\s\-_]?(key|secret)/i,
  auth_state: /(?:oauth|auth)[\s\-_]?state/i,
  access_token: /access[\s\-_]?token/i,
  refresh_token: /refresh[\s\-_]?token/i,

  // Token management (developer dashboards)
  token_name: /token[\s\-_]?name/i,
  token_label: /token[\s\-_]?label/i,
  token_description: /token[\s\-_]?(description|desc)/i,
  personal_token: /personal[\s\-_]?(access[\s\-_]?)?token/i,

  // Referral & Social
  referral: /referral[\s\-_]?(code|link)/i,
  affiliate: /affiliate[\s\-_]?(code|link)/i,
  invite: /invit(e|ation)[\s\-_]?code/i,
} as const

/**
 * Technical CAPTCHA provider/name marker. Checked against the candidate
 * field's own attributes, not the whole page, so a separate hidden
 * reCAPTCHA token elsewhere in a form does not suppress a real OTP field.
 */
export const CAPTCHA_ATTRIBUTE_PATTERN = EXCLUSION_PATTERNS.captcha

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
