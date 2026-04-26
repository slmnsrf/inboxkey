/**
 * Tests for passwordless-watcher.ts
 *
 * Covers:
 *  1. Initial-load: detector true → sendMessage fired
 *  2. Initial-load: detector false → sendMessage NOT fired
 *  3. Per-URL one-shot: same URL detected twice → sendMessage called once
 *  4. SPA URL change via onUrlChanged() → detector fires for new URL
 *  5. automationLevel='manual' → sendMessage suppressed
 *  6. automationLevel flips mid-session via chrome.storage.onChanged
 *  7. Cleanup clears seenUrls + removes storage listener so re-init fires again
 *  8. Fail-closed default: sendMessage suppressed during storage hydration gap
 *  9. Hydration does not overwrite a value already set by onChanged listener
 * 10. onUrlChanged() public API contract: fires after debounce, not before
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { PasswordlessWatcher } from '../passwordless-watcher'

// ---------------------------------------------------------------------------
// Mock the detector — we never exercise all 4 real gates in unit tests
// ---------------------------------------------------------------------------
const mockDetectPasswordlessPage = vi.fn<[string], boolean>()

vi.mock('@/lib/detection/passwordless-page-detector', () => ({
  detectPasswordlessPage: mockDetectPasswordlessPage,
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Capture the most recently registered chrome.storage.onChanged listener.
 * Must be called AFTER initPasswordlessWatcher() so the listener is registered.
 */
function getLatestOnChangedListener(): (
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string
) => void {
  const calls = vi.mocked(chrome.storage.onChanged.addListener).mock.calls
  const latest = calls[calls.length - 1]
  if (!latest) throw new Error('No onChanged listener registered')
  return latest[0] as (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string
  ) => void
}

/**
 * Flush all pending microtasks (storage.get resolves as a Promise).
 */
async function flushMicrotasks(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0))
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let watcher: PasswordlessWatcher | null = null

beforeEach(() => {
  vi.clearAllMocks()

  // Default: detector returns false (safe baseline)
  mockDetectPasswordlessPage.mockReturnValue(false)

  // Default storage: automationLevel = 'autofill'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(vi.mocked(chrome.storage.local.get) as any).mockResolvedValue({
    settings: { automationLevel: 'autofill' },
  })

  // Simulate window.location.href = 'https://example.com/login'
  Object.defineProperty(window, 'location', {
    value: { href: 'https://example.com/login' },
    writable: true,
    configurable: true,
  })
})

