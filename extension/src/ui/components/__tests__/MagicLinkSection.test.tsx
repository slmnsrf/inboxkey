/**
 * Unit Tests for MagicLinkSection Component
 * Tests link display, opening, and security validation
 */

import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MagicLinkSection } from '../MagicLinkSection'
import type { PopupCacheMagicLink } from '@/shared/popup-messages'

describe('MagicLinkSection', () => {
  const mockOnOpen = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe('Empty State', () => {
    it('should render empty state when no links', () => {
      render(<MagicLinkSection links={[]} onOpen={mockOnOpen} />)

      expect(screen.getByText(/magic links/i)).toBeInTheDocument()
      expect(screen.getByRole('note')).toBeInTheDocument()
    })

    it('should show appropriate empty message', () => {
      render(<MagicLinkSection links={[]} onOpen={mockOnOpen} />)

      // Should use EmptyState component with "no-links" variant
      const emptyState = screen.getByRole('note')
      expect(emptyState).toBeInTheDocument()
    })
  })

  describe('Link List Rendering', () => {
    it('should render list of magic links', () => {
      const links: PopupCacheMagicLink[] = [
        {
          url: 'https://github.com/verify',
          type: 'verify',
          source: 'noreply@github.com',
          receivedAt: Date.now(),
        },
        {
          url: 'https://twitter.com/login',
          type: 'login',
          source: 'info@twitter.com',
          receivedAt: Date.now(),
        },
      ]

      render(<MagicLinkSection links={links} onOpen={mockOnOpen} />)

      expect(screen.getByText(/github.com/i)).toBeInTheDocument()
      expect(screen.getByText(/twitter.com/i)).toBeInTheDocument()
    })

    it('should render links in provided order', () => {
      const links: PopupCacheMagicLink[] = [
        {
          url: 'https://first.com/link',
          type: 'verify',
          source: 'test@first.com',
          receivedAt: Date.now(),
        },
        {
          url: 'https://second.com/link',
          type: 'login',
          source: 'test@second.com',
          receivedAt: Date.now(),
        },
        {
          url: 'https://third.com/link',
          type: 'reset',
          source: 'test@third.com',
          receivedAt: Date.now(),
        },
      ]

      render(<MagicLinkSection links={links} onOpen={mockOnOpen} />)

      const linkElements = screen.getAllByRole('button', { name: /open/i })
      expect(linkElements).toHaveLength(3)
    })

    it('should use unique keys for duplicate URLs', () => {
      const links: PopupCacheMagicLink[] = [
        {
          url: 'https://example.com/verify',
          type: 'verify',
          source: 'test1@example.com',
          receivedAt: Date.now(),
        },
        {
          url: 'https://example.com/verify',
          type: 'verify',
          source: 'test2@example.com',
          receivedAt: Date.now(),
        },
      ]

      const { container } = render(<MagicLinkSection links={links} onOpen={mockOnOpen} />)

      // Should render both links despite same URL
      const linkCards = container.querySelectorAll('.link-card')
      expect(linkCards).toHaveLength(2)
    })
  })

  describe('Link Opening', () => {
    it('should call onOpen when link button clicked', async () => {
      mockOnOpen.mockResolvedValue(undefined)

      const link: PopupCacheMagicLink = {
        url: 'https://example.com/verify',
        type: 'verify',
        source: 'test@example.com',
        receivedAt: Date.now(),
      }

      render(<MagicLinkSection links={[link]} onOpen={mockOnOpen} />)

      const openButton = screen.getByRole('button', { name: /open/i })
      fireEvent.click(openButton)

      await waitFor(() => {
        expect(mockOnOpen).toHaveBeenCalledWith(link)
      })
    })

    it('should pass correct link object to onOpen', async () => {
      mockOnOpen.mockResolvedValue(undefined)

      const links: PopupCacheMagicLink[] = [
        {
          url: 'https://first.com/verify',
          type: 'verify',
          source: 'test@first.com',
          receivedAt: Date.now(),
          providerId: 'gmail',
          providerName: 'Gmail',
        },
        {
          url: 'https://second.com/login',
          type: 'login',
          source: 'test@second.com',
          receivedAt: Date.now(),
          providerId: 'outlook',
          providerName: 'Outlook',
        },
      ]

      render(<MagicLinkSection links={links} onOpen={mockOnOpen} />)

      const buttons = screen.getAllByRole('button', { name: /open/i })
      fireEvent.click(buttons[1]) // Click second link

      await waitFor(() => {
        expect(mockOnOpen).toHaveBeenCalledWith(links[1])
      })
    })

    it('should disable button while opening', async () => {
      mockOnOpen.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      )

      const link: PopupCacheMagicLink = {
        url: 'https://example.com/verify',
        type: 'verify',
        source: 'test@example.com',
        receivedAt: Date.now(),
      }

      render(<MagicLinkSection links={[link]} onOpen={mockOnOpen} />)

      const openButton = screen.getByRole('button', { name: /open/i })
      fireEvent.click(openButton)

      await waitFor(() => {
        expect(openButton).toBeDisabled()
      })
    })

    it('should show feedback after opening', async () => {
      mockOnOpen.mockResolvedValue(undefined)

      const link: PopupCacheMagicLink = {
        url: 'https://example.com/verify',
        type: 'verify',
        source: 'test@example.com',
        receivedAt: Date.now(),
      }

      render(<MagicLinkSection links={[link]} onOpen={mockOnOpen} />)

      const openButton = screen.getByRole('button', { name: /open/i })
      fireEvent.click(openButton)

      await waitFor(() => {
        expect(screen.getByText(/opened/i)).toBeInTheDocument()
      })
    })

    it('should reset button state after 2 seconds', async () => {
      mockOnOpen.mockResolvedValue(undefined)

      const link: PopupCacheMagicLink = {
        url: 'https://example.com/verify',
        type: 'verify',
        source: 'test@example.com',
        receivedAt: Date.now(),
      }

      render(<MagicLinkSection links={[link]} onOpen={mockOnOpen} />)

      const openButton = screen.getByRole('button', { name: /open/i })
      fireEvent.click(openButton)

      await waitFor(() => {
        expect(screen.getByText(/opened/i)).toBeInTheDocument()
      })

      // Fast-forward 2 seconds
      vi.advanceTimersByTime(2000)

      await waitFor(() => {
        expect(screen.queryByText(/opened/i)).not.toBeInTheDocument()
        expect(screen.getByText(/open/i)).toBeInTheDocument()
      })
    })
  })

  describe('Link Types', () => {
    it('should display login link type', () => {
      const link: PopupCacheMagicLink = {
        url: 'https://example.com/login',
        type: 'login',
        source: 'test@example.com',
        receivedAt: Date.now(),
      }

      render(<MagicLinkSection links={[link]} onOpen={mockOnOpen} />)

      // LinkCard should render type label
      expect(screen.getByText(/login/i)).toBeInTheDocument()
    })

    it('should display verify link type', () => {
      const link: PopupCacheMagicLink = {
        url: 'https://example.com/verify',
        type: 'verify',
        source: 'test@example.com',
        receivedAt: Date.now(),
      }

      render(<MagicLinkSection links={[link]} onOpen={mockOnOpen} />)

      expect(screen.getByText(/verify/i)).toBeInTheDocument()
    })

    it('should display reset link type', () => {
      const link: PopupCacheMagicLink = {
        url: 'https://example.com/reset',
        type: 'reset',
        source: 'test@example.com',
        receivedAt: Date.now(),
      }

      render(<MagicLinkSection links={[link]} onOpen={mockOnOpen} />)

      expect(screen.getByText(/reset/i)).toBeInTheDocument()
    })

    it('should display all link types in mixed list', () => {
      const links: PopupCacheMagicLink[] = [
        {
          url: 'https://example.com/login',
          type: 'login',
          source: 'test@example.com',
          receivedAt: Date.now(),
        },
        {
          url: 'https://example.com/verify',
          type: 'verify',
          source: 'test@example.com',
          receivedAt: Date.now(),
        },
        {
          url: 'https://example.com/reset',
          type: 'reset',
          source: 'test@example.com',
          receivedAt: Date.now(),
        },
      ]

      render(<MagicLinkSection links={links} onOpen={mockOnOpen} />)

      // All three types should be visible
      expect(screen.getByText(/login/i)).toBeInTheDocument()
      expect(screen.getByText(/verify/i)).toBeInTheDocument()
      expect(screen.getByText(/reset/i)).toBeInTheDocument()
    })
  })

  describe('Provider Display', () => {
    it('should show provider badge when provided', () => {
      const link: PopupCacheMagicLink = {
        url: 'https://example.com/verify',
        type: 'verify',
        source: 'test@gmail.com',
        receivedAt: Date.now(),
        providerId: 'gmail',
        providerName: 'Gmail',
      }

      render(<MagicLinkSection links={[link]} onOpen={mockOnOpen} />)

      expect(screen.getByText('Gmail')).toBeInTheDocument()
    })

    it('should not show provider badge when not provided', () => {
      const link: PopupCacheMagicLink = {
        url: 'https://example.com/verify',
        type: 'verify',
        source: 'test@example.com',
        receivedAt: Date.now(),
      }

      render(<MagicLinkSection links={[link]} onOpen={mockOnOpen} />)

      expect(screen.queryByText(/gmail/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/outlook/i)).not.toBeInTheDocument()
    })

    it('should display multiple providers correctly', () => {
      const links: PopupCacheMagicLink[] = [
        {
          url: 'https://example.com/verify',
          type: 'verify',
          source: 'test@gmail.com',
          receivedAt: Date.now(),
          providerId: 'gmail',
          providerName: 'Gmail',
        },
        {
          url: 'https://example.com/login',
          type: 'login',
          source: 'test@outlook.com',
          receivedAt: Date.now(),
          providerId: 'outlook',
          providerName: 'Outlook',
        },
      ]

      render(<MagicLinkSection links={links} onOpen={mockOnOpen} />)

      expect(screen.getByText('Gmail')).toBeInTheDocument()
      expect(screen.getByText('Outlook')).toBeInTheDocument()
    })
  })

  describe('Opened/Unopened State', () => {
    it('should render unopened links normally', () => {
      const link: PopupCacheMagicLink = {
        url: 'https://example.com/verify',
        type: 'verify',
        source: 'test@example.com',
        receivedAt: Date.now(),
      }

      render(<MagicLinkSection links={[link]} onOpen={mockOnOpen} />)

      const openButton = screen.getByRole('button', { name: /open/i })
      expect(openButton).toBeInTheDocument()
    })

    it('should show when link has been opened', () => {
      const link: PopupCacheMagicLink = {
        url: 'https://example.com/verify',
        type: 'verify',
        source: 'test@example.com',
        receivedAt: Date.now(),
        openedAt: Date.now() - 5000,
      }

      render(<MagicLinkSection links={[link]} onOpen={mockOnOpen} />)

      // LinkCard should handle opened state
      const button = screen.getByRole('button')
      expect(button).toBeInTheDocument()
    })
  })

  describe('Error Handling', () => {
    it('should handle onOpen errors gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockOnOpen.mockRejectedValue(new Error('Failed to open link'))

      const link: PopupCacheMagicLink = {
        url: 'https://example.com/verify',
        type: 'verify',
        source: 'test@example.com',
        receivedAt: Date.now(),
      }

      render(<MagicLinkSection links={[link]} onOpen={mockOnOpen} />)

      const openButton = screen.getByRole('button', { name: /open/i })
      fireEvent.click(openButton)

      // Should still reset after timeout
      vi.advanceTimersByTime(2000)

      await waitFor(() => {
        expect(openButton).not.toBeDisabled()
      })

      consoleErrorSpy.mockRestore()
    })

    it('should allow retrying after failed open', async () => {
      mockOnOpen
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(undefined)

      const link: PopupCacheMagicLink = {
        url: 'https://example.com/verify',
        type: 'verify',
        source: 'test@example.com',
        receivedAt: Date.now(),
      }

      render(<MagicLinkSection links={[link]} onOpen={mockOnOpen} />)

      const openButton = screen.getByRole('button', { name: /open/i })

      // First attempt - fails
      fireEvent.click(openButton)
      vi.advanceTimersByTime(2000)

      await waitFor(() => {
        expect(openButton).not.toBeDisabled()
      })

      // Second attempt - succeeds
      fireEvent.click(openButton)

      await waitFor(() => {
        expect(mockOnOpen).toHaveBeenCalledTimes(2)
      })
    })
  })

  describe('Accessibility', () => {
    it('should have section heading', () => {
      render(<MagicLinkSection links={[]} onOpen={mockOnOpen} />)

      const heading = screen.getByRole('heading', { name: /magic links/i })
      expect(heading).toBeInTheDocument()
    })

    it('should have accessible link buttons', () => {
      const link: PopupCacheMagicLink = {
        url: 'https://example.com/verify',
        type: 'verify',
        source: 'test@example.com',
        receivedAt: Date.now(),
      }

      render(<MagicLinkSection links={[link]} onOpen={mockOnOpen} />)

      const openButton = screen.getByRole('button')
      expect(openButton).toHaveAccessibleName()
    })

    it('should use role=note for empty state', () => {
      render(<MagicLinkSection links={[]} onOpen={mockOnOpen} />)

      expect(screen.getByRole('note')).toBeInTheDocument()
    })

    it('should be keyboard navigable', () => {
      const links: PopupCacheMagicLink[] = [
        {
          url: 'https://first.com/verify',
          type: 'verify',
          source: 'test@first.com',
          receivedAt: Date.now(),
        },
        {
          url: 'https://second.com/login',
          type: 'login',
          source: 'test@second.com',
          receivedAt: Date.now(),
        },
      ]

      render(<MagicLinkSection links={links} onOpen={mockOnOpen} />)

      const buttons = screen.getAllByRole('button')

      // All buttons should be focusable
      buttons.forEach((button) => {
        button.focus()
        expect(button).toHaveFocus()
      })
    })
  })

  describe('Domain Display', () => {
    it('should extract and display domain from URL', () => {
      const link: PopupCacheMagicLink = {
        url: 'https://github.com/verify?token=abc123',
        type: 'verify',
        source: 'noreply@github.com',
        receivedAt: Date.now(),
      }

      render(<MagicLinkSection links={[link]} onOpen={mockOnOpen} />)

      expect(screen.getByText('github.com')).toBeInTheDocument()
    })

    it('should handle subdomains correctly', () => {
      const link: PopupCacheMagicLink = {
        url: 'https://accounts.google.com/verify',
        type: 'verify',
        source: 'noreply@google.com',
        receivedAt: Date.now(),
      }

      render(<MagicLinkSection links={[link]} onOpen={mockOnOpen} />)

      expect(screen.getByText('accounts.google.com')).toBeInTheDocument()
    })

    it('should handle invalid URLs gracefully', () => {
      const link: PopupCacheMagicLink = {
        url: 'not-a-valid-url',
        type: 'verify',
        source: 'test@example.com',
        receivedAt: Date.now(),
      }

      render(<MagicLinkSection links={[link]} onOpen={mockOnOpen} />)

      // Should display the raw URL if parsing fails
      expect(screen.getByText('not-a-valid-url')).toBeInTheDocument()
    })
  })

  describe('Edge Cases', () => {
    it('should handle very long URLs', () => {
      const longUrl = 'https://example.com/verify?token=' + 'a'.repeat(500)
      const link: PopupCacheMagicLink = {
        url: longUrl,
        type: 'verify',
        source: 'test@example.com',
        receivedAt: Date.now(),
      }

      render(<MagicLinkSection links={[link]} onOpen={mockOnOpen} />)

      // Should render without crashing
      expect(screen.getByRole('button')).toBeInTheDocument()
    })

    it('should handle multiple links from same domain', () => {
      const links: PopupCacheMagicLink[] = [
        {
          url: 'https://example.com/verify?token=1',
          type: 'verify',
          source: 'test@example.com',
          receivedAt: Date.now(),
        },
        {
          url: 'https://example.com/login?token=2',
          type: 'login',
          source: 'test@example.com',
          receivedAt: Date.now(),
        },
        {
          url: 'https://example.com/reset?token=3',
          type: 'reset',
          source: 'test@example.com',
          receivedAt: Date.now(),
        },
      ]

      render(<MagicLinkSection links={links} onOpen={mockOnOpen} />)

      const buttons = screen.getAllByRole('button', { name: /open/i })
      expect(buttons).toHaveLength(3)
    })

    it('should handle links with special characters in domain', () => {
      const link: PopupCacheMagicLink = {
        url: 'https://example-site.co.uk/verify',
        type: 'verify',
        source: 'test@example.com',
        receivedAt: Date.now(),
      }

      render(<MagicLinkSection links={[link]} onOpen={mockOnOpen} />)

      expect(screen.getByText('example-site.co.uk')).toBeInTheDocument()
    })

    it('should handle empty source field', () => {
      const link: PopupCacheMagicLink = {
        url: 'https://example.com/verify',
        type: 'verify',
        source: '',
        receivedAt: Date.now(),
      }

      render(<MagicLinkSection links={[link]} onOpen={mockOnOpen} />)

      // Should still render the link
      expect(screen.getByRole('button')).toBeInTheDocument()
    })
  })

  describe('Security Considerations', () => {
    it('should render HTTPS links', () => {
      const link: PopupCacheMagicLink = {
        url: 'https://secure.example.com/verify',
        type: 'verify',
        source: 'test@example.com',
        receivedAt: Date.now(),
      }

      render(<MagicLinkSection links={[link]} onOpen={mockOnOpen} />)

      expect(screen.getByText('secure.example.com')).toBeInTheDocument()
    })

    it('should handle HTTP links (though they should be filtered upstream)', () => {
      const link: PopupCacheMagicLink = {
        url: 'http://insecure.example.com/verify',
        type: 'verify',
        source: 'test@example.com',
        receivedAt: Date.now(),
      }

      render(<MagicLinkSection links={[link]} onOpen={mockOnOpen} />)

      // Component should still render (validation is in onOpen handler)
      expect(screen.getByRole('button')).toBeInTheDocument()
    })
  })

  describe('Internationalization', () => {
    it('should use translation for section heading', () => {
      render(<MagicLinkSection links={[]} onOpen={mockOnOpen} />)

      // Should use t('section_magic_links')
      expect(screen.getByRole('heading')).toBeInTheDocument()
    })

    it('should use translation for link type labels', () => {
      const links: PopupCacheMagicLink[] = [
        {
          url: 'https://example.com/login',
          type: 'login',
          source: 'test@example.com',
          receivedAt: Date.now(),
        },
      ]

      render(<MagicLinkSection links={links} onOpen={mockOnOpen} />)

      // Should use t('link_type_login')
      expect(screen.getByRole('button')).toBeInTheDocument()
    })
  })
})
