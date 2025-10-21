/**
 * @inboxkey/extraction-core
 *
 * Shared extraction logic for OTP codes and magic links.
 * Used by both the main InboxKey extension and the reviewer dev tool.
 */

// Main extraction functions
export { extractFromEmail, extractMagicLinks } from './extraction/extractor'
export { extractOTPs } from './extraction/otp-extractor'

// Types from extractor
export type {
  ExtractContext,
  ExtractionOptions,
  LinkCandidate,
  ExtractResult,
  Charset,
} from './extraction/extractor'

// Types from otp-extractor
export type {
  OTPCandidate,
  OTPExtractOptions,
  OtpCharset,
} from './extraction/otp-extractor'

// Constants from extraction-types
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
} from './extraction/extraction-types'

// Matching utilities (for advanced use)
export { shapeScore, type ExpectedShape } from './matching/shape-matcher'
export { domainAffinity, extractETLD } from './matching/domain-affinity'
