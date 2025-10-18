/**
 * CodeCard Component Tests
 *
 * Verifies structured metadata, compact time rendering, and copy flows.
 */

import React from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CodeCard } from '../CodeCard'
import type { PopupCacheCode } from '@/shared/popup-messages'

const baseItem: PopupCacheCode = {
  code: '483921',
  source: 'noreply@example.com - Welcome to InboxKey',
  receivedAt: Date.now(),
  from: 'noreply@example.com',
  to: 'user@example.com',
  subject: 'Welcome to InboxKey'
}

describe('CodeCard', () => {
  const mockOnCopy = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'))
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders metadata labels and values', () => {
    render(<CodeCard item={baseItem} onCopy={mockOnCopy} />)

    expect(screen.getByText('From')).toBeInTheDocument()
    expect(screen.getByText(baseItem.from!)).toBeInTheDocument()
    expect(screen.getByText('To')).toBeInTheDocument()
    expect(screen.getByText(baseItem.to!)).toBeInTheDocument()
    expect(screen.getByText('Subject')).toBeInTheDocument()
    expect(screen.getByText(baseItem.subject!)).toBeInTheDocument()
    expect(screen.getByText('Code')).toBeInTheDocument()
    expect(screen.getAllByText(baseItem.code)[0]).toBeInTheDocument()
  })

  it('uses compact relative time with accessible label', () => {
    const item: PopupCacheCode = {
      ...baseItem,
      receivedAt: Date.now() - 5 * 60 * 1000 // 5 minutes ago
    }

    render(<CodeCard item={item} onCopy={mockOnCopy} />)

    expect(screen.getByText('5m ago')).toBeInTheDocument()
    expect(screen.getByLabelText('Received 5m ago')).toBeInTheDocument()
  })

  it('falls back to "now" for future timestamps', () => {
    const item: PopupCacheCode = {
      ...baseItem,
      receivedAt: Date.now() + 60 * 1000
    }

    render(<CodeCard item={item} onCopy={mockOnCopy} />)

    expect(screen.getByText(/now/i)).toBeInTheDocument()
  })

  it('shows fallback text when subject is missing', () => {
    const item: PopupCacheCode = {
      ...baseItem,
      subject: undefined,
      source: 'sender@example.com'
    }

    render(<CodeCard item={item} onCopy={mockOnCopy} />)

    expect(screen.getByText('N/A')).toBeInTheDocument()
  })

  it('invokes onCopy when the copy button is pressed', async () => {
    mockOnCopy.mockResolvedValue(undefined)
    render(<CodeCard item={baseItem} onCopy={mockOnCopy} />)

    const copyButton = screen.getByRole('button', { name: /^Copy$/i })
    fireEvent.click(copyButton)

    await waitFor(() => {
      expect(mockOnCopy).toHaveBeenCalledWith(baseItem.code)
      expect(copyButton).toHaveTextContent(/copied/i)
    })
  })

  it('invokes onCopy when the code pill is pressed', async () => {
    mockOnCopy.mockResolvedValue(undefined)
    render(<CodeCard item={baseItem} onCopy={mockOnCopy} />)

    const codePill = screen.getByRole('button', {
      name: new RegExp(`Copy code ${baseItem.code}`, 'i')
    })
    fireEvent.click(codePill)

    await waitFor(() => {
      expect(mockOnCopy).toHaveBeenCalledTimes(1)
    })
  })

  it('disables the copy button while copying and re-enables afterwards', async () => {
    mockOnCopy.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 100))
    )
    render(<CodeCard item={baseItem} onCopy={mockOnCopy} />)

    const copyButton = screen.getByRole('button', { name: /^Copy$/i })
    fireEvent.click(copyButton)

    await waitFor(() => expect(copyButton).toBeDisabled())

    vi.advanceTimersByTime(2000)

    await waitFor(() => expect(copyButton).not.toBeDisabled())
  })

  it('provides descriptive aria-label for copy button', () => {
    render(<CodeCard item={baseItem} onCopy={mockOnCopy} />)

    const copyButton = screen.getByRole('button', { name: /^Copy$/i })
    expect(copyButton).toHaveAccessibleName()
    expect(copyButton.getAttribute('aria-label')).toContain(baseItem.code)
    expect(copyButton.getAttribute('aria-label')).toContain(baseItem.from!)
  })
})
