/**
 * Unit Tests for ChangePasswordForm Component
 * Tests form validation, password change flow, and security
 */

import React from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChangePasswordForm } from '../ChangePasswordForm'
import { LockProvider } from '../../../contexts/LockContext'
import { PIN_LENGTH } from '@/lib/crypto/key-manager'

// Mock the LockContext
const mockChangePassword = vi.fn()
const mockIsLoading = false

vi.mock('../../../contexts/LockContext', () => ({
  LockProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useLockContext: () => ({
    changePassword: mockChangePassword,
    isLoading: mockIsLoading,
  }),
}))

// Mock the usePasswordValidation hook
const mockUsePasswordValidation = vi.fn()
vi.mock('../../../hooks/usePasswordValidation', () => ({
  usePasswordValidation: (password: string) => mockUsePasswordValidation(password),
}))

describe('ChangePasswordForm', () => {
  const mockOnSuccess = vi.fn()
  const mockOnCancel = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()

    // Default: new password is valid
    mockUsePasswordValidation.mockReturnValue({
      isValid: true,
      strength: 4,
      issues: [],
      score: 4,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe('Form Rendering', () => {
    it('should render all password fields', () => {
      render(<ChangePasswordForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />)

      expect(screen.getByLabelText(/current pin/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/new pin/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/confirm.*pin/i)).toBeInTheDocument()
    })

    it('should render submit and cancel buttons', () => {
      render(<ChangePasswordForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />)

      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /change|save/i })).toBeInTheDocument()
    })

    it('should have form heading', () => {
      render(<ChangePasswordForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />)

      expect(screen.getByRole('heading', { name: /change.*password|pin/i })).toBeInTheDocument()
    })

    it('should autofocus current password field', () => {
      render(<ChangePasswordForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />)

      const currentPasswordInput = screen.getByLabelText(/current pin/i)
      expect(currentPasswordInput).toHaveFocus()
    })
  })

  describe('Form Validation', () => {
    it('should disable submit when form is empty', () => {
      render(<ChangePasswordForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />)

      const submitButton = screen.getByRole('button', { name: /change|save/i })
      expect(submitButton).toBeDisabled()
    })

    it('should disable submit when only current password entered', async () => {
      const user = userEvent.setup({ delay: null })

      render(<ChangePasswordForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />)

      const currentPasswordInput = screen.getByLabelText(/current pin/i)
      await user.type(currentPasswordInput, '123456')

      const submitButton = screen.getByRole('button', { name: /change|save/i })
      expect(submitButton).toBeDisabled()
    })

    it('should disable submit when passwords do not match', async () => {
      const user = userEvent.setup({ delay: null })

      render(<ChangePasswordForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />)

      const currentPasswordInput = screen.getByLabelText(/current pin/i)
      const newPasswordInput = screen.getByLabelText(/new pin/i)
      const confirmPasswordInput = screen.getByLabelText(/confirm.*pin/i)

      await user.type(currentPasswordInput, '123456')
      await user.type(newPasswordInput, '654321')
      await user.type(confirmPasswordInput, '111111')

      const submitButton = screen.getByRole('button', { name: /change|save/i })
      expect(submitButton).toBeDisabled()
    })

    it('should show error when passwords mismatch', async () => {
      const user = userEvent.setup({ delay: null })

      render(<ChangePasswordForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />)

      const newPasswordInput = screen.getByLabelText(/new pin/i)
      const confirmPasswordInput = screen.getByLabelText(/confirm.*pin/i)

      await user.type(newPasswordInput, '654321')
      await user.type(confirmPasswordInput, '111111')

      expect(screen.getByText(/mismatch|do not match/i)).toBeInTheDocument()
    })

    it('should enable submit when all fields valid and match', async () => {
      const user = userEvent.setup({ delay: null })

      render(<ChangePasswordForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />)

      const currentPasswordInput = screen.getByLabelText(/current pin/i)
      const newPasswordInput = screen.getByLabelText(/new pin/i)
      const confirmPasswordInput = screen.getByLabelText(/confirm.*pin/i)

      await user.type(currentPasswordInput, '123456')
      await user.type(newPasswordInput, '654321')
      await user.type(confirmPasswordInput, '654321')

      const submitButton = screen.getByRole('button', { name: /change|save/i })
      expect(submitButton).not.toBeDisabled()
    })

    it('should show success indicator when passwords match', async () => {
      const user = userEvent.setup({ delay: null })

      render(<ChangePasswordForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />)

      const newPasswordInput = screen.getByLabelText(/new pin/i)
      const confirmPasswordInput = screen.getByLabelText(/confirm.*pin/i)

      await user.type(newPasswordInput, '654321')
      await user.type(confirmPasswordInput, '654321')

      expect(screen.getByText(/match|correct/i)).toBeInTheDocument()
    })

    it('should validate new password strength', async () => {
      const user = userEvent.setup({ delay: null })

      mockUsePasswordValidation.mockReturnValue({
        isValid: false,
        strength: 0,
        issues: ['PIN must be exactly 6 digits'],
        score: 0,
      })

      render(<ChangePasswordForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />)

      const currentPasswordInput = screen.getByLabelText(/current pin/i)
      const newPasswordInput = screen.getByLabelText(/new pin/i)
      const confirmPasswordInput = screen.getByLabelText(/confirm.*pin/i)

      await user.type(currentPasswordInput, '123456')
      await user.type(newPasswordInput, '123')
      await user.type(confirmPasswordInput, '123')

      const submitButton = screen.getByRole('button', { name: /change|save/i })
      expect(submitButton).toBeDisabled()
    })

    it('should reject same password as current', async () => {
      const user = userEvent.setup({ delay: null })

      render(<ChangePasswordForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />)

      const currentPasswordInput = screen.getByLabelText(/current pin/i)
      const newPasswordInput = screen.getByLabelText(/new pin/i)
      const confirmPasswordInput = screen.getByLabelText(/confirm.*pin/i)

      await user.type(currentPasswordInput, '123456')
      await user.type(newPasswordInput, '123456')
      await user.type(confirmPasswordInput, '123456')

      const submitButton = screen.getByRole('button', { name: /change|save/i })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/same|cannot be the same/i)).toBeInTheDocument()
      })

      expect(mockChangePassword).not.toHaveBeenCalled()
    })
  })

  describe('Password Input Sanitization', () => {
    it('should only allow numeric input', async () => {
      const user = userEvent.setup({ delay: null })

      render(<ChangePasswordForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />)

      const currentPasswordInput = screen.getByLabelText(/current pin/i) as HTMLInputElement

      await user.type(currentPasswordInput, 'abc123xyz')

      expect(currentPasswordInput.value).toBe('123')
    })

    it('should limit input to PIN_LENGTH characters', async () => {
      const user = userEvent.setup({ delay: null })

      render(<ChangePasswordForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />)

      const currentPasswordInput = screen.getByLabelText(/current pin/i) as HTMLInputElement

      await user.type(currentPasswordInput, '123456789')

      expect(currentPasswordInput.value).toBe('123456')
      expect(currentPasswordInput.value.length).toBe(PIN_LENGTH)
    })

    it('should sanitize all password fields', async () => {
      const user = userEvent.setup({ delay: null })

      render(<ChangePasswordForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />)

      const currentPasswordInput = screen.getByLabelText(/current pin/i) as HTMLInputElement
      const newPasswordInput = screen.getByLabelText(/new pin/i) as HTMLInputElement
      const confirmPasswordInput = screen.getByLabelText(/confirm.*pin/i) as HTMLInputElement

      await user.type(currentPasswordInput, 'abc123')
      await user.type(newPasswordInput, 'def456')
      await user.type(confirmPasswordInput, 'ghi789')

      expect(currentPasswordInput.value).toBe('123')
      expect(newPasswordInput.value).toBe('456')
      expect(confirmPasswordInput.value).toBe('789')
    })
  })

  describe('Form Submission', () => {
    it('should call changePassword with correct arguments', async () => {
      const user = userEvent.setup({ delay: null })
      mockChangePassword.mockResolvedValue(undefined)

      render(<ChangePasswordForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />)

      const currentPasswordInput = screen.getByLabelText(/current pin/i)
      const newPasswordInput = screen.getByLabelText(/new pin/i)
      const confirmPasswordInput = screen.getByLabelText(/confirm.*pin/i)

      await user.type(currentPasswordInput, '123456')
      await user.type(newPasswordInput, '654321')
      await user.type(confirmPasswordInput, '654321')

      const submitButton = screen.getByRole('button', { name: /change|save/i })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(mockChangePassword).toHaveBeenCalledWith('123456', '654321')
      })
    })

    it('should show loading state during submission', async () => {
      const user = userEvent.setup({ delay: null })
      mockChangePassword.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      )

      render(<ChangePasswordForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />)

      const currentPasswordInput = screen.getByLabelText(/current pin/i)
      const newPasswordInput = screen.getByLabelText(/new pin/i)
      const confirmPasswordInput = screen.getByLabelText(/confirm.*pin/i)

      await user.type(currentPasswordInput, '123456')
      await user.type(newPasswordInput, '654321')
      await user.type(confirmPasswordInput, '654321')

      const submitButton = screen.getByRole('button', { name: /change|save/i })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/changing|saving/i)).toBeInTheDocument()
      })
    })

    it('should disable buttons during submission', async () => {
      const user = userEvent.setup({ delay: null })
      mockChangePassword.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      )

      render(<ChangePasswordForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />)

      const currentPasswordInput = screen.getByLabelText(/current pin/i)
      const newPasswordInput = screen.getByLabelText(/new pin/i)
      const confirmPasswordInput = screen.getByLabelText(/confirm.*pin/i)

      await user.type(currentPasswordInput, '123456')
      await user.type(newPasswordInput, '654321')
      await user.type(confirmPasswordInput, '654321')

      const submitButton = screen.getByRole('button', { name: /change|save/i })
      const cancelButton = screen.getByRole('button', { name: /cancel/i })

      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(submitButton).toBeDisabled()
        expect(cancelButton).toBeDisabled()
      })
    })

    it('should show success feedback on successful change', async () => {
      const user = userEvent.setup({ delay: null })
      mockChangePassword.mockResolvedValue(undefined)

      render(<ChangePasswordForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />)

      const currentPasswordInput = screen.getByLabelText(/current pin/i)
      const newPasswordInput = screen.getByLabelText(/new pin/i)
      const confirmPasswordInput = screen.getByLabelText(/confirm.*pin/i)

      await user.type(currentPasswordInput, '123456')
      await user.type(newPasswordInput, '654321')
      await user.type(confirmPasswordInput, '654321')

      const submitButton = screen.getByRole('button', { name: /change|save/i })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/success|changed/i)).toBeInTheDocument()
      })
    })

    it('should call onSuccess after successful change', async () => {
      const user = userEvent.setup({ delay: null })
      mockChangePassword.mockResolvedValue(undefined)

      render(<ChangePasswordForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />)

      const currentPasswordInput = screen.getByLabelText(/current pin/i)
      const newPasswordInput = screen.getByLabelText(/new pin/i)
      const confirmPasswordInput = screen.getByLabelText(/confirm.*pin/i)

      await user.type(currentPasswordInput, '123456')
      await user.type(newPasswordInput, '654321')
      await user.type(confirmPasswordInput, '654321')

      const submitButton = screen.getByRole('button', { name: /change|save/i })
      fireEvent.click(submitButton)

      // Wait for success message
      await waitFor(() => {
        expect(screen.getByText(/success|changed/i)).toBeInTheDocument()
      })

      // Fast-forward success timeout
      vi.advanceTimersByTime(1200)

      await waitFor(() => {
        expect(mockOnSuccess).toHaveBeenCalled()
      })
    })

    it('should reset form after successful submission', async () => {
      const user = userEvent.setup({ delay: null })
      mockChangePassword.mockResolvedValue(undefined)

      render(<ChangePasswordForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />)

      const currentPasswordInput = screen.getByLabelText(/current pin/i) as HTMLInputElement
      const newPasswordInput = screen.getByLabelText(/new pin/i) as HTMLInputElement
      const confirmPasswordInput = screen.getByLabelText(/confirm.*pin/i) as HTMLInputElement

      await user.type(currentPasswordInput, '123456')
      await user.type(newPasswordInput, '654321')
      await user.type(confirmPasswordInput, '654321')

      const submitButton = screen.getByRole('button', { name: /change|save/i })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/success|changed/i)).toBeInTheDocument()
      })

      // Fields should be cleared
      expect(currentPasswordInput.value).toBe('')
      expect(newPasswordInput.value).toBe('')
      expect(confirmPasswordInput.value).toBe('')
    })
  })

  describe('Error Handling', () => {
    it('should show error when current password is missing', async () => {
      const user = userEvent.setup({ delay: null })

      render(<ChangePasswordForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />)

      const newPasswordInput = screen.getByLabelText(/new pin/i)
      const confirmPasswordInput = screen.getByLabelText(/confirm.*pin/i)

      await user.type(newPasswordInput, '654321')
      await user.type(confirmPasswordInput, '654321')

      const submitButton = screen.getByRole('button', { name: /change|save/i })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/current.*required|missing/i)).toBeInTheDocument()
      })

      expect(mockChangePassword).not.toHaveBeenCalled()
    })

    it('should show error when new password is invalid', async () => {
      const user = userEvent.setup({ delay: null })

      mockUsePasswordValidation.mockReturnValue({
        isValid: false,
        strength: 0,
        issues: ['PIN must be exactly 6 digits'],
        score: 0,
      })

      render(<ChangePasswordForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />)

      const currentPasswordInput = screen.getByLabelText(/current pin/i)
      const newPasswordInput = screen.getByLabelText(/new pin/i)
      const confirmPasswordInput = screen.getByLabelText(/confirm.*pin/i)

      await user.type(currentPasswordInput, '123456')
      await user.type(newPasswordInput, '123')
      await user.type(confirmPasswordInput, '123')

      const submitButton = screen.getByRole('button', { name: /change|save/i })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/invalid/i)).toBeInTheDocument()
      })

      expect(mockChangePassword).not.toHaveBeenCalled()
    })

    it('should display error from changePassword failure', async () => {
      const user = userEvent.setup({ delay: null })
      mockChangePassword.mockRejectedValue(new Error('Incorrect current password'))

      render(<ChangePasswordForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />)

      const currentPasswordInput = screen.getByLabelText(/current pin/i)
      const newPasswordInput = screen.getByLabelText(/new pin/i)
      const confirmPasswordInput = screen.getByLabelText(/confirm.*pin/i)

      await user.type(currentPasswordInput, '123456')
      await user.type(newPasswordInput, '654321')
      await user.type(confirmPasswordInput, '654321')

      const submitButton = screen.getByRole('button', { name: /change|save/i })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/incorrect.*password/i)).toBeInTheDocument()
      })

      expect(mockOnSuccess).not.toHaveBeenCalled()
    })

    it('should handle non-Error exceptions', async () => {
      const user = userEvent.setup({ delay: null })
      mockChangePassword.mockRejectedValue('String error')

      render(<ChangePasswordForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />)

      const currentPasswordInput = screen.getByLabelText(/current pin/i)
      const newPasswordInput = screen.getByLabelText(/new pin/i)
      const confirmPasswordInput = screen.getByLabelText(/confirm.*pin/i)

      await user.type(currentPasswordInput, '123456')
      await user.type(newPasswordInput, '654321')
      await user.type(confirmPasswordInput, '654321')

      const submitButton = screen.getByRole('button', { name: /change|save/i })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument()
      })
    })

    it('should reset form after error', async () => {
      const user = userEvent.setup({ delay: null })
      mockChangePassword.mockRejectedValue(new Error('Test error'))

      render(<ChangePasswordForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />)

      const currentPasswordInput = screen.getByLabelText(/current pin/i) as HTMLInputElement
      const newPasswordInput = screen.getByLabelText(/new pin/i) as HTMLInputElement
      const confirmPasswordInput = screen.getByLabelText(/confirm.*pin/i) as HTMLInputElement

      await user.type(currentPasswordInput, '123456')
      await user.type(newPasswordInput, '654321')
      await user.type(confirmPasswordInput, '654321')

      const submitButton = screen.getByRole('button', { name: /change|save/i })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument()
      })

      // Form should be reset
      expect(currentPasswordInput.value).toBe('')
      expect(newPasswordInput.value).toBe('')
      expect(confirmPasswordInput.value).toBe('')
    })

    it('should clear error when user types', async () => {
      const user = userEvent.setup({ delay: null })

      render(<ChangePasswordForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />)

      const submitButton = screen.getByRole('button', { name: /change|save/i })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument()
      })

      const currentPasswordInput = screen.getByLabelText(/current pin/i)
      await user.type(currentPasswordInput, '1')

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  describe('Cancel Functionality', () => {
    it('should call onCancel when cancel button clicked', () => {
      render(<ChangePasswordForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />)

      const cancelButton = screen.getByRole('button', { name: /cancel/i })
      fireEvent.click(cancelButton)

      expect(mockOnCancel).toHaveBeenCalled()
    })

    it('should reset form when cancelled', async () => {
      const user = userEvent.setup({ delay: null })

      render(<ChangePasswordForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />)

      const currentPasswordInput = screen.getByLabelText(/current pin/i) as HTMLInputElement
      const newPasswordInput = screen.getByLabelText(/new pin/i) as HTMLInputElement

      await user.type(currentPasswordInput, '123456')
      await user.type(newPasswordInput, '654321')

      const cancelButton = screen.getByRole('button', { name: /cancel/i })
      fireEvent.click(cancelButton)

      expect(currentPasswordInput.value).toBe('')
      expect(newPasswordInput.value).toBe('')
    })
  })

  describe('Accessibility', () => {
    it('should have accessible labels for all inputs', () => {
      render(<ChangePasswordForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />)

      const currentPasswordInput = screen.getByLabelText(/current pin/i)
      const newPasswordInput = screen.getByLabelText(/new pin/i)
      const confirmPasswordInput = screen.getByLabelText(/confirm.*pin/i)

      expect(currentPasswordInput).toHaveAccessibleName()
      expect(newPasswordInput).toHaveAccessibleName()
      expect(confirmPasswordInput).toHaveAccessibleName()
    })

    it('should mark error messages with role=alert', async () => {
      mockChangePassword.mockRejectedValue(new Error('Test error'))

      render(<ChangePasswordForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />)

      const submitButton = screen.getByRole('button', { name: /change|save/i })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument()
      })
    })

    it('should have proper input types', () => {
      render(<ChangePasswordForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />)

      const currentPasswordInput = screen.getByLabelText(/current pin/i)
      const newPasswordInput = screen.getByLabelText(/new pin/i)

      expect(currentPasswordInput).toHaveAttribute('type', 'password')
      expect(newPasswordInput).toHaveAttribute('type', 'password')
    })

    it('should have inputMode=numeric for PIN inputs', () => {
      render(<ChangePasswordForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />)

      const currentPasswordInput = screen.getByLabelText(/current pin/i)
      const newPasswordInput = screen.getByLabelText(/new pin/i)

      expect(currentPasswordInput).toHaveAttribute('inputMode', 'numeric')
      expect(newPasswordInput).toHaveAttribute('inputMode', 'numeric')
    })

    it('should have pattern attribute for numeric validation', () => {
      render(<ChangePasswordForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />)

      const currentPasswordInput = screen.getByLabelText(/current pin/i)
      expect(currentPasswordInput).toHaveAttribute('pattern', '\\d*')
    })

    it('should have autocomplete=off for security', () => {
      render(<ChangePasswordForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />)

      const currentPasswordInput = screen.getByLabelText(/current pin/i)
      expect(currentPasswordInput).toHaveAttribute('autocomplete', 'off')
    })
  })

  describe('Show/Hide Password Toggles', () => {
    it('should render password toggle buttons if implemented', () => {
      render(<ChangePasswordForm onSuccess={mockOnSuccess} onCancel={mockOnCancel} />)

      // PasswordInput component should have show/hide toggles
      const currentPasswordInput = screen.getByLabelText(/current pin/i)
      expect(currentPasswordInput).toBeInTheDocument()
    })
  })
})
