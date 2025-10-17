/**
 * PasswordStrengthMeter Component
 *
 * Visual password strength indicator with colored progress bar and feedback.
 * Uses usePasswordValidation hook for strength calculation.
 */

import React from 'react'
import { usePasswordValidation } from '@/ui/hooks/usePasswordValidation'

/**
 * Props for PasswordStrengthMeter component
 */
export interface PasswordStrengthMeterProps {
  /** Password to evaluate */
  password: string
  /** Optional CSS class name */
  className?: string
}

/**
 * Strength label configuration
 */
const STRENGTH_CONFIG = {
  0: {
    label: 'None',
    color: '#6b7280', // Gray
    percentage: 0,
  },
  1: {
    label: 'Weak',
    color: '#ef4444', // Red
    percentage: 25,
  },
  2: {
    label: 'Fair',
    color: '#f59e0b', // Yellow
    percentage: 50,
  },
  3: {
    label: 'Good',
    color: '#3b82f6', // Blue
    percentage: 75,
  },
  4: {
    label: 'Strong',
    color: '#10b981', // Green
    percentage: 100,
  },
} as const

/**
 * PasswordStrengthMeter Component
 *
 * Displays a visual strength indicator with colored progress bar and feedback messages.
 *
 * @example
 * ```tsx
 * <PasswordStrengthMeter password={password} />
 * ```
 */
export function PasswordStrengthMeter({
  password,
  className = '',
}: PasswordStrengthMeterProps): JSX.Element {
  const { strength, issues } = usePasswordValidation(password)
  const config = STRENGTH_CONFIG[strength]

  return (
    <div className={`password-strength-meter ${className}`}>
      {/* Progress bar */}
      <div className="password-strength-meter__bar-container">
        <div
          className="password-strength-meter__bar"
          style={{
            width: `${config.percentage}%`,
            backgroundColor: config.color,
          }}
          role="progressbar"
          aria-valuenow={config.percentage}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Password strength: ${config.label}`}
        />
      </div>

      {/* Strength label */}
      <div className="password-strength-meter__label">
        <span style={{ color: config.color }}>Strength: {config.label}</span>
      </div>

      {/* Issues and suggestions */}
      {issues.length > 0 && (
        <div className="password-strength-meter__issues" role="alert" aria-live="polite">
          {issues.map((issue, index) => (
            <div key={index} className="password-strength-meter__issue">
              <span className="password-strength-meter__issue-icon">⚠️</span>
              <span className="password-strength-meter__issue-text">{issue}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
