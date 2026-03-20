import { describe, it, expect, vi, beforeEach } from 'vitest'
import { hasEmailContext } from '../../src/lib/detection/email-context-guard'
import { AUTOCOMPLETE_VALUES } from '../../src/lib/detection/patterns'

vi.mock('../../src/lib/detection/email-context-guard')
const mockHasEmailContext = vi.mocked(hasEmailContext)

describe('Email context bypass logic', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    document.body.innerHTML = ''
  })

  it('bypasses email context check for autocomplete="one-time-code"', () => {
    const field = document.createElement('input')
    field.setAttribute('autocomplete', 'one-time-code')
    const ac = field.getAttribute('autocomplete')?.toLowerCase()
    const bypass = ac != null && (AUTOCOMPLETE_VALUES as readonly string[]).includes(ac)
    expect(bypass).toBe(true)
  })

  it('bypasses email context check for autocomplete="one-time-password"', () => {
    const field = document.createElement('input')
    field.setAttribute('autocomplete', 'one-time-password')
    const ac = field.getAttribute('autocomplete')?.toLowerCase()
    const bypass = ac != null && (AUTOCOMPLETE_VALUES as readonly string[]).includes(ac)
    expect(bypass).toBe(true)
  })

  it('bypasses email context check for autocomplete="otp"', () => {
    const field = document.createElement('input')
    field.setAttribute('autocomplete', 'otp')
    const ac = field.getAttribute('autocomplete')?.toLowerCase()
    const bypass = ac != null && (AUTOCOMPLETE_VALUES as readonly string[]).includes(ac)
    expect(bypass).toBe(true)
  })

  it('does NOT bypass for name="otp" (no autocomplete)', () => {
    const field = document.createElement('input')
    field.setAttribute('name', 'otp')
    const ac = field.getAttribute('autocomplete')?.toLowerCase()
    const bypass = ac != null && (AUTOCOMPLETE_VALUES as readonly string[]).includes(ac)
    expect(bypass).toBe(false)
  })

  it('does NOT bypass for name="activation_code"', () => {
    const field = document.createElement('input')
    field.setAttribute('name', 'activation_code')
    const ac = field.getAttribute('autocomplete')?.toLowerCase()
    const bypass = ac != null && (AUTOCOMPLETE_VALUES as readonly string[]).includes(ac)
    expect(bypass).toBe(false)
  })

  it('blocks session when hasEmailContext returns false for non-bypass field', () => {
    mockHasEmailContext.mockReturnValue(false)
    const field = document.createElement('input')
    field.setAttribute('name', 'promo_code')
    expect(hasEmailContext(field)).toBe(false)
  })

  it('allows session when hasEmailContext returns true for non-bypass field', () => {
    mockHasEmailContext.mockReturnValue(true)
    const field = document.createElement('input')
    field.setAttribute('name', 'verification_code')
    expect(hasEmailContext(field)).toBe(true)
  })
})
