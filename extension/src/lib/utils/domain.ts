/**
 * Domain utilities for per-domain feature toggling
 */

import { getDomain } from 'tldts'
import type { DomainPreferences } from '@/lib/storage/schema'
import { STORAGE_KEYS } from '@/lib/storage/schema'
import { isBankingDomain } from '@/lib/data/banking-blocklist'
import { isBlacklisted } from './blacklist'

/**
 * Extract eTLD+1 (effective top-level domain + 1) from a URL or hostname
 * using the Mozilla Public Suffix List (via tldts).
 *
 * Examples:
 * - https://www.example.com/path  → example.com
 * - https://login.amazon.co.uk    → amazon.co.uk
 * - https://shop.example.com.tr   → example.com.tr
 * - https://localhost:3000        → localhost
 * - https://192.168.1.1           → 192.168.1.1
 *
 * @param url - Full URL or bare hostname
 * @returns eTLD+1 domain, or empty string on invalid URL input.
 *          Returns the bare hostname for single-label hosts, IPs, and
 *          anything tldts cannot parse to a registrable domain.
 */
export function extractDomain(url: string): string {
  try {
    let hostname: string

    if (url.includes('://')) {
      const urlObj = new URL(url)
      hostname = urlObj.hostname
    } else {
      hostname = url
    }

    // localhost / IPs: return as-is so per-domain preferences keyed
    // on them still work.
    if (hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
      return hostname
    }

    const registrable = getDomain(hostname)
    return registrable ?? hostname
  } catch (error) {
    console.log('[Domain] Failed to extract domain from:', url, error)
    return ''
  }
}

/**
 * Check if InboxKey is enabled for a given URL (full precedence checking)
 *
 * Precedence order (highest to lowest):
 * 1. Domain Preferences (popup toggle) - HIGHEST PRIORITY
 * 2. Banking blocklist (if setting enabled)
 * 3. Domain blacklist
 * 4. URL blacklist
 * 5. Global default setting
 *
 * @param url - Full URL to check
 * @returns true if enabled, false if disabled
 */
export async function isExtensionEnabled(url: string): Promise<boolean> {
  try {
    const domain = extractDomain(url)

    const result = await chrome.storage.local.get([
      STORAGE_KEYS.DOMAIN_PREFERENCES,
      STORAGE_KEYS.SETTINGS
    ])

    const domainPreferences: DomainPreferences =
      result[STORAGE_KEYS.DOMAIN_PREFERENCES] || { domains: {} }
    const settings = result[STORAGE_KEYS.SETTINGS] || {}

    // 1. Check explicit domain preference (HIGHEST PRIORITY - allows override)
    if (domain in domainPreferences.domains) {
      return domainPreferences.domains[domain]
    }

    // 2. Check banking blocklist (if setting enabled)
    const disableOnBankingSites = settings.disableOnBankingSites ?? false
    if (disableOnBankingSites && isBankingDomain(domain)) {
      return false
    }

    // 3. Check blacklist (domain + URL)
    const blacklisted = await isBlacklisted(url)
    if (blacklisted) {
      return false
    }

    // 4. Fall back to default setting
    return settings.domainsEnabledByDefault ?? true
  } catch (error) {
    console.log('[Domain] Failed to check extension state:', error)
    return true // Default to enabled on error
  }
}

/**
 * Check if InboxKey is enabled for a given domain
 *
 * Logic:
 * 1. If domain has explicit preference, use it (HIGHEST PRIORITY - allows override)
 * 2. Check banking blocklist (if setting enabled)
 * 3. Otherwise, use domainsEnabledByDefault setting
 *
 * @param domain - eTLD+1 domain to check
 * @returns true if enabled, false if disabled
 */
export async function isDomainEnabled(domain: string): Promise<boolean> {
  try {
    const result = await chrome.storage.local.get([
      STORAGE_KEYS.DOMAIN_PREFERENCES,
      STORAGE_KEYS.SETTINGS
    ])

    const domainPreferences: DomainPreferences =
      result[STORAGE_KEYS.DOMAIN_PREFERENCES] || { domains: {} }
    const settings = result[STORAGE_KEYS.SETTINGS] || {}

    // 1. Check explicit user preference (HIGHEST PRIORITY - allows override)
    if (domain in domainPreferences.domains) {
      return domainPreferences.domains[domain]
    }

    // 2. Check banking blocklist (if setting enabled)
    const disableOnBankingSites = settings.disableOnBankingSites ?? false
    if (disableOnBankingSites && isBankingDomain(domain)) {
      return false
    }

    // 3. Fall back to default setting
    const domainsEnabledByDefault = settings.domainsEnabledByDefault ?? true
    return domainsEnabledByDefault
  } catch (error) {
    console.log('[Domain] Failed to check domain state:', error)
    return true // Default to enabled on error
  }
}
