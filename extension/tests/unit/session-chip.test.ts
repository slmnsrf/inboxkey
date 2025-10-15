/**
 * Unit tests for session-chip wrapper module
 *
 * session-chip.ts is a thin backward-compatibility bridge that delegates
 * to showFieldFeedback. These tests verify the public contract without
 * asserting on internal DOM structure (which is owned by field-feedback).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { showSessionChip } from '../../src/contents/session-chip'

// Mock split-input-detector (field-feedback depends on it)
vi.mock('../../src/lib/detection/split-input-detector', () => ({
  detectSplitInputGroup: vi.fn().mockReturnValue(null)
}))

// Need access to the mocked module to reset in beforeEach
import { detectSplitInputGroup } from '../../src/lib/detection/split-input-detector'

beforeEach(() => {
  // Ensure the split-input mock returns null (vi.clearAllMocks wipes it)
  vi.mocked(detectSplitInputGroup).mockReturnValue(null)

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

  // Mock requestAnimationFrame: run callback once via microtask
  let rafCounter = 0
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    const id = ++rafCounter
    Promise.resolve().then(() => cb(0))
    return id
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})

  // Mock CSS.escape
  if (typeof CSS === 'undefined') {
    (global as any).CSS = {}
  }
  if (!(CSS as any).escape) {
    (CSS as any).escape = (value: string) => value
  }
})

afterEach(() => {
  // Remove overlay elements (but NOT aria regions -- module-cached singletons)
  document.querySelectorAll('inboxkey-overlay').forEach(el => el.remove())
  document.querySelectorAll('input, div:not(#inboxkey-sr-status):not(#inboxkey-sr-alert)').forEach(el => {
    if (el.parentElement) el.remove()
  })
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('showSessionChip (delegation wrapper)', () => {
  it('returns a ChipHandle with update and hide methods', async () => {
    const field = document.createElement('input')
    document.body.appendChild(field)

    const handle = await showSessionChip(field, 20)

    expect(typeof handle.update).toBe('function')
    expect(typeof handle.hide).toBe('function')
  })

  it('creates an overlay element (delegates to showFieldFeedback)', async () => {
    const field = document.createElement('input')
    document.body.appendChild(field)

    await showSessionChip(field, 20)

    const overlay = document.querySelector('inboxkey-overlay')
    expect(overlay).toBeTruthy()
    expect(overlay!.getAttribute('data-state')).toBe('listening')
  })

  it('calling update("filled") does not throw', async () => {
    const field = document.createElement('input')
    document.body.appendChild(field)

    const handle = await showSessionChip(field, 20)

    expect(() => handle.update('filled')).not.toThrow()
  })

  it('calling hide() does not throw and removes overlay', async () => {
    const field = document.createElement('input')
    document.body.appendChild(field)

    const handle = await showSessionChip(field, 20)

    expect(() => handle.hide()).not.toThrow()
    expect(document.querySelector('inboxkey-overlay')).toBeNull()
  })

  it('forwards onClose callback', async () => {
    const onClose = vi.fn()
    const field = document.createElement('input')
    document.body.appendChild(field)

    await showSessionChip(field, 20, { onClose })

    // Trigger Escape key - should invoke onClose via field-feedback
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('returns no-op handle when chips are disabled', async () => {
    ;(chrome.storage.local.get as any).mockResolvedValueOnce({
      settings: { showSessionChips: false }
    })

    const field = document.createElement('input')
    document.body.appendChild(field)

    const handle = await showSessionChip(field, 20)

    // No overlay created
    expect(document.querySelector('inboxkey-overlay')).toBeNull()

    // Methods should not throw
    expect(() => handle.update('filled')).not.toThrow()
    expect(() => handle.hide()).not.toThrow()
  })
})
