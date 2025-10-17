import React from 'react'
import { renderHook, act } from '@testing-library/react'
import { ToastProvider, useToast } from '../../contexts/ToastContext'
import { vi } from 'vitest'

describe('useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('throws error when used outside ToastProvider', () => {
    expect(() => {
      renderHook(() => useToast())
    }).toThrow('useToast must be used within ToastProvider')
  })

  it('shows toast with message', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ToastProvider>{children}</ToastProvider>
    )

    const { result } = renderHook(() => useToast(), { wrapper })

    act(() => {
      result.current.showToast('Test message')
    })

    expect(result.current.toasts).toHaveLength(1)
    expect(result.current.toasts[0].message).toBe('Test message')
    expect(result.current.toasts[0].variant).toBe('info') // default
  })

  it('shows toast with custom variant', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ToastProvider>{children}</ToastProvider>
    )

    const { result } = renderHook(() => useToast(), { wrapper })

    act(() => {
      result.current.showToast('Success!', 'success')
    })

    expect(result.current.toasts[0].variant).toBe('success')
  })

  it('auto-dismisses toast after duration', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ToastProvider>{children}</ToastProvider>
    )

    const { result } = renderHook(() => useToast(), { wrapper })

    act(() => {
      result.current.showToast('Auto dismiss', 'info', 3000)
    })

    expect(result.current.toasts).toHaveLength(1)

    // Fast-forward time
    act(() => {
      vi.advanceTimersByTime(3000)
    })

    expect(result.current.toasts).toHaveLength(0)
  })

  it('manually dismisses toast', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ToastProvider>{children}</ToastProvider>
    )

    const { result } = renderHook(() => useToast(), { wrapper })

    act(() => {
      result.current.showToast('Dismiss me')
    })

    const toastId = result.current.toasts[0].id

    act(() => {
      result.current.dismissToast(toastId)
    })

    expect(result.current.toasts).toHaveLength(0)
  })

  it('queues multiple toasts', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ToastProvider>{children}</ToastProvider>
    )

    const { result } = renderHook(() => useToast(), { wrapper })

    act(() => {
      result.current.showToast('Toast 1')
      result.current.showToast('Toast 2', 'success')
      result.current.showToast('Toast 3', 'error')
    })

    expect(result.current.toasts).toHaveLength(3)
    expect(result.current.toasts[0].message).toBe('Toast 1')
    expect(result.current.toasts[1].message).toBe('Toast 2')
    expect(result.current.toasts[2].message).toBe('Toast 3')
  })

  it('each toast has unique ID', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ToastProvider>{children}</ToastProvider>
    )

    const { result } = renderHook(() => useToast(), { wrapper })

    act(() => {
      result.current.showToast('Toast 1')
      result.current.showToast('Toast 2')
    })

    const ids = result.current.toasts.map(t => t.id)
    expect(new Set(ids).size).toBe(2) // All unique
  })
})
