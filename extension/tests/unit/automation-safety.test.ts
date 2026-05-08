import { beforeEach, describe, expect, it } from 'vitest'
import {
  getFullAutomationSafety,
  isPaymentProviderDomain,
} from '../../src/lib/automation/automation-safety'

function makeField(html: string): HTMLInputElement {
  document.body.innerHTML = html
  const field = document.querySelector('input') as HTMLInputElement | null
  if (!field) {
    throw new Error('test fixture missing input')
  }
  return field
}

describe('automation safety', () => {
  beforeEach(() => {
    document.title = ''
    document.body.innerHTML = ''
  })

  it('detects curated payment provider domains', () => {
    expect(isPaymentProviderDomain('stripe.com')).toBe(true)
    expect(isPaymentProviderDomain('adyen.com')).toBe(true)
    expect(isPaymentProviderDomain('iyzico.com')).toBe(true)
    expect(isPaymentProviderDomain('example.com')).toBe(false)
  })

  it('demotes full automation on payment provider domains', () => {
    const field = makeField('<input autocomplete="one-time-code" />')

    const result = getFullAutomationSafety({
      url: 'https://checkout.stripe.com/c/pay/session',
      field,
    })

    expect(result.shouldDemote).toBe(true)
    expect(result.reasons).toContain('payment-provider-domain')
  })

  it('demotes full automation on payment provider hosts under broad domains', () => {
    const field = makeField('<input autocomplete="one-time-code" />')

    const result = getFullAutomationSafety({
      url: 'https://pay.google.com/gp/p/ui/pay',
      field,
    })

    expect(result.shouldDemote).toBe(true)
    expect(result.reasons).toContain('payment-provider-domain')
  })

  it('demotes full automation on known banking domains', () => {
    const field = makeField('<input autocomplete="one-time-code" />')

    const result = getFullAutomationSafety({
      url: 'https://secure.chase.com/web/auth',
      field,
    })

    expect(result.shouldDemote).toBe(true)
    expect(result.reasons).toContain('banking-domain')
  })

  it('demotes full automation for payment context near the field', () => {
    const field = makeField(`
      <form>
        <h2>Secure checkout</h2>
        <p>Confirm payment with the verification code.</p>
        <input id="otp" autocomplete="one-time-code" />
      </form>
    `)

    const result = getFullAutomationSafety({
      url: 'https://shop.example.com/checkout',
      field,
    })

    expect(result.shouldDemote).toBe(true)
    expect(result.reasons).toContain('payment-context')
  })

  it('demotes full automation for multilingual payment context', () => {
    const field = makeField(`
      <form>
        <label for="otp">Ödeme onayı için kodu girin</label>
        <input id="otp" autocomplete="one-time-code" />
      </form>
    `)

    const result = getFullAutomationSafety({
      url: 'https://shop.example.com/odeme',
      field,
    })

    expect(result.shouldDemote).toBe(true)
    expect(result.reasons).toContain('payment-context')
  })

  it('demotes full automation for banking context near the field', () => {
    const field = makeField(`
      <form>
        <p>Enter the code from your banking app.</p>
        <input autocomplete="one-time-code" />
      </form>
    `)

    const result = getFullAutomationSafety({
      url: 'https://merchant.example.com/verify',
      field,
    })

    expect(result.shouldDemote).toBe(true)
    expect(result.reasons).toContain('banking-context')
  })

  it('does not demote ordinary login OTP context', () => {
    const field = makeField(`
      <form>
        <label for="otp">Enter verification code</label>
        <input id="otp" autocomplete="one-time-code" />
      </form>
    `)

    const result = getFullAutomationSafety({
      url: 'https://accounts.example.com/login',
      field,
    })

    expect(result.shouldDemote).toBe(false)
    expect(result.reasons).toEqual([])
  })
})
