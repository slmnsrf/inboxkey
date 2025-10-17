/**
 * Tests for LockScreen Component
 *
 * Tests lock screen interface including:
 * - Rendering in different modes
 * - Password input and submission
 * - Success/error handling
 * - Loading states
 * - Settings link navigation
 * - Auto-focus behavior
 */

import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LockScreen } from '../LockScreen'
import type { ReactNode } from 'react'

// Mock LockContext
const mockUnlock = vi.fn()
const mockLockContext = {
  unlock: mockUnlock,
  isLoading: false,
  isInitialized: true,
  isUnlocked: false,
  initialize: vi.fn(),
  lock: vi.fn(),
  changePassword: vi.fn(),
  disablePasswordProtection: vi.fn(),
}

vi.mock('@/ui/contexts/LockContext', () => ({
  useLockContext: () => mockLockContext,
}))

// Mock chrome.runtime API
const mockOpenOptionsPage = vi.fn()
global.chrome = {
  runtime: {
    openOptionsPage: mockOpenOptionsPage,
  },
} as any

describe('LockScreen', () => {
  const defaultProps = {
    mode: 'popup' as const,
    onUnlock: vi.fn(),
    showSettingsLink: false,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockLockContext.isLoading = false
    mockUnlock.mockResolvedValue({ success: true })
  })

  describe('rendering', () => {
    it('should render lock screen with title and description', () => {
      render(<LockScreen {...defaultProps} />)

      expect(screen.getByText('InboxKey is Locked')).toBeInTheDocument()
      expect(screen.getByText('Enter your password to unlock')).toBeInTheDocument()
    })

    it('should render password input field', () => {
      render(<LockScreen {...defaultProps} />)

      const input = screen.getByLabelText('Password')
      expect(input).toBeInTheDocument()
      expect(input).toHaveAttribute('type', 'password')
    })

    it('should render unlock button', () => {
      render(<LockScreen {...defaultProps} />)

      expect(screen.getByRole('button', { name: /unlock/i })).toBeInTheDocument()
    })

    it('should auto-focus password input on mount', () => {
      render(<LockScreen {...defaultProps} />)

      const input = screen.getByLabelText('Password')
      expect(input).toHaveFocus()
    })

    it('should render in popup mode', () => {
      const { container } = render(<LockScreen {...defaultProps} mode="popup" />)

      expect(container.querySelector('.lock-screen--popup')).toBeInTheDocument()
    })

    it('should render in settings mode', () => {
      const { container } = render(<LockScreen {...defaultProps} mode="settings" />)

      expect(container.querySelector('.lock-screen--settings')).toBeInTheDocument()
    })
  })

  describe('settings link', () => {
    it('should show settings link when showSettingsLink is true in popup mode', () => {
      render(<LockScreen {...defaultProps} mode="popup" showSettingsLink />)

      expect(screen.getByText('Configure in Settings')).toBeInTheDocument()
    })

    it('should not show settings link when showSettingsLink is false', () => {
      render(<LockScreen {...defaultProps} mode="popup" showSettingsLink={false} />)

      expect(screen.queryByText('Configure in Settings')).not.toBeInTheDocument()
    })

    it('should not show settings link in settings mode', () => {
      render(<LockScreen {...defaultProps} mode="settings" showSettingsLink />)

      expect(screen.queryByText('Configure in Settings')).not.toBeInTheDocument()
    })

    it('should open options page when settings link is clicked', async () => {
      const user = userEvent.setup()

      render(<LockScreen {...defaultProps} mode="popup" showSettingsLink />)

      const settingsLink = screen.getByText('Configure in Settings')
      await user.click(settingsLink)

      expect(mockOpenOptionsPage).toHaveBeenCalled()
    })

    it('should disable settings link during unlock', async () => {
      const user = userEvent.setup()
      mockUnlock.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 100))
      )

      render(<LockScreen {...defaultProps} mode="popup" showSettingsLink />)

      const input = screen.getByLabelText('Password')
      await user.type(input, 'password')

      const unlockButton = screen.getByRole('button', { name: /unlock/i })
      await user.click(unlockButton)

      const settingsLink = screen.getByText('Configure in Settings')
      expect(settingsLink).toBeDisabled()
    })
  })

  describe('password input and validation', () => {
    it('should update password on input change', async () => {
      const user = userEvent.setup()

      render(<LockScreen {...defaultProps} />)

      const input = screen.getByLabelText('Password')
      await user.type(input, 'mypassword')

      expect(input).toHaveValue('mypassword')
    })

    it('should show error when submitting empty password', async () => {
      const user = userEvent.setup()

      render(<LockScreen {...defaultProps} />)

      const unlockButton = screen.getByRole('button', { name: /unlock/i })
      await user.click(unlockButton)

      expect(await screen.findByText('Please enter your password')).toBeInTheDocument()
      expect(mockUnlock).not.toHaveBeenCalled()
    })

    it('should disable unlock button when password is empty', () => {
      render(<LockScreen {...defaultProps} />)

      const unlockButton = screen.getByRole('button', { name: /unlock/i })
      expect(unlockButton).toBeDisabled()
    })

    it('should enable unlock button when password is entered', async () => {
      const user = userEvent.setup()

      render(<LockScreen {...defaultProps} />)

      const input = screen.getByLabelText('Password')
      await user.type(input, 'password')

      const unlockButton = screen.getByRole('button', { name: /unlock/i })
      expect(unlockButton).not.toBeDisabled()
    })

    it('should clear error message when user starts typing', async () => {
      const user = userEvent.setup()
      mockUnlock.mockResolvedValue({ success: false, error: 'Wrong password' })

      render(<LockScreen {...defaultProps} />)

      const input = screen.getByLabelText('Password')
      await user.type(input, 'wrong')

      const unlockButton = screen.getByRole('button', { name: /unlock/i })
      await user.click(unlockButton)

      expect(await screen.findByText('Wrong password')).toBeInTheDocument()

      // Type again to clear error
      await user.type(input, 'a')

      expect(screen.queryByText('Wrong password')).not.toBeInTheDocument()
    })
  })

  describe('unlock flow', () => {
    it('should call unlock with password on submit', async () => {
      const user = userEvent.setup()
      const onUnlock = vi.fn()

      render(<LockScreen {...defaultProps} onUnlock={onUnlock} />)

      const input = screen.getByLabelText('Password')
      await user.type(input, 'correctPassword')

      const unlockButton = screen.getByRole('button', { name: /unlock/i })
      await user.click(unlockButton)

      await waitFor(() => {
        expect(mockUnlock).toHaveBeenCalledWith('correctPassword')
      })
    })

    it('should call onUnlock callback on successful unlock', async () => {
      const user = userEvent.setup()
      const onUnlock = vi.fn()
      mockUnlock.mockResolvedValue({ success: true })

      render(<LockScreen {...defaultProps} onUnlock={onUnlock} />)

      const input = screen.getByLabelText('Password')
      await user.type(input, 'password')

      const unlockButton = screen.getByRole('button', { name: /unlock/i })
      await user.click(unlockButton)

      await waitFor(() => {
        expect(onUnlock).toHaveBeenCalled()
      })
    })

    it('should show error message on wrong password', async () => {
      const user = userEvent.setup()
      mockUnlock.mockResolvedValue({ success: false, error: 'Wrong password. Please try again.' })

      render(<LockScreen {...defaultProps} />)

      const input = screen.getByLabelText('Password')
      await user.type(input, 'wrongPassword')

      const unlockButton = screen.getByRole('button', { name: /unlock/i })
      await user.click(unlockButton)

      expect(await screen.findByText('Wrong password. Please try again.')).toBeInTheDocument()
    })

    it('should show default error message when no error provided', async () => {
      const user = userEvent.setup()
      mockUnlock.mockResolvedValue({ success: false })

      render(<LockScreen {...defaultProps} />)

      const input = screen.getByLabelText('Password')
      await user.type(input, 'password')

      const unlockButton = screen.getByRole('button', { name: /unlock/i })
      await user.click(unlockButton)

      expect(await screen.findByText('Wrong password. Please try again.')).toBeInTheDocument()
    })

    it('should clear password field after failed attempt', async () => {
      const user = userEvent.setup()
      mockUnlock.mockResolvedValue({ success: false, error: 'Wrong password' })

      render(<LockScreen {...defaultProps} />)

      const input = screen.getByLabelText('Password')
      await user.type(input, 'wrongPassword')

      const unlockButton = screen.getByRole('button', { name: /unlock/i })
      await user.click(unlockButton)

      await waitFor(() => {
        expect(screen.getByText('Wrong password')).toBeInTheDocument()
      })

      // Password should be cleared
      expect(input).toHaveValue('')
    })

    it('should handle unlock errors gracefully', async () => {
      const user = userEvent.setup()
      mockUnlock.mockRejectedValue(new Error('Network error'))

      render(<LockScreen {...defaultProps} />)

      const input = screen.getByLabelText('Password')
      await user.type(input, 'password')

      const unlockButton = screen.getByRole('button', { name: /unlock/i })
      await user.click(unlockButton)

      expect(await screen.findByText('Network error')).toBeInTheDocument()
    })

    it('should handle non-Error exceptions', async () => {
      const user = userEvent.setup()
      mockUnlock.mockRejectedValue('String error')

      render(<LockScreen {...defaultProps} />)

      const input = screen.getByLabelText('Password')
      await user.type(input, 'password')

      const unlockButton = screen.getByRole('button', { name: /unlock/i })
      await user.click(unlockButton)

      expect(await screen.findByText('An unexpected error occurred')).toBeInTheDocument()
    })
  })

  describe('loading states', () => {
    it('should show loading spinner during unlock', async () => {
      const user = userEvent.setup()
      mockUnlock.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 100))
      )

      render(<LockScreen {...defaultProps} />)

      const input = screen.getByLabelText('Password')
      await user.type(input, 'password')

      const unlockButton = screen.getByRole('button', { name: /unlock/i })
      await user.click(unlockButton)

      // Should show "Unlocking..." text
      expect(screen.getByText('Unlocking...')).toBeInTheDocument()

      // Wait for completion
      await waitFor(() => {
        expect(screen.queryByText('Unlocking...')).not.toBeInTheDocument()
      })
    })

    it('should disable form during unlock', async () => {
      const user = userEvent.setup()
      mockUnlock.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 100))
      )

      render(<LockScreen {...defaultProps} />)

      const input = screen.getByLabelText('Password')
      await user.type(input, 'password')

      const unlockButton = screen.getByRole('button', { name: /unlock/i })
      await user.click(unlockButton)

      // Input and button should be disabled
      await waitFor(() => {
        expect(input).toBeDisabled()
        expect(unlockButton).toBeDisabled()
      })
    })

    it('should disable form when context isLoading is true', () => {
      mockLockContext.isLoading = true

      render(<LockScreen {...defaultProps} />)

      const input = screen.getByLabelText('Password')
      const unlockButton = screen.getByRole('button', { name: /unlock/i })

      expect(input).toBeDisabled()
      expect(unlockButton).toBeDisabled()
    })
  })

  describe('keyboard interactions', () => {
    it('should submit form on Enter key', async () => {
      const user = userEvent.setup()
      const onUnlock = vi.fn()
      mockUnlock.mockResolvedValue({ success: true })

      render(<LockScreen {...defaultProps} onUnlock={onUnlock} />)

      const input = screen.getByLabelText('Password')
      await user.type(input, 'password{Enter}')

      await waitFor(() => {
        expect(mockUnlock).toHaveBeenCalledWith('password')
        expect(onUnlock).toHaveBeenCalled()
      })
    })
  })
})
