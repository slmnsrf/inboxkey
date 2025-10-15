import { describe, it, expect } from 'vitest'
import { classifyNonEmailIntent } from '../../src/lib/detection/non-email-contexts'

describe('Non-Email Contexts', () => {
  describe('Developer/Admin token management', () => {
    it('should detect "Personal Access Tokens" context', () => {
      const result = classifyNonEmailIntent('Personal Access Tokens Settings API Key')
      expect(result.category).toBe('developer')
      expect(result.blocked).toBe(true)
    })

    it('should detect Turkish developer context', () => {
      const result = classifyNonEmailIntent('API Anahtarı Geliştirici Ayarları')
      expect(result.category).toBe('developer')
      expect(result.blocked).toBe(true)
    })
  })

  describe('Postal/Address', () => {
    it('should detect "zip code" context', () => {
      const result = classifyNonEmailIntent('Enter your zip code and billing address')
      expect(result.category).toBe('address')
      expect(result.blocked).toBe(true)
    })

    it('should detect "Postleitzahl" (German postal code)', () => {
      const result = classifyNonEmailIntent('Geben Sie Ihre Postleitzahl ein')
      expect(result.category).toBe('address')
      expect(result.blocked).toBe(true)
    })
  })

  describe('Payment/Banking', () => {
    it('should detect "bank verification" context', () => {
      const result = classifyNonEmailIntent('Enter your bank verification code from your banking app')
      expect(result.category).toBe('payment')
      expect(result.blocked).toBe(true)
    })
  })

  describe('No false blocking on real OTP contexts', () => {
    it('should NOT block "Enter verification code" (generic OTP)', () => {
      const result = classifyNonEmailIntent('Enter verification code sent to your email')
      expect(result.blocked).toBe(false)
    })

    it('should NOT block "Check your email for the code"', () => {
      const result = classifyNonEmailIntent('Check your email for the code')
      expect(result.blocked).toBe(false)
    })
  })
})
