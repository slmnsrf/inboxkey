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

  useEffect(() => {
    bridge
      .getPopupData()
      .then(setData)
      .catch((err) => {
        console.error('[Popup] Failed to load data:', err)
        setError(err.message)
      })
      .finally(() => setLoading(false))
  }, [])

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

  return { data, loading, error, refresh }
}
