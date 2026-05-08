/**
 * debugLog
 * --------
 * Conditional console output for transient extension diagnostics.
 *
 * Default OFF. Toggled by Settings > Advanced > "Extraction debug log"
 * (`settings.extractionDebugLogEnabled`). When OFF, calls are no-ops so
 * port-disconnected, context-invalidated, and other lifecycle warnings
 * don't reach the user's browser console or chrome://extensions errors
 * page. When the user flips the flag on, the listener picks up the
 * change and subsequent calls log normally.
 *
 * Safe in any context (background, content, popup, options) — degrades
 * to no-op when `chrome.storage` is unavailable (e.g. content script
 * still alive on a page after the extension was reloaded).
 */
import { STORAGE_KEYS } from "@/lib/storage/schema"

let verboseEnabled = false

interface SettingsLike {
  extractionDebugLogEnabled?: boolean
}

function applySettings(value: unknown): void {
  if (value && typeof value === "object") {
    verboseEnabled = Boolean((value as SettingsLike).extractionDebugLogEnabled)
  }
}

// Hydrate once at module load. Errors are swallowed so a stale content
// script never produces an uncaught rejection.
try {
  const get = chrome?.storage?.local?.get?.bind(chrome.storage.local)
  if (get) {
    Promise.resolve(get(STORAGE_KEYS.SETTINGS)).then(
      (result) => applySettings(result?.[STORAGE_KEYS.SETTINGS]),
      () => {},
    )
  }
} catch {
  // chrome.storage unavailable; remain silent.
}

// Live-update on flag toggle. Optional chaining short-circuits when
// `chrome.storage` is undefined.
try {
  chrome?.storage?.onChanged?.addListener?.((changes, area) => {
    if (area !== "local") return
    const change = changes[STORAGE_KEYS.SETTINGS]
    if (change) applySettings(change.newValue)
  })
} catch {
  // chrome.storage unavailable; no listener installed.
}

export function debugLog(...args: unknown[]): void {
  if (verboseEnabled) console.warn(...args)
}
