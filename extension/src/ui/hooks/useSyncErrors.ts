/**
 * useSyncErrors Hook
 *
 * Manages sync error state for the ErrorBanner component.
 * Fetches error state from background worker and handles dismissal.
 *
 * Features:
 * - Grouped error banner when 2+ accounts have errors
 * - Single account banner with email when only 1 account has an error
 * - Per-session dismissal (dismissed errors stay hidden until popup reopens)
 * - Network banner auto-dismisses when connection restored
 * - Polls background for error state changes
 */

import { useState, useEffect, useRef } from 'react'
import { PopupBridge } from '../services/popup-bridge'
import { t } from '@/lib/i18n'
import type { BannerVariant, BannerType } from '../components/ErrorBanner'

export interface SyncErrorState {
  variant: BannerVariant
  type: BannerType
  message: string
  actionLabel?: string
  onAction?: () => void
}

const bridge = new PopupBridge()

const DISMISSED_STORAGE_KEY = 'inboxkey_dismissed_banners'

/** Load dismissed banners from session storage (persists across popup reopens, clears on browser close). */
async function loadDismissed(): Promise<Set<BannerType>> {
  try {
    const result = await chrome.storage.session.get(DISMISSED_STORAGE_KEY)
    const arr = result[DISMISSED_STORAGE_KEY]
    return Array.isArray(arr) ? new Set(arr as BannerType[]) : new Set()
  } catch {
    return new Set()
  }
}

/** Save dismissed banners to session storage. */
async function saveDismissed(dismissed: Set<BannerType>): Promise<void> {
  try {
    await chrome.storage.session.set({ [DISMISSED_STORAGE_KEY]: Array.from(dismissed) })
  } catch {
    // Best effort
  }
}

export function useSyncErrors(options?: { onRetrySuccess?: () => void }) {
  const [dismissed, setDismissed] = useState<Set<BannerType>>(new Set())
  const [dismissedLoaded, setDismissedLoaded] = useState(false)
  const [syncError, setSyncError] = useState<SyncErrorState | null>(null)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const isRetryingRef = useRef(false)

  // Load persisted dismissed state on mount
  useEffect(() => {
    loadDismissed().then(loaded => {
      setDismissed(loaded)
      setDismissedLoaded(true)
    })
  }, [])

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
      if (!dismissedLoaded) return // Wait for persisted dismiss state before showing banners

      try {
        const errors = await bridge.getSyncErrors()

        if (!mounted) return

        if (errors.length >= 2) {
          // Multiple accounts have errors: show grouped banner
          if (dismissed.has('multiple-accounts')) {
            setSyncError(null)
            return
          }

          setSyncError({
            variant: 'warning',
            type: 'multiple-accounts',
            message: t('sync_error_multiple_accounts', [String(errors.length)]),
            actionLabel: t('sync_error_open_accounts'),
            onAction: () => {
              chrome.tabs.create({
                url: chrome.runtime.getURL('options.html?tab=accounts')
              })
            },
          })
        } else if (errors.length === 1) {
          const errorInfo = errors[0]

          // Don't show if dismissed this session
          if (dismissed.has(errorInfo.type)) {
            setSyncError(null)
            return
          }

          // Map single error info to banner state (existing behavior)
          let actionLabel: string | undefined
          let onAction: (() => void) | undefined

          if (errorInfo.type === 'sync-failed') {
            actionLabel = 'Retry Sync'
            onAction = async () => {
              if (isRetryingRef.current) return
              isRetryingRef.current = true
              setSyncError(prev => prev ? { ...prev, actionLabel: 'Retrying...' } : null)
              try {
                await bridge.triggerSync()
                // Dismiss banner on successful retry
                setDismissed((prev) => new Set(prev).add('sync-failed'))
                setSyncError(null)
                options?.onRetrySuccess?.()
              } catch (err) {
                console.error('[useSyncErrors] Retry sync failed:', err)
                setSyncError(prev => prev ? {
                  ...prev,
                  actionLabel: 'Retry Sync',
                  message: 'Retry failed. Check your email connections in Settings.'
                } : null)
              } finally {
                isRetryingRef.current = false
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
          // No backend errors: check client-side network status
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
  }, [dismissed, isOnline, dismissedLoaded])

  const dismissSyncError = (type: BannerType) => {
    setDismissed((prev) => {
      const next = new Set(prev).add(type)
      saveDismissed(next)
      return next
    })
    setSyncError(null)
  }

  return { syncError, dismissSyncError }
}
