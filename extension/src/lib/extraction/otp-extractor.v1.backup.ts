/**
 * OTP Extractor
 *
 * Extracts verification codes from email content with confidence scoring.
 */

import type { EmailMessage } from '@/lib/providers/provider-interface'
import type { OTPCandidate } from './extraction-types'
import { COMMON_OTP_PATTERNS, CODE_KEYWORDS } from './extraction-types'

export class OTPExtractor {
  /**
   * Extract OTP candidates from an email
   */
  extractFromEmail(email: EmailMessage): OTPCandidate[] {
    // Pre-filter: Only extract from emails that look like verification emails
    if (!this.isLikelyVerificationEmail(email)) {
      console.log(`[OTPExtractor] ⏭️  Skipping non-verification email: "${email.subject.substring(0, 60)}"`)
      return []
    }

    const candidates: OTPCandidate[] = []

    // Extract from subject
    candidates.push(...this.extractFromText(email.subject, 'subject'))

    // Extract from snippet (if available)
    if (email.snippet) {
      candidates.push(...this.extractFromText(email.snippet, 'snippet'))
    }

    // Extract from body text
    if (email.bodyText) {
      candidates.push(...this.extractFromText(email.bodyText, 'body'))
    }

    // Sort by confidence (highest first)
    candidates.sort((a, b) => b.confidence - a.confidence)

    // Deduplicate (same code in multiple locations)
    return this.deduplicateCandidates(candidates)
  }

  /**
   * Check if email is likely a verification/OTP email
   */
  private isLikelyVerificationEmail(email: EmailMessage): boolean {
    const checkText = `${email.subject} ${email.snippet || ''} ${email.bodyText?.substring(0, 500) || ''}`.toLowerCase()

    // Check for verification keywords in any language
    for (const keywords of Object.values(CODE_KEYWORDS)) {
      for (const keyword of keywords) {
        if (checkText.includes(keyword.toLowerCase())) {
          return true
        }
      }
    }

    return false
  }

  /**
   * Extract codes from text using patterns
   */
  private extractFromText(
    text: string,
    location: 'subject' | 'body' | 'snippet'
  ): OTPCandidate[] {
    const candidates: OTPCandidate[] = []
    const seenCodes = new Set<string>()

    for (const pattern of COMMON_OTP_PATTERNS) {
      const matches = text.matchAll(pattern.regex)

      for (const match of matches) {
        const code = match[1]
        const normalizedCode = code.toUpperCase()

        // Skip if already found by a higher-priority pattern
        if (seenCodes.has(normalizedCode)) {
          continue
        }

        // For numeric patterns, filter out years and common numbers
        if (pattern.charset === 'digits') {
          if (this.isYear(code)) {
            console.log(`[OTPExtractor] ❌ Filtered "${code}" - year`)
            continue
          }
        }

        // For alphanumeric patterns, filter out common words and unlikely OTPs
        if (pattern.charset === 'alphanumeric') {
          if (this.isCommonWord(code)) {
            console.log(`[OTPExtractor] ❌ Filtered "${code}" - common word`)
            continue
          }
          // Check if it looks like a real OTP (has digits, not all lowercase)
          if (!this.isLikelyOTP(code)) {
            console.log(`[OTPExtractor] ❌ Filtered "${code}" - not likely OTP (no digits or wrong case)`)
            continue
          }
          console.log(`[OTPExtractor] ✅ Accepted "${code}" - passed all filters`)
        }

        seenCodes.add(normalizedCode)
        const index = match.index!

        // Get context (50 chars before and after)
        const contextStart = Math.max(0, index - 50)
        const contextEnd = Math.min(text.length, index + match[0].length + 50)
        const context = text.slice(contextStart, contextEnd).trim()

        // Calculate confidence boost if near keywords
        const keywordBoost = this.calculateKeywordBoost(context)
        const finalConfidence = Math.min(100, pattern.confidence + keywordBoost)

        candidates.push({
          code,
          confidence: finalConfidence,
          location,
          pattern: pattern.name,
          context,
        })
      }
    }

    return candidates
  }

  /**
   * Check if a numeric code is a year (2020-2039)
   */
  private isYear(code: string): boolean {
    return /^20[2-3]\d$/.test(code)
  }

