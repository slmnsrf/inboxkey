/**
 * useLockStatus Hook
 *
 * Fetches lock status from background worker.
 */

import { useState, useEffect } from 'react'
import { PopupBridge } from '../services/popup-bridge'
import type { LockStatus } from '../services/popup-bridge'

const bridge = new PopupBridge()

export function useLockStatus() {
  const [isInitialized, setIsInitialized] = useState(false)
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    bridge
      .getLockStatus()
      .then((status: LockStatus) => {
        setIsInitialized(status.isInitialized)
        setIsUnlocked(status.isUnlocked)
      })
      .finally(() => setLoading(false))
  }, [])

  return { isInitialized, isUnlocked, loading }
}
