/**
 * Integration Tests for SecuritySettings Component
 *
 * Tests complete user flows including:
 * - Full password setup flow (uninitialized → initialized)
 * - Full unlock flow (locked → unlocked)
 * - Full password change flow
 * - Full disable protection flow
 * - State transitions via LockContext broadcasts
 */

import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SecuritySettings } from '../SecuritySettings'
import type { ReactNode } from 'react'

// Mock child components to simplify integration testing
vi.mock('../ChangePasswordForm', () => ({
  ChangePasswordForm: ({ onSuccess, onCancel }: any) => (
    <div data-testid="change-password-form">
      <button onClick={onSuccess}>Submit Change</button>
      <button onClick={onCancel}>Cancel Change</button>
    </div>
  ),
}))

vi.mock('../AutoLockConfig', () => ({
  AutoLockConfig: ({ onLockNow }: any) => (
    <div data-testid="auto-lock-config">
      <button onClick={onLockNow}>Lock Now</button>
    </div>
  ),
}))

// Mock LockContext
const mockInitialize = vi.fn()
const mockUnlock = vi.fn()
const mockLock = vi.fn()
const mockChangePassword = vi.fn()
const mockDisablePasswordProtection = vi.fn()

const mockLockContext = {
  isInitialized: false,
  isUnlocked: false,
  isLoading: false,
  initialize: mockInitialize,
  unlock: mockUnlock,
  lock: mockLock,
  changePassword: mockChangePassword,
  disablePasswordProtection: mockDisablePasswordProtection,
}

// Create wrapper component for LockProvider
const LockProviderWrapper = ({ children }: { children: ReactNode }) => {
  return <>{children}</>
}

vi.mock('@/ui/contexts/LockContext', () => ({
  useLockContext: () => mockLockContext,
  LockProvider: LockProviderWrapper,
}))

// Mock usePasswordValidation
const mockUsePasswordValidation = vi.fn()
vi.mock('@/ui/hooks/usePasswordValidation', () => ({
  usePasswordValidation: (password: string) => mockUsePasswordValidation(password),
}))

