/**
 * Tests for PasswordStrengthMeter Component
 *
 * Tests password strength visualization including:
 * - Strength display for different password qualities
 * - Color coding based on strength
 * - Progress bar percentage
 * - Validation issues display
 * - Accessibility attributes
 */

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PasswordStrengthMeter } from '../PasswordStrengthMeter'

// Mock usePasswordValidation hook
const mockUsePasswordValidation = vi.fn()
vi.mock('@/ui/hooks/usePasswordValidation', () => ({
  usePasswordValidation: (password: string) => mockUsePasswordValidation(password),
}))

describe('PasswordStrengthMeter', () => {
  it('should show strength for empty password (None)', () => {
    mockUsePasswordValidation.mockReturnValue({
      strength: 0,
      issues: ['Password must be at least 8 characters'],
      isValid: false,
      score: 0,
    })

    render(<PasswordStrengthMeter password="" />)

    expect(screen.getByText(/Strength: None/i)).toBeInTheDocument()
    const progressBar = screen.getByRole('progressbar')
    expect(progressBar).toHaveAttribute('aria-valuenow', '0')
    expect(progressBar).toHaveStyle({ width: '0%' })
  })

  it('should show strength for weak password (Weak/Red)', () => {
    mockUsePasswordValidation.mockReturnValue({
      strength: 1,
      issues: ['Add another word or two', 'Uncommon words are better'],
      isValid: true,
      score: 1,
    })

    render(<PasswordStrengthMeter password="password" />)

    expect(screen.getByText(/Strength: Weak/i)).toBeInTheDocument()

    const progressBar = screen.getByRole('progressbar')
    expect(progressBar).toHaveAttribute('aria-valuenow', '25')
    expect(progressBar).toHaveStyle({
      width: '25%',
      backgroundColor: '#ef4444', // Red
    })
  })

  it('should show strength for fair password (Fair/Yellow)', () => {
    mockUsePasswordValidation.mockReturnValue({
      strength: 2,
      issues: [],
      isValid: true,
      score: 2,
    })

    render(<PasswordStrengthMeter password="password123" />)

    expect(screen.getByText(/Strength: Fair/i)).toBeInTheDocument()

    const progressBar = screen.getByRole('progressbar')
    expect(progressBar).toHaveAttribute('aria-valuenow', '50')
    expect(progressBar).toHaveStyle({
      width: '50%',
      backgroundColor: '#f59e0b', // Yellow
    })
  })

  it('should show strength for good password (Good/Blue)', () => {
    mockUsePasswordValidation.mockReturnValue({
      strength: 3,
      issues: [],
      isValid: true,
      score: 3,
    })

    render(<PasswordStrengthMeter password="MyGoodPassword2024" />)

    expect(screen.getByText(/Strength: Good/i)).toBeInTheDocument()

    const progressBar = screen.getByRole('progressbar')
    expect(progressBar).toHaveAttribute('aria-valuenow', '75')
    expect(progressBar).toHaveStyle({
      width: '75%',
      backgroundColor: '#3b82f6', // Blue
    })
  })

  it('should show strength for strong password (Strong/Green)', () => {
    mockUsePasswordValidation.mockReturnValue({
      strength: 4,
      issues: [],
      isValid: true,
      score: 4,
    })

    render(<PasswordStrengthMeter password="MyV3ry$tr0ng!P@ssw0rd" />)

    expect(screen.getByText(/Strength: Strong/i)).toBeInTheDocument()

    const progressBar = screen.getByRole('progressbar')
    expect(progressBar).toHaveAttribute('aria-valuenow', '100')
    expect(progressBar).toHaveStyle({
      width: '100%',
      backgroundColor: '#10b981', // Green
    })
  })

  it('should display validation issues', () => {
    mockUsePasswordValidation.mockReturnValue({
      strength: 1,
      issues: ['Add another word or two', 'Uncommon words are better', 'Avoid common patterns'],
      isValid: true,
      score: 1,
    })

    render(<PasswordStrengthMeter password="weak" />)

    expect(screen.getByText('Add another word or two')).toBeInTheDocument()
    expect(screen.getByText('Uncommon words are better')).toBeInTheDocument()
    expect(screen.getByText('Avoid common patterns')).toBeInTheDocument()
  })

  it('should not display issues section when no issues', () => {
    mockUsePasswordValidation.mockReturnValue({
      strength: 4,
      issues: [],
      isValid: true,
      score: 4,
    })

    render(<PasswordStrengthMeter password="strong-password" />)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('should have alert role for issues section', () => {
    mockUsePasswordValidation.mockReturnValue({
      strength: 1,
      issues: ['Password is too weak'],
      isValid: true,
      score: 1,
    })

    render(<PasswordStrengthMeter password="weak" />)

    const alert = screen.getByRole('alert')
    expect(alert).toBeInTheDocument()
    expect(alert).toHaveAttribute('aria-live', 'polite')
  })

  it('should have proper aria-label for progress bar', () => {
    mockUsePasswordValidation.mockReturnValue({
      strength: 3,
      issues: [],
      isValid: true,
      score: 3,
    })

    render(<PasswordStrengthMeter password="good-password" />)

    const progressBar = screen.getByRole('progressbar')
    expect(progressBar).toHaveAttribute('aria-label', 'Password strength: Good')
  })

  it('should have aria-valuemin and aria-valuemax attributes', () => {
    mockUsePasswordValidation.mockReturnValue({
      strength: 2,
      issues: [],
      isValid: true,
      score: 2,
    })

    render(<PasswordStrengthMeter password="password" />)

    const progressBar = screen.getByRole('progressbar')
    expect(progressBar).toHaveAttribute('aria-valuemin', '0')
    expect(progressBar).toHaveAttribute('aria-valuemax', '100')
  })

  it('should use custom className', () => {
    mockUsePasswordValidation.mockReturnValue({
      strength: 2,
      issues: [],
      isValid: true,
      score: 2,
    })

    const { container } = render(
      <PasswordStrengthMeter password="password" className="custom-class" />
    )

    const wrapper = container.querySelector('.custom-class')
    expect(wrapper).toBeInTheDocument()
  })

  it('should display warning icons for issues', () => {
    mockUsePasswordValidation.mockReturnValue({
      strength: 1,
      issues: ['Issue 1', 'Issue 2'],
      isValid: true,
      score: 1,
    })

    const { container } = render(<PasswordStrengthMeter password="weak" />)

    const icons = container.querySelectorAll('.password-strength-meter__issue-icon')
    expect(icons).toHaveLength(2)
    icons.forEach((icon) => {
      expect(icon).toHaveTextContent('⚠️')
    })
  })

  it('should color strength label based on strength', () => {
    const strengthConfigs = [
      { strength: 0, color: '#6b7280', label: 'None' },
      { strength: 1, color: '#ef4444', label: 'Weak' },
      { strength: 2, color: '#f59e0b', label: 'Fair' },
      { strength: 3, color: '#3b82f6', label: 'Good' },
      { strength: 4, color: '#10b981', label: 'Strong' },
    ]

    strengthConfigs.forEach(({ strength, color, label }) => {
      mockUsePasswordValidation.mockReturnValue({
        strength: strength as 0 | 1 | 2 | 3 | 4,
        issues: [],
        isValid: strength > 0,
        score: strength,
      })

      const { unmount } = render(<PasswordStrengthMeter password="test" />)

      const labelElement = screen.getByText(`Strength: ${label}`)
      expect(labelElement).toHaveStyle({ color })

      unmount()
    })
  })

  it('should handle password change reactively', () => {
    const { rerender } = render(<PasswordStrengthMeter password="" />)

    mockUsePasswordValidation.mockReturnValue({
      strength: 0,
      issues: ['Too short'],
      isValid: false,
      score: 0,
    })

    rerender(<PasswordStrengthMeter password="weak" />)
    expect(screen.getByText(/Strength: None/i)).toBeInTheDocument()

    mockUsePasswordValidation.mockReturnValue({
      strength: 4,
      issues: [],
      isValid: true,
      score: 4,
    })

    rerender(<PasswordStrengthMeter password="V3ry$tr0ng!P@ssw0rd" />)
    expect(screen.getByText(/Strength: Strong/i)).toBeInTheDocument()
  })
})
