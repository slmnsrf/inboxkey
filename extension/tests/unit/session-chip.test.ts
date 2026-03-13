import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { showSessionChip } from '../../src/contents/session-chip'

// Mock chrome.storage for settings
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
})

describe('showSessionChip (delegation wrapper)', () => {
  it('returns a handle with update and hide methods', async () => {
    const field = document.createElement('input')
    document.body.appendChild(field)

    const handle = await showSessionChip(field, 20)
    expect(typeof handle.update).toBe('function')
    expect(typeof handle.hide).toBe('function')
  })

  it('wraps the field in a shimmer container (not a floating chip)', async () => {
    const field = document.createElement('input')
    document.body.appendChild(field)

    await showSessionChip(field, 20)

    const wrapper = field.parentElement
    expect(wrapper!.classList.contains('inboxkey-shimmer-wrap')).toBe(true)
  })

  it('forwards onClose callback to field-feedback', async () => {
    const onClose = vi.fn()
    const field = document.createElement('input')
    document.body.appendChild(field)

    await showSessionChip(field, 20, { onClose })

    const dismissBtn = field.parentElement!.querySelector('.inboxkey-field-tooltip-dismiss') as HTMLButtonElement
    expect(dismissBtn).toBeTruthy()
    dismissBtn.click()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('returns no-op handle when chips are disabled', async () => {
    ;(chrome.storage.local.get as any).mockResolvedValueOnce({
      settings: { showSessionChips: false }
    })

    const field = document.createElement('input')
    document.body.appendChild(field)

    const handle = await showSessionChip(field, 20)
    expect(field.parentElement).toBe(document.body) // Not wrapped
    expect(() => handle.update('filled')).not.toThrow()
    expect(() => handle.hide()).not.toThrow()
  })
})
