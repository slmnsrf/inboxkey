/**
 * Tests for LockContext
 *
 * Tests React context for lock state management including:
 * - Provider initialization
 * - Hook usage validation
 * - Initial state loading
 * - Broadcast message handling
 * - Action methods (initialize, unlock, lock, changePassword, disable)
 */

import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { LockProvider, useLockContext } from '../LockContext'
import type { ReactNode } from 'react'

// Mock LockService
const mockLockService = {
  getStatus: vi.fn(),
  initialize: vi.fn(),
  unlock: vi.fn(),
  lock: vi.fn(),
  changePassword: vi.fn(),
  disablePasswordProtection: vi.fn(),
}

// Mock chrome.runtime.onMessage
const mockOnMessageListeners: Array<(message: any, sender: any, sendResponse: any) => void> = []
const mockOnMessage = {
  addListener: vi.fn((listener) => {
    mockOnMessageListeners.push(listener)
  }),
  removeListener: vi.fn((listener) => {
    const index = mockOnMessageListeners.indexOf(listener)
    if (index > -1) {
      mockOnMessageListeners.splice(index, 1)
    }
  }),
}

global.chrome = {
  runtime: {
    onMessage: mockOnMessage,
  },
} as any

// Mock LockService module
vi.mock('@/lib/services/lock-service', () => ({
  LockService: vi.fn(() => mockLockService),
}))