describe('SecuritySettings Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Reset lock context state to defaults
    mockLockContext.isInitialized = false
    mockLockContext.isUnlocked = false
    mockLockContext.isLoading = false

    // Default password validation
    mockUsePasswordValidation.mockReturnValue({
      strength: 4,
      issues: [],
      isValid: true,
      score: 4,
    })

    mockInitialize.mockResolvedValue(undefined)
    mockUnlock.mockResolvedValue({ success: true })
    mockLock.mockResolvedValue(undefined)
    mockChangePassword.mockResolvedValue(undefined)
    mockDisablePasswordProtection.mockResolvedValue(undefined)
  })

  describe('Full password setup flow (uninitialized → initialized)', () => {
    it('should complete full password setup flow', async () => {
      vi.useFakeTimers()
      const user = userEvent.setup({ delay: null })

      // Start with uninitialized state
      mockLockContext.isInitialized = false
      mockLockContext.isUnlocked = false

      render(<SecuritySettings />)

      // Should show enable password protection toggle
      expect(screen.getByText('Enable Password Protection to:')).toBeInTheDocument()
      const enableButton = screen.getByRole('button', { name: /enable/i })
      await user.click(enableButton)

      // Should show password setup form
      expect(await screen.findByLabelText('New Password')).toBeInTheDocument()
      expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument()

      // Fill in passwords
      const newPassword = screen.getByLabelText('New Password')
      const confirmPassword = screen.getByLabelText('Confirm Password')

      await user.type(newPassword, 'V3ryStr0ng!P@ssw0rd')
      await user.type(confirmPassword, 'V3ryStr0ng!P@ssw0rd')

      // Submit
      const submitButton = screen.getByRole('button', { name: /enable protection/i })
      await user.click(submitButton)

      // Verify initialization was called
      await waitFor(() => {
        expect(mockInitialize).toHaveBeenCalledWith('V3ryStr0ng!P@ssw0rd')
      })

      // Should show success message
      expect(await screen.findByText('Password protection enabled successfully!')).toBeInTheDocument()

      // Fast-forward to trigger onSuccess callback
      vi.advanceTimersByTime(1000)

      // Setup form should be hidden after success
      await waitFor(() => {
        expect(screen.queryByLabelText('New Password')).not.toBeInTheDocument()
      })

      vi.useRealTimers()
    })

    it('should allow canceling password setup', async () => {
      const user = userEvent.setup()
      mockLockContext.isInitialized = false

      render(<SecuritySettings />)

      // Click enable button
      const enableButton = screen.getByRole('button', { name: /enable/i })
      await user.click(enableButton)

      // Should show password setup form
      expect(await screen.findByLabelText('New Password')).toBeInTheDocument()

      // Click cancel
      const cancelButton = screen.getByRole('button', { name: /cancel/i })
      await user.click(cancelButton)

      // Setup form should be hidden
      expect(screen.queryByLabelText('New Password')).not.toBeInTheDocument()
      expect(mockInitialize).not.toHaveBeenCalled()
    })

    it('should handle initialization errors', async () => {
      const user = userEvent.setup()
      mockLockContext.isInitialized = false
      mockInitialize.mockRejectedValue(new Error('Background service unavailable'))

      render(<SecuritySettings />)

      // Enable and fill form
      const enableButton = screen.getByRole('button', { name: /enable/i })
      await user.click(enableButton)

      const newPassword = screen.getByLabelText('New Password')
      const confirmPassword = screen.getByLabelText('Confirm Password')

      await user.type(newPassword, 'StrongPassword123!')
      await user.type(confirmPassword, 'StrongPassword123!')

      const submitButton = screen.getByRole('button', { name: /enable protection/i })
      await user.click(submitButton)

      // Should show error
      expect(await screen.findByText('Background service unavailable')).toBeInTheDocument()

      // Form should still be visible
      expect(screen.getByLabelText('New Password')).toBeInTheDocument()
    })
  })

  describe('Full unlock flow (locked → unlocked)', () => {
    it('should show lock screen when initialized but locked', () => {
      mockLockContext.isInitialized = true
      mockLockContext.isUnlocked = false

      render(<SecuritySettings />)

      expect(screen.getByText('InboxKey is Locked')).toBeInTheDocument()
      expect(screen.getByText('Unlock to change security settings')).toBeInTheDocument()
    })

    it('should complete full unlock flow', async () => {
      const user = userEvent.setup()
      mockLockContext.isInitialized = true
      mockLockContext.isUnlocked = false

      const { rerender } = render(<SecuritySettings />)

      // Should show lock screen
      expect(screen.getByText('InboxKey is Locked')).toBeInTheDocument()

      // Enter password and unlock
      const passwordInput = screen.getByLabelText('Password')
      await user.type(passwordInput, 'mypassword')

      const unlockButton = screen.getByRole('button', { name: /unlock/i })
      await user.click(unlockButton)

      await waitFor(() => {
        expect(mockUnlock).toHaveBeenCalledWith('mypassword')
      })

      // Simulate state change after unlock
      mockLockContext.isUnlocked = true
      rerender(<SecuritySettings />)

      // Should now show unlocked settings panel
      await waitFor(() => {
        expect(screen.getByText('Enabled (Unlocked)')).toBeInTheDocument()
      })
      expect(screen.getByText('Change Password')).toBeInTheDocument()
      expect(screen.queryByText('InboxKey is Locked')).not.toBeInTheDocument()
    })
  })

  describe('Full password change flow', () => {
    it('should show change password form when unlocked', async () => {
      const user = userEvent.setup()
      mockLockContext.isInitialized = true
      mockLockContext.isUnlocked = true

      render(<SecuritySettings />)

      // Should show change password button
      const changeButton = screen.getByRole('button', { name: /change password/i })
      await user.click(changeButton)

      // Should show ChangePasswordForm (mocked)
      expect(screen.getByTestId('change-password-form')).toBeInTheDocument()

      // Button should be hidden
      expect(screen.queryByRole('button', { name: /change password/i })).not.toBeInTheDocument()
    })

    it('should hide form after successful password change', async () => {
      const user = userEvent.setup()
      mockLockContext.isInitialized = true
      mockLockContext.isUnlocked = true

      render(<SecuritySettings />)

      // Show change password form
      const changeButton = screen.getByRole('button', { name: /change password/i })
      await user.click(changeButton)

      // Simulate successful change
      const submitButton = screen.getByText('Submit Change')
      await user.click(submitButton)

      // Form should be hidden
      await waitFor(() => {
        expect(screen.queryByTestId('change-password-form')).not.toBeInTheDocument()
      })

      // Change password button should be visible again
      expect(screen.getByRole('button', { name: /change password/i })).toBeInTheDocument()
    })

    it('should allow canceling password change', async () => {
      const user = userEvent.setup()
      mockLockContext.isInitialized = true
      mockLockContext.isUnlocked = true

      render(<SecuritySettings />)

      const changeButton = screen.getByRole('button', { name: /change password/i })
      await user.click(changeButton)

      // Cancel
      const cancelButton = screen.getByText('Cancel Change')
      await user.click(cancelButton)

      // Form should be hidden
      await waitFor(() => {
        expect(screen.queryByTestId('change-password-form')).not.toBeInTheDocument()
      })
    })
  })

  describe('Full disable protection flow', () => {
    it('should show disable password protection button in danger zone', () => {
      mockLockContext.isInitialized = true
      mockLockContext.isUnlocked = true

      render(<SecuritySettings />)

      expect(screen.getByText('Danger Zone')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /disable password protection/i })).toBeInTheDocument()
    })

    it('should show confirmation form when disable is clicked', async () => {
      const user = userEvent.setup()
      mockLockContext.isInitialized = true
      mockLockContext.isUnlocked = true

      render(<SecuritySettings />)

      const disableButton = screen.getByRole('button', { name: /disable password protection/i })
      await user.click(disableButton)

      // Should show confirmation form
      expect(screen.getByLabelText('Confirm with Password')).toBeInTheDocument()
      expect(screen.getByText(/Warning:/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /disable protection/i })).toBeInTheDocument()
    })

    it('should complete full disable protection flow', async () => {
      const user = userEvent.setup()
      mockLockContext.isInitialized = true
      mockLockContext.isUnlocked = true

      const { rerender } = render(<SecuritySettings />)

      // Click disable button
      const disableButton = screen.getByRole('button', { name: /disable password protection/i })
      await user.click(disableButton)

      // Enter password
      const passwordInput = screen.getByLabelText('Confirm with Password')
      await user.type(passwordInput, 'mypassword')

      // Submit
      const confirmButton = screen.getByRole('button', { name: /disable protection/i })
      await user.click(confirmButton)

      await waitFor(() => {
        expect(mockDisablePasswordProtection).toHaveBeenCalledWith('mypassword')
      })

      // Simulate state change after disable
      mockLockContext.isInitialized = false
      mockLockContext.isUnlocked = false
      rerender(<SecuritySettings />)

      // Should show uninitialized state
      await waitFor(() => {
        expect(screen.getByText('Enable Password Protection to:')).toBeInTheDocument()
      })
    })

    it('should require password for disable confirmation', async () => {
      const user = userEvent.setup()
      mockLockContext.isInitialized = true
      mockLockContext.isUnlocked = true

      render(<SecuritySettings />)

      // Open disable form
      const disableButton = screen.getByRole('button', { name: /disable password protection/i })
      await user.click(disableButton)

      // Try to submit without password
      const confirmButton = screen.getByRole('button', { name: /disable protection/i })
      await user.click(confirmButton)

      // Should show error
      expect(await screen.findByText('Please enter your password to confirm')).toBeInTheDocument()
      expect(mockDisablePasswordProtection).not.toHaveBeenCalled()
    })

    it('should handle disable errors', async () => {
      const user = userEvent.setup()
      mockLockContext.isInitialized = true
      mockLockContext.isUnlocked = true
      mockDisablePasswordProtection.mockRejectedValue(new Error('Password is incorrect'))

      render(<SecuritySettings />)

      // Open disable form
      const disableButton = screen.getByRole('button', { name: /disable password protection/i })
      await user.click(disableButton)

      // Enter password and submit
      const passwordInput = screen.getByLabelText('Confirm with Password')
      await user.type(passwordInput, 'wrongpassword')

      const confirmButton = screen.getByRole('button', { name: /disable protection/i })
      await user.click(confirmButton)

      // Should show error
      expect(await screen.findByText('Password is incorrect')).toBeInTheDocument()

      // Form should still be visible
      expect(screen.getByLabelText('Confirm with Password')).toBeInTheDocument()

      // Password should be cleared
      expect(passwordInput).toHaveValue('')
    })

    it('should allow canceling disable protection', async () => {
      const user = userEvent.setup()
      mockLockContext.isInitialized = true
      mockLockContext.isUnlocked = true

      render(<SecuritySettings />)

      // Open disable form
      const disableButton = screen.getByRole('button', { name: /disable password protection/i })
      await user.click(disableButton)

      // Enter some password
      const passwordInput = screen.getByLabelText('Confirm with Password')
      await user.type(passwordInput, 'mypassword')

      // Cancel
      const cancelButton = screen.getByRole('button', { name: /cancel/i })
      await user.click(cancelButton)

      // Form should be hidden
      expect(screen.queryByLabelText('Confirm with Password')).not.toBeInTheDocument()

      // Disable button should be visible again
      expect(screen.getByRole('button', { name: /disable password protection/i })).toBeInTheDocument()

      expect(mockDisablePasswordProtection).not.toHaveBeenCalled()
    })

    it('should clear error when user starts typing', async () => {
      const user = userEvent.setup()
      mockLockContext.isInitialized = true
      mockLockContext.isUnlocked = true

      render(<SecuritySettings />)

      // Open disable form
      const disableButton = screen.getByRole('button', { name: /disable password protection/i })
      await user.click(disableButton)

      // Submit without password to trigger error
      const confirmButton = screen.getByRole('button', { name: /disable protection/i })
      await user.click(confirmButton)

      expect(await screen.findByText('Please enter your password to confirm')).toBeInTheDocument()

      // Start typing
      const passwordInput = screen.getByLabelText('Confirm with Password')
      await user.type(passwordInput, 'a')

      // Error should be cleared
      expect(screen.queryByText('Please enter your password to confirm')).not.toBeInTheDocument()
    })
  })

  describe('Auto-lock configuration', () => {
    it('should show auto-lock config when unlocked', () => {
      mockLockContext.isInitialized = true
      mockLockContext.isUnlocked = true

      render(<SecuritySettings />)

      expect(screen.getByTestId('auto-lock-config')).toBeInTheDocument()
    })

    it('should not show auto-lock config when locked', () => {
      mockLockContext.isInitialized = true
      mockLockContext.isUnlocked = false

      render(<SecuritySettings />)

      expect(screen.queryByTestId('auto-lock-config')).not.toBeInTheDocument()
    })

    it('should not show auto-lock config when uninitialized', () => {
      mockLockContext.isInitialized = false
      mockLockContext.isUnlocked = false

      render(<SecuritySettings />)

      expect(screen.queryByTestId('auto-lock-config')).not.toBeInTheDocument()
    })
  })

  describe('State-based rendering', () => {
    it('should render uninitialized state correctly', () => {
      mockLockContext.isInitialized = false
      mockLockContext.isUnlocked = false

      const { container } = render(<SecuritySettings />)

      expect(container.querySelector('.security-settings--uninitialized')).toBeInTheDocument()
      expect(screen.getByText('Enable Password Protection to:')).toBeInTheDocument()
      expect(screen.queryByText('InboxKey is Locked')).not.toBeInTheDocument()
      expect(screen.queryByText('Change Password')).not.toBeInTheDocument()
    })

    it('should render locked state correctly', () => {
      mockLockContext.isInitialized = true
      mockLockContext.isUnlocked = false

      const { container } = render(<SecuritySettings />)

      expect(container.querySelector('.security-settings--locked')).toBeInTheDocument()
      expect(screen.getByText('InboxKey is Locked')).toBeInTheDocument()
      expect(screen.getByText('Unlock to change security settings')).toBeInTheDocument()
      expect(screen.queryByText('Change Password')).not.toBeInTheDocument()
    })

    it('should render unlocked state correctly', () => {
      mockLockContext.isInitialized = true
      mockLockContext.isUnlocked = true

      const { container } = render(<SecuritySettings />)

      expect(container.querySelector('.security-settings--unlocked')).toBeInTheDocument()
      expect(screen.getByText('Enabled (Unlocked)')).toBeInTheDocument()
      expect(screen.getByText('Change Password')).toBeInTheDocument()
      expect(screen.getByText('Danger Zone')).toBeInTheDocument()
      expect(screen.queryByText('InboxKey is Locked')).not.toBeInTheDocument()
    })
  })

  describe('Loading states', () => {
    it('should disable buttons when isLoading is true', () => {
      mockLockContext.isInitialized = true
      mockLockContext.isUnlocked = true
      mockLockContext.isLoading = true

      render(<SecuritySettings />)

      const changePasswordButton = screen.getByRole('button', { name: /change password/i })
      expect(changePasswordButton).toBeDisabled()

      const disableButton = screen.getByRole('button', { name: /disable password protection/i })
      expect(disableButton).toBeDisabled()
    })
  })
})
