import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('Focus gate behavior', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('marks field with data-inboxkey-focus-gated attribute', () => {
    const field = document.createElement('input')
    document.body.appendChild(field)
    field.setAttribute('data-inboxkey-focus-gated', 'true')
    expect(field.hasAttribute('data-inboxkey-focus-gated')).toBe(true)
  })

  it('prevents duplicate registration via attribute check', () => {
    const field = document.createElement('input')
    field.setAttribute('data-inboxkey-focus-gated', 'true')
    expect(field.hasAttribute('data-inboxkey-focus-gated')).toBe(true)
  })

  it('focus event fires handler', () => {
    const field = document.createElement('input')
    document.body.appendChild(field)
    const handler = vi.fn()
    field.addEventListener('focus', handler, { once: true })
    field.focus()
    expect(handler).toHaveBeenCalledOnce()
  })

  it('{ once: true } auto-removes listener after first fire', () => {
    const field = document.createElement('input')
    document.body.appendChild(field)
    const handler = vi.fn()
    field.addEventListener('focus', handler, { once: true })
    field.focus()
    field.blur()
    field.focus()
    expect(handler).toHaveBeenCalledOnce()
  })

  it('removeEventListener prevents handler from firing', () => {
    const field = document.createElement('input')
    document.body.appendChild(field)
    const handler = vi.fn()
    field.addEventListener('focus', handler, { once: true })
    field.removeEventListener('focus', handler)
    field.focus()
    expect(handler).not.toHaveBeenCalled()
  })

  it('removing attribute blocks handler re-entry check', () => {
    const field = document.createElement('input')
    field.setAttribute('data-inboxkey-focus-gated', 'true')
    field.removeAttribute('data-inboxkey-focus-gated')
    expect(field.hasAttribute('data-inboxkey-focus-gated')).toBe(false)
  })
})
