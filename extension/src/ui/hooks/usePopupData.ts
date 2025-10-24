/**
 * usePopupData Hook
 *
 * Fetches and manages popup data from background worker.
 * Provides loading state, error handling, and refresh capability.
 */

import { useState, useEffect } from 'react'
import type { PopupCache } from '@/shared/popup-messages'
import { PopupBridge } from '../services/popup-bridge'

const bridge = new PopupBridge()

export function usePopupData() {
  const [data, setData] = useState<PopupCache | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true)

        // Get cached data first (fast)
        const cache = await bridge.getPopupData()
        setData(cache)
        setLoading(false)

        // Check if should auto-sync
        const shouldAutoSync =
          cache.codes.length === 0 || // No codes
          !cache.ts || // No timestamp
          (Date.now() - cache.ts > 30_000) // Stale (>30s)

        if (shouldAutoSync) {
          console.log('[usePopupData] Auto-triggering sync (cache stale or empty)')
          setIsSyncing(true)

          try {
            const result = await bridge.triggerSync()
            setData(result)
          } catch (err) {
            console.warn('[usePopupData] Auto-sync failed:', err)
            // Don't set error state for auto-sync failures
          } finally {
            setIsSyncing(false)
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load popup data')
        setLoading(false)
      }
    }

    loadData()
  }, []) // Run only on mount

  const refresh = async () => {
    setLoading(true)
    setError(null)
    try {
      const newData = await bridge.getPopupData()
      setData(newData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return { data, loading, error, refresh, isSyncing }
}
