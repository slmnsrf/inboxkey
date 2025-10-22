/**
 * useSyncErrors Hook
 *
 * Manages sync error state for the ErrorBanner component.
 * Fetches error state from background worker and handles dismissal.
 *
 * Features:
 * - Per-session dismissal (dismissed errors stay hidden until popup reopens)
 * - Network banner auto-dismisses when connection restored
 * - Polls background for error state changes
 */

import { useState, useEffect } from 'react'
import { PopupBridge } from '../services/popup-bridge'
import type { BannerVariant, BannerType } from '../components/ErrorBanner'

export interface SyncErrorState {
  variant: BannerVariant
  type: BannerType
  message: string
  actionLabel?: string
  onAction?: () => void
}

const bridge = new PopupBridge()

export function useSyncErrors() {
  const [dismissed, setDismissed] = useState<Set<BannerType>>(new Set())
  const [syncError, setSyncError] = useState<SyncErrorState | null>(null)
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  // Monitor online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      // Auto-dismiss network banner when connection restored
      setDismissed((prev) => {
        const next = new Set(prev)
        next.delete('network-offline')
        return next
      })
    }

    const handleOffline = () => {
      setIsOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Fetch sync error state from background
  useEffect(() => {
    let mounted = true

    const fetchSyncError = async () => {
      try {
        const errorInfo = await bridge.getSyncError()

        if (!mounted) return

        if (errorInfo) {
          // Don't show if dismissed this session
          if (dismissed.has(errorInfo.type)) {
            setSyncError(null)
            return
          }

          // Map error info to banner state
          let actionLabel: string | undefined
          let onAction: (() => void) | undefined

          if (errorInfo.type === 'sync-failed') {
            actionLabel = 'Retry Sync'
            onAction = async () => {
              try {
                await bridge.triggerSync()
                // Dismiss banner on successful retry
                setDismissed((prev) => new Set(prev).add('sync-failed'))
                setSyncError(null)
              } catch (err) {
                console.error('[useSyncErrors] Retry sync failed:', err)
              }
            }
          } else if (errorInfo.type === 'auth-expired') {
            actionLabel = 'Reconnect'
            onAction = () => {
              chrome.runtime.openOptionsPage()
            }
          }

          setSyncError({
            variant: errorInfo.variant,
            type: errorInfo.type,
            message: errorInfo.message,
            actionLabel,
            onAction,
          })
        } else {
          // Network offline detection (client-side only)
          if (!isOnline && !dismissed.has('network-offline')) {
            setSyncError({
              variant: 'info',
              type: 'network-offline',
              message: "You're offline. Your codes are safe and ready.",
            })
          } else {
            setSyncError(null)
          }
        }
      } catch (error) {
        console.error('[useSyncErrors] Failed to fetch sync error:', error)
        setSyncError(null)
      }
    }

    fetchSyncError()

    // Poll for error state changes every 5 seconds
    const interval = setInterval(fetchSyncError, 5000)

    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [dismissed, isOnline])

  const dismissSyncError = (type: BannerType) => {
    setDismissed((prev) => new Set(prev).add(type))
    setSyncError(null)
  }

  return { syncError, dismissSyncError }
}