  /**
   * Check if code is a common word (to filter out false positives)
   */
  private isCommonWord(code: string): boolean {
    const commonWords = new Set([
      // Action words (English)
      'WELCOME', 'ACCOUNT', 'SERVICE', 'CONFIRM', 'VERIFY', 'PLEASE',
      'THANKS', 'SECURITY', 'MESSAGE', 'SUPPORT', 'CONTACT', 'PRIVACY',
      'PASSWORD', 'RECOVERY', 'ACTIVATE', 'CONTINUE', 'COMPLETE', 'PROCEED',
      'SUBMIT', 'CANCEL', 'UPDATE', 'CHANGE', 'REMOVE', 'DELETE', 'RESET',
      'SAFETY', 'ACTION', 'ENABLE', 'DISABLE', 'STATUS', 'ONLINE', 'OFFLINE',

      // Social/Platforms
      'GOOGLE', 'AMAZON', 'GITHUB', 'MICROSOFT', 'FACEBOOK', 'TWITTER',
      'APPLE', 'NETFLIX', 'SPOTIFY', 'LINKEDIN', 'INSTAGRAM', 'YOUTUBE',
      'DISCORD', 'TWITCH', 'TIKTOK', 'REDDIT', 'TELEGRAM', 'WHATSAPP',
      'DROPBOX', 'NOTION', 'SLACK', 'ZOOM', 'PAYPAL', 'STRIPE',
      'TARKOV', 'VALORANT', 'LEAGUE', 'FORTNITE', 'ROBLOX', 'MINECRAFT',

      // Generic words (English)
      'BUTTON', 'CLICK', 'ACCESS', 'LOGIN', 'LOGOUT', 'SIGNIN', 'SIGNOUT',
      'REGISTER', 'SUBSCRIBE', 'DOWNLOAD', 'UPLOAD', 'SETTINGS', 'PROFILE',
      'EMAIL', 'EMAILS', 'ADDRESS', 'PHONE', 'NUMBER', 'WEBSITE', 'LINK',
      'HELP', 'INFO', 'ABOUT', 'TERMS', 'POLICY', 'LEGAL', 'COPYRIGHT',
      'FORWARD', 'REPLY', 'SEND', 'RECEIVE', 'OPEN', 'CLOSE', 'VIEW',
      'POWERED', 'MANAGE', 'CREATED', 'INBOX', 'FOLDER', 'ARCHIVE', 'CENTRE',

      // Marketing words (Italian)
      'ACQUISTA', // BUY
      'SUBITO', // NOW
      'SCOPRI', // DISCOVER
      'OFFERTA', // OFFER
      'SCONTO', // DISCOUNT
      'GRATIS', // FREE

      // Marketing words (German)
      'KAUFEN', // BUY
      'JETZT', // NOW
      'ANGEBOT', // OFFER

      // Marketing words (French)
      'ACHETER', // BUY
      'OFFRE', // OFFER
      'GRATUIT', // FREE

      // Marketing words (Spanish)
      'COMPRAR', // BUY
      'AHORA', // NOW
      'OFERTA', // OFFER
    ])
    return commonWords.has(code.toUpperCase())
  }

  /**
   * Check if an alphanumeric code looks like a real OTP
   * Real OTPs usually have mixed case or digits, and aren't common patterns
   */
  private isLikelyOTP(code: string): boolean {
    // All lowercase is suspicious (real OTPs are usually uppercase or mixed)
    if (code === code.toLowerCase() && /[a-z]/.test(code)) {
      return false
    }

    // Filter out years (2020-2030 range)
    if (/^20[2-3]\d$/.test(code)) {
      return false
    }

    // Must have either:
    // 1. At least one digit AND one letter (mixed alphanumeric)
    // 2. All uppercase letters (like DYKGZQHG)
    const hasDigit = /\d/.test(code)
    const hasLetter = /[a-zA-Z]/.test(code)
    const isAllUppercase = code === code.toUpperCase()

    if (hasDigit && hasLetter) {
      return true // Mixed: A1B2C3, M3BYRN6Q
    }

    if (isAllUppercase && hasLetter && !hasDigit) {
      return true // All uppercase letters: DYKGZQHG
    }

    return false
  }

  /**
   * Boost confidence if code is near verification keywords
   */
  private calculateKeywordBoost(context: string): number {
    const lowerContext = context.toLowerCase()

    // Check all language keywords
    for (const keywords of Object.values(CODE_KEYWORDS)) {
      for (const keyword of keywords) {
        if (lowerContext.includes(keyword.toLowerCase())) {
          return 15 // +15 confidence boost
        }
      }
    }

    return 0
  }

  /**
   * Remove duplicate codes (keep highest confidence)
   */
  private deduplicateCandidates(candidates: OTPCandidate[]): OTPCandidate[] {
    const seen = new Map<string, OTPCandidate>()

    for (const candidate of candidates) {
      const existing = seen.get(candidate.code)

      if (!existing || candidate.confidence > existing.confidence) {
        seen.set(candidate.code, candidate)
      }
    }

    return Array.from(seen.values())
  }
}
