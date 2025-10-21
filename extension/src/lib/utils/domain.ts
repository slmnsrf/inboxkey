/**
 * Domain utilities for per-domain feature toggling
 */

import type { DomainPreferences } from '@/lib/storage/schema'
import { STORAGE_KEYS } from '@/lib/storage/schema'

/**
 * Extract eTLD+1 (effective top-level domain + 1) from a URL
 *
 * Examples:
 * - https://www.example.com/path → example.com
 * - https://subdomain.example.com → example.com
 * - https://localhost:3000 → localhost
 * - https://192.168.1.1 → 192.168.1.1
 *
 * @param url - Full URL or hostname
 * @returns eTLD+1 domain, or empty string if invalid
 */
export function extractDomain(url: string): string {
  try {
    let hostname: string

    // If it's a full URL, parse it
    if (url.includes('://')) {
      const urlObj = new URL(url)
      hostname = urlObj.hostname
    } else {
      // Treat as hostname directly
      hostname = url
    }

    // Handle localhost and IPs (return as-is)
    if (hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
      return hostname
    }

    // Extract eTLD+1 (basic implementation)
    // For production, you might want to use a library like tldts
    const parts = hostname.split('.')

    // If only one part (e.g., "localhost"), return it
    if (parts.length === 1) {
      return parts[0]
    }

    // Handle common TLDs and multi-part TLDs
    // For simplicity, we'll take the last 2 parts for most cases
    // This covers .com, .org, .net, etc.
    const lastTwo = parts.slice(-2).join('.')

    // Handle special cases like .co.uk, .com.au, etc.
    if (parts.length >= 3) {
      const lastPart = parts[parts.length - 1]
      const secondLastPart = parts[parts.length - 2]

      // Common two-part TLDs
      const twoPartTlds = ['co', 'com', 'org', 'net', 'gov', 'edu', 'ac']
      if (twoPartTlds.includes(secondLastPart) && lastPart.length === 2) {
        // This is likely a two-part TLD like .co.uk
        return parts.slice(-3).join('.')
      }
    }

    return lastTwo
  } catch (error) {
    console.error('[Domain] Failed to extract domain from:', url, error)
    return ''
  }
}

/**
 * Check if InboxKey is enabled for a given domain
 *
 * Logic:
 * 1. If domain has explicit preference, use it
 * 2. Otherwise, use domainsEnabledByDefault setting
 *
 * @param domain - eTLD+1 domain to check
 * @returns true if enabled, false if disabled
 */
export async function isDomainEnabled(domain: string): Promise<boolean> {
  try {
    // Get domain preferences and settings
    const result = await chrome.storage.local.get([
      STORAGE_KEYS.DOMAIN_PREFERENCES,
      STORAGE_KEYS.SETTINGS
    ])

    const domainPreferences: DomainPreferences = result[STORAGE_KEYS.DOMAIN_PREFERENCES] || { domains: {} }
    const settings = result[STORAGE_KEYS.SETTINGS] || {}

    // Check explicit preference first
    if (domain in domainPreferences.domains) {
      return domainPreferences.domains[domain]
    }

    // Fall back to default setting
    const domainsEnabledByDefault = settings.domainsEnabledByDefault ?? true
    return domainsEnabledByDefault
  } catch (error) {
    console.error('[Domain] Failed to check domain state:', error)
    // Default to enabled on error
    return true
  }
}
