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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AutomationLevel = 'autofill' | 'manual' | string

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
  let automationLevel: AutomationLevel = 'autofill'

  /** Debounce timer id for SPA URL changes. */
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  /** Original pushState/replaceState references (restored on cleanup). */
  const originalPushState = history.pushState.bind(history)
  const originalReplaceState = history.replaceState.bind(history)

  // -- Automation level cache ----------------------------------------------

  /**
   * Read and cache automationLevel from chrome.storage.local.
   * Async, but called once at init — result is ready before first SPA event.
   */
  async function hydrateAutomationLevel(): Promise<void> {
    try {
      const result = await chrome.storage.local.get('settings')
      automationLevel = result.settings?.automationLevel ?? 'autofill'
    } catch {
      // Fail-open: default to 'autofill' so the watcher still fires.
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
    chrome.runtime.sendMessage({
      type: 'TRIGGER_INBOX_POLL',
      source: 'passwordless-page',
      url,
    })
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

  // Monkey-patch pushState and replaceState for SPA router navigation
  history.pushState = function (
    ...args: Parameters<typeof history.pushState>
  ): void {
    originalPushState(...args)
    onUrlChange()
  }

  history.replaceState = function (
    ...args: Parameters<typeof history.replaceState>
  ): void {
    originalReplaceState(...args)
    onUrlChange()
  }

  // -- Cleanup -------------------------------------------------------------

  return function cleanup(): void {
    // Clear debounce timer
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }

    // Remove URL listeners
    window.removeEventListener('popstate', onUrlChange)

    // Restore original history methods
    history.pushState = originalPushState
    history.replaceState = originalReplaceState

    // Unsubscribe storage listener
    chrome.storage.onChanged.removeListener(onStorageChanged)

    // Clear seen-URL set
    seenUrls.clear()
  }
}
