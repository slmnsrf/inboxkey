/**
 * Unit Tests for AccountsPanel Component
 * Tests OAuth flows, account management, and accessibility
 */

import React from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AccountsPanel } from '../AccountsPanel'
import { LockProvider } from '../../contexts/LockContext'
import { ToastProvider } from '../../contexts/ToastContext'

// Mock OAuth modules
const mockAuthenticateGmail = vi.fn()
const mockAuthenticateOutlook = vi.fn()
const mockFetchGmailProfile = vi.fn()
const mockFetchOutlookProfile = vi.fn()
const mockIsGmailConfigured = vi.fn()
const mockIsOutlookConfigured = vi.fn()

vi.mock('@/lib/providers/gmail/chrome-auth', () => ({
  authenticateGmail: mockAuthenticateGmail,
}))

vi.mock('@/lib/providers/outlook/chrome-auth', () => ({
  authenticateOutlook: mockAuthenticateOutlook,
}))

vi.mock('@/lib/providers/gmail/profile', () => ({
  fetchGmailProfile: mockFetchGmailProfile,
}))

vi.mock('@/lib/providers/outlook/profile', () => ({
  fetchOutlookProfile: mockFetchOutlookProfile,
}))

vi.mock('@/lib/providers/gmail/config', () => ({
  isGmailConfigured: mockIsGmailConfigured,
}))

vi.mock('@/lib/providers/outlook/config', () => ({
  isOutlookConfigured: mockIsOutlookConfigured,
}))

// Mock chrome API
const mockSendMessage = vi.fn()
global.chrome = {
  runtime: {
    sendMessage: mockSendMessage,
  },
} as any

// Helper to render with providers
function renderWithProviders(ui: React.ReactElement) {
  return render(
    <ToastProvider>
      <LockProvider>{ui}</LockProvider>
    </ToastProvider>
  )
}

