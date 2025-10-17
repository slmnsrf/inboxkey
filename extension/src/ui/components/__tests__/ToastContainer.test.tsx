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

    expect(screen.getByText('Success message')).toBeInTheDocument()
  })

  it('applies correct variant class', () => {
    render(
      <ToastProvider>
        <ToastTrigger />
        <ToastContainer />
      </ToastProvider>
    )

    fireEvent.click(screen.getByText('Show Error'))

    const toast = screen.getByText('Error message').closest('.toast')
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
    expect(screen.getByText('Success message')).toBeInTheDocument()

    const closeButton = screen.getByLabelText('Dismiss notification')
    fireEvent.click(closeButton)

    expect(screen.queryByText('Success message')).not.toBeInTheDocument()
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

    expect(screen.getByText('Success message')).toBeInTheDocument()
    expect(screen.getByText('Error message')).toBeInTheDocument()
  })

  it('has aria-live region for accessibility', () => {
    render(
      <ToastProvider>
        <ToastTrigger />
        <ToastContainer />
      </ToastProvider>
    )

    fireEvent.click(screen.getByText('Show Success'))

    const container = screen.getByText('Success message').closest('.toast-container')
    expect(container).toHaveAttribute('aria-live', 'polite')
  })
})
