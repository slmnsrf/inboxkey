// @inboxkey/extraction-core - Public API
// Pure extraction logic with no Chrome API dependencies

export { extractFromEmail, extractMagicLinks } from './extractor'
export type {
  ExtractContext,
  ExtractionOptions,
  LinkCandidate,
  ExtractResult,
  Charset,
} from './extractor'

export { extractOTPs } from './otp-extractor'
export type { OTPCandidate, OTPExtractOptions } from './otp-extractor'

export {
  MAGIC_LINK_KEYWORDS,
  MAGIC_LINK_URL_HINTS,
  DANGEROUS_LINK_KEYWORDS,
  CODE_KEYWORDS,
  CODE_KEYWORDS_LOCALE,
} from './extraction-types'
