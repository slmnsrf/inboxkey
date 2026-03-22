/**
 * Unit tests for field-feedback core module (Shadow DOM Overlay approach)
 *
 * Tests overlay creation, host-attribute state transitions, cleanup,
 * dismiss/cancel, auto-dismiss, compact mode, double-load guard, and
 * no-op handle when disabled.
 *
 * NOTE: The Shadow DOM is closed, so tests rely on host element attributes
 * (data-state, data-compact, etc.) which are mirrored for testability.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock split-input-detector so we control split detection per test
vi.mock('../../src/lib/detection/split-input-detector', () => ({
  detectSplitInputGroup: vi.fn().mockReturnValue(null)
}))

import { showFieldFeedback } from '../../src/contents/field-feedback'
import { detectSplitInputGroup } from '../../src/lib/detection/split-input-detector'

// ─── Environment setup ──────────────────────────────────────────────────────

beforeEach(() => {
  // Ensure the split-input mock returns null (vi.clearAllMocks wipes it)
  vi.mocked(detectSplitInputGroup).mockReturnValue(null)

  // Mock chrome.storage so setting check resolves to enabled
  global.chrome = {
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({ settings: { showSessionChips: true } })
      }
    }
  } as any

  // Mock IntersectionObserver (not available in happy-dom)
  global.IntersectionObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  })) as any

  // Mock requestAnimationFrame: run callback once via microtask to avoid
  // infinite recursion from OverlayManager's rAF loop, while still allowing
  // syncPosition to execute for each overlay.
  let rafCounter = 0
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    const id = ++rafCounter
    // Run once asynchronously so the overlay constructor finishes first
    Promise.resolve().then(() => cb(0))
    return id
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})

  // Mock CSS.escape (not available in happy-dom)
  if (typeof CSS === 'undefined') {
    (global as any).CSS = {}
  }
  if (!(CSS as any).escape) {
    (CSS as any).escape = (value: string) => value
  }
})

afterEach(() => {
  // Remove overlay elements (but NOT aria regions -- they are module-cached
  // singletons that cannot be recreated once the module-level refs are set)
  document.querySelectorAll('inboxkey-overlay').forEach(el => el.remove())
  // Remove test-created elements (inputs, containers) but preserve aria regions
  document.querySelectorAll('input, div:not(#inboxkey-sr-status):not(#inboxkey-sr-alert)').forEach(el => {
    if (el.parentElement) el.remove()
  })
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

// ─── Test 1: Overlay creation ───────────────────────────────────────────────

describe('showFieldFeedback', () => {
  it('creates an <inboxkey-overlay> element on document.body', async () => {
    const field = document.createElement('input')
    field.type = 'text'
    document.body.appendChild(field)

    await showFieldFeedback(field)

    const overlay = document.querySelector('inboxkey-overlay')
    expect(overlay).toBeTruthy()
    expect(overlay!.parentElement).toBe(document.body)
  })

  it('does NOT wrap the input in a container (no DOM restructuring)', async () => {
    const container = document.createElement('div')
    const field = document.createElement('input')
    container.appendChild(field)
    document.body.appendChild(container)

    await showFieldFeedback(field)

    // Field should remain a child of its original container
    expect(field.parentElement).toBe(container)
  })

  it('returns a ChipHandle with update and hide methods', async () => {
    const field = document.createElement('input')
    document.body.appendChild(field)

    const handle = await showFieldFeedback(field)

    expect(typeof handle.update).toBe('function')
    expect(typeof handle.hide).toBe('function')
  })

  it('sets data-state="listening" initially', async () => {
    const field = document.createElement('input')
    document.body.appendChild(field)

    await showFieldFeedback(field)

    const overlay = document.querySelector('inboxkey-overlay')
    expect(overlay!.getAttribute('data-state')).toBe('listening')
  })

  it('creates shared ARIA live regions on document.body', async () => {
    const field = document.createElement('input')
    document.body.appendChild(field)

    await showFieldFeedback(field)

    const statusRegion = document.getElementById('inboxkey-sr-status')
    expect(statusRegion).toBeTruthy()
    expect(statusRegion!.getAttribute('role')).toBe('status')
    expect(statusRegion!.getAttribute('aria-live')).toBe('polite')

    const alertRegion = document.getElementById('inboxkey-sr-alert')
    expect(alertRegion).toBeTruthy()
    expect(alertRegion!.getAttribute('role')).toBe('alert')
    expect(alertRegion!.getAttribute('aria-live')).toBe('assertive')
  })
})

// ─── Test 2: State transitions ──────────────────────────────────────────────

describe('ChipHandle.update', () => {
  it('changes data-state to "filled"', async () => {
    const field = document.createElement('input')
    document.body.appendChild(field)

    const handle = await showFieldFeedback(field)
    handle.update('filled')

    const overlay = document.querySelector('inboxkey-overlay')
    expect(overlay!.getAttribute('data-state')).toBe('filled')
  })

  it('changes data-state to "timeout"', async () => {
    const field = document.createElement('input')
    document.body.appendChild(field)

    const handle = await showFieldFeedback(field)
    handle.update('timeout')

    const overlay = document.querySelector('inboxkey-overlay')
    expect(overlay!.getAttribute('data-state')).toBe('timeout')
  })

  it('changes data-state to "copied"', async () => {
    const field = document.createElement('input')
    document.body.appendChild(field)

    const handle = await showFieldFeedback(field)
    handle.update('copied')

    const overlay = document.querySelector('inboxkey-overlay')
    expect(overlay!.getAttribute('data-state')).toBe('copied')
  })

  it('updates data-text attribute with status message', async () => {
    const field = document.createElement('input')
    document.body.appendChild(field)

    const handle = await showFieldFeedback(field)

    expect(
      document.querySelector('inboxkey-overlay')!.getAttribute('data-text')
    ).toBe('InboxKey')

    handle.update('filled')
    expect(
      document.querySelector('inboxkey-overlay')!.getAttribute('data-text')
    ).toBe('Code filled')

    handle.update('copied')
    expect(
      document.querySelector('inboxkey-overlay')!.getAttribute('data-text')
    ).toBe('Copied to clipboard')

    handle.update('timeout')
    expect(
      document.querySelector('inboxkey-overlay')!.getAttribute('data-text')
    ).toBe('No code received')
  })

  it('updates ARIA live region for filled state', async () => {
    const field = document.createElement('input')
    document.body.appendChild(field)

    const handle = await showFieldFeedback(field)
    handle.update('filled')

    const statusRegion = document.getElementById('inboxkey-sr-status')
    expect(statusRegion!.textContent).toBe('Verification code filled automatically')
  })

  it('updates ARIA alert region for timeout state', async () => {
    const field = document.createElement('input')
    document.body.appendChild(field)

    const handle = await showFieldFeedback(field)
    handle.update('timeout')

    const alertRegion = document.getElementById('inboxkey-sr-alert')
    expect(alertRegion!.textContent).toBe('No verification code received')
  })
})

// ─── Test 3: Cleanup (hide) ─────────────────────────────────────────────────

describe('ChipHandle.hide', () => {
  it('removes the overlay from DOM', async () => {
    const field = document.createElement('input')
    document.body.appendChild(field)

    const handle = await showFieldFeedback(field)
    expect(document.querySelector('inboxkey-overlay')).toBeTruthy()

    handle.hide()
    expect(document.querySelector('inboxkey-overlay')).toBeNull()
  })

  it('preserves the field in its original parent after hide', async () => {
    const container = document.createElement('div')
    const field = document.createElement('input')
    container.appendChild(field)
    document.body.appendChild(container)

    const handle = await showFieldFeedback(field)
    handle.hide()

    expect(field.parentElement).toBe(container)
    expect(document.contains(field)).toBe(true)
  })

  it('preserves field value after hide', async () => {
    const container = document.createElement('div')
    const field = document.createElement('input')
    container.appendChild(field)
    document.body.appendChild(container)

    const handle = await showFieldFeedback(field)
    field.value = '123456'
    field.dispatchEvent(new Event('input', { bubbles: true }))

    handle.hide()

    expect(field.value).toBe('123456')
    expect(document.contains(field)).toBe(true)
  })
})

// ─── Test 4: Compact mode ───────────────────────────────────────────────────

describe('compact mode', () => {
  it('sets data-compact="true" when input is narrow (<120px)', async () => {
    const field = document.createElement('input')
    document.body.appendChild(field)

    // Mock getBoundingClientRect to return a narrow width
    vi.spyOn(field, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 100,
      right: 80,
      bottom: 130,
      width: 80,
      height: 30,
      x: 0,
      y: 100,
      toJSON: () => {},
    })

    await showFieldFeedback(field)

    const overlay = document.querySelector('inboxkey-overlay')
    expect(overlay!.getAttribute('data-compact')).toBe('true')
  })

  it('sets data-compact="false" when input is wide enough (>=120px)', async () => {
    const field = document.createElement('input')
    document.body.appendChild(field)

    vi.spyOn(field, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 100,
      right: 300,
      bottom: 130,
      width: 300,
      height: 30,
      x: 0,
      y: 100,
      toJSON: () => {},
    })

    await showFieldFeedback(field)

    const overlay = document.querySelector('inboxkey-overlay')
    expect(overlay!.getAttribute('data-compact')).toBe('false')
  })
})

// ─── Test 5: Auto-dismiss ───────────────────────────────────────────────────

describe('auto-dismiss', () => {
  it('destroys overlay after filled auto-dismiss delay (3s)', async () => {
    vi.useFakeTimers()

    const field = document.createElement('input')
    document.body.appendChild(field)

    const handle = await showFieldFeedback(field)
    handle.update('filled')

    expect(document.querySelector('inboxkey-overlay')).not.toBeNull()

    // Advance past the 3s auto-dismiss
    vi.advanceTimersByTime(3000)

    // Overlay should be destroyed (removed from DOM), not just set to idle
    expect(document.querySelector('inboxkey-overlay')).toBeNull()

    vi.useRealTimers()
  })

  it('destroys overlay after timeout auto-dismiss delay (4s)', async () => {
    vi.useFakeTimers()

    const field = document.createElement('input')
    document.body.appendChild(field)

    const handle = await showFieldFeedback(field)
    handle.update('timeout')

    expect(document.querySelector('inboxkey-overlay')).not.toBeNull()

    vi.advanceTimersByTime(4000)

    expect(document.querySelector('inboxkey-overlay')).toBeNull()

    vi.useRealTimers()
  })

  it('destroys overlay after copied auto-dismiss delay (2s)', async () => {
    vi.useFakeTimers()

    const field = document.createElement('input')
    document.body.appendChild(field)

    const handle = await showFieldFeedback(field)
    handle.update('copied')

    expect(document.querySelector('inboxkey-overlay')).not.toBeNull()

    vi.advanceTimersByTime(2000)

    expect(document.querySelector('inboxkey-overlay')).toBeNull()

    vi.useRealTimers()
  })
})

// ─── Test 6: Double-load guard ──────────────────────────────────────────────

describe('double-load guard', () => {
  it('returns the same handle when called twice on the same input', async () => {
    const field = document.createElement('input')
    field.id = 'otp-field'
    document.body.appendChild(field)

    const handle1 = await showFieldFeedback(field)
    const handle2 = await showFieldFeedback(field)

    expect(handle2).toBe(handle1)

    // Only one overlay should exist
    const overlays = document.querySelectorAll('inboxkey-overlay')
    expect(overlays.length).toBe(1)
  })
})

// ─── Test 7: No-op handle when disabled ─────────────────────────────────────

describe('disabled chip setting', () => {
  it('returns NO_OP_HANDLE when showSessionChips is false', async () => {
    ;(chrome.storage.local.get as any).mockResolvedValueOnce({
      settings: { showSessionChips: false }
    })

    const field = document.createElement('input')
    document.body.appendChild(field)

    const handle = await showFieldFeedback(field)

    // No overlay should be created
    expect(document.querySelector('inboxkey-overlay')).toBeNull()

    // update/hide should not throw
    expect(() => handle.update('filled')).not.toThrow()
    expect(() => handle.hide()).not.toThrow()
  })
})

// ─── Test 8: Escape key dismiss ─────────────────────────────────────────────

describe('Escape key dismissal', () => {
  it('fires onClose callback when Escape is pressed', async () => {
    const onClose = vi.fn()
    const field = document.createElement('input')
    document.body.appendChild(field)

    await showFieldFeedback(field, { onClose })

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does NOT fire onClose for non-Escape keys', async () => {
    const onClose = vi.fn()
    const field = document.createElement('input')
    document.body.appendChild(field)

    await showFieldFeedback(field, { onClose })

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))

    expect(onClose).not.toHaveBeenCalled()
  })
})

// ─── Test 9: Split input support ────────────────────────────────────────────

describe('split input support', () => {
  it('creates overlays for each input in a detected split group', async () => {
    const container = document.createElement('div')
    const inputs: HTMLInputElement[] = []
    for (let i = 0; i < 6; i++) {
      const input = document.createElement('input')
      input.maxLength = 1
      input.type = 'text'
      container.appendChild(input)
      inputs.push(input)
    }
    document.body.appendChild(container)

    ;(detectSplitInputGroup as any).mockReturnValue({ inputs })

    await showFieldFeedback(inputs[0])

    // Each split input gets its own overlay
    const overlays = document.querySelectorAll('inboxkey-overlay')
    expect(overlays.length).toBe(6)

    // All should be in listening state
    overlays.forEach(overlay => {
      expect(overlay.getAttribute('data-state')).toBe('listening')
    })
  })

  it('updates all split overlays when handle.update is called', async () => {
    const container = document.createElement('div')
    const inputs: HTMLInputElement[] = []
    for (let i = 0; i < 4; i++) {
      const input = document.createElement('input')
      input.maxLength = 1
      container.appendChild(input)
      inputs.push(input)
    }
    document.body.appendChild(container)

    ;(detectSplitInputGroup as any).mockReturnValue({ inputs })

    const handle = await showFieldFeedback(inputs[0])
    handle.update('filled')

    const overlays = document.querySelectorAll('inboxkey-overlay')
    overlays.forEach(overlay => {
      expect(overlay.getAttribute('data-state')).toBe('filled')
    })
  })

  it('removes all split overlays when handle.hide is called', async () => {
    const container = document.createElement('div')
    const inputs: HTMLInputElement[] = []
    for (let i = 0; i < 4; i++) {
      const input = document.createElement('input')
      input.maxLength = 1
      container.appendChild(input)
      inputs.push(input)
    }
    document.body.appendChild(container)

    ;(detectSplitInputGroup as any).mockReturnValue({ inputs })

    const handle = await showFieldFeedback(inputs[0])
    handle.hide()

    expect(document.querySelectorAll('inboxkey-overlay').length).toBe(0)
  })
})
