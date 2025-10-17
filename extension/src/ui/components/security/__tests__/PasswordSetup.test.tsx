/**
 * Tests for PasswordSetup Component
 *
 * Tests password initialization flow including:
 * - Password validation (length, strength)
 * - Password matching
 * - Strength meter integration
 * - Submit handling
 * - Success/error states
 * - Cancel functionality
 */

import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PasswordSetup } from '../PasswordSetup'

// Mock LockContext
const mockInitialize = vi.fn()
const mockLockContext = {
  initialize: mockInitialize,
  isLoading: false,
  isInitialized: false,
  isUnlocked: false,
  unlock: vi.fn(),
  lock: vi.fn(),
  changePassword: vi.fn(),
  disablePasswordProtection: vi.fn(),
}

vi.mock('@/ui/contexts/LockContext', () => ({
  useLockContext: () => mockLockContext,
}))

// Mock usePasswordValidation hook
const mockUsePasswordValidation = vi.fn()
vi.mock('@/ui/hooks/usePasswordValidation', () => ({
  usePasswordValidation: (password: string) => mockUsePasswordValidation(password),
}))

describe('PasswordSetup', () => {
  const defaultProps = {
    onSuccess: vi.fn(),
    onCancel: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockLockContext.isLoading = false
    mockInitialize.mockResolvedValue(undefined)

    // Default password validation mock
    mockUsePasswordValidation.mockReturnValue({
      strength: 0,
      issues: [],
      isValid: false,
      score: 0,
    })
  })

  describe('rendering', () => {
    it('should render setup form with title and description', () => {
      render(<PasswordSetup {...defaultProps} />)

      expect(screen.getByText('Set Up Password Protection')).toBeInTheDocument()
      expect(
        screen.getByText('Create a password to secure your OTP codes and email access')
      ).toBeInTheDocument()
    })

    it('should render password input fields', () => {
      render(<PasswordSetup {...defaultProps} />)

      expect(screen.getByLabelText('New Password')).toBeInTheDocument()
      expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument()
    })

    it('should render enable protection button', () => {
      render(<PasswordSetup {...defaultProps} />)

      expect(screen.getByRole('button', { name: /enable protection/i })).toBeInTheDocument()
    })

    it('should render cancel button when onCancel is provided', () => {
      render(<PasswordSetup {...defaultProps} />)

      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
    })

    it('should not render cancel button when onCancel is not provided', () => {
      const { onCancel, ...propsWithoutCancel } = defaultProps
      render(<PasswordSetup {...propsWithoutCancel} />)

      expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument()
    })

    it('should render warning about password recovery', () => {
      render(<PasswordSetup {...defaultProps} />)

      expect(screen.getByText(/Important:/i)).toBeInTheDocument()
      expect(screen.getByText(/If you forget this password/i)).toBeInTheDocument()
    })

    it('should auto-focus new password field', () => {
      render(<PasswordSetup {...defaultProps} />)

      const newPasswordInput = screen.getByLabelText('New Password')
      expect(newPasswordInput).toHaveFocus()
    })
  })

  describe('password strength meter', () => {
    it('should not show strength meter when password is empty', () => {
      const { container } = render(<PasswordSetup {...defaultProps} />)

      expect(
        container.querySelector('.password-setup__strength-meter')
      ).not.toBeInTheDocument()
    })

    it('should show strength meter when password is entered', async () => {
      const user = userEvent.setup()
      mockUsePasswordValidation.mockReturnValue({
        strength: 1,
        issues: ['Add more characters'],
        isValid: false,
        score: 1,
      })

      const { container } = render(<PasswordSetup {...defaultProps} />)

      const newPasswordInput = screen.getByLabelText('New Password')
      await user.type(newPasswordInput, 'pass')

      expect(container.querySelector('.password-setup__strength-meter')).toBeInTheDocument()
    })
  })

  describe('password validation', () => {
    it('should require minimum password length (8 characters)', async () => {
      const user = userEvent.setup()
      mockUsePasswordValidation.mockReturnValue({
        strength: 1,
        issues: [],
        isValid: true,
        score: 1,
      })

      render(<PasswordSetup {...defaultProps} />)

      const newPasswordInput = screen.getByLabelText('New Password')
      const confirmPasswordInput = screen.getByLabelText('Confirm Password')

      await user.type(newPasswordInput, 'short')
      await user.type(confirmPasswordInput, 'short')

      const submitButton = screen.getByRole('button', { name: /enable protection/i })
      await user.click(submitButton)

      expect(await screen.findByText('Password must be at least 8 characters')).toBeInTheDocument()
      expect(mockInitialize).not.toHaveBeenCalled()
    })

    it('should require passwords to match', async () => {
      const user = userEvent.setup()
      mockUsePasswordValidation.mockReturnValue({
        strength: 3,
        issues: [],
        isValid: true,
        score: 3,
      })

      render(<PasswordSetup {...defaultProps} />)

      const newPasswordInput = screen.getByLabelText('New Password')
      const confirmPasswordInput = screen.getByLabelText('Confirm Password')

      await user.type(newPasswordInput, 'Password123!')
      await user.type(confirmPasswordInput, 'DifferentPassword123!')

      const submitButton = screen.getByRole('button', { name: /enable protection/i })
      await user.click(submitButton)

      expect(await screen.findByText('Passwords do not match')).toBeInTheDocument()
      expect(mockInitialize).not.toHaveBeenCalled()
    })

    it('should show inline error for mismatched passwords', async () => {
      const user = userEvent.setup()
      mockUsePasswordValidation.mockReturnValue({
        strength: 3,
        issues: [],
        isValid: true,
        score: 3,
      })

      render(<PasswordSetup {...defaultProps} />)

      const newPasswordInput = screen.getByLabelText('New Password')
      const confirmPasswordInput = screen.getByLabelText('Confirm Password')

      await user.type(newPasswordInput, 'Password123!')
      await user.type(confirmPasswordInput, 'Different')

      // Error should appear inline on confirm field
      expect(screen.getByText('Passwords do not match')).toBeInTheDocument()
    })

    it('should show match indicator when passwords match', async () => {
      const user = userEvent.setup()
      mockUsePasswordValidation.mockReturnValue({
        strength: 3,
        issues: [],
        isValid: true,
        score: 3,
      })

      render(<PasswordSetup {...defaultProps} />)

      const newPasswordInput = screen.getByLabelText('New Password')
      const confirmPasswordInput = screen.getByLabelText('Confirm Password')

      await user.type(newPasswordInput, 'Password123!')
      await user.type(confirmPasswordInput, 'Password123!')

      expect(screen.getByText('Passwords match')).toBeInTheDocument()
      expect(screen.getByText('✓')).toBeInTheDocument()
    })

    it('should not show match indicator when confirm is empty', async () => {
      const user = userEvent.setup()

      render(<PasswordSetup {...defaultProps} />)

      const newPasswordInput = screen.getByLabelText('New Password')
      await user.type(newPasswordInput, 'Password123!')

      expect(screen.queryByText('Passwords match')).not.toBeInTheDocument()
    })

    it('should require valid password strength', async () => {
      const user = userEvent.setup()
      mockUsePasswordValidation.mockReturnValue({
        strength: 0,
        issues: ['Too weak'],
        isValid: false,
        score: 0,
      })

      render(<PasswordSetup {...defaultProps} />)

      const newPasswordInput = screen.getByLabelText('New Password')
      const confirmPasswordInput = screen.getByLabelText('Confirm Password')

      await user.type(newPasswordInput, 'weakpass')
      await user.type(confirmPasswordInput, 'weakpass')

      const submitButton = screen.getByRole('button', { name: /enable protection/i })
      await user.click(submitButton)

      expect(
        await screen.findByText('Password does not meet strength requirements')
      ).toBeInTheDocument()
      expect(mockInitialize).not.toHaveBeenCalled()
    })

    it('should disable submit button when form is invalid', async () => {
      const user = userEvent.setup()
      mockUsePasswordValidation.mockReturnValue({
        strength: 1,
        issues: [],
        isValid: true,
        score: 1,
      })

      render(<PasswordSetup {...defaultProps} />)

      const submitButton = screen.getByRole('button', { name: /enable protection/i })

      // Initially disabled
      expect(submitButton).toBeDisabled()

      // Type mismatched passwords
      const newPasswordInput = screen.getByLabelText('New Password')
      const confirmPasswordInput = screen.getByLabelText('Confirm Password')

      await user.type(newPasswordInput, 'Password123!')
      await user.type(confirmPasswordInput, 'Different123!')

      // Still disabled
      expect(submitButton).toBeDisabled()
    })

    it('should enable submit button when form is valid', async () => {
      const user = userEvent.setup()
      mockUsePasswordValidation.mockReturnValue({
        strength: 3,
        issues: [],
        isValid: true,
        score: 3,
      })

      render(<PasswordSetup {...defaultProps} />)

      const newPasswordInput = screen.getByLabelText('New Password')
      const confirmPasswordInput = screen.getByLabelText('Confirm Password')

      await user.type(newPasswordInput, 'StrongPassword123!')
      await user.type(confirmPasswordInput, 'StrongPassword123!')

      const submitButton = screen.getByRole('button', { name: /enable protection/i })
      expect(submitButton).not.toBeDisabled()
    })
  })

  describe('submit handling', () => {
    it('should call initialize with password on submit', async () => {
      const user = userEvent.setup()
      mockUsePasswordValidation.mockReturnValue({
        strength: 4,
        issues: [],
        isValid: true,
        score: 4,
      })

      render(<PasswordSetup {...defaultProps} />)

      const newPasswordInput = screen.getByLabelText('New Password')
      const confirmPasswordInput = screen.getByLabelText('Confirm Password')

      await user.type(newPasswordInput, 'V3ryStr0ng!P@ss')
      await user.type(confirmPasswordInput, 'V3ryStr0ng!P@ss')

      const submitButton = screen.getByRole('button', { name: /enable protection/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(mockInitialize).toHaveBeenCalledWith('V3ryStr0ng!P@ss')
      })
    })

    it('should show success message after initialization', async () => {
      const user = userEvent.setup()
      mockUsePasswordValidation.mockReturnValue({
        strength: 4,
        issues: [],
        isValid: true,
        score: 4,
      })

      render(<PasswordSetup {...defaultProps} />)

      const newPasswordInput = screen.getByLabelText('New Password')
      const confirmPasswordInput = screen.getByLabelText('Confirm Password')

      await user.type(newPasswordInput, 'StrongPassword123!')
      await user.type(confirmPasswordInput, 'StrongPassword123!')

      const submitButton = screen.getByRole('button', { name: /enable protection/i })
      await user.click(submitButton)

      expect(
        await screen.findByText('Password protection enabled successfully!')
      ).toBeInTheDocument()
    })

    it('should call onSuccess after successful initialization', async () => {
      vi.useFakeTimers()
      const user = userEvent.setup({ delay: null })
      const onSuccess = vi.fn()
      mockUsePasswordValidation.mockReturnValue({
        strength: 4,
        issues: [],
        isValid: true,
        score: 4,
      })

      render(<PasswordSetup {...defaultProps} onSuccess={onSuccess} />)

      const newPasswordInput = screen.getByLabelText('New Password')
      const confirmPasswordInput = screen.getByLabelText('Confirm Password')

      await user.type(newPasswordInput, 'StrongPassword123!')
      await user.type(confirmPasswordInput, 'StrongPassword123!')

      const submitButton = screen.getByRole('button', { name: /enable protection/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText('Password protection enabled successfully!')).toBeInTheDocument()
      })

      // Fast-forward timers to trigger onSuccess callback
      vi.advanceTimersByTime(1000)

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalled()
      })

      vi.useRealTimers()
    })

    it('should show error message on initialization failure', async () => {
      const user = userEvent.setup()
      mockUsePasswordValidation.mockReturnValue({
        strength: 4,
        issues: [],
        isValid: true,
        score: 4,
      })
      mockInitialize.mockRejectedValue(new Error('Background service unavailable'))

      render(<PasswordSetup {...defaultProps} />)

      const newPasswordInput = screen.getByLabelText('New Password')
      const confirmPasswordInput = screen.getByLabelText('Confirm Password')

      await user.type(newPasswordInput, 'StrongPassword123!')
      await user.type(confirmPasswordInput, 'StrongPassword123!')

      const submitButton = screen.getByRole('button', { name: /enable protection/i })
      await user.click(submitButton)

      expect(await screen.findByText('Background service unavailable')).toBeInTheDocument()
    })

    it('should handle non-Error exceptions', async () => {
      const user = userEvent.setup()
      mockUsePasswordValidation.mockReturnValue({
        strength: 4,
        issues: [],
        isValid: true,
        score: 4,
      })
      mockInitialize.mockRejectedValue('String error')

      render(<PasswordSetup {...defaultProps} />)

      const newPasswordInput = screen.getByLabelText('New Password')
      const confirmPasswordInput = screen.getByLabelText('Confirm Password')

      await user.type(newPasswordInput, 'StrongPassword123!')
      await user.type(confirmPasswordInput, 'StrongPassword123!')

      const submitButton = screen.getByRole('button', { name: /enable protection/i })
      await user.click(submitButton)

      expect(
        await screen.findByText('Failed to set up password protection')
      ).toBeInTheDocument()
    })

    it('should clear sensitive data after success', async () => {
      const user = userEvent.setup()
      mockUsePasswordValidation.mockReturnValue({
        strength: 4,
        issues: [],
        isValid: true,
        score: 4,
      })

      render(<PasswordSetup {...defaultProps} />)

      const newPasswordInput = screen.getByLabelText('New Password')
      const confirmPasswordInput = screen.getByLabelText('Confirm Password')

      await user.type(newPasswordInput, 'StrongPassword123!')
      await user.type(confirmPasswordInput, 'StrongPassword123!')

      const submitButton = screen.getByRole('button', { name: /enable protection/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText('Password protection enabled successfully!')).toBeInTheDocument()
      })

      // Password fields should be cleared (not visible in success state)
      expect(screen.queryByLabelText('New Password')).not.toBeInTheDocument()
    })

    it('should clear error when user starts typing', async () => {
      const user = userEvent.setup()
      mockUsePasswordValidation.mockReturnValue({
        strength: 1,
        issues: [],
        isValid: true,
        score: 1,
      })

      render(<PasswordSetup {...defaultProps} />)

      const newPasswordInput = screen.getByLabelText('New Password')
      const confirmPasswordInput = screen.getByLabelText('Confirm Password')

      await user.type(newPasswordInput, 'short')
      await user.type(confirmPasswordInput, 'different')

      const submitButton = screen.getByRole('button', { name: /enable protection/i })
      await user.click(submitButton)

      expect(await screen.findByText('Passwords do not match')).toBeInTheDocument()

      // Type in password field to clear error
      await user.type(newPasswordInput, 'a')

      expect(screen.queryByText('Passwords do not match')).not.toBeInTheDocument()
    })
  })

  describe('loading states', () => {
    it('should show loading spinner during initialization', async () => {
      const user = userEvent.setup()
      mockUsePasswordValidation.mockReturnValue({
        strength: 4,
        issues: [],
        isValid: true,
        score: 4,
      })
      mockInitialize.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      )

      render(<PasswordSetup {...defaultProps} />)

      const newPasswordInput = screen.getByLabelText('New Password')
      const confirmPasswordInput = screen.getByLabelText('Confirm Password')

      await user.type(newPasswordInput, 'StrongPassword123!')
      await user.type(confirmPasswordInput, 'StrongPassword123!')

      const submitButton = screen.getByRole('button', { name: /enable protection/i })
      await user.click(submitButton)

      expect(screen.getByText('Setting up...')).toBeInTheDocument()

      await waitFor(
        () => {
          expect(screen.queryByText('Setting up...')).not.toBeInTheDocument()
        },
        { timeout: 200 }
      )
    })

    it('should disable form during initialization', async () => {
      const user = userEvent.setup()
      mockUsePasswordValidation.mockReturnValue({
        strength: 4,
        issues: [],
        isValid: true,
        score: 4,
      })
      mockInitialize.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      )

      render(<PasswordSetup {...defaultProps} />)

      const newPasswordInput = screen.getByLabelText('New Password')
      const confirmPasswordInput = screen.getByLabelText('Confirm Password')

      await user.type(newPasswordInput, 'StrongPassword123!')
      await user.type(confirmPasswordInput, 'StrongPassword123!')

      const submitButton = screen.getByRole('button', { name: /enable protection/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(newPasswordInput).toBeDisabled()
        expect(confirmPasswordInput).toBeDisabled()
        expect(submitButton).toBeDisabled()
      })
    })

    it('should disable form when context isLoading is true', () => {
      mockLockContext.isLoading = true

      render(<PasswordSetup {...defaultProps} />)

      const newPasswordInput = screen.getByLabelText('New Password')
      const confirmPasswordInput = screen.getByLabelText('Confirm Password')
      const submitButton = screen.getByRole('button', { name: /enable protection/i })

      expect(newPasswordInput).toBeDisabled()
      expect(confirmPasswordInput).toBeDisabled()
      expect(submitButton).toBeDisabled()
    })
  })

  describe('cancel functionality', () => {
    it('should call onCancel when cancel button is clicked', async () => {
      const user = userEvent.setup()
      const onCancel = vi.fn()

      render(<PasswordSetup {...defaultProps} onCancel={onCancel} />)

      const cancelButton = screen.getByRole('button', { name: /cancel/i })
      await user.click(cancelButton)

      expect(onCancel).toHaveBeenCalled()
    })

    it('should clear passwords when cancel is clicked', async () => {
      const user = userEvent.setup()
      const onCancel = vi.fn()
      mockUsePasswordValidation.mockReturnValue({
        strength: 3,
        issues: [],
        isValid: true,
        score: 3,
      })

      render(<PasswordSetup {...defaultProps} onCancel={onCancel} />)

      const newPasswordInput = screen.getByLabelText('New Password')
      const confirmPasswordInput = screen.getByLabelText('Confirm Password')

      await user.type(newPasswordInput, 'Password123!')
      await user.type(confirmPasswordInput, 'Password123!')

      const cancelButton = screen.getByRole('button', { name: /cancel/i })
      await user.click(cancelButton)

      // Passwords should be cleared before calling onCancel
      expect(newPasswordInput).toHaveValue('')
      expect(confirmPasswordInput).toHaveValue('')
    })

    it('should disable cancel button during initialization', async () => {
      const user = userEvent.setup()
      mockUsePasswordValidation.mockReturnValue({
        strength: 4,
        issues: [],
        isValid: true,
        score: 4,
      })
      mockInitialize.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      )

      render(<PasswordSetup {...defaultProps} />)

      const newPasswordInput = screen.getByLabelText('New Password')
      const confirmPasswordInput = screen.getByLabelText('Confirm Password')

      await user.type(newPasswordInput, 'StrongPassword123!')
      await user.type(confirmPasswordInput, 'StrongPassword123!')

      const submitButton = screen.getByRole('button', { name: /enable protection/i })
      await user.click(submitButton)

      const cancelButton = screen.getByRole('button', { name: /cancel/i })
      expect(cancelButton).toBeDisabled()
    })
  })
})
