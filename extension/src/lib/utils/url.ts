/**
 * URL utilities for blacklist management
 *
 * Provides URL normalization, validation, and domain extraction
 * for consistent matching across the blacklist feature.
 */

/**
 * Normalize a URL for consistent matching
 *
 * Normalization process:
 * 1. Parse URL and extract components
 * 2. Lowercase hostname
 * 3. Remove query string and hash
 * 4. Remove trailing slash from pathname
 * 5. Preserve protocol, hostname, port, and pathname only
 *
 * Examples:
 * - https://Example.com/Path?query=1#hash → https://example.com/Path
 * - https://example.com/ → https://example.com
 * - https://example.com:8080/path/ → https://example.com:8080/path
 *
 * @param url - URL string to normalize
 * @returns Normalized URL string, or null if invalid
 */
export function normalizeUrl(url: string): string | null {
  try {
    const urlObj = new URL(url)

    // Lowercase hostname
    urlObj.hostname = urlObj.hostname.toLowerCase()

    // Remove query and hash
    urlObj.search = ''
    urlObj.hash = ''

    // Remove trailing slash from pathname (unless it's just '/')
    if (urlObj.pathname !== '/' && urlObj.pathname.endsWith('/')) {
      urlObj.pathname = urlObj.pathname.slice(0, -1)
    }

    return urlObj.toString()
  } catch (error) {
    console.error('[URL] Failed to normalize URL:', url, error)
    return null
  }
}

/**
 * Validate that a string is a valid domain (hostname only)
 *
 * Valid domain requirements:
 * - No protocol (http://, https://)
 * - No path, query, or hash
 * - No port
 * - Contains at least one dot (e.g., example.com) OR is localhost/IP
 * - Valid hostname characters only
 *
 * Examples:
 * - example.com → valid
 * - sub.example.com → valid
 * - localhost → valid
 * - 192.168.1.1 → valid
 * - https://example.com → invalid (has protocol)
 * - example.com/path → invalid (has path)
 * - example.com:8080 → invalid (has port)
 *
 * @param domain - Domain string to validate
 * @returns true if valid domain, false otherwise
 */
export function isValidDomain(domain: string): boolean {
  // Check for empty or whitespace
  if (!domain || typeof domain !== 'string' || domain.trim() !== domain) {
    return false
  }

  // Check for protocol
  if (domain.includes('://')) {
    return false
  }

  // Check for path, query, or hash
  if (domain.includes('/') || domain.includes('?') || domain.includes('#')) {
    return false
  }

  // Check for port (but allow IPv6 brackets)
  if (domain.includes(':') && !domain.startsWith('[')) {
    return false
  }

  // Special cases: localhost and IPs
  if (domain === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(domain)) {
    return true
  }

  // Must contain at least one dot
  if (!domain.includes('.')) {
    return false
  }

  // Basic hostname validation (alphanumeric, dots, hyphens)
  const hostnameRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i
  return hostnameRegex.test(domain)
}

/**
 * Validate that a string is a valid URL
 *
 * Valid URL requirements:
 * - Must have protocol (http:// or https://)
 * - Must have valid hostname
 * - May have port, path, query, or hash
 *
 * Examples:
 * - https://example.com → valid
 * - https://example.com/path → valid
 * - https://example.com:8080 → valid
 * - example.com → invalid (no protocol)
 * - ftp://example.com → invalid (wrong protocol)
 *
 * @param url - URL string to validate
 * @returns true if valid URL, false otherwise
 */
export function isValidUrl(url: string): boolean {
  try {
    const urlObj = new URL(url)
    // Only allow http and https protocols
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:'
  } catch (error) {
    return false
  }
}

/**
 * Extract domain from a URL
 *
 * This uses the existing extractDomain utility logic but
 * is provided here for convenience and consistency.
 *
 * Examples:
 * - https://www.example.com/path → example.com
 * - https://sub.example.com → example.com
 * - https://localhost:3000 → localhost
 *
 * @param url - Full URL string
 * @returns Domain (eTLD+1), or empty string if invalid
 */
export function extractDomainFromUrl(url: string): string {
  try {
    const urlObj = new URL(url)
    const hostname = urlObj.hostname.toLowerCase()

    // Handle localhost and IPs (return as-is)
    if (hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
      return hostname
    }

    // Extract eTLD+1 (basic implementation)
    const parts = hostname.split('.')

    // If only one part (e.g., "localhost"), return it
    if (parts.length === 1) {
      return parts[0]
    }

    // Handle common TLDs and multi-part TLDs
    const lastTwo = parts.slice(-2).join('.')

    // Handle special cases like .co.uk, .com.au, etc.
    if (parts.length >= 3) {
      const lastPart = parts[parts.length - 1]
      const secondLastPart = parts[parts.length - 2]

      // Common two-part TLDs
      const twoPartTlds = ['co', 'com', 'org', 'net', 'gov', 'edu', 'ac']
      if (twoPartTlds.includes(secondLastPart) && lastPart.length === 2) {
        return parts.slice(-3).join('.')
      }
    }

    return lastTwo
  } catch (error) {
    console.error('[URL] Failed to extract domain from URL:', url, error)
    return ''
  }
}
