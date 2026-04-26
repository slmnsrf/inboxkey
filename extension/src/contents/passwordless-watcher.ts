/**
 * Passwordless Page Watcher
 *
 * Detects "check your inbox" interstitial pages and fires TRIGGER_INBOX_POLL
 * so the background can poll immediately without the user opening the popup.
 *
 * Lifecycle:
 *   1. On init: read automationLevel from chrome.storage.local, cache it,
 *      subscribe to chrome.storage.onChanged for live updates.
 *   2. On initial load: run detectPasswordlessPage(url) and fire if positive.
 *   3. On SPA navigation: monkey-patch pushState/replaceState and listen for
 *      popstate. After 250ms debounce, re-run detection on new URL.
 *   4. Per-URL one-shot: a Set<string> prevents re-firing on the same URL
 *      within one content-script lifetime.
 *   5. Cleanup: restores patched globals, removes listeners, clears state.
 */

import { detectPasswordlessPage } from '@/lib/detection/passwordless-page-detector'
import type { AutomationLevel } from '@/lib/storage/schema'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialize the passwordless page watcher.
 *
 * Must be called inside the content-script IIFE after domain/HTML checks pass.
 *
 * @returns Cleanup function — call on `beforeunload` to remove all listeners
 *          and restore patched globals.
 */
export function initPasswordlessWatcher(): () => void {
  // -- State ----------------------------------------------------------------

  /** URLs already fired this content-script lifetime (prevents re-fire on same URL). */
  const seenUrls = new Set<string>()

  /** Cached automation level — updated by chrome.storage.onChanged. */
  let automationLevel: AutomationLevel = 'manual'

  /**
   * Set to true the first time onChanged delivers a settings value.
   * Prevents the async storage.get() callback from overwriting a fresher
   * value that already arrived via the listener while the get was in flight.
   */
  let hydratedFromListener = false

  /** Debounce timer id for SPA URL changes. */
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  /** Original pushState/replaceState references (restored on cleanup). */
  const originalPushState = history.pushState
  const originalReplaceState = history.replaceState

  // -- Automation level cache ----------------------------------------------

  /**
   * Read and cache automationLevel from chrome.storage.local.
   * Async, but called once at init — result is ready before first SPA event.
   *
   * Only applies the storage result if the onChanged listener has not already
   * delivered a fresher value. This prevents a stale storage.get() response
   * from overwriting a value that arrived via onChanged while the get was
   * in flight.
   */
  async function hydrateAutomationLevel(): Promise<void> {
    try {
      const result = await chrome.storage.local.get('settings')
      // Only apply if a fresher value didn't already arrive via onChanged
      if (!hydratedFromListener) {
        automationLevel = result.settings?.automationLevel ?? 'autofill'
      }
    } catch {
      // Fail-closed: leave automationLevel as 'manual' so the watcher does
      // nothing if storage is unavailable. Better to miss a fire than to fire
      // when the user may have configured manual mode.
    }
  }

  /**
   * chrome.storage.onChanged listener.
   * Keeps automationLevel in sync after the user changes it in settings.
   */
  function onStorageChanged(
    changes: Record<string, chrome.storage.StorageChange>
  ): void {
    if (changes.settings) {
      automationLevel =
        changes.settings.newValue?.automationLevel ?? 'autofill'
      hydratedFromListener = true
    }
  }

  chrome.storage.onChanged.addListener(onStorageChanged)

  // -- Detection & fire ----------------------------------------------------

  /**
   * Run detection on the given URL. If positive (and not yet seen, and not
   * in manual mode), send TRIGGER_INBOX_POLL to the background.
   */
  function maybeFireForUrl(url: string): void {
    if (automationLevel === 'manual') return
    if (seenUrls.has(url)) return
    if (!detectPasswordlessPage(url)) return

    seenUrls.add(url)

    // Fire-and-forget — background always returns { success: true }
    try {
      chrome.runtime.sendMessage({
        type: 'TRIGGER_INBOX_POLL',
        source: 'passwordless-page',
        url,
      })
    } catch {
      // Extension context invalidated (e.g., extension update). Remove from
      // seenUrls so a subsequent navigation can retry once context recovers.
      seenUrls.delete(url)
    }
  }

  // -- Initial load --------------------------------------------------------

  // Hydrate cache then evaluate current page.
  // We intentionally don't block on this — in production the storage read
  // takes <5ms and the initial DOM is already stable. If the user has 'manual'
  // in storage it will be set before any SPA event could fire (those are user-
  // initiated and come later). The only edge case is the very first page load
  // with manual mode: the await ensures we respect it before firing.
  hydrateAutomationLevel().then(() => {
    maybeFireForUrl(window.location.href)
  })

  // -- SPA URL-change detection --------------------------------------------

  /**
   * Debounced handler for any URL change event.
   * Waits 250ms to let SPA double-renders settle before evaluating.
   */
  function onUrlChange(): void {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer)
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      maybeFireForUrl(window.location.href)
    }, 250)
  }

  // popstate covers browser back/forward navigation
  window.addEventListener('popstate', onUrlChange)

  // Monkey-patch pushState and replaceState for SPA router navigation.
  // Named functions allow identity-check in cleanup so we only unwrap our own
  // patch (preserving any third-party patch installed after ours).
  function patchedPushState(...args: Parameters<typeof history.pushState>): void {
    originalPushState.call(history, ...args)
    onUrlChange()
  }
  function patchedReplaceState(...args: Parameters<typeof history.replaceState>): void {
    originalReplaceState.call(history, ...args)
    onUrlChange()
  }

  history.pushState = patchedPushState
  history.replaceState = patchedReplaceState

  // -- Cleanup -------------------------------------------------------------

  return function cleanup(): void {
    // Clear debounce timer
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }

    // Remove URL listeners
    window.removeEventListener('popstate', onUrlChange)

    // Restore original history methods only if our patch is still on top.
    // This preserves any third-party patch that may have wrapped ours.
    if (history.pushState === patchedPushState) {
      history.pushState = originalPushState
    }
    if (history.replaceState === patchedReplaceState) {
      history.replaceState = originalReplaceState
    }

    // Unsubscribe storage listener
    chrome.storage.onChanged.removeListener(onStorageChanged)

    // Clear seen-URL set
    seenUrls.clear()
  }
}