describe('LockContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOnMessageListeners.length = 0 // Clear listeners
    mockLockService.getStatus.mockResolvedValue({
      isInitialized: false,
      isUnlocked: false,
      isLoading: false,
    })
  })

  describe('useLockContext hook', () => {
    it('should throw error when used outside provider', () => {
      // Suppress console.error for this test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(() => {
        renderHook(() => useLockContext())
      }).toThrow('useLockContext must be used within LockProvider')

      consoleSpy.mockRestore()
    })
  })

  describe('LockProvider', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <LockProvider>{children}</LockProvider>
    )

    it('should provide context to children', () => {
      const { result } = renderHook(() => useLockContext(), { wrapper })

      expect(result.current).toBeDefined()
      expect(result.current).toHaveProperty('isInitialized')
      expect(result.current).toHaveProperty('isUnlocked')
      expect(result.current).toHaveProperty('isLoading')
      expect(result.current).toHaveProperty('initialize')
      expect(result.current).toHaveProperty('unlock')
      expect(result.current).toHaveProperty('lock')
      expect(result.current).toHaveProperty('changePassword')
      expect(result.current).toHaveProperty('disablePasswordProtection')
    })

    it('should load initial state from background on mount', async () => {
      mockLockService.getStatus.mockResolvedValue({
        isInitialized: true,
        isUnlocked: false,
        isLoading: false,
      })

      const { result } = renderHook(() => useLockContext(), { wrapper })

      // Initial loading state
      expect(result.current.isLoading).toBe(true)

      // Wait for state to load
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(mockLockService.getStatus).toHaveBeenCalledTimes(1)
      expect(result.current.isInitialized).toBe(true)
      expect(result.current.isUnlocked).toBe(false)
    })

    it('should set safe defaults when getStatus fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockLockService.getStatus.mockRejectedValue(new Error('Background error'))

      const { result } = renderHook(() => useLockContext(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.isInitialized).toBe(false)
      expect(result.current.isUnlocked).toBe(false)

      consoleSpy.mockRestore()
    })

    it('should listen for LOCK_STATE_CHANGED messages', async () => {
      mockLockService.getStatus.mockResolvedValue({
        isInitialized: false,
        isUnlocked: false,
        isLoading: false,
      })

      const { result } = renderHook(() => useLockContext(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Initially uninitialized
      expect(result.current.isInitialized).toBe(false)
      expect(result.current.isUnlocked).toBe(false)

      // Simulate broadcast message from background
      act(() => {
        mockOnMessageListeners.forEach((listener) => {
          listener(
            {
              type: 'LOCK_STATE_CHANGED',
              status: {
                isInitialized: true,
                isUnlocked: true,
                isLoading: false,
              },
            },
            {} as any,
            () => {}
          )
        })
      })

      // State should be updated
      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true)
        expect(result.current.isUnlocked).toBe(true)
      })
    })

    it('should ignore non-lock-state messages', async () => {
      mockLockService.getStatus.mockResolvedValue({
        isInitialized: false,
        isUnlocked: false,
        isLoading: false,
      })

      const { result } = renderHook(() => useLockContext(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      const initialState = { ...result.current }

      // Send unrelated message
      act(() => {
        mockOnMessageListeners.forEach((listener) => {
          listener(
            {
              type: 'OTHER_MESSAGE_TYPE',
              data: 'something',
            },
            {} as any,
            () => {}
          )
        })
      })

      // State should not change
      expect(result.current.isInitialized).toBe(initialState.isInitialized)
      expect(result.current.isUnlocked).toBe(initialState.isUnlocked)
    })

    it('should cleanup message listener on unmount', async () => {
      const { unmount } = renderHook(() => useLockContext(), { wrapper })

      await waitFor(() => {
        expect(mockOnMessage.addListener).toHaveBeenCalled()
      })

      const addedListeners = mockOnMessageListeners.length

      unmount()

      expect(mockOnMessage.removeListener).toHaveBeenCalled()
      expect(mockOnMessageListeners.length).toBe(addedListeners - 1)
    })
  })

  describe('initialize action', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <LockProvider>{children}</LockProvider>
    )

    it('should call lockService.initialize with password', async () => {
      mockLockService.initialize.mockResolvedValue(undefined)

      const { result } = renderHook(() => useLockContext(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      await act(async () => {
        await result.current.initialize('MyPassword123!')
      })

      expect(mockLockService.initialize).toHaveBeenCalledWith('MyPassword123!')
    })

    it('should set loading state during initialization', async () => {
      mockLockService.initialize.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 50))
      )

      const { result } = renderHook(() => useLockContext(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      const initPromise = act(async () => {
        await result.current.initialize('password')
      })

      // Should be loading during operation
      await waitFor(() => {
        expect(result.current.isLoading).toBe(true)
      })

      await initPromise

      // Should not be loading after completion
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })
    })

    it('should propagate errors from lockService', async () => {
      mockLockService.initialize.mockRejectedValue(new Error('Initialization failed'))

      const { result } = renderHook(() => useLockContext(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      await expect(
        act(async () => {
          await result.current.initialize('password')
        })
      ).rejects.toThrow('Initialization failed')
    })
  })

  describe('unlock action', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <LockProvider>{children}</LockProvider>
    )

    it('should call lockService.unlock and return result', async () => {
      mockLockService.unlock.mockResolvedValue({
        success: true,
      })

      const { result } = renderHook(() => useLockContext(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      let unlockResult: any
      await act(async () => {
        unlockResult = await result.current.unlock('password')
      })

      expect(mockLockService.unlock).toHaveBeenCalledWith('password')
      expect(unlockResult).toEqual({ success: true })
    })

    it('should return error on failed unlock', async () => {
      mockLockService.unlock.mockResolvedValue({
        success: false,
        error: 'Wrong password',
      })

      const { result } = renderHook(() => useLockContext(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      let unlockResult: any
      await act(async () => {
        unlockResult = await result.current.unlock('wrongPassword')
      })

      expect(unlockResult).toEqual({
        success: false,
        error: 'Wrong password',
      })
    })

    it('should set loading state during unlock', async () => {
      mockLockService.unlock.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 50))
      )

      const { result } = renderHook(() => useLockContext(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      const unlockPromise = act(async () => {
        await result.current.unlock('password')
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(true)
      })

      await unlockPromise

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })
    })
  })

  describe('lock action', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <LockProvider>{children}</LockProvider>
    )

    it('should call lockService.lock', async () => {
      mockLockService.lock.mockResolvedValue(undefined)

      const { result } = renderHook(() => useLockContext(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      await act(async () => {
        await result.current.lock()
      })

      expect(mockLockService.lock).toHaveBeenCalled()
    })

    it('should set loading state during lock', async () => {
      mockLockService.lock.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 50))
      )

      const { result } = renderHook(() => useLockContext(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      const lockPromise = act(async () => {
        await result.current.lock()
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(true)
      })

      await lockPromise

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })
    })

    it('should propagate errors from lockService', async () => {
      mockLockService.lock.mockRejectedValue(new Error('Lock failed'))

      const { result } = renderHook(() => useLockContext(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      await expect(
        act(async () => {
          await result.current.lock()
        })
      ).rejects.toThrow('Lock failed')
    })
  })

  describe('changePassword action', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <LockProvider>{children}</LockProvider>
    )

    it('should call lockService.changePassword', async () => {
      mockLockService.changePassword.mockResolvedValue(undefined)

      const { result } = renderHook(() => useLockContext(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      await act(async () => {
        await result.current.changePassword('oldPassword', 'newPassword')
      })

      expect(mockLockService.changePassword).toHaveBeenCalledWith('oldPassword', 'newPassword')
    })

    it('should set loading state during password change', async () => {
      mockLockService.changePassword.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 50))
      )

      const { result } = renderHook(() => useLockContext(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      const changePromise = act(async () => {
        await result.current.changePassword('old', 'new')
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(true)
      })

      await changePromise

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })
    })

    it('should propagate errors from lockService', async () => {
      mockLockService.changePassword.mockRejectedValue(
        new Error('Current password is incorrect')
      )

      const { result } = renderHook(() => useLockContext(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      await expect(
        act(async () => {
          await result.current.changePassword('wrong', 'new')
        })
      ).rejects.toThrow('Current password is incorrect')
    })
  })

  describe('disablePasswordProtection action', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <LockProvider>{children}</LockProvider>
    )

    it('should call lockService.disablePasswordProtection', async () => {
      mockLockService.disablePasswordProtection.mockResolvedValue(undefined)

      const { result } = renderHook(() => useLockContext(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      await act(async () => {
        await result.current.disablePasswordProtection('password')
      })

      expect(mockLockService.disablePasswordProtection).toHaveBeenCalledWith('password')
    })

    it('should set loading state during disable', async () => {
      mockLockService.disablePasswordProtection.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 50))
      )

      const { result } = renderHook(() => useLockContext(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      const disablePromise = act(async () => {
        await result.current.disablePasswordProtection('password')
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(true)
      })

      await disablePromise

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })
    })

    it('should propagate errors from lockService', async () => {
      mockLockService.disablePasswordProtection.mockRejectedValue(
        new Error('Password is incorrect')
      )

      const { result } = renderHook(() => useLockContext(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      await expect(
        act(async () => {
          await result.current.disablePasswordProtection('wrong')
        })
      ).rejects.toThrow('Password is incorrect')
    })
  })
})