afterEach(() => {
  // Always call cleanup to release resources
  if (watcher) {
    watcher.cleanup()
    watcher = null
  }
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('initPasswordlessWatcher', () => {

  it('test 1: initial load — detector returns true → sendMessage fired with correct payload', async () => {
    mockDetectPasswordlessPage.mockReturnValue(true)

    const { initPasswordlessWatcher } = await import('../passwordless-watcher')
    watcher = initPasswordlessWatcher()

    // Wait for the async storage hydration + .then()
    await flushMicrotasks()

    expect(chrome.runtime.sendMessage).toHaveBeenCalledOnce()
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'TRIGGER_INBOX_POLL',
      source: 'passwordless-page',
      url: 'https://example.com/login',
    })
  })

  it('test 2: initial load — detector returns false → sendMessage NOT called', async () => {
    mockDetectPasswordlessPage.mockReturnValue(false)

    const { initPasswordlessWatcher } = await import('../passwordless-watcher')
    watcher = initPasswordlessWatcher()

    await flushMicrotasks()

    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled()
  })

  it('test 3: per-URL one-shot — same URL detected twice → sendMessage called only once', async () => {
    mockDetectPasswordlessPage.mockReturnValue(true)

    const { initPasswordlessWatcher } = await import('../passwordless-watcher')
    watcher = initPasswordlessWatcher()

    await flushMicrotasks()

    // Simulate host calling onUrlChanged() for the SAME URL (e.g., SPA double-render)
    watcher.onUrlChanged()

    // Wait for 250ms debounce
    await new Promise(resolve => setTimeout(resolve, 300))

    // sendMessage should have been called exactly once (one-shot for this URL)
    expect(chrome.runtime.sendMessage).toHaveBeenCalledOnce()
  })

  it('test 4: SPA URL change — new URL → detector fires again for the new URL', async () => {
    // Initial URL detection: false to keep it clean
    mockDetectPasswordlessPage.mockReturnValueOnce(false)

    const { initPasswordlessWatcher } = await import('../passwordless-watcher')
    watcher = initPasswordlessWatcher()

    await flushMicrotasks()

    // Ensure sendMessage not called for initial false detection
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled()

    // Simulate SPA navigation: host updates location.href then calls onUrlChanged()
    Object.defineProperty(window, 'location', {
      value: { href: 'https://example.com/signin/magic' },
      writable: true,
      configurable: true,
    })

    // Detector now returns true for the new URL
    mockDetectPasswordlessPage.mockReturnValue(true)

    // Host-driven notification (replaces old pushState patch)
    watcher.onUrlChanged()

    // Wait for 250ms debounce
    await new Promise(resolve => setTimeout(resolve, 300))

    expect(chrome.runtime.sendMessage).toHaveBeenCalledOnce()
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'TRIGGER_INBOX_POLL',
      source: 'passwordless-page',
      url: 'https://example.com/signin/magic',
    })
  })

  it('test 5: automationLevel=manual → sendMessage suppressed', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(vi.mocked(chrome.storage.local.get) as any).mockResolvedValue({
      settings: { automationLevel: 'manual' },
    })

    mockDetectPasswordlessPage.mockReturnValue(true)

    const { initPasswordlessWatcher } = await import('../passwordless-watcher')
    watcher = initPasswordlessWatcher()

    await flushMicrotasks()

    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled()
  })

  it('test 6: automationLevel flips from autofill to manual mid-session → next detection suppressed', async () => {
    // Start with autofill but detector returns false on first URL to avoid initial fire
    mockDetectPasswordlessPage.mockReturnValueOnce(false)

    const { initPasswordlessWatcher } = await import('../passwordless-watcher')
    watcher = initPasswordlessWatcher()

    await flushMicrotasks()

    // Capture the onChanged listener registered by the watcher
    const listener = getLatestOnChangedListener()

    // Flip automationLevel to 'manual' via storage change event
    listener(
      { settings: { newValue: { automationLevel: 'manual' } } },
      'local'
    )

    // Now simulate SPA navigation to a new URL with detector returning true
    Object.defineProperty(window, 'location', {
      value: { href: 'https://example.com/login/check' },
      writable: true,
      configurable: true,
    })
    mockDetectPasswordlessPage.mockReturnValue(true)

    watcher.onUrlChanged()

    // Wait for 250ms debounce
    await new Promise(resolve => setTimeout(resolve, 300))

    // Should still be suppressed because manual mode is now active
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled()
  })

  it('test 7: cleanup clears seenUrls + removes storage listener so re-init fires again', async () => {
    mockDetectPasswordlessPage.mockReturnValue(true)

    const { initPasswordlessWatcher } = await import('../passwordless-watcher')
    watcher = initPasswordlessWatcher()

    await flushMicrotasks()

    // First init fires
    expect(chrome.runtime.sendMessage).toHaveBeenCalledOnce()

    // Clean up the first watcher
    watcher.cleanup()
    watcher = null

    // Verify storage listener was explicitly removed
    expect(vi.mocked(chrome.storage.onChanged.removeListener)).toHaveBeenCalled()

    // Clear mocks to reset call count
    vi.clearAllMocks()
    mockDetectPasswordlessPage.mockReturnValue(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(vi.mocked(chrome.storage.local.get) as any).mockResolvedValue({
      settings: { automationLevel: 'autofill' },
    })

    // Re-init should fire again (seenUrls was cleared)
    watcher = initPasswordlessWatcher()

    await flushMicrotasks()

    expect(chrome.runtime.sendMessage).toHaveBeenCalledOnce()
  })

  it('test 8: fail-closed default — sendMessage suppressed during storage hydration gap', async () => {
    // Stub storage.get to never resolve, simulating the hydration gap
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(vi.mocked(chrome.storage.local.get) as any).mockReturnValue(new Promise(() => {}))

    mockDetectPasswordlessPage.mockReturnValue(true)

    const { initPasswordlessWatcher } = await import('../passwordless-watcher')
    watcher = initPasswordlessWatcher()

    // Even if onUrlChanged fires immediately (before hydration resolves),
    // the watcher must NOT call sendMessage because the default is 'manual'.
    watcher.onUrlChanged()

    // Wait for debounce
    await new Promise(resolve => setTimeout(resolve, 300))

    // Must be silent — storage never resolved, so automationLevel stays 'manual'
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled()
  })

  it('test 9: hydration does not overwrite a value already set by onChanged listener', async () => {
    // Stub storage.get to resolve slowly (50ms), simulating the hydration gap.
    // The onChanged listener will fire before get() resolves, delivering 'manual'.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(vi.mocked(chrome.storage.local.get) as any).mockReturnValue(
      new Promise(resolve =>
        setTimeout(() => resolve({ settings: { automationLevel: 'autofill' } }), 50)
      )
    )

    // Detector always returns true for this test URL.
    mockDetectPasswordlessPage.mockReturnValue(true)

    const { initPasswordlessWatcher } = await import('../passwordless-watcher')
    watcher = initPasswordlessWatcher()

    // Fire onChanged with 'manual' before the slow get resolves.
    const listener = getLatestOnChangedListener()
    listener(
      { settings: { newValue: { automationLevel: 'manual' } } },
      'local'
    )

    // Wait 100ms — enough for both the listener and the slow get() to complete.
    await new Promise(resolve => setTimeout(resolve, 100))

    // Trigger a SPA navigation so maybeFireForUrl runs with the current automationLevel.
    Object.defineProperty(window, 'location', {
      value: { href: 'https://example.com/signin/check' },
      writable: true,
      configurable: true,
    })
    watcher.onUrlChanged()

    // Wait for 250ms debounce
    await new Promise(resolve => setTimeout(resolve, 300))

    // 'manual' from onChanged must win — sendMessage must NOT have been called.
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled()
  })

  it('test 10: onUrlChanged() public API — does not fire before debounce, fires after', async () => {
    // Initial URL: detector false (no initial fire)
    mockDetectPasswordlessPage.mockReturnValueOnce(false)

    const { initPasswordlessWatcher } = await import('../passwordless-watcher')
    watcher = initPasswordlessWatcher()

    await flushMicrotasks()
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled()

    // Navigate to a new URL that the detector recognises
    Object.defineProperty(window, 'location', {
      value: { href: 'https://example.com/check-inbox' },
      writable: true,
      configurable: true,
    })
    mockDetectPasswordlessPage.mockReturnValue(true)

    // Must NOT fire synchronously (before debounce window expires)
    watcher.onUrlChanged()
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled()

    // Must fire after debounce
    await new Promise(resolve => setTimeout(resolve, 300))
    expect(chrome.runtime.sendMessage).toHaveBeenCalledOnce()
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'TRIGGER_INBOX_POLL',
      source: 'passwordless-page',
      url: 'https://example.com/check-inbox',
    })
  })

})
