/**
 * Simple HTML to text conversion - strips tags and decodes entities
 */
export function htmlToText(html: string): string {
  if (!html) return ''

  // Strip HTML tags
  let text = html.replace(/<[^>]*>/g, ' ')

  // Decode common HTML entities
  const entities: Record<string, string> = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
  }

  for (const [entity, char] of Object.entries(entities)) {
    text = text.replace(new RegExp(entity, 'g'), char)
  }

  // Decode numeric entities
  text = text.replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
  text = text.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))

  // Normalize whitespace
  text = text.replace(/\s+/g, ' ').trim()

  return text
}

/**
 * Extract effective top-level domain from email address
 * e.g., "noreply@accounts.google.com" -> "google.com"
 * Handles RFC 2822 format: "Display Name <email@domain.com>" -> "google.com"
 */
export function extractETLD(email: string): string {
  if (!email) return ''

  // First, extract email from angle brackets if present
  // Handles: "Display Name <email@domain.com>" -> "email@domain.com"
  const angleMatch = email.match(/<([^>]+)>/i)
  const cleanEmail = angleMatch ? angleMatch[1] : email

  // Extract domain part after @
  const match = cleanEmail.match(/@([^@\s>]+)/i)
  if (!match) return ''

  const domain = match[1].toLowerCase()

  // Simple heuristic: take last two parts for most domains
  // e.g., "accounts.google.com" -> "google.com"
  // This is simplified - for a dev tool it's sufficient
  const parts = domain.split('.')

  if (parts.length >= 2) {
    return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`
  }

  return domain
}

/**
 * Create a stable hash for message ID
 * Simple implementation: combine provider and messageId
 */
export function hashId(provider: string, messageId: string): string {
  return `${provider}:${messageId}`
}

/**
 * Simple string hash function (for backup if needed)
 */
export function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36)
}
