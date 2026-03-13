/**
 * Unit tests for field-feedback core module
 * Tests DOM wrapping, state transitions, cleanup, dismiss, and split-input support
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { showFieldFeedback } from '../../src/contents/field-feedback'

// Mock split-input-detector so we control split detection per test
vi.mock('../../src/lib/detection/split-input-detector', () => ({
  detectSplitInputGroup: vi.fn().mockReturnValue(null)
}))
import { detectSplitInputGroup } from '../../src/lib/detection/split-input-detector'

beforeEach(() => {
  global.chrome = {
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({ settings: { showSessionChips: true } })
      }
    }
  } as any
})

afterEach(() => {
  document.body.innerHTML = ''
  document.head.querySelectorAll('style[id^="inboxkey-"]').forEach(s => s.remove())
  // Restore window.matchMedia to default
  if (window.matchMedia.toString().includes('mockImplementation')) {
    // If we mocked it, restore default behavior by deleting it
    delete (window as any).matchMedia
  }
  vi.clearAllMocks()
})

// ─── Test 1: DOM wrapping ─────────────────────────────────────────────────────

describe('showFieldFeedback', () => {
  it('wraps the target field in a shimmer container', async () => {
    const field = document.createElement('input')
    field.type = 'text'
    document.body.appendChild(field)

    await showFieldFeedback(field)

    const wrapper = field.parentElement
    expect(wrapper).toBeTruthy()
    expect(wrapper!.classList.contains('inboxkey-shimmer-wrap')).toBe(true)
    expect(wrapper!.classList.contains('inboxkey-shimmer-wrap--listening')).toBe(true)
  })

  it('returns a ChipHandle with update and hide methods', async () => {
    const field = document.createElement('input')
    document.body.appendChild(field)
    const handle = await showFieldFeedback(field)
    expect(typeof handle.update).toBe('function')
    expect(typeof handle.hide).toBe('function')
  })

  it('adds a tooltip with dismiss button inside wrapper', async () => {
    const field = document.createElement('input')
    document.body.appendChild(field)
    await showFieldFeedback(field)
    const tooltip = field.parentElement!.querySelector('.inboxkey-field-tooltip')
    expect(tooltip).toBeTruthy()
    expect(tooltip!.textContent).toContain('Checking emails')
    const dismissBtn = tooltip!.querySelector('.inboxkey-field-tooltip-dismiss')
    expect(dismissBtn).toBeTruthy()
    expect(dismissBtn!.getAttribute('aria-label')).toBe('Dismiss InboxKey')
  })

  it('injects styles into document head', async () => {
    const field = document.createElement('input')
    document.body.appendChild(field)
    await showFieldFeedback(field)
    const style = document.getElementById('inboxkey-field-feedback-styles')
    expect(style).toBeTruthy()
    expect(style!.tagName).toBe('STYLE')
  })

  it('adds ARIA live region for accessibility', async () => {
    const field = document.createElement('input')
    document.body.appendChild(field)
    await showFieldFeedback(field)
    const liveRegion = field.parentElement!.querySelector('[role="status"]')
    expect(liveRegion).toBeTruthy()
    expect(liveRegion!.getAttribute('aria-live')).toBe('polite')
  })
})

// ─── Test 2: State transitions ────────────────────────────────────────────────

describe('ChipHandle.update', () => {
  it('changes shimmer wrapper class to filled state', async () => {
    const field = document.createElement('input')
    document.body.appendChild(field)
    const handle = await showFieldFeedback(field)
    handle.update('filled')
    const wrapper = field.parentElement!
    expect(wrapper.classList.contains('inboxkey-shimmer-wrap--filled')).toBe(true)
    expect(wrapper.classList.contains('inboxkey-shimmer-wrap--listening')).toBe(false)
  })

  it('updates tooltip text for each state', async () => {
    const field = document.createElement('input')
    document.body.appendChild(field)
    const handle = await showFieldFeedback(field)
    const tooltip = field.parentElement!.querySelector('.inboxkey-field-tooltip')!

    handle.update('filled')
    expect(tooltip.textContent).toBe('Code filled')

    handle.update('copied')
    expect(tooltip.textContent).toBe('Copied to clipboard')

    handle.update('timeout')
    expect(tooltip.textContent).toBe('No code received')
  })

  it('updates ARIA live region text', async () => {
    const field = document.createElement('input')
    document.body.appendChild(field)
    const handle = await showFieldFeedback(field)
    const liveRegion = field.parentElement!.querySelector('[role="status"]')!
    handle.update('filled')
    expect(liveRegion.textContent).toBe('Success: Code filled automatically')
  })
})

// ─── Test 3: Cleanup ──────────────────────────────────────────────────────────

describe('ChipHandle.hide', () => {
  it('unwraps the field back to its original parent', async () => {
    const container = document.createElement('div')
    const field = document.createElement('input')
    container.appendChild(field)
    document.body.appendChild(container)
    const handle = await showFieldFeedback(field)
    expect(field.parentElement!.classList.contains('inboxkey-shimmer-wrap')).toBe(true)
    handle.hide()
    // hide() should be synchronous for DOM restructure
    expect(field.parentElement).toBe(container)
  })

  it('removes tooltip and live region from DOM', async () => {
    const field = document.createElement('input')
    document.body.appendChild(field)
    const handle = await showFieldFeedback(field)
    handle.hide()
    expect(document.querySelector('.inboxkey-field-tooltip')).toBeNull()
    expect(document.querySelector('[role="status"]')).toBeNull()
  })
})

// ─── Test 4: Dismiss/cancel flow ──────────────────────────────────────────────

describe('dismiss control', () => {
  it('calls onClose and hides when dismiss button clicked in listening state', async () => {
    const onClose = vi.fn()
    const field = document.createElement('input')
    document.body.appendChild(field)
    await showFieldFeedback(field, { onClose })
    const dismissBtn = field.parentElement!.querySelector('.inboxkey-field-tooltip-dismiss') as HTMLButtonElement
    expect(dismissBtn).toBeTruthy()
    dismissBtn.click()
    expect(onClose).toHaveBeenCalledOnce()
    expect(field.parentElement).toBe(document.body) // unwrapped after dismiss
  })
})

// ─── Test 5: hide() safety after autofill ─────────────────────────────────────

describe('ChipHandle.hide safety', () => {
  it('preserves field value after hide() unwraps the DOM', async () => {
    const container = document.createElement('div')
    const field = document.createElement('input')
    container.appendChild(field)
    document.body.appendChild(container)
    const handle = await showFieldFeedback(field)
    field.value = '123456'
    field.dispatchEvent(new Event('input', { bubbles: true }))
    handle.hide()
    expect(document.contains(field)).toBe(true)
    expect(field.value).toBe('123456')
    expect(field.parentElement).toBe(container)
  })
})

// ─── Test 6: No-op handle when disabled ───────────────────────────────────────

describe('disabled chip setting', () => {
  it('returns no-op handle when showSessionChips is false', async () => {
    ;(chrome.storage.local.get as any).mockResolvedValueOnce({
      settings: { showSessionChips: false }
    })
    const field = document.createElement('input')
    document.body.appendChild(field)
    const handle = await showFieldFeedback(field)
    expect(field.parentElement).toBe(document.body)
    expect(() => handle.update('filled')).not.toThrow()
    expect(() => handle.hide()).not.toThrow()
  })
})

// ─── Test 7: Split input support ──────────────────────────────────────────────

describe('split input support (auto-detected internally)', () => {
  it('wraps each OTP cell individually when split group is detected', async () => {
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
    for (const input of inputs) {
      expect(input.parentElement!.classList.contains('inboxkey-shimmer-wrap')).toBe(true)
    }
    // No inline text on split inputs (too small per-cell)
    const inlineTexts = container.querySelectorAll('.inboxkey-inline-text')
    expect(inlineTexts.length).toBe(0)
  })
})

// ─── Test 8: Theme detection ──────────────────────────────────────────────────

describe('theme detection', () => {
  it('detects dark theme from prefers-color-scheme', async () => {
    // Mock matchMedia
    window.matchMedia = vi.fn().mockImplementation(query => ({
      matches: query === '(prefers-color-scheme: dark)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))

    const field = document.createElement('input')
    document.body.appendChild(field)

    await showFieldFeedback(field)

    const style = document.getElementById('inboxkey-field-feedback-styles')
    // Dark theme should use dark blue channel
    expect(style!.textContent).toContain('10, 132, 255')
  })
})
