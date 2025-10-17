/**
 * Unified Email Extractor
 *
 * Combines OTP and Magic Link extraction.
 */

import type { EmailMessage } from '@/lib/providers/provider-interface'
import type { ExtractionResult } from './extraction-types'
import { OTPExtractor } from './otp-extractor'
import { MagicLinkExtractor } from './link-extractor'

export class EmailExtractor {
  private otpExtractor = new OTPExtractor()
  private linkExtractor = new MagicLinkExtractor()

  /**
   * Extract all candidates from an email
   */
  extract(email: EmailMessage): ExtractionResult {
    return {
      otpCandidates: this.otpExtractor.extractFromEmail(email),
      magicLinks: this.linkExtractor.extractFromEmail(email),
      metadata: {
        from: email.from.email,
        subject: email.subject,
        timestamp: email.date.getTime(),
        hasHtml: Boolean(email.bodyHtml),
      },
    }
  }
}