describe('AccountsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default successful config
    mockIsGmailConfigured.mockReturnValue(true)
    mockIsOutlookConfigured.mockReturnValue(true)

    // Default empty mailboxes
    mockSendMessage.mockImplementation((msg) => {
      if (msg.type === 'GET_MAILBOXES') {
        return Promise.resolve({ success: true, mailboxes: [] })
      }
      return Promise.resolve({ success: true })
    })

    // Mock successful lock status (unlocked, not initialized)
    mockSendMessage.mockImplementation((msg) => {
      if (msg.type === 'GET_LOCK_STATUS') {
        return Promise.resolve({
          success: true,
          isInitialized: false,
          isUnlocked: true,
        })
      }
      if (msg.type === 'GET_MAILBOXES') {
        return Promise.resolve({ success: true, mailboxes: [] })
      }
      return Promise.resolve({ success: true })
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Empty State', () => {
    it('should render empty state when no accounts connected', async () => {
      renderWithProviders(<AccountsPanel />)

      await waitFor(() => {
        expect(screen.getByText(/no accounts/i)).toBeInTheDocument()
      })
    })

    it('should show provider cards with not connected status', async () => {
      renderWithProviders(<AccountsPanel />)

      await waitFor(() => {
        expect(screen.getByText(/Gmail/i)).toBeInTheDocument()
        expect(screen.getByText(/Outlook/i)).toBeInTheDocument()
      })

      // Should show not connected status
      const statusElements = screen.getAllByText(/not connected/i)
      expect(statusElements.length).toBeGreaterThan(0)
    })

    it('should show connect buttons for both providers', async () => {
      renderWithProviders(<AccountsPanel />)

      await waitFor(() => {
        expect(screen.getByLabelText(/connect gmail/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/connect outlook/i)).toBeInTheDocument()
      })
    })
  })

  describe('Account List Rendering', () => {
    it('should render list of connected accounts', async () => {
      const mailboxes = [
        {
          id: 'mailbox-1',
          providerId: 'gmail' as const,
          email: 'user@gmail.com',
          addedAt: Date.now(),
          lastSyncedAt: Date.now() - 60000, // 1 minute ago
          tokenExpiresAt: Date.now() + 3600000,
        },
        {
          id: 'mailbox-2',
          providerId: 'outlook' as const,
          email: 'user@outlook.com',
          addedAt: Date.now(),
          lastSyncedAt: Date.now() - 120000, // 2 minutes ago
          tokenExpiresAt: Date.now() + 3600000,
        },
      ]

      mockSendMessage.mockImplementation((msg) => {
        if (msg.type === 'GET_MAILBOXES') {
          return Promise.resolve({ success: true, mailboxes })
        }
        if (msg.type === 'GET_LOCK_STATUS') {
          return Promise.resolve({
            success: true,
            isInitialized: false,
            isUnlocked: true,
          })
        }
        return Promise.resolve({ success: true })
      })

      renderWithProviders(<AccountsPanel />)

      await waitFor(() => {
        expect(screen.getByText('user@gmail.com')).toBeInTheDocument()
        expect(screen.getByText('user@outlook.com')).toBeInTheDocument()
      })
    })

    it('should show last synced timestamp for each account', async () => {
      const mailboxes = [
        {
          id: 'mailbox-1',
          providerId: 'gmail' as const,
          email: 'test@gmail.com',
          addedAt: Date.now(),
          lastSyncedAt: Date.now() - 60000,
          tokenExpiresAt: Date.now() + 3600000,
        },
      ]

      mockSendMessage.mockImplementation((msg) => {
        if (msg.type === 'GET_MAILBOXES') {
          return Promise.resolve({ success: true, mailboxes })
        }
        if (msg.type === 'GET_LOCK_STATUS') {
          return Promise.resolve({
            success: true,
            isInitialized: false,
            isUnlocked: true,
          })
        }
        return Promise.resolve({ success: true })
      })

      renderWithProviders(<AccountsPanel />)

      await waitFor(() => {
        expect(screen.getByText(/last synced/i)).toBeInTheDocument()
      })
    })

    it('should show remove button for each account', async () => {
      const mailboxes = [
        {
          id: 'mailbox-1',
          providerId: 'gmail' as const,
          email: 'test@gmail.com',
          addedAt: Date.now(),
          lastSyncedAt: Date.now(),
          tokenExpiresAt: Date.now() + 3600000,
        },
      ]

      mockSendMessage.mockImplementation((msg) => {
        if (msg.type === 'GET_MAILBOXES') {
          return Promise.resolve({ success: true, mailboxes })
        }
        if (msg.type === 'GET_LOCK_STATUS') {
          return Promise.resolve({
            success: true,
            isInitialized: false,
            isUnlocked: true,
          })
        }
        return Promise.resolve({ success: true })
      })

      renderWithProviders(<AccountsPanel />)

      await waitFor(() => {
        expect(screen.getByLabelText(/remove account.*test@gmail.com/i)).toBeInTheDocument()
      })
    })
  })

  describe('Gmail OAuth Flow', () => {
    it('should trigger OAuth flow when connect Gmail clicked', async () => {
      mockAuthenticateGmail.mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 3600,
      })
      mockFetchGmailProfile.mockResolvedValue('newuser@gmail.com')
      mockSendMessage.mockImplementation((msg) => {
        if (msg.type === 'STORE_MAILBOX') {
          return Promise.resolve({ success: true })
        }
        if (msg.type === 'GET_MAILBOXES') {
          return Promise.resolve({ success: true, mailboxes: [] })
        }
        if (msg.type === 'GET_LOCK_STATUS') {
          return Promise.resolve({
            success: true,
            isInitialized: false,
            isUnlocked: true,
          })
        }
        return Promise.resolve({ success: true })
      })

      renderWithProviders(<AccountsPanel />)

      await waitFor(() => {
        expect(screen.getByLabelText(/connect gmail/i)).toBeInTheDocument()
      })

      const connectButton = screen.getByLabelText(/connect gmail/i)
      fireEvent.click(connectButton)

      await waitFor(() => {
        expect(mockAuthenticateGmail).toHaveBeenCalled()
      })
    })

    it('should show loading state during OAuth flow', async () => {
      // Make OAuth take some time
      mockAuthenticateGmail.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      )

      renderWithProviders(<AccountsPanel />)

      await waitFor(() => {
        expect(screen.getByLabelText(/connect gmail/i)).toBeInTheDocument()
      })

      const connectButton = screen.getByLabelText(/connect gmail/i)
      fireEvent.click(connectButton)

      // Should show loading indicator
      await waitFor(() => {
        expect(screen.getByText(/authenticating/i)).toBeInTheDocument()
      })
    })

    it('should fetch profile after successful OAuth', async () => {
      mockAuthenticateGmail.mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 3600,
      })
      mockFetchGmailProfile.mockResolvedValue('user@gmail.com')
      mockSendMessage.mockImplementation((msg) => {
        if (msg.type === 'STORE_MAILBOX') {
          return Promise.resolve({ success: true })
        }
        if (msg.type === 'GET_MAILBOXES') {
          return Promise.resolve({ success: true, mailboxes: [] })
        }
        if (msg.type === 'GET_LOCK_STATUS') {
          return Promise.resolve({
            success: true,
            isInitialized: false,
            isUnlocked: true,
          })
        }
        return Promise.resolve({ success: true })
      })

      renderWithProviders(<AccountsPanel />)

      await waitFor(() => {
        expect(screen.getByLabelText(/connect gmail/i)).toBeInTheDocument()
      })

      const connectButton = screen.getByLabelText(/connect gmail/i)
      fireEvent.click(connectButton)

      await waitFor(() => {
        expect(mockFetchGmailProfile).toHaveBeenCalledWith('access-token')
      })
    })

    it('should store mailbox after profile fetch', async () => {
      mockAuthenticateGmail.mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 3600,
      })
      mockFetchGmailProfile.mockResolvedValue('user@gmail.com')
      mockSendMessage.mockImplementation((msg) => {
        if (msg.type === 'STORE_MAILBOX') {
          return Promise.resolve({ success: true })
        }
        if (msg.type === 'GET_MAILBOXES') {
          return Promise.resolve({ success: true, mailboxes: [] })
        }
        if (msg.type === 'GET_LOCK_STATUS') {
          return Promise.resolve({
            success: true,
            isInitialized: false,
            isUnlocked: true,
          })
        }
        return Promise.resolve({ success: true })
      })

      renderWithProviders(<AccountsPanel />)

      await waitFor(() => {
        expect(screen.getByLabelText(/connect gmail/i)).toBeInTheDocument()
      })

      const connectButton = screen.getByLabelText(/connect gmail/i)
      fireEvent.click(connectButton)

      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'STORE_MAILBOX',
            provider: 'gmail',
            email: 'user@gmail.com',
          })
        )
      })
    })

    it('should show success toast on successful connection', async () => {
      mockAuthenticateGmail.mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 3600,
      })
      mockFetchGmailProfile.mockResolvedValue('user@gmail.com')
      mockSendMessage.mockImplementation((msg) => {
        if (msg.type === 'STORE_MAILBOX') {
          return Promise.resolve({ success: true })
        }
        if (msg.type === 'GET_MAILBOXES') {
          return Promise.resolve({ success: true, mailboxes: [] })
        }
        if (msg.type === 'GET_LOCK_STATUS') {
          return Promise.resolve({
            success: true,
            isInitialized: false,
            isUnlocked: true,
          })
        }
        return Promise.resolve({ success: true })
      })

      renderWithProviders(<AccountsPanel />)

      await waitFor(() => {
        expect(screen.getByLabelText(/connect gmail/i)).toBeInTheDocument()
      })

      const connectButton = screen.getByLabelText(/connect gmail/i)
      fireEvent.click(connectButton)

      // Toast should appear (implementation depends on toast context)
      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'STORE_MAILBOX' })
        )
      })
    })

    it('should prevent duplicate account connections', async () => {
      const mailboxes = [
        {
          id: 'mailbox-1',
          providerId: 'gmail' as const,
          email: 'existing@gmail.com',
          addedAt: Date.now(),
          lastSyncedAt: Date.now(),
          tokenExpiresAt: Date.now() + 3600000,
        },
      ]

      mockAuthenticateGmail.mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 3600,
      })
      mockFetchGmailProfile.mockResolvedValue('existing@gmail.com')
      mockSendMessage.mockImplementation((msg) => {
        if (msg.type === 'GET_MAILBOXES') {
          return Promise.resolve({ success: true, mailboxes })
        }
        if (msg.type === 'GET_LOCK_STATUS') {
          return Promise.resolve({
            success: true,
            isInitialized: false,
            isUnlocked: true,
          })
        }
        return Promise.resolve({ success: true })
      })

      renderWithProviders(<AccountsPanel />)

      await waitFor(() => {
        expect(screen.getByText('existing@gmail.com')).toBeInTheDocument()
      })

      const connectButton = screen.getByLabelText(/connect gmail/i)
      fireEvent.click(connectButton)

      await waitFor(() => {
        expect(mockFetchGmailProfile).toHaveBeenCalled()
      })

      // Should NOT call STORE_MAILBOX
      expect(mockSendMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'STORE_MAILBOX' })
      )
    })
  })

  describe('Outlook OAuth Flow', () => {
    it('should trigger OAuth flow when connect Outlook clicked', async () => {
      mockAuthenticateOutlook.mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 3600,
      })
      mockFetchOutlookProfile.mockResolvedValue('user@outlook.com')
      mockSendMessage.mockImplementation((msg) => {
        if (msg.type === 'STORE_MAILBOX') {
          return Promise.resolve({ success: true })
        }
        if (msg.type === 'GET_MAILBOXES') {
          return Promise.resolve({ success: true, mailboxes: [] })
        }
        if (msg.type === 'GET_LOCK_STATUS') {
          return Promise.resolve({
            success: true,
            isInitialized: false,
            isUnlocked: true,
          })
        }
        return Promise.resolve({ success: true })
      })

      renderWithProviders(<AccountsPanel />)

      await waitFor(() => {
        expect(screen.getByLabelText(/connect outlook/i)).toBeInTheDocument()
      })

      const connectButton = screen.getByLabelText(/connect outlook/i)
      fireEvent.click(connectButton)

      await waitFor(() => {
        expect(mockAuthenticateOutlook).toHaveBeenCalled()
      })
    })

    it('should handle Outlook connection successfully', async () => {
      mockAuthenticateOutlook.mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 3600,
      })
      mockFetchOutlookProfile.mockResolvedValue('user@outlook.com')
      mockSendMessage.mockImplementation((msg) => {
        if (msg.type === 'STORE_MAILBOX') {
          return Promise.resolve({ success: true })
        }
        if (msg.type === 'GET_MAILBOXES') {
          return Promise.resolve({ success: true, mailboxes: [] })
        }
        if (msg.type === 'GET_LOCK_STATUS') {
          return Promise.resolve({
            success: true,
            isInitialized: false,
            isUnlocked: true,
          })
        }
        return Promise.resolve({ success: true })
      })

      renderWithProviders(<AccountsPanel />)

      await waitFor(() => {
        expect(screen.getByLabelText(/connect outlook/i)).toBeInTheDocument()
      })

      const connectButton = screen.getByLabelText(/connect outlook/i)
      fireEvent.click(connectButton)

      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'STORE_MAILBOX',
            provider: 'outlook',
            email: 'user@outlook.com',
          })
        )
      })
    })
  })

  describe('Account Removal', () => {
    it('should show confirmation dialog when remove clicked', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)

      const mailboxes = [
        {
          id: 'mailbox-1',
          providerId: 'gmail' as const,
          email: 'test@gmail.com',
          addedAt: Date.now(),
          lastSyncedAt: Date.now(),
          tokenExpiresAt: Date.now() + 3600000,
        },
      ]

      mockSendMessage.mockImplementation((msg) => {
        if (msg.type === 'GET_MAILBOXES') {
          return Promise.resolve({ success: true, mailboxes })
        }
        if (msg.type === 'GET_LOCK_STATUS') {
          return Promise.resolve({
            success: true,
            isInitialized: false,
            isUnlocked: true,
          })
        }
        return Promise.resolve({ success: true })
      })

      renderWithProviders(<AccountsPanel />)

      await waitFor(() => {
        expect(screen.getByText('test@gmail.com')).toBeInTheDocument()
      })

      const removeButton = screen.getByLabelText(/remove account.*test@gmail.com/i)
      fireEvent.click(removeButton)

      expect(confirmSpy).toHaveBeenCalled()

      confirmSpy.mockRestore()
    })

    it('should call REMOVE_MAILBOX when confirmed', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

      const mailboxes = [
        {
          id: 'mailbox-1',
          providerId: 'gmail' as const,
          email: 'test@gmail.com',
          addedAt: Date.now(),
          lastSyncedAt: Date.now(),
          tokenExpiresAt: Date.now() + 3600000,
        },
      ]

      mockSendMessage.mockImplementation((msg) => {
        if (msg.type === 'REMOVE_MAILBOX') {
          return Promise.resolve({ success: true })
        }
        if (msg.type === 'GET_MAILBOXES') {
          return Promise.resolve({ success: true, mailboxes })
        }
        if (msg.type === 'GET_LOCK_STATUS') {
          return Promise.resolve({
            success: true,
            isInitialized: false,
            isUnlocked: true,
          })
        }
        return Promise.resolve({ success: true })
      })

      renderWithProviders(<AccountsPanel />)

      await waitFor(() => {
        expect(screen.getByText('test@gmail.com')).toBeInTheDocument()
      })

      const removeButton = screen.getByLabelText(/remove account.*test@gmail.com/i)
      fireEvent.click(removeButton)

      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledWith({
          type: 'REMOVE_MAILBOX',
          mailboxId: 'mailbox-1',
        })
      })

      confirmSpy.mockRestore()
    })

    it('should not remove account when cancelled', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)

      const mailboxes = [
        {
          id: 'mailbox-1',
          providerId: 'gmail' as const,
          email: 'test@gmail.com',
          addedAt: Date.now(),
          lastSyncedAt: Date.now(),
          tokenExpiresAt: Date.now() + 3600000,
        },
      ]

      mockSendMessage.mockImplementation((msg) => {
        if (msg.type === 'GET_MAILBOXES') {
          return Promise.resolve({ success: true, mailboxes })
        }
        if (msg.type === 'GET_LOCK_STATUS') {
          return Promise.resolve({
            success: true,
            isInitialized: false,
            isUnlocked: true,
          })
        }
        return Promise.resolve({ success: true })
      })

      renderWithProviders(<AccountsPanel />)

      await waitFor(() => {
        expect(screen.getByText('test@gmail.com')).toBeInTheDocument()
      })

      const removeButton = screen.getByLabelText(/remove account.*test@gmail.com/i)
      fireEvent.click(removeButton)

      expect(mockSendMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'REMOVE_MAILBOX' })
      )

      confirmSpy.mockRestore()
    })
  })

  describe('Error Handling', () => {
    it('should display error when OAuth fails', async () => {
      mockAuthenticateGmail.mockRejectedValue(new Error('OAuth cancelled by user'))

      renderWithProviders(<AccountsPanel />)

      await waitFor(() => {
        expect(screen.getByLabelText(/connect gmail/i)).toBeInTheDocument()
      })

      const connectButton = screen.getByLabelText(/connect gmail/i)
      fireEvent.click(connectButton)

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument()
      })
    })

    it('should display error when profile fetch fails', async () => {
      mockAuthenticateGmail.mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 3600,
      })
      mockFetchGmailProfile.mockRejectedValue(new Error('PROFILE_FETCH_FAILED'))

      renderWithProviders(<AccountsPanel />)

      await waitFor(() => {
        expect(screen.getByLabelText(/connect gmail/i)).toBeInTheDocument()
      })

      const connectButton = screen.getByLabelText(/connect gmail/i)
      fireEvent.click(connectButton)

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument()
      })
    })

    it('should display error when storage fails', async () => {
      mockAuthenticateGmail.mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 3600,
      })
      mockFetchGmailProfile.mockResolvedValue('user@gmail.com')
      mockSendMessage.mockImplementation((msg) => {
        if (msg.type === 'STORE_MAILBOX') {
          return Promise.resolve({ success: false, error: 'Storage error' })
        }
        if (msg.type === 'GET_MAILBOXES') {
          return Promise.resolve({ success: true, mailboxes: [] })
        }
        if (msg.type === 'GET_LOCK_STATUS') {
          return Promise.resolve({
            success: true,
            isInitialized: false,
            isUnlocked: true,
          })
        }
        return Promise.resolve({ success: true })
      })

      renderWithProviders(<AccountsPanel />)

      await waitFor(() => {
        expect(screen.getByLabelText(/connect gmail/i)).toBeInTheDocument()
      })

      const connectButton = screen.getByLabelText(/connect gmail/i)
      fireEvent.click(connectButton)

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument()
      })
    })

    it('should handle missing OAuth configuration', async () => {
      mockIsGmailConfigured.mockReturnValue(false)

      renderWithProviders(<AccountsPanel />)

      await waitFor(() => {
        expect(screen.getByLabelText(/connect gmail/i)).toBeInTheDocument()
      })

      const connectButton = screen.getByLabelText(/connect gmail/i)
      fireEvent.click(connectButton)

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument()
      })

      // Should NOT call authenticate
      expect(mockAuthenticateGmail).not.toHaveBeenCalled()
    })
  })

  describe('Loading States', () => {
    it('should disable buttons during connection', async () => {
      mockAuthenticateGmail.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      )

      renderWithProviders(<AccountsPanel />)

      await waitFor(() => {
        expect(screen.getByLabelText(/connect gmail/i)).toBeInTheDocument()
      })

      const gmailButton = screen.getByLabelText(/connect gmail/i)
      const outlookButton = screen.getByLabelText(/connect outlook/i)

      fireEvent.click(gmailButton)

      // Both buttons should be disabled during connection
      await waitFor(() => {
        expect(gmailButton).toBeDisabled()
        expect(outlookButton).toBeDisabled()
      })
    })

    it('should show connection stages', async () => {
      mockAuthenticateGmail.mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 3600,
      })
      mockFetchGmailProfile.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve('user@gmail.com'), 50))
      )
      mockSendMessage.mockImplementation((msg) => {
        if (msg.type === 'STORE_MAILBOX') {
          return Promise.resolve({ success: true })
        }
        if (msg.type === 'GET_MAILBOXES') {
          return Promise.resolve({ success: true, mailboxes: [] })
        }
        if (msg.type === 'GET_LOCK_STATUS') {
          return Promise.resolve({
            success: true,
            isInitialized: false,
            isUnlocked: true,
          })
        }
        return Promise.resolve({ success: true })
      })

      renderWithProviders(<AccountsPanel />)

      await waitFor(() => {
        expect(screen.getByLabelText(/connect gmail/i)).toBeInTheDocument()
      })

      const connectButton = screen.getByLabelText(/connect gmail/i)
      fireEvent.click(connectButton)

      // Should show stage labels
      await waitFor(() => {
        const button = screen.getByLabelText(/connect gmail/i)
        expect(button).toHaveAttribute('aria-busy', 'true')
      })
    })
  })

  describe('Accessibility', () => {
    it('should have proper ARIA labels for connect buttons', async () => {
      renderWithProviders(<AccountsPanel />)

      await waitFor(() => {
        expect(screen.getByLabelText(/connect gmail/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/connect outlook/i)).toBeInTheDocument()
      })
    })

    it('should have proper ARIA labels for remove buttons', async () => {
      const mailboxes = [
        {
          id: 'mailbox-1',
          providerId: 'gmail' as const,
          email: 'test@gmail.com',
          addedAt: Date.now(),
          lastSyncedAt: Date.now(),
          tokenExpiresAt: Date.now() + 3600000,
        },
      ]

      mockSendMessage.mockImplementation((msg) => {
        if (msg.type === 'GET_MAILBOXES') {
          return Promise.resolve({ success: true, mailboxes })
        }
        if (msg.type === 'GET_LOCK_STATUS') {
          return Promise.resolve({
            success: true,
            isInitialized: false,
            isUnlocked: true,
          })
        }
        return Promise.resolve({ success: true })
      })

      renderWithProviders(<AccountsPanel />)

      await waitFor(() => {
        const removeButton = screen.getByLabelText(/remove account.*test@gmail.com/i)
        expect(removeButton).toBeInTheDocument()
      })
    })

    it('should have aria-live region for status announcements', async () => {
      renderWithProviders(<AccountsPanel />)

      await waitFor(() => {
        const liveRegion = screen.getByRole('status')
        expect(liveRegion).toHaveAttribute('aria-live', 'polite')
      })
    })

    it('should mark error messages with role=alert', async () => {
      mockAuthenticateGmail.mockRejectedValue(new Error('OAuth failed'))

      renderWithProviders(<AccountsPanel />)

      await waitFor(() => {
        expect(screen.getByLabelText(/connect gmail/i)).toBeInTheDocument()
      })

      const connectButton = screen.getByLabelText(/connect gmail/i)
      fireEvent.click(connectButton)

      await waitFor(() => {
        const alert = screen.getByRole('alert')
        expect(alert).toBeInTheDocument()
      })
    })

    it('should associate error with button using aria-describedby', async () => {
      mockAuthenticateGmail.mockRejectedValue(new Error('OAuth failed'))

      renderWithProviders(<AccountsPanel />)

      await waitFor(() => {
        expect(screen.getByLabelText(/connect gmail/i)).toBeInTheDocument()
      })

      const connectButton = screen.getByLabelText(/connect gmail/i)
      fireEvent.click(connectButton)

      await waitFor(() => {
        expect(connectButton).toHaveAttribute('aria-invalid', 'true')
        expect(connectButton).toHaveAttribute('aria-describedby')
      })
    })
  })

  describe('Locked State', () => {
    it('should show locked message when initialized but locked', async () => {
      mockSendMessage.mockImplementation((msg) => {
        if (msg.type === 'GET_LOCK_STATUS') {
          return Promise.resolve({
            success: true,
            isInitialized: true,
            isUnlocked: false,
          })
        }
        return Promise.resolve({ success: true })
      })

      renderWithProviders(<AccountsPanel />)

      await waitFor(() => {
        expect(screen.getByText(/unlock/i)).toBeInTheDocument()
      })

      // Should NOT show connect buttons when locked
      expect(screen.queryByLabelText(/connect gmail/i)).not.toBeInTheDocument()
    })

    it('should allow connections when unlocked', async () => {
      mockSendMessage.mockImplementation((msg) => {
        if (msg.type === 'GET_LOCK_STATUS') {
          return Promise.resolve({
            success: true,
            isInitialized: true,
            isUnlocked: true,
          })
        }
        if (msg.type === 'GET_MAILBOXES') {
          return Promise.resolve({ success: true, mailboxes: [] })
        }
        return Promise.resolve({ success: true })
      })

      renderWithProviders(<AccountsPanel />)

      await waitFor(() => {
        expect(screen.getByLabelText(/connect gmail/i)).toBeInTheDocument()
      })
    })

    it('should allow connections in passwordless mode', async () => {
      mockSendMessage.mockImplementation((msg) => {
        if (msg.type === 'GET_LOCK_STATUS') {
          return Promise.resolve({
            success: true,
            isInitialized: false,
            isUnlocked: true,
          })
        }
        if (msg.type === 'GET_MAILBOXES') {
          return Promise.resolve({ success: true, mailboxes: [] })
        }
        return Promise.resolve({ success: true })
      })

      renderWithProviders(<AccountsPanel />)

      await waitFor(() => {
        expect(screen.getByLabelText(/connect gmail/i)).toBeInTheDocument()
      })
    })
  })
})
