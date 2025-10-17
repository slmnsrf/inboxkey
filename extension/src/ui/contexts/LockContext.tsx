/**
 * Lock Context
 *
 * React Context provider for global lock state management.
 * Listens for lock state changes from background and provides
 * actions for lock/unlock operations.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'
import { LockService } from '@/lib/services/lock-service'
import type { LockStatus } from '@/lib/services/lock-service'

interface LockContextValue {
  // State
  isInitialized: boolean
  isUnlocked: boolean
  isLocked: boolean
  isLoading: boolean

  // Actions
  initialize: (password: string) => Promise<void>
  unlock: (password: string) => Promise<{ success: boolean; error?: string }>
  lock: () => Promise<void>
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>
  disablePasswordProtection: (password: string) => Promise<void>
}

const LockContext = createContext<LockContextValue | undefined>(undefined)

/**
 * Lock state change message from background
 */
interface LockStateChangedMessage {
  type: 'LOCK_STATE_CHANGED'
  status: {
    isInitialized: boolean
    isUnlocked: boolean
    isLoading: boolean
  }
}

/**
 * Props for LockProvider
 */
export interface LockProviderProps {
  children: ReactNode
}

/**
 * Lock Context Provider
 */
export function LockProvider({ children }: LockProviderProps): JSX.Element {
  const [lockService] = useState(() => new LockService())
  const [isInitialized, setIsInitialized] = useState(false)
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  /**
   * Update state from LockStatus
   */
  const updateState = useCallback((status: LockStatus) => {
    setIsInitialized(status.isInitialized)
    setIsUnlocked(status.isUnlocked)
    setIsLoading(status.isLoading)
  }, [])

  /**
   * Query initial lock state on mount
   */
  useEffect(() => {
    const initializeState = async () => {
      setIsLoading(true)
      try {
        const status = await lockService.getStatus()
        updateState(status)
      } catch (error) {
        console.error('[LockContext] Failed to get initial status:', error)
        // Set safe defaults on error
        setIsInitialized(false)
        setIsUnlocked(false)
      } finally {
        setIsLoading(false)
      }
    }

    initializeState()
  }, [lockService, updateState])

  /**
   * Listen for lock state changes from background
   */
  useEffect(() => {
    const handleMessage = (
      message: unknown,
      _sender: chrome.runtime.MessageSender,
      _sendResponse: (response?: unknown) => void
    ) => {
      // Type guard to check if this is a lock state change message
      if (
        typeof message === 'object' &&
        message !== null &&
        'type' in message &&
        message.type === 'LOCK_STATE_CHANGED'
      ) {
        const lockMessage = message as LockStateChangedMessage
        if (lockMessage.status) {
          updateState(lockMessage.status)
        }
      }
    }

    chrome.runtime.onMessage.addListener(handleMessage)

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage)
    }
  }, [updateState])

  /**
   * Initialize lock mode with password
   */
  const initialize = useCallback(
    async (password: string): Promise<void> => {
      setIsLoading(true)
      try {
        await lockService.initialize(password)
        // State will be updated via broadcast message from background
      } finally {
        setIsLoading(false)
      }
    },
    [lockService]
  )

  /**
   * Unlock with password
   */
  const unlock = useCallback(
    async (password: string): Promise<{ success: boolean; error?: string }> => {
      setIsLoading(true)
      try {
        const result = await lockService.unlock(password)
        // State will be updated via broadcast message from background
        return result
      } finally {
        setIsLoading(false)
      }
    },
    [lockService]
  )

  /**
   * Lock the extension
   */
  const lock = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    try {
      await lockService.lock()
      // State will be updated via broadcast message from background
    } finally {
      setIsLoading(false)
    }
  }, [lockService])

  /**
   * Change password
   */
  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string): Promise<void> => {
      setIsLoading(true)
      try {
        await lockService.changePassword(currentPassword, newPassword)
        // State will be updated via broadcast message from background
      } finally {
        setIsLoading(false)
      }
    },
    [lockService]
  )

  /**
   * Disable password protection
   */
  const disablePasswordProtection = useCallback(
    async (password: string): Promise<void> => {
      setIsLoading(true)
      try {
        await lockService.disablePasswordProtection(password)
        // State will be updated via broadcast message from background
      } finally {
        setIsLoading(false)
      }
    },
    [lockService]
  )

  // Compute lock state from isInitialized and isUnlocked
  const isLocked = isInitialized && !isUnlocked

  const value: LockContextValue = {
    isInitialized,
    isUnlocked,
    isLocked,
    isLoading,
    initialize,
    unlock,
    lock,
    changePassword,
    disablePasswordProtection,
  }

  return <LockContext.Provider value={value}>{children}</LockContext.Provider>
}

/**
 * Hook to use lock context
 * @throws Error if used outside LockProvider
 */
export function useLockContext(): LockContextValue {
  const context = useContext(LockContext)
  if (!context) {
    throw new Error('useLockContext must be used within LockProvider')
  }
  return context
}
