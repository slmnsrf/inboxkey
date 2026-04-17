/**
 * Auto-Submit Telemetry
 *
 * Privacy-preserving failure tracking for auto-submit button detection.
 * Stores last 10 failures only, auto-prunes older entries.
 */

import { extractDomain } from '@/lib/utils/domain'
import type { BetaFeatureUsage } from './schema'
import { StorageFactory } from './storage-factory'

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

    // Atomic read-modify-write: mutateSettings runs the getter, our
    // transform, and the write inside a single mutex block. A bare
    // getSettings + updateSettings pair leaks the read across the lock
    // boundary and two concurrent telemetry writers can drop each
    // other's entries.
    const storage = await StorageFactory.create()
    await storage.mutateSettings(current => {
      const failures: AutoSubmitFailure[] = [...(current.autoSubmitFailures ?? [])]
      failures.unshift(failure)
      if (failures.length > MAX_FAILURES) {
        failures.splice(MAX_FAILURES)
      }
      return { autoSubmitFailures: failures }
    })

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
    const storage = await StorageFactory.create()
    const settings = await storage.getSettings()
    const failures: AutoSubmitFailure[] = settings.autoSubmitFailures ?? []
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
    const storage = await StorageFactory.create()
    await storage.updateSettings({ autoSubmitFailures: [] })
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

    // Same atomic-RMW rationale as logAutoSubmitFailure above.
    const storage = await StorageFactory.create()
    await storage.mutateSettings(current => {
      const usageLog: BetaFeatureUsage[] = [...(current.betaFeatureUsage ?? [])]
      usageLog.unshift(usage)
      if (usageLog.length > MAX_BETA_USAGE) {
        usageLog.splice(MAX_BETA_USAGE)
      }
      return { betaFeatureUsage: usageLog }
    })

    console.log(`[Telemetry] Beta feature usage logged: ${feature} on ${urlDomain}`)
  } catch (error) {
    console.warn('[Telemetry] Failed to log beta feature usage:', error)
  }
}
