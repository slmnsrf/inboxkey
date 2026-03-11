import { describe, it, expect } from 'vitest'
import { classifyDeliveryChannel } from '../../src/lib/detection/signal-classifier'

describe('Signal Classifier - Phone Number Detection', () => {
  describe('Masked phone numbers as SMS evidence', () => {
    it('should detect "sent to ***89" as SMS', () => {
      const result = classifyDeliveryChannel({
        label: '',
        placeholder: '',
        nearbyText: 'We sent a code to ***89',
      })
      expect(result.channel).toBe('sms')
    })

    it('should detect "ending in 1234" as SMS', () => {
      const result = classifyDeliveryChannel({
        label: '',
        placeholder: '',
        nearbyText: 'Code sent to number ending in 1234',
      })
      expect(result.channel).toBe('sms')
    })

    it('should detect "+90 *** *** **42" as SMS', () => {
      const result = classifyDeliveryChannel({
        label: '',
        placeholder: '',
        nearbyText: 'Kod +90 *** *** **42 numarasına gönderildi',
      })
      expect(result.channel).toBe('sms')
    })

    it('should detect "(555) ***-**12" as SMS', () => {
      const result = classifyDeliveryChannel({
        label: '',
        placeholder: '',
        nearbyText: 'Code sent to (555) ***-**12',
      })
      expect(result.channel).toBe('sms')
    })
  })

  describe('Phone + email hybrid', () => {
    it('should detect email when both phone and email present', () => {
      const result = classifyDeliveryChannel({
        label: '',
        placeholder: '',
        nearbyText: 'Code sent to your email or phone ending in **89',
      })
      expect(result.channel).toBe('email')
      expect(result.allChannels).toContain('email')
      expect(result.allChannels).toContain('sms')
    })
  })

  describe('No false positives on non-phone numbers', () => {
    it('should NOT detect "order #12345" as SMS', () => {
      const result = classifyDeliveryChannel({
        label: '',
        placeholder: '',
        nearbyText: 'Your order #12345 has been confirmed',
      })
      expect(result.channel).toBe('unknown')
    })
  })
})
