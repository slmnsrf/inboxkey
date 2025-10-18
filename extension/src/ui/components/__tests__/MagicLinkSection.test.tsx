/**
 * MagicLinkSection Component Tests
 *
 * Verifies list rendering, quick metadata access, and open button behavior.
 */

import React from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MagicLinkSection } from '../MagicLinkSection'
import type { PopupCacheMagicLink } from '@/shared/popup-messages'

const baseLink: PopupCacheMagicLink = {
  url: 'https://example.com/magic',
  type: 'verify',
  source: 'noreply@example.com - Sign in link',
  receivedAt: Date.now(),
  from: 'noreply@example.com',
  to: 'user@example.com',
  subject: 'Sign in link'
}

describe('MagicLinkSection', () => {
  const mockOnOpen = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'))
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders empty state when there are no links', () => {
    render(<MagicLinkSection links={[]} onOpen={mockOnOpen} />)

    expect(screen.getByText(/Magic Links/i)).toBeInTheDocument()
    expect(screen.getByText(/No magic links/i)).toBeInTheDocument()
  })

  it('renders metadata rows for each link', () => {
    render(<MagicLinkSection links={[baseLink]} onOpen={mockOnOpen} />)

    expect(screen.getByText('From')).toBeInTheDocument()
    expect(screen.getByText(baseLink.from!)).toBeInTheDocument()
    expect(screen.getByText('To')).toBeInTheDocument()
    expect(screen.getByText(baseLink.to!)).toBeInTheDocument()
    expect(screen.getByText('Subject')).toBeInTheDocument()
    expect(screen.getByText(baseLink.subject!)).toBeInTheDocument()
  })

  it('shows compact relative time', () => {
    const link: PopupCacheMagicLink = {
      ...baseLink,
      receivedAt: Date.now() - 60 * 60 * 1000 // 1 hour ago
    }

    render(<MagicLinkSection links={[link]} onOpen={mockOnOpen} />)

    expect(screen.getByText('1h ago')).toBeInTheDocument()
    expect(screen.getByLabelText('Received 1h ago')).toBeInTheDocument()
  })

  it('invokes onOpen and shows loading state', async () => {
    mockOnOpen.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 100))
    )

    render(<MagicLinkSection links={[baseLink]} onOpen={mockOnOpen} />)

    const button = screen.getByRole('button', { name: /^Open$/i })
    fireEvent.click(button)

    await waitFor(() => {
      expect(mockOnOpen).toHaveBeenCalledWith(baseLink)
      expect(button).toBeDisabled()
      expect(button).toHaveTextContent(/Opening/i)
    })
  })

  it('uses fallback text when metadata is missing', () => {
    const link: PopupCacheMagicLink = {
      ...baseLink,
      from: undefined,
      to: undefined,
      subject: undefined,
      source: 'mystery@example.com'
    }

    render(<MagicLinkSection links={[link]} onOpen={mockOnOpen} />)

    const fallbackValues = screen.getAllByText('N/A')
    expect(fallbackValues.length).toBeGreaterThanOrEqual(2)
  })

  it('provides descriptive aria-label on open button', () => {
    render(<MagicLinkSection links={[baseLink]} onOpen={mockOnOpen} />)

    const button = screen.getByRole('button', { name: /^Open$/i })
    expect(button.getAttribute('aria-label')).toContain(baseLink.subject!)
  })
})
