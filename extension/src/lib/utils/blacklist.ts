/**
 * Blacklist utilities for managing blacklisted domains and URLs
 *
 * Provides CRUD operations and matching logic for the blacklist feature.
 * Integrates with chrome.storage.local for persistence.
 */

import { STORAGE_KEYS, DEFAULT_SETTINGS } from '@/lib/storage/schema'
import type { Settings } from '@/lib/storage/schema'
import { StorageFactory } from '@/lib/storage/storage-factory'
import { normalizeUrl, isValidDomain, isValidUrl, extractDomainFromUrl } from './url'

/**
 * Maximum number of entries allowed per blacklist type
 * Prevents unbounded storage growth
 */
export const MAX_BLACKLIST_ENTRIES = 100

/**
 * Error types for blacklist operations
 */
export type BlacklistError =
  | 'INVALID_DOMAIN'
  | 'INVALID_URL'
  | 'DUPLICATE_ENTRY'
  | 'MAX_ENTRIES_REACHED'
  | 'STORAGE_ERROR'

/**
 * Result type for blacklist operations
 */
export interface BlacklistResult {
  success: boolean
  error?: BlacklistError
  errorMessage?: string
}

/**
 * Check if a URL is blacklisted (domain or URL match)
 *
 * Matching logic:
 * 1. Extract domain from URL
 * 2. Check if domain is in blacklistedDomains (blocks all subdomains)
 * 3. Normalize URL and check if it's in blacklistedUrls (exact match)
 *
 * Examples:
 * - blacklistedDomains: ['example.com'] → blocks https://example.com, https://www.example.com, https://sub.example.com
 * - blacklistedUrls: ['https://example.com/login'] → blocks only https://example.com/login (not https://example.com/signup)
 *
 * @param url - URL to check
 * @returns true if blacklisted, false otherwise
 */
export async function isBlacklisted(url: string): Promise<boolean> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS)
    const settings: Settings = result[STORAGE_KEYS.SETTINGS]

    if (!settings) {
      return false
    }

    const blacklistedDomains = settings.blacklistedDomains || []
    const blacklistedUrls = settings.blacklistedUrls || []

    // Extract domain from URL
    const domain = extractDomainFromUrl(url)

    // Check if domain is blacklisted (blocks all subdomains)
    if (domain) {
      const urlHostname = new URL(url).hostname.toLowerCase()

      for (const blacklistedDomain of blacklistedDomains) {
        const blacklistedLower = blacklistedDomain.toLowerCase()

        // Exact match OR subdomain match
        if (
          urlHostname === blacklistedLower ||
          urlHostname.endsWith('.' + blacklistedLower)
        ) {
          return true
        }
      }
    }

    // Check if URL is blacklisted (exact match after normalization)
    const normalizedUrl = normalizeUrl(url)
    if (normalizedUrl && blacklistedUrls.includes(normalizedUrl)) {
      return true
    }

    return false
  } catch (error) {
    console.warn('[Blacklist] Failed to check if URL is blacklisted:', url, error)
    return false // Default to not blacklisted on error
  }
}

/**
 * Add a domain to the blacklist
 *
 * Validation:
 * - Must be a valid domain (no protocol, path, query, or hash)
 * - Must not be a duplicate
 * - Must not exceed MAX_BLACKLIST_ENTRIES
 *
 * @param domain - Domain to add (e.g., "example.com")
 * @returns BlacklistResult with success status and error details
 */
export async function addBlacklistedDomain(domain: string): Promise<BlacklistResult> {
  try {
    // Validate domain
    if (!isValidDomain(domain)) {
      return {
        success: false,
        error: 'INVALID_DOMAIN',
        errorMessage: 'Invalid domain format. Use hostname only (e.g., example.com)',
      }
    }

    // Normalize domain (lowercase)
    const normalizedDomain = domain.toLowerCase()

    // Atomic RMW: a concurrent settings update racing with this add
    // must either both writes serialize or this add must no-op with a
    // duplicate-check failure. mutateSettings provides the former.
    const storage = await StorageFactory.create()

    // Pre-check duplicates/limits outside the lock for a cleaner user-
    // facing error code. The real duplicate and limit guard is the
    // check inside mutateSettings below, which runs under the lock.
    const preview = await storage.getSettings()
    const preList = preview.blacklistedDomains || []
    if (preList.includes(normalizedDomain)) {
      return { success: false, error: 'DUPLICATE_ENTRY', errorMessage: 'Domain is already blacklisted' }
    }
    if (preList.length >= MAX_BLACKLIST_ENTRIES) {
      return { success: false, error: 'MAX_ENTRIES_REACHED', errorMessage: `Maximum ${MAX_BLACKLIST_ENTRIES} domains allowed` }
    }

    await storage.mutateSettings(current => {
      const blacklistedDomains = current.blacklistedDomains || []
      // Re-check under the lock - a concurrent writer may have added
      // this same domain between the preview and here.
      if (blacklistedDomains.includes(normalizedDomain)) {
        return {}
      }
      if (blacklistedDomains.length >= MAX_BLACKLIST_ENTRIES) {
        return {}
      }
      return { blacklistedDomains: [...blacklistedDomains, normalizedDomain] }
    })

    return { success: true }
  } catch (error) {
    console.warn('[Blacklist] Failed to add domain:', domain, error)
    return {
      success: false,
      error: 'STORAGE_ERROR',
      errorMessage: 'Failed to save domain to blacklist',
    }
  }
}

