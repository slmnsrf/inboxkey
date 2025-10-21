/**
 * Email Extraction - Public API (v2)
 *
 * Export extractors and types for extracting OTPs and magic links from emails.
 */

// V2 functional extractors
export { extractOTPs } from './otp-extractor'
export { extractFromEmail, extractMagicLinks } from './extractor'

// V2 types from otp-extractor
export type {
  OTPCandidate,
  OTPExtractOptions,
  OtpCharset,
} from './otp-extractor'

// V2 types from extractor
export type {
  LinkCandidate,
  ExtractResult,
  ExtractContext,
  ExtractionOptions,
  Charset,
} from './extractor'

// V2 constants from extraction-types
export {
  COMMON_OTP_PATTERNS,
  CODE_KEYWORDS,
  MAGIC_LINK_KEYWORDS,
  CODE_KEYWORDS_BY_LANG,
  MAGIC_LINK_KEYWORDS_BY_LANG,
  MAGIC_LINK_URL_HINTS,
  DANGEROUS_LINK_KEYWORDS,
  OTP_PATTERNS,
  SCORE_WEIGHTS,
  THRESHOLDS,
  EXTRACTION_DEFAULTS,
} from './extraction-types'
