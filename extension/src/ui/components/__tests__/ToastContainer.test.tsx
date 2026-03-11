import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { ToastContainer } from '../ToastContainer'
import { ToastProvider, useToast } from '../../contexts/ToastContext'
import { vi } from 'vitest'

// Helper component to trigger toasts
function ToastTrigger() {
  const { showToast } = useToast()

  return (
    <div>
      <button onClick={() => showToast('Success message', 'success')}>
        Show Success
      </button>
      <button onClick={() => showToast('Error message', 'error')}>
        Show Error
      </button>
    </div>
  )
}

describe('ToastContainer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders nothing when no toasts', () => {
    const { container } = render(
      <ToastProvider>
        <ToastContainer />
      </ToastProvider>
    )

    expect(container.querySelector('.toast-container')).toBeNull()
  })

  it('renders toast when shown', () => {
    render(
      <ToastProvider>
        <ToastTrigger />
        <ToastContainer />
      </ToastProvider>
    )

    fireEvent.click(screen.getByText('Show Success'))

    expect(screen.getByTestId('toast-message')).toHaveTextContent('Success message')
  })

  it('applies correct variant class', () => {
    render(
      <ToastProvider>
        <ToastTrigger />
        <ToastContainer />
      </ToastProvider>
    )

    fireEvent.click(screen.getByText('Show Error'))

    const toast = screen.getByTestId('toast')
    expect(toast).toHaveClass('toast--error')
  })

  it('dismisses toast when close button clicked', () => {
    render(
      <ToastProvider>
        <ToastTrigger />
        <ToastContainer />
      </ToastProvider>
    )

    fireEvent.click(screen.getByText('Show Success'))
    expect(screen.getByTestId('toast-message')).toHaveTextContent('Success message')

    const closeButton = screen.getByTestId('toast-close')
    fireEvent.click(closeButton)

    expect(screen.queryByTestId('toast-message')).not.toBeInTheDocument()
  })

  it('renders multiple toasts', () => {
    render(
      <ToastProvider>
        <ToastTrigger />
        <ToastContainer />
      </ToastProvider>
    )

    fireEvent.click(screen.getByText('Show Success'))
    fireEvent.click(screen.getByText('Show Error'))

    const messages = screen.getAllByTestId('toast-message')
    expect(messages).toHaveLength(2)
    expect(messages[0]).toHaveTextContent('Success message')
    expect(messages[1]).toHaveTextContent('Error message')
  })

  it('has aria-live region for accessibility', () => {
    render(
      <ToastProvider>
        <ToastTrigger />
        <ToastContainer />
      </ToastProvider>
    )

    fireEvent.click(screen.getByText('Show Success'))

    const container = screen.getByTestId('toast-container')
    expect(container).toBeInTheDocument()

    // The LiveRegion component has the aria-live attribute.
    // Multiple elements may have role="status" (e.g., toast + live region),
    // so we query all and verify at least one has aria-live="polite".
    const liveRegions = screen.getAllByRole('status')
    const politeRegion = liveRegions.find(
      (el) => el.getAttribute('aria-live') === 'polite'
    )
    expect(politeRegion).toBeDefined()
  })
})
