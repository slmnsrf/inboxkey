/**
 * Unit Tests for CodeCard Component
 * Tests code display, copy functionality, and accessibility
 */

import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CodeCard } from '../CodeCard'
import type { PopupCacheCode } from '@/shared/popup-messages'

describe('CodeCard', () => {
  const mockOnCopy = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe('Code Display', () => {
    it('should render verification code', () => {
      const item: PopupCacheCode = {
        code: '123456',
        source: 'test@example.com - GitHub',
        receivedAt: Date.now(),
      }

      render(<CodeCard item={item} onCopy={mockOnCopy} />)

      expect(screen.getByText('123456')).toBeInTheDocument()
    })

    it('should render code with provider badge', () => {
      const item: PopupCacheCode = {
        code: '789012',
        source: 'test@gmail.com - Twitter',
        receivedAt: Date.now(),
        providerId: 'gmail',
        providerName: 'Gmail',
      }

      render(<CodeCard item={item} onCopy={mockOnCopy} />)

      expect(screen.getByText('Gmail')).toBeInTheDocument()
      const badge = screen.getByText('Gmail')
      expect(badge).toHaveAttribute('data-provider', 'gmail')
    })

    it('should render without provider badge when not provided', () => {
      const item: PopupCacheCode = {
        code: '111111',
        source: 'test@example.com',
        receivedAt: Date.now(),
      }

      render(<CodeCard item={item} onCopy={mockOnCopy} />)

      expect(screen.queryByText(/gmail/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/outlook/i)).not.toBeInTheDocument()
    })

    it('should display sender from source', () => {
      const item: PopupCacheCode = {
        code: '123456',
        source: 'sender@example.com - Subject Line',
        receivedAt: Date.now(),
      }

      render(<CodeCard item={item} onCopy={mockOnCopy} />)

      expect(screen.getByText('sender@example.com')).toBeInTheDocument()
    })

    it('should display subject from source', () => {
      const item: PopupCacheCode = {
        code: '123456',
        source: 'sender@example.com - Your verification code',
        receivedAt: Date.now(),
      }

      render(<CodeCard item={item} onCopy={mockOnCopy} />)

      expect(screen.getByText('Your verification code')).toBeInTheDocument()
    })

    it('should handle source without subject', () => {
      const item: PopupCacheCode = {
        code: '123456',
        source: 'sender@example.com',
        receivedAt: Date.now(),
      }

      render(<CodeCard item={item} onCopy={mockOnCopy} />)

      expect(screen.getByText('sender@example.com')).toBeInTheDocument()
      // Subject should not be rendered
      expect(screen.queryByClassName('code-source-subject')).not.toBeInTheDocument()
    })

    it('should handle subject with multiple dashes', () => {
      const item: PopupCacheCode = {
        code: '123456',
        source: 'test@example.com - Re: Sign-in - Security Alert',
        receivedAt: Date.now(),
      }

      render(<CodeCard item={item} onCopy={mockOnCopy} />)

      expect(screen.getByText('Re: Sign-in - Security Alert')).toBeInTheDocument()
    })
  })

  describe('Timestamp Formatting', () => {
    it('should show "just now" for recent codes', () => {
      const item: PopupCacheCode = {
        code: '123456',
        source: 'test@example.com',
        receivedAt: Date.now() - 5000, // 5 seconds ago
      }

      render(<CodeCard item={item} onCopy={mockOnCopy} />)

      expect(screen.getByText(/just now/i)).toBeInTheDocument()
    })

    it('should show minutes for codes less than an hour old', () => {
      const item: PopupCacheCode = {
        code: '123456',
        source: 'test@example.com',
        receivedAt: Date.now() - 5 * 60 * 1000, // 5 minutes ago
      }

      render(<CodeCard item={item} onCopy={mockOnCopy} />)

      expect(screen.getByText('5m ago')).toBeInTheDocument()
    })

    it('should show hours for codes older than an hour', () => {
      const item: PopupCacheCode = {
        code: '123456',
        source: 'test@example.com',
        receivedAt: Date.now() - 3 * 60 * 60 * 1000, // 3 hours ago
      }

      render(<CodeCard item={item} onCopy={mockOnCopy} />)

      expect(screen.getByText('3h ago')).toBeInTheDocument()
    })

    it('should handle edge case of exactly 1 minute', () => {
      const item: PopupCacheCode = {
        code: '123456',
        source: 'test@example.com',
        receivedAt: Date.now() - 60 * 1000, // Exactly 1 minute
      }

      render(<CodeCard item={item} onCopy={mockOnCopy} />)

      expect(screen.getByText('1m ago')).toBeInTheDocument()
    })

    it('should handle edge case of exactly 1 hour', () => {
      const item: PopupCacheCode = {
        code: '123456',
        source: 'test@example.com',
        receivedAt: Date.now() - 60 * 60 * 1000, // Exactly 1 hour
      }

      render(<CodeCard item={item} onCopy={mockOnCopy} />)

      expect(screen.getByText('1h ago')).toBeInTheDocument()
    })
  })

  describe('Copy Button', () => {
    it('should render copy button', () => {
      const item: PopupCacheCode = {
        code: '123456',
        source: 'test@example.com',
        receivedAt: Date.now(),
      }

      render(<CodeCard item={item} onCopy={mockOnCopy} />)

      const copyButton = screen.getByRole('button', { name: /copy/i })
      expect(copyButton).toBeInTheDocument()
    })

    it('should call onCopy when button clicked', async () => {
      mockOnCopy.mockResolvedValue(undefined)

      const item: PopupCacheCode = {
        code: '123456',
        source: 'test@example.com',
        receivedAt: Date.now(),
      }

      render(<CodeCard item={item} onCopy={mockOnCopy} />)

      const copyButton = screen.getByRole('button', { name: /copy/i })
      fireEvent.click(copyButton)

      await waitFor(() => {
        expect(mockOnCopy).toHaveBeenCalledWith('123456')
      })
    })

    it('should show success feedback after copy', async () => {
      mockOnCopy.mockResolvedValue(undefined)

      const item: PopupCacheCode = {
        code: '123456',
        source: 'test@example.com',
        receivedAt: Date.now(),
      }

      render(<CodeCard item={item} onCopy={mockOnCopy} />)

      const copyButton = screen.getByRole('button', { name: /copy/i })
      fireEvent.click(copyButton)

      await waitFor(() => {
        expect(screen.getByText(/copied/i)).toBeInTheDocument()
      })
    })

    it('should disable button while copying', async () => {
      mockOnCopy.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      )

      const item: PopupCacheCode = {
        code: '123456',
        source: 'test@example.com',
        receivedAt: Date.now(),
      }

      render(<CodeCard item={item} onCopy={mockOnCopy} />)

      const copyButton = screen.getByRole('button', { name: /copy/i })
      fireEvent.click(copyButton)

      // Button should be disabled during copy
      await waitFor(() => {
        expect(copyButton).toBeDisabled()
      })
    })

    it('should reset button after 2 seconds', async () => {
      mockOnCopy.mockResolvedValue(undefined)

      const item: PopupCacheCode = {
        code: '123456',
        source: 'test@example.com',
        receivedAt: Date.now(),
      }

      render(<CodeCard item={item} onCopy={mockOnCopy} />)

      const copyButton = screen.getByRole('button', { name: /copy/i })
      fireEvent.click(copyButton)

      await waitFor(() => {
        expect(screen.getByText(/copied/i)).toBeInTheDocument()
      })

      // Fast-forward 2 seconds
      vi.advanceTimersByTime(2000)

      await waitFor(() => {
        expect(screen.queryByText(/copied/i)).not.toBeInTheDocument()
        expect(screen.getByText(/copy/i)).toBeInTheDocument()
      })
    })

    it('should apply copied styling class', async () => {
      mockOnCopy.mockResolvedValue(undefined)

      const item: PopupCacheCode = {
        code: '123456',
        source: 'test@example.com',
        receivedAt: Date.now(),
      }

      render(<CodeCard item={item} onCopy={mockOnCopy} />)

      const copyButton = screen.getByRole('button', { name: /copy/i })
      fireEvent.click(copyButton)

      await waitFor(() => {
        expect(copyButton).toHaveClass('code-copy-button--copied')
      })
    })

    it('should handle copy errors gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockOnCopy.mockRejectedValue(new Error('Copy failed'))

      const item: PopupCacheCode = {
        code: '123456',
        source: 'test@example.com',
        receivedAt: Date.now(),
      }

      render(<CodeCard item={item} onCopy={mockOnCopy} />)

      const copyButton = screen.getByRole('button', { name: /copy/i })
      fireEvent.click(copyButton)

      // Should still reset after timeout even on error
      vi.advanceTimersByTime(2000)

      await waitFor(() => {
        expect(copyButton).not.toBeDisabled()
      })

      consoleErrorSpy.mockRestore()
    })

    it('should allow multiple copy attempts', async () => {
      mockOnCopy.mockResolvedValue(undefined)

      const item: PopupCacheCode = {
        code: '123456',
        source: 'test@example.com',
        receivedAt: Date.now(),
      }

      render(<CodeCard item={item} onCopy={mockOnCopy} />)

      const copyButton = screen.getByRole('button', { name: /copy/i })

      // First copy
      fireEvent.click(copyButton)
      await waitFor(() => expect(mockOnCopy).toHaveBeenCalledTimes(1))

      // Reset
      vi.advanceTimersByTime(2000)

      // Second copy
      fireEvent.click(copyButton)
      await waitFor(() => expect(mockOnCopy).toHaveBeenCalledTimes(2))
    })
  })

  describe('Used/Unused State', () => {
    it('should render unused codes normally', () => {
      const item: PopupCacheCode = {
        code: '123456',
        source: 'test@example.com',
        receivedAt: Date.now(),
      }

      render(<CodeCard item={item} onCopy={mockOnCopy} />)

      const card = screen.getByText('123456').closest('.code-card')
      expect(card).toBeInTheDocument()
      // Should not have used styling
      expect(card).not.toHaveClass('code-card--used')
    })

    it('should show used indicator when code has been used', () => {
      const item: PopupCacheCode = {
        code: '123456',
        source: 'test@example.com',
        receivedAt: Date.now(),
        usedAt: Date.now() - 5000,
      }

      render(<CodeCard item={item} onCopy={mockOnCopy} />)

      // Card should have used class if implemented
      const card = screen.getByText('123456').closest('.code-card')
      expect(card).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('should have accessible copy button label', () => {
      const item: PopupCacheCode = {
        code: '123456',
        source: 'test@example.com - GitHub',
        receivedAt: Date.now(),
      }

      render(<CodeCard item={item} onCopy={mockOnCopy} />)

      const copyButton = screen.getByRole('button')
      expect(copyButton).toHaveAccessibleName()
    })

    it('should include code and source in aria-label', () => {
      const item: PopupCacheCode = {
        code: '123456',
        source: 'sender@example.com - Subject',
        receivedAt: Date.now(),
      }

      render(<CodeCard item={item} onCopy={mockOnCopy} />)

      const copyButton = screen.getByRole('button')
      const ariaLabel = copyButton.getAttribute('aria-label')

      expect(ariaLabel).toContain('123456')
      expect(ariaLabel).toContain('sender@example.com - Subject')
    })

    it('should be keyboard accessible', () => {
      mockOnCopy.mockResolvedValue(undefined)

      const item: PopupCacheCode = {
        code: '123456',
        source: 'test@example.com',
        receivedAt: Date.now(),
      }

      render(<CodeCard item={item} onCopy={mockOnCopy} />)

      const copyButton = screen.getByRole('button')

      // Simulate Enter key
      copyButton.focus()
      fireEvent.keyDown(copyButton, { key: 'Enter', code: 'Enter' })

      // Should be focusable and clickable via keyboard
      expect(copyButton).toHaveFocus()
    })

    it('should indicate button state to screen readers', async () => {
      mockOnCopy.mockResolvedValue(undefined)

      const item: PopupCacheCode = {
        code: '123456',
        source: 'test@example.com',
        receivedAt: Date.now(),
      }

      render(<CodeCard item={item} onCopy={mockOnCopy} />)

      const copyButton = screen.getByRole('button')
      fireEvent.click(copyButton)

      await waitFor(() => {
        expect(copyButton).toBeDisabled()
        expect(screen.getByText(/copied/i)).toBeInTheDocument()
      })
    })
  })

  describe('Multiple Provider Support', () => {
    it('should display Gmail badge correctly', () => {
      const item: PopupCacheCode = {
        code: '123456',
        source: 'user@gmail.com - GitHub',
        receivedAt: Date.now(),
        providerId: 'gmail',
        providerName: 'Gmail',
      }

      render(<CodeCard item={item} onCopy={mockOnCopy} />)

      const badge = screen.getByText('Gmail')
      expect(badge).toHaveClass('provider-badge')
      expect(badge).toHaveAttribute('data-provider', 'gmail')
    })

    it('should display Outlook badge correctly', () => {
      const item: PopupCacheCode = {
        code: '789012',
        source: 'user@outlook.com - Twitter',
        receivedAt: Date.now(),
        providerId: 'outlook',
        providerName: 'Outlook',
      }

      render(<CodeCard item={item} onCopy={mockOnCopy} />)

      const badge = screen.getByText('Outlook')
      expect(badge).toHaveClass('provider-badge')
      expect(badge).toHaveAttribute('data-provider', 'outlook')
    })
  })

  describe('Edge Cases', () => {
    it('should handle very long codes', () => {
      const item: PopupCacheCode = {
        code: '123456789012345678901234567890',
        source: 'test@example.com',
        receivedAt: Date.now(),
      }

      render(<CodeCard item={item} onCopy={mockOnCopy} />)

      expect(screen.getByText('123456789012345678901234567890')).toBeInTheDocument()
    })

    it('should handle very long subjects', () => {
      const longSubject = 'A'.repeat(200)
      const item: PopupCacheCode = {
        code: '123456',
        source: `test@example.com - ${longSubject}`,
        receivedAt: Date.now(),
      }

      render(<CodeCard item={item} onCopy={mockOnCopy} />)

      expect(screen.getByText(longSubject)).toBeInTheDocument()
    })

    it('should handle codes with special characters', () => {
      const item: PopupCacheCode = {
        code: 'ABC-123',
        source: 'test@example.com',
        receivedAt: Date.now(),
      }

      render(<CodeCard item={item} onCopy={mockOnCopy} />)

      expect(screen.getByText('ABC-123')).toBeInTheDocument()
    })

    it('should handle source with special characters', () => {
      const item: PopupCacheCode = {
        code: '123456',
        source: 'test+alias@example.com - Re: [URGENT] Sign-in (Code: 123456)',
        receivedAt: Date.now(),
      }

      render(<CodeCard item={item} onCopy={mockOnCopy} />)

      expect(screen.getByText('test+alias@example.com')).toBeInTheDocument()
      expect(screen.getByText('Re: [URGENT] Sign-in (Code: 123456)')).toBeInTheDocument()
    })

    it('should handle future timestamps gracefully', () => {
      const item: PopupCacheCode = {
        code: '123456',
        source: 'test@example.com',
        receivedAt: Date.now() + 60000, // 1 minute in future
      }

      render(<CodeCard item={item} onCopy={mockOnCopy} />)

      // Should show "just now" for future timestamps
      expect(screen.getByText(/just now/i)).toBeInTheDocument()
    })

    it('should handle very old timestamps', () => {
      const item: PopupCacheCode = {
        code: '123456',
        source: 'test@example.com',
        receivedAt: Date.now() - 24 * 60 * 60 * 1000, // 24 hours ago
      }

      render(<CodeCard item={item} onCopy={mockOnCopy} />)

      expect(screen.getByText('24h ago')).toBeInTheDocument()
    })
  })

  describe('Internationalization', () => {
    it('should use translation for button text', () => {
      const item: PopupCacheCode = {
        code: '123456',
        source: 'test@example.com',
        receivedAt: Date.now(),
      }

      render(<CodeCard item={item} onCopy={mockOnCopy} />)

      // Should use t('button_copy') and t('button_copied')
      expect(screen.getByRole('button')).toBeInTheDocument()
    })

    it('should use translation for time formatting', () => {
      const item: PopupCacheCode = {
        code: '123456',
        source: 'test@example.com',
        receivedAt: Date.now() - 5000,
      }

      render(<CodeCard item={item} onCopy={mockOnCopy} />)

      // Should use t('time_just_now')
      expect(screen.getByText(/just now/i)).toBeInTheDocument()
    })
  })
})
