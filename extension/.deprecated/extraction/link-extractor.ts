/**
 * Magic Link Extractor
 *
 * Extracts magic links from HTML emails with security checks.
 */

import type { EmailMessage } from '@/lib/providers/provider-interface'
import type { MagicLinkCandidate } from './extraction-types'
import { MAGIC_LINK_KEYWORDS, EXCLUDED_LINK_DOMAINS } from './extraction-types'

export class MagicLinkExtractor {
  /**
   * Extract magic link candidates from email
   */
  extractFromEmail(email: EmailMessage): MagicLinkCandidate[] {
    if (!email.bodyHtml) {
      return []
    }

    const candidates: MagicLinkCandidate[] = []

    // Extract links using regex (works in service workers without DOMParser)
    const links = this.extractLinksFromHtml(email.bodyHtml)

    for (const link of links) {
      const candidate = this.analyzeLink(link.href, link.text)
      if (candidate) {
        candidates.push(candidate)
      }
    }

    // Sort by confidence
    candidates.sort((a, b) => b.confidence - a.confidence)

    return candidates
  }

  /**
   * Extract links from HTML using regex (service worker compatible)
   * Returns array of {href, text} objects
   */
  private extractLinksFromHtml(html: string): Array<{ href: string; text: string }> {
    const links: Array<{ href: string; text: string }> = []

    // Match <a> tags with href attribute
    // Supports both single and double quotes
    const linkRegex = /<a\s+[^>]*?href=["']([^"']+)["'][^>]*?>([\s\S]*?)<\/a>/gi

    let match: RegExpExecArray | null
    while ((match = linkRegex.exec(html)) !== null) {
      const href = match[1]
      const innerHtml = match[2]

      // Extract text content from inner HTML (strip tags)
      const text = innerHtml
        .replace(/<[^>]+>/g, '') // Remove HTML tags
        .replace(/&nbsp;/g, ' ') // Replace &nbsp; with space
        .replace(/&amp;/g, '&')  // Decode &amp;
        .replace(/&lt;/g, '<')   // Decode &lt;
        .replace(/&gt;/g, '>')   // Decode &gt;
        .replace(/&quot;/g, '"') // Decode &quot;
        .replace(/&#39;/g, "'")  // Decode &#39;
        .replace(/\s+/g, ' ')    // Normalize whitespace
        .trim()

      links.push({ href, text })
    }

    return links
  }

  /**
   * Analyze a link to determine if it's a magic link
   */
  private analyzeLink(
    url: string,
    buttonText: string
  ): MagicLinkCandidate | null {
    try {
      const urlObj = new URL(url)

      // Security checks
      if (urlObj.protocol !== 'https:') {
        return null // Only HTTPS links
      }

      // Exclude common safe links (check both domain and path)
      if (this.isExcludedDomain(urlObj.hostname) || this.isExcludedPath(urlObj)) {
        return null
      }

      // Check if URL has token-like parameters
      const hasTokenParam = this.hasTokenParameter(urlObj)
      if (!hasTokenParam) {
        return null
      }

      // Determine link type from keywords
      const type = this.determineLinkType(buttonText, url)

      // Calculate confidence
      let confidence = 50 // Base confidence

      if (hasTokenParam) confidence += 30
      if (buttonText.length > 0) confidence += 10

      const keywordBoost = this.calculateKeywordConfidence(buttonText)
      confidence += keywordBoost

      return {
        url,
        confidence: Math.max(0, Math.min(100, confidence)),
        type,
        domain: urlObj.hostname,
        buttonText: buttonText || undefined,
      }
    } catch {
      return null // Invalid URL
    }
  }

  /**
   * Check if domain or path should be excluded
   */
  private isExcludedDomain(hostname: string): boolean {
    const lowerHostname = hostname.toLowerCase()

    return EXCLUDED_LINK_DOMAINS.some(excluded =>
      lowerHostname.includes(excluded)
    )
  }

  /**
   * Check if URL path should be excluded (for safe links)
   */
  private isExcludedPath(url: URL): boolean {
    const lowerPath = url.pathname.toLowerCase()
    const fullUrl = url.toString().toLowerCase()

    return EXCLUDED_LINK_DOMAINS.some(excluded =>
      lowerPath.includes(excluded) || fullUrl.includes(excluded)
    )
  }

  /**
   * Check if URL has token-like parameters
   */
  private hasTokenParameter(url: URL): boolean {
    const tokenParams = ['token', 'code', 'key', 'verify', 'confirm', 'auth']

    for (const param of tokenParams) {
      if (url.searchParams.has(param)) {
        const value = url.searchParams.get(param)
        // Token should be at least 8 chars
        if (value && value.length >= 8) {
          return true
        }
      }
    }

    // Check if path contains a token-like segment (20+ alphanumeric chars)
    const pathSegments = url.pathname.split('/')
    for (const segment of pathSegments) {
      if (segment.length >= 20 && /^[A-Za-z0-9_-]{20,}$/.test(segment)) {
        return true
      }
    }

    return false
  }

  /**
   * Determine link type from text and URL across all supported languages
   */
  private determineLinkType(
    text: string,
    url: string
  ): 'login' | 'verify' | 'reset' | 'unknown' {
    const combined = `${text} ${url}`.toLowerCase()

    // Check all languages for login keywords
    for (const lang of Object.keys(MAGIC_LINK_KEYWORDS)) {
      const keywords = MAGIC_LINK_KEYWORDS[lang as keyof typeof MAGIC_LINK_KEYWORDS]
      for (const keyword of keywords.login) {
        if (combined.includes(keyword.toLowerCase())) return 'login'
      }
    }

    // Check all languages for verify keywords
    for (const lang of Object.keys(MAGIC_LINK_KEYWORDS)) {
      const keywords = MAGIC_LINK_KEYWORDS[lang as keyof typeof MAGIC_LINK_KEYWORDS]
      for (const keyword of keywords.verify) {
        if (combined.includes(keyword.toLowerCase())) return 'verify'
      }
    }

    // Check all languages for reset keywords
    for (const lang of Object.keys(MAGIC_LINK_KEYWORDS)) {
      const keywords = MAGIC_LINK_KEYWORDS[lang as keyof typeof MAGIC_LINK_KEYWORDS]
      for (const keyword of keywords.reset) {
        if (combined.includes(keyword.toLowerCase())) return 'reset'
      }
    }

    return 'unknown'
  }

  /**
   * Calculate confidence boost from keywords across all supported languages
   */
  private calculateKeywordConfidence(text: string): number {
    const lowerText = text.toLowerCase()

    // Flatten all keywords from all languages
    const allKeywords: string[] = []
    for (const lang of Object.keys(MAGIC_LINK_KEYWORDS)) {
      const keywords = MAGIC_LINK_KEYWORDS[lang as keyof typeof MAGIC_LINK_KEYWORDS]
      allKeywords.push(...keywords.login, ...keywords.verify, ...keywords.reset)
    }

    for (const keyword of allKeywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        return 20 // +20 confidence
      }
    }

    return 0
  }
}
