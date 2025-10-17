/**
 * Email Extraction - Public API
 *
 * Export extractors and types for extracting OTPs and magic links from emails.
 */

export { OTPExtractor } from './otp-extractor'
export { MagicLinkExtractor } from './link-extractor'
export { EmailExtractor } from './extractor'

export type {
  OTPCandidate,
  MagicLinkCandidate,
  ExtractionResult,
  OTPPattern,
} from './extraction-types'

export {
  COMMON_OTP_PATTERNS,
  CODE_KEYWORDS,
  MAGIC_LINK_KEYWORDS,
  EXCLUDED_LINK_DOMAINS,
} from './extraction-types'
