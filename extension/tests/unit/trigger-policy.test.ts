import { describe, it, expect } from 'vitest'
import { shouldAutoTrigger } from '../../src/lib/detection/trigger-policy'

describe('Trigger Policy', () => {
  describe('Channel gating', () => {
    it('should block SMS-only channel', () => {
      const result = shouldAutoTrigger({
        channel: 'sms',
        hasEmailOption: false,
        nonEmailCategory: null,
        otpScore: 80,
        threshold: 70,
      })
      expect(result.action).toBe('block')
      expect(result.reason).toContain('sms')
    })

    it('should block authenticator-only channel', () => {
      const result = shouldAutoTrigger({
        channel: 'authenticator',
        hasEmailOption: false,
        nonEmailCategory: null,
        otpScore: 80,
        threshold: 70,
      })
      expect(result.action).toBe('block')
    })

    it('should allow email channel', () => {
      const result = shouldAutoTrigger({
        channel: 'email',
        hasEmailOption: true,
        nonEmailCategory: null,
        otpScore: 80,
        threshold: 70,
      })
      expect(result.action).toBe('trigger')
    })

    it('should allow SMS+email hybrid', () => {
      const result = shouldAutoTrigger({
        channel: 'sms',
        hasEmailOption: true,
        nonEmailCategory: null,
        otpScore: 80,
        threshold: 70,
      })
      expect(result.action).toBe('trigger')
    })
  })

  describe('Non-email intent gating', () => {
    it('should block developer token context', () => {
      const result = shouldAutoTrigger({
        channel: 'unknown',
        hasEmailOption: false,
        nonEmailCategory: 'developer',
        otpScore: 80,
        threshold: 70,
      })
      expect(result.action).toBe('block')
    })

    it('should block postal/address context', () => {
      const result = shouldAutoTrigger({
        channel: 'unknown',
        hasEmailOption: false,
        nonEmailCategory: 'address',
        otpScore: 80,
        threshold: 70,
      })
      expect(result.action).toBe('block')
    })
  })

  describe('Unknown channel policy', () => {
    it('should block unknown channel with insufficient evidence', () => {
      const result = shouldAutoTrigger({
        channel: 'unknown',
        hasEmailOption: false,
        nonEmailCategory: null,
        otpScore: 75,
        threshold: 70,
      })
      expect(result.action).toBe('block')
    })

    it('should allow unknown channel with very strong OTP evidence', () => {
      const result = shouldAutoTrigger({
        channel: 'unknown',
        hasEmailOption: false,
        nonEmailCategory: null,
        otpScore: 95,
        threshold: 70,
      })
      expect(result.action).toBe('trigger')
    })

    it('should use normal threshold for unknown channel with email option', () => {
      const result = shouldAutoTrigger({
        channel: 'unknown',
        hasEmailOption: true,
        nonEmailCategory: null,
        otpScore: 75,
        threshold: 70,
      })
      expect(result.action).toBe('trigger')
      expect(result.reason).toContain('Email-eligible')
    })
  })

  describe('Email below threshold', () => {
    it('should block email channel when OTP score below threshold', () => {
      const result = shouldAutoTrigger({
        channel: 'email',
        hasEmailOption: true,
        nonEmailCategory: null,
        otpScore: 50,
        threshold: 70,
      })
      expect(result.action).toBe('block')
      expect(result.reason).toContain('OTP score')
    })
  })
})