/**
 * Add a URL to the blacklist
 *
 * Validation:
 * - Must be a valid URL (http:// or https://)
 * - Must not be a duplicate (after normalization)
 * - Must not exceed MAX_BLACKLIST_ENTRIES
 *
 * @param url - URL to add (e.g., "https://example.com/login")
 * @returns BlacklistResult with success status and error details
 */
export async function addBlacklistedUrl(url: string): Promise<BlacklistResult> {
  try {
    // Validate URL
    if (!isValidUrl(url)) {
      return {
        success: false,
        error: 'INVALID_URL',
        errorMessage: 'Invalid URL format. Must start with http:// or https://',
      }
    }

    // Normalize URL
    const normalizedUrl = normalizeUrl(url)
    if (!normalizedUrl) {
      return {
        success: false,
        error: 'INVALID_URL',
        errorMessage: 'Failed to normalize URL',
      }
    }

    const storage = await StorageFactory.create()

    const preview = await storage.getSettings()
    const preList = preview.blacklistedUrls || []
    if (preList.includes(normalizedUrl)) {
      return { success: false, error: 'DUPLICATE_ENTRY', errorMessage: 'URL is already blacklisted' }
    }
    if (preList.length >= MAX_BLACKLIST_ENTRIES) {
      return { success: false, error: 'MAX_ENTRIES_REACHED', errorMessage: `Maximum ${MAX_BLACKLIST_ENTRIES} URLs allowed` }
    }

    await storage.mutateSettings(current => {
      const blacklistedUrls = current.blacklistedUrls || []
      if (blacklistedUrls.includes(normalizedUrl)) return {}
      if (blacklistedUrls.length >= MAX_BLACKLIST_ENTRIES) return {}
      return { blacklistedUrls: [...blacklistedUrls, normalizedUrl] }
    })

    return { success: true }
  } catch (error) {
    console.warn('[Blacklist] Failed to add URL:', url, error)
    return {
      success: false,
      error: 'STORAGE_ERROR',
      errorMessage: 'Failed to save URL to blacklist',
    }
  }
}

/**
 * Remove a domain from the blacklist
 *
 * @param domain - Domain to remove (case-insensitive)
 * @returns BlacklistResult with success status
 */
export async function removeBlacklistedDomain(domain: string): Promise<BlacklistResult> {
  try {
    const normalizedDomain = domain.toLowerCase()

    const storage = await StorageFactory.create()
    await storage.mutateSettings(current => ({
      blacklistedDomains: (current.blacklistedDomains || []).filter(d => d !== normalizedDomain),
    }))

    return { success: true }
  } catch (error) {
    console.warn('[Blacklist] Failed to remove domain:', domain, error)
    return {
      success: false,
      error: 'STORAGE_ERROR',
      errorMessage: 'Failed to remove domain from blacklist',
    }
  }
}

/**
 * Remove a URL from the blacklist
 *
 * @param url - URL to remove (normalized before comparison)
 * @returns BlacklistResult with success status
 */
export async function removeBlacklistedUrl(url: string): Promise<BlacklistResult> {
  try {
    const normalizedUrl = normalizeUrl(url)
    if (!normalizedUrl) {
      return {
        success: false,
        error: 'INVALID_URL',
        errorMessage: 'Invalid URL',
      }
    }

    const storage = await StorageFactory.create()
    await storage.mutateSettings(current => ({
      blacklistedUrls: (current.blacklistedUrls || []).filter(u => u !== normalizedUrl),
    }))

    return { success: true }
  } catch (error) {
    console.warn('[Blacklist] Failed to remove URL:', url, error)
    return {
      success: false,
      error: 'STORAGE_ERROR',
      errorMessage: 'Failed to remove URL from blacklist',
    }
  }
}

/**
 * Clear all blacklisted domains
 *
 * @returns BlacklistResult with success status
 */
export async function clearBlacklistedDomains(): Promise<BlacklistResult> {
  try {
    const storage = await StorageFactory.create()
    await storage.updateSettings({ blacklistedDomains: [] })

    return { success: true }
  } catch (error) {
    console.warn('[Blacklist] Failed to clear domains:', error)
    return {
      success: false,
      error: 'STORAGE_ERROR',
      errorMessage: 'Failed to clear blacklisted domains',
    }
  }
}

/**
 * Clear all blacklisted URLs
 *
 * @returns BlacklistResult with success status
 */
export async function clearBlacklistedUrls(): Promise<BlacklistResult> {
  try {
    const storage = await StorageFactory.create()
    await storage.updateSettings({ blacklistedUrls: [] })

    return { success: true }
  } catch (error) {
    console.warn('[Blacklist] Failed to clear URLs:', error)
    return {
      success: false,
      error: 'STORAGE_ERROR',
      errorMessage: 'Failed to clear blacklisted URLs',
    }
  }
}

/**
 * Get all blacklisted domains
 *
 * @returns Array of blacklisted domains
 */
export async function getBlacklistedDomains(): Promise<string[]> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS)
    const settings: Settings = result[STORAGE_KEYS.SETTINGS]
    return settings?.blacklistedDomains || []
  } catch (error) {
    console.warn('[Blacklist] Failed to get domains:', error)
    return []
  }
}

/**
 * Get all blacklisted URLs
 *
 * @returns Array of blacklisted URLs
 */
export async function getBlacklistedUrls(): Promise<string[]> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS)
    const settings: Settings = result[STORAGE_KEYS.SETTINGS]
    return settings?.blacklistedUrls || []
  } catch (error) {
    console.warn('[Blacklist] Failed to get URLs:', error)
    return []
  }
}
