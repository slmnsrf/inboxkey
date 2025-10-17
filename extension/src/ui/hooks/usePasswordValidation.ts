/**
 * usePasswordValidation Hook
 *
 * Provides real-time password strength validation using zxcvbn.
 * Checks password against security requirements and returns strength score,
 * validation issues, and whether password meets minimum requirements.
 */

import { useMemo } from 'react'
import { PIN_REGEX } from '@/lib/crypto/key-manager'
import { t } from '@/lib/i18n'

/**
 * Password validation result
 */
export interface PasswordValidation {
  /** Strength score (0=none, 1=weak, 2=fair, 3=good, 4=strong) */
  strength: 0 | 1 | 2 | 3 | 4
  /** Array of validation issues/suggestions */
  issues: string[]
  /** Whether password meets minimum requirements */
  isValid: boolean
  /** Raw zxcvbn score for display (0-4) */
  score: number
}

/**
 * Custom hook for password validation and strength calculation
 *
 * @param password - Password string to validate
 * @returns Validation result with strength, issues, and validity
 *
 * @example
 * ```tsx
 * const { strength, issues, isValid } = usePasswordValidation(password)
 * if (!isValid) {
 *   return <div>Password errors: {issues.join(', ')}</div>
 * }
 * ```
 */
export function usePasswordValidation(password: string): PasswordValidation {
  return useMemo(() => {
    const isValid = PIN_REGEX.test(password)
    const issues: string[] = isValid ? [] : [t('security_pin_error_invalid')]
    const strength: 0 | 1 | 2 | 3 | 4 = isValid ? 4 : 0

    return {
      strength,
      issues,
      isValid,
      score: strength,
    }
  }, [password])
}
