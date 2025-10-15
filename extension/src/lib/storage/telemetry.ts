/**
 * Auto-Submit Telemetry
 *
 * Privacy-preserving failure tracking for auto-submit button detection.
 * Stores last 10 failures only, auto-prunes older entries.
 */

import { extractDomain } from '@/lib/utils/domain'
import type { BetaFeatureUsage } from './schema'

export interface AutoSubmitFailure {
  timestamp: number
  urlDomain: string  // eTLD+1 only (privacy-preserving)
  reason: 'no_buttons' | 'no_safe_buttons' | 'score_too_low' | 'click_failed'
  buttonText?: string  // First 20 chars only, sanitized
  buttonCount: number
  topScore?: number
}

const MAX_FAILURES = 10
const MAX_BETA_USAGE = 20
const STORAGE_KEY = 'settings'

/**
 * Log an auto-submit failure
 */
export async function logAutoSubmitFailure(
  url: string,
  reason: AutoSubmitFailure['reason'],
  details: Partial<Pick<AutoSubmitFailure, 'buttonText' | 'buttonCount' | 'topScore'>> = {}
): Promise<void> {
  try {
    // Extract eTLD+1 for privacy
    const urlDomain = extractDomain(url) || 'unknown'

    // Sanitize button text (first 20 chars, remove sensitive data)
    const buttonText = details.buttonText
      ? sanitizeText(details.buttonText).substring(0, 20)
      : undefined

    const failure: AutoSubmitFailure = {
      timestamp: Date.now(),
      urlDomain,
      reason,
      buttonText,
      buttonCount: details.buttonCount || 0,
      topScore: details.topScore
    }

    // Get current settings
    const result = await chrome.storage.local.get(STORAGE_KEY)
    const settings = result.settings || {}

    // Get existing failures
    const failures: AutoSubmitFailure[] = settings.autoSubmitFailures || []

    // Add new failure
    failures.unshift(failure)

    // Prune to last 10
    if (failures.length > MAX_FAILURES) {
      failures.splice(MAX_FAILURES)
    }

    // Save back
    settings.autoSubmitFailures = failures
    await chrome.storage.local.set({ settings })

    console.log(`[Telemetry] Logged auto-submit failure: ${reason} on ${urlDomain}`)
  } catch (error) {
    console.warn('[Telemetry] Failed to log auto-submit failure:', error)
  }
}

/**
 * Get recent auto-submit failures
 */
export async function getRecentFailures(limit: number = MAX_FAILURES): Promise<AutoSubmitFailure[]> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY)
    const settings = result.settings || {}
    const failures: AutoSubmitFailure[] = settings.autoSubmitFailures || []
    return failures.slice(0, limit)
  } catch (error) {
    console.warn('[Telemetry] Failed to get recent failures:', error)
    return []
  }
}

/**
 * Clear all telemetry data
 */
export async function clearTelemetry(): Promise<void> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY)
    const settings = result.settings || {}
    settings.autoSubmitFailures = []
    await chrome.storage.local.set({ settings })
    console.log('[Telemetry] Cleared all auto-submit telemetry')
  } catch (error) {
    console.warn('[Telemetry] Failed to clear telemetry:', error)
  }
}

/**
 * Sanitize text to remove sensitive data
 */
function sanitizeText(text: string): string {
  // Remove emails, URLs, numbers that look like codes
  return text
    .replace(/[\w.-]+@[\w.-]+\.\w+/g, '[EMAIL]')
    .replace(/https?:\/\/[^\s]+/g, '[URL]')
    .replace(/\b\d{4,}\b/g, '[CODE]')
    .trim()
}

/**
 * Log beta feature usage
 */
export async function logBetaFeatureUsage(
  feature: BetaFeatureUsage['feature'],
  metadata: BetaFeatureUsage['metadata']
): Promise<void> {
  try {
    const url = window.location.href
    const urlDomain = extractDomain(url) || 'unknown'

    const usage: BetaFeatureUsage = {
      timestamp: Date.now(),
      feature,
      urlDomain,
      metadata
    }

    // Get current settings
    const result = await chrome.storage.local.get(STORAGE_KEY)
    const settings = result.settings || {}

    // Get existing usage log
    const usageLog: BetaFeatureUsage[] = settings.betaFeatureUsage || []

    // Add new usage
    usageLog.unshift(usage)

    // Prune to last 20
    if (usageLog.length > MAX_BETA_USAGE) {
      usageLog.splice(MAX_BETA_USAGE)
    }

    // Save back
    settings.betaFeatureUsage = usageLog
    await chrome.storage.local.set({ settings })

    console.log(`[Telemetry] Beta feature usage logged: ${feature} on ${urlDomain}`)
  } catch (error) {
    console.warn('[Telemetry] Failed to log beta feature usage:', error)
  }
}
