/**
 * Unit Tests for usePasswordValidation Hook
 * Tests password validation logic, strength calculation, and edge cases
 */

import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { usePasswordValidation } from '../usePasswordValidation'
import { PIN_REGEX } from '@/lib/crypto/key-manager'

describe('usePasswordValidation', () => {
  describe('Valid PINs', () => {
    it('should validate 6-digit PIN as valid', () => {
      const { result } = renderHook(() => usePasswordValidation('123456'))

      expect(result.current.isValid).toBe(true)
      expect(result.current.strength).toBe(4)
      expect(result.current.issues).toHaveLength(0)
    })

    it('should validate all-zeros PIN', () => {
      const { result } = renderHook(() => usePasswordValidation('000000'))

      expect(result.current.isValid).toBe(true)
      expect(result.current.issues).toHaveLength(0)
    })

    it('should validate all-nines PIN', () => {
      const { result } = renderHook(() => usePasswordValidation('999999'))

      expect(result.current.isValid).toBe(true)
      expect(result.current.issues).toHaveLength(0)
    })

    it('should validate random 6-digit PIN', () => {
      const { result } = renderHook(() => usePasswordValidation('847293'))

      expect(result.current.isValid).toBe(true)
      expect(result.current.strength).toBe(4)
    })
  })

  describe('Invalid PINs - Length', () => {
    it('should reject empty string', () => {
      const { result } = renderHook(() => usePasswordValidation(''))

      expect(result.current.isValid).toBe(false)
      expect(result.current.strength).toBe(0)
      expect(result.current.issues.length).toBeGreaterThan(0)
    })

    it('should reject PIN with less than 6 digits', () => {
      const { result } = renderHook(() => usePasswordValidation('12345'))

      expect(result.current.isValid).toBe(false)
      expect(result.current.strength).toBe(0)
    })

    it('should reject single digit', () => {
      const { result } = renderHook(() => usePasswordValidation('1'))

      expect(result.current.isValid).toBe(false)
      expect(result.current.strength).toBe(0)
    })

    it('should reject 5-digit PIN', () => {
      const { result } = renderHook(() => usePasswordValidation('12345'))

      expect(result.current.isValid).toBe(false)
    })

    it('should reject 7-digit PIN', () => {
      const { result } = renderHook(() => usePasswordValidation('1234567'))

      expect(result.current.isValid).toBe(false)
      expect(result.current.strength).toBe(0)
    })

    it('should reject PIN with more than 6 digits', () => {
      const { result } = renderHook(() => usePasswordValidation('12345678'))

      expect(result.current.isValid).toBe(false)
    })
  })

  describe('Invalid PINs - Non-numeric', () => {
    it('should reject PIN with letters', () => {
      const { result } = renderHook(() => usePasswordValidation('abc123'))

      expect(result.current.isValid).toBe(false)
      expect(result.current.strength).toBe(0)
    })

    it('should reject PIN with special characters', () => {
      const { result } = renderHook(() => usePasswordValidation('123!@#'))

      expect(result.current.isValid).toBe(false)
    })

    it('should reject PIN with spaces', () => {
      const { result } = renderHook(() => usePasswordValidation('123 456'))

      expect(result.current.isValid).toBe(false)
    })

    it('should reject PIN with hyphens', () => {
      const { result } = renderHook(() => usePasswordValidation('123-456'))

      expect(result.current.isValid).toBe(false)
    })

    it('should reject alphanumeric string', () => {
      const { result } = renderHook(() => usePasswordValidation('abc123'))

      expect(result.current.isValid).toBe(false)
    })

    it('should reject only letters', () => {
      const { result } = renderHook(() => usePasswordValidation('abcdef'))

      expect(result.current.isValid).toBe(false)
    })
  })

  describe('Strength Calculation', () => {
    it('should return strength 4 for valid PIN', () => {
      const { result } = renderHook(() => usePasswordValidation('123456'))

      expect(result.current.strength).toBe(4)
      expect(result.current.score).toBe(4)
    })

    it('should return strength 0 for invalid PIN', () => {
      const { result } = renderHook(() => usePasswordValidation('123'))

      expect(result.current.strength).toBe(0)
      expect(result.current.score).toBe(0)
    })

    it('should match score and strength values', () => {
      const { result } = renderHook(() => usePasswordValidation('654321'))

      expect(result.current.score).toBe(result.current.strength)
    })
  })

  describe('Validation Issues', () => {
    it('should return no issues for valid PIN', () => {
      const { result } = renderHook(() => usePasswordValidation('123456'))

      expect(result.current.issues).toHaveLength(0)
    })

    it('should return issues for invalid PIN', () => {
      const { result } = renderHook(() => usePasswordValidation('abc'))

      expect(result.current.issues.length).toBeGreaterThan(0)
    })

    it('should provide descriptive error message', () => {
      const { result } = renderHook(() => usePasswordValidation('12345'))

      expect(result.current.issues[0]).toBeTruthy()
      expect(typeof result.current.issues[0]).toBe('string')
    })

    it('should use translation for error messages', () => {
      const { result } = renderHook(() => usePasswordValidation(''))

      // Should use t('security_pin_error_invalid')
      expect(result.current.issues[0]).toBeTruthy()
    })
  })

  describe('Real-time Validation', () => {
    it('should update validation when password changes', () => {
      const { result, rerender } = renderHook(
        ({ password }) => usePasswordValidation(password),
        { initialProps: { password: '123' } }
      )

      expect(result.current.isValid).toBe(false)

      // Update to valid PIN
      rerender({ password: '123456' })

      expect(result.current.isValid).toBe(true)
    })

    it('should update from valid to invalid', () => {
      const { result, rerender } = renderHook(
        ({ password }) => usePasswordValidation(password),
        { initialProps: { password: '123456' } }
      )

      expect(result.current.isValid).toBe(true)

      // Update to invalid
      rerender({ password: '12345' })

      expect(result.current.isValid).toBe(false)
    })

    it('should validate incrementally as user types', () => {
      const { result, rerender } = renderHook(
        ({ password }) => usePasswordValidation(password),
        { initialProps: { password: '' } }
      )

      expect(result.current.isValid).toBe(false)

      rerender({ password: '1' })
      expect(result.current.isValid).toBe(false)

      rerender({ password: '12' })
      expect(result.current.isValid).toBe(false)

      rerender({ password: '123' })
      expect(result.current.isValid).toBe(false)

      rerender({ password: '1234' })
      expect(result.current.isValid).toBe(false)

      rerender({ password: '12345' })
      expect(result.current.isValid).toBe(false)

      rerender({ password: '123456' })
      expect(result.current.isValid).toBe(true)
    })

    it('should validate when deleting characters', () => {
      const { result, rerender } = renderHook(
        ({ password }) => usePasswordValidation(password),
        { initialProps: { password: '123456' } }
      )

      expect(result.current.isValid).toBe(true)

      rerender({ password: '12345' })
      expect(result.current.isValid).toBe(false)

      rerender({ password: '1234' })
      expect(result.current.isValid).toBe(false)
    })
  })

  describe('Edge Cases', () => {
    it('should handle whitespace-only input', () => {
      const { result } = renderHook(() => usePasswordValidation('      '))

      expect(result.current.isValid).toBe(false)
    })

    it('should handle very long numeric string', () => {
      const { result } = renderHook(() => usePasswordValidation('123456789012345678901234567890'))

      expect(result.current.isValid).toBe(false)
    })

    it('should handle special Unicode characters', () => {
      const { result } = renderHook(() => usePasswordValidation('①②③④⑤⑥'))

      expect(result.current.isValid).toBe(false)
    })

    it('should handle emoji', () => {
      const { result } = renderHook(() => usePasswordValidation('😀😁😂😃😄😅'))

      expect(result.current.isValid).toBe(false)
    })

    it('should handle decimal points', () => {
      const { result } = renderHook(() => usePasswordValidation('123.456'))

      expect(result.current.isValid).toBe(false)
    })

    it('should handle leading zeros', () => {
      const { result } = renderHook(() => usePasswordValidation('000123'))

      expect(result.current.isValid).toBe(true)
    })

    it('should handle trailing zeros', () => {
      const { result } = renderHook(() => usePasswordValidation('123000'))

      expect(result.current.isValid).toBe(true)
    })

    it('should handle negative numbers', () => {
      const { result } = renderHook(() => usePasswordValidation('-12345'))

      expect(result.current.isValid).toBe(false)
    })

    it('should handle positive sign', () => {
      const { result } = renderHook(() => usePasswordValidation('+123456'))

      expect(result.current.isValid).toBe(false)
    })
  })

  describe('Consistency with PIN_REGEX', () => {
    it('should match PIN_REGEX validation', () => {
      const testCases = [
        '123456',  // valid
        '000000',  // valid
        '999999',  // valid
        '12345',   // invalid - too short
        '1234567', // invalid - too long
        'abc123',  // invalid - letters
        '123 456', // invalid - space
        '',        // invalid - empty
      ]

      testCases.forEach((pin) => {
        const { result } = renderHook(() => usePasswordValidation(pin))
        const regexValid = PIN_REGEX.test(pin)

        expect(result.current.isValid).toBe(regexValid)
      })
    })
  })

  describe('Memoization', () => {
    it('should return same object for same password', () => {
      const { result, rerender } = renderHook(
        ({ password }) => usePasswordValidation(password),
        { initialProps: { password: '123456' } }
      )

      const firstResult = result.current

      rerender({ password: '123456' })

      // Should be memoized (same reference)
      expect(result.current).toBe(firstResult)
    })

    it('should return new object for different password', () => {
      const { result, rerender } = renderHook(
        ({ password }) => usePasswordValidation(password),
        { initialProps: { password: '123456' } }
      )

      const firstResult = result.current

      rerender({ password: '654321' })

      // Should be new object
      expect(result.current).not.toBe(firstResult)
    })
  })

  describe('Type Safety', () => {
    it('should return correct TypeScript types', () => {
      const { result } = renderHook(() => usePasswordValidation('123456'))

      // Type checks
      expect(typeof result.current.isValid).toBe('boolean')
      expect(typeof result.current.strength).toBe('number')
      expect(typeof result.current.score).toBe('number')
      expect(Array.isArray(result.current.issues)).toBe(true)
    })

    it('should have strength as 0-4 range', () => {
      const testCases = ['', '123', '123456']

      testCases.forEach((pin) => {
        const { result } = renderHook(() => usePasswordValidation(pin))

        expect(result.current.strength).toBeGreaterThanOrEqual(0)
        expect(result.current.strength).toBeLessThanOrEqual(4)
      })
    })

    it('should have issues as array of strings', () => {
      const { result } = renderHook(() => usePasswordValidation('abc'))

      result.current.issues.forEach((issue) => {
        expect(typeof issue).toBe('string')
      })
    })
  })

  describe('Common Weak PINs', () => {
    it('should accept sequential PIN (validation only, no strength penalty)', () => {
      const { result } = renderHook(() => usePasswordValidation('123456'))

      // Accepts any 6-digit PIN - no weak PIN detection implemented
      expect(result.current.isValid).toBe(true)
    })

    it('should accept repeated digit PIN', () => {
      const { result } = renderHook(() => usePasswordValidation('111111'))

      expect(result.current.isValid).toBe(true)
    })

    it('should accept common PIN like 000000', () => {
      const { result } = renderHook(() => usePasswordValidation('000000'))

      expect(result.current.isValid).toBe(true)
    })

    it('should accept reverse sequential PIN', () => {
      const { result } = renderHook(() => usePasswordValidation('654321'))

      expect(result.current.isValid).toBe(true)
    })
  })

  describe('Performance', () => {
    it('should validate quickly', () => {
      const start = performance.now()

      for (let i = 0; i < 1000; i++) {
        renderHook(() => usePasswordValidation('123456'))
      }

      const elapsed = performance.now() - start

      // Should complete 1000 validations in reasonable time
      expect(elapsed).toBeLessThan(1000) // Less than 1 second
    })
  })

  describe('Integration with Form Validation', () => {
    it('should provide all needed validation data', () => {
      const { result } = renderHook(() => usePasswordValidation('123456'))

      // Should have everything needed for form validation
      expect(result.current).toHaveProperty('isValid')
      expect(result.current).toHaveProperty('strength')
      expect(result.current).toHaveProperty('issues')
      expect(result.current).toHaveProperty('score')
    })

    it('should work for confirm password validation', () => {
      const password = '123456'
      const confirmPassword = '123456'

      const { result: passwordResult } = renderHook(() => usePasswordValidation(password))
      const { result: confirmResult } = renderHook(() => usePasswordValidation(confirmPassword))

      expect(passwordResult.current.isValid).toBe(true)
      expect(confirmResult.current.isValid).toBe(true)
      expect(password).toBe(confirmPassword)
    })
  })
})
