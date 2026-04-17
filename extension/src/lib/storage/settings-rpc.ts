/**
 * Settings RPC — cross-context serialization for settings mutations.
 *
 * The problem
 * -----------
 * PlaintextStorage's AsyncMutex only serializes calls sharing the same
 * JS heap. In MV3 each context (popup, options, content script,
 * service worker) runs its own module graph, so a mutex in the SW
 * instance does nothing for a write issued from a content script, and
 * vice versa. Two concurrent writes from different contexts can both
 * read the same `settings`, each apply their partial, and each write
 * it back — last-writer-wins.
 *
 * The fix
 * -------
 * All settings mutations funnel through the service worker. The SW is
 * the only context that touches `chrome.storage.local`'s settings key,
 * and inside the SW a singleton PlaintextStorage + its mutex provides
 * real serialization. Other contexts send a typed message; the SW
 * handler runs the matching transform under `runExclusive`.
 *
 * Transform functions can't cross the messaging boundary, so the API
 * is a discriminated union of named mutations. Add a new mutation kind
 * here, implement its transform in `applySettingsMutation`, and
 * callers anywhere in the extension can invoke it safely.
 */

import type { Settings, BetaFeatureUsage } from './schema'
import type { AutoSubmitFailure } from './telemetry'

/**
 * Discriminated union of all settings mutations that can be requested
 * from any extension context. Payloads are structured clones so they
 * must not contain functions, DOM nodes, or other non-transferable
 * values.
 */
export type SettingsMutation =
  | { kind: 'telemetry.addAutoSubmitFailure'; failure: AutoSubmitFailure; maxEntries: number }
  | { kind: 'telemetry.addBetaFeatureUsage'; usage: BetaFeatureUsage; maxEntries: number }
  | { kind: 'telemetry.clearAutoSubmitFailures' }
  | { kind: 'blacklist.addDomain'; domain: string; maxEntries: number }
  | { kind: 'blacklist.addUrl'; url: string; maxEntries: number }
  | { kind: 'blacklist.removeDomain'; domain: string }
  | { kind: 'blacklist.removeUrl'; url: string }
  | { kind: 'blacklist.clearDomains' }
  | { kind: 'blacklist.clearUrls' }
  | { kind: 'patch'; updates: Partial<Settings> }

export const SETTINGS_MUTATE_MESSAGE_TYPE = 'STORAGE_SETTINGS_MUTATE' as const

export interface SettingsMutateMessage {
  type: typeof SETTINGS_MUTATE_MESSAGE_TYPE
  mutation: SettingsMutation
}

export interface SettingsMutateResponse {
  ok: boolean
  error?: string
}

/**
 * Translate a mutation kind into the transform that applySettingsMutation
 * feeds into PlaintextStorage.mutateSettings. Centralized so callers
 * can't introduce bespoke transforms that skip the lock.
 */
export function settingsMutationToTransform(
  mutation: SettingsMutation
): (current: Settings) => Partial<Settings> {
  switch (mutation.kind) {
    case 'telemetry.addAutoSubmitFailure':
      return current => {
        const failures = [...(current.autoSubmitFailures ?? [])]
        failures.unshift(mutation.failure)
        if (failures.length > mutation.maxEntries) {
          failures.splice(mutation.maxEntries)
        }
        return { autoSubmitFailures: failures }
      }
    case 'telemetry.addBetaFeatureUsage':
      return current => {
        const usage = [...(current.betaFeatureUsage ?? [])]
        usage.unshift(mutation.usage)
        if (usage.length > mutation.maxEntries) {
          usage.splice(mutation.maxEntries)
        }
        return { betaFeatureUsage: usage }
      }
    case 'telemetry.clearAutoSubmitFailures':
      return () => ({ autoSubmitFailures: [] })
    case 'blacklist.addDomain':
      return current => {
        const list = current.blacklistedDomains || []
        if (list.includes(mutation.domain)) return {}
        if (list.length >= mutation.maxEntries) return {}
        return { blacklistedDomains: [...list, mutation.domain] }
      }
    case 'blacklist.addUrl':
      return current => {
        const list = current.blacklistedUrls || []
        if (list.includes(mutation.url)) return {}
        if (list.length >= mutation.maxEntries) return {}
        return { blacklistedUrls: [...list, mutation.url] }
      }
    case 'blacklist.removeDomain':
      return current => ({
        blacklistedDomains: (current.blacklistedDomains || []).filter(
          d => d !== mutation.domain
        ),
      })
    case 'blacklist.removeUrl':
      return current => ({
        blacklistedUrls: (current.blacklistedUrls || []).filter(
          u => u !== mutation.url
        ),
      })
    case 'blacklist.clearDomains':
      return () => ({ blacklistedDomains: [] })
    case 'blacklist.clearUrls':
      return () => ({ blacklistedUrls: [] })
    case 'patch':
      return () => mutation.updates
  }
}

/**
 * True if the current JS context is the MV3 service worker. Used as
 * the dispatch heuristic: SW callers apply locally (their own mutex
 * is the canonical one); non-SW callers round-trip through the SW.
 */
export function isServiceWorkerContext(): boolean {
  // Service workers have no `window`. All other extension contexts
  // (popup, options, content script, devtools) have one.
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  return typeof self !== 'undefined' && typeof window === 'undefined'
}

/**
 * Client-side helper: send a mutation request to the SW and await the
 * ack. Used by non-SW contexts.
 */
export async function sendSettingsMutation(
  mutation: SettingsMutation
): Promise<void> {
  const response: SettingsMutateResponse = await chrome.runtime.sendMessage({
    type: SETTINGS_MUTATE_MESSAGE_TYPE,
    mutation,
  } satisfies SettingsMutateMessage)

  if (!response?.ok) {
    throw new Error(response?.error ?? 'Settings mutation failed')
  }
}
