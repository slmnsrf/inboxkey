/**
 * BridgeStatusRow Component
 *
 * Settings tab row showing InboxBridge connection status with version
 * and Uninstall action. Placed after Automation, before Appearance.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { t } from '@/lib/i18n'
import { getNativeClient } from '@/lib/native-messaging'
import { UninstallBridgeModal } from './accounts/UninstallBridgeModal'

type BridgeState = 'checking' | 'connected' | 'disconnected'

export function BridgeStatusRow() {
  const [status, setStatus] = useState<BridgeState>('checking')
  const [version, setVersion] = useState<string | null>(null)
  const [installInfo, setInstallInfo] = useState<any>(undefined)
  const [imapAccountIds, setImapAccountIds] = useState<string[]>([])
  const [showUninstall, setShowUninstall] = useState(false)

  const checkBridge = useCallback(async () => {
    setStatus('checking')
    try {
      const client = getNativeClient()
      const ping = await client.ping()
      setStatus('connected')
      setVersion(ping.version || null)
      setInstallInfo(ping.installInfo)
    } catch {
      setStatus('disconnected')
      setVersion(null)
      setInstallInfo(undefined)
    }
  }, [])

  const loadImapAccounts = useCallback(async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_MAILBOXES' })
      if (response.success) {
        const ids = response.mailboxes
          .filter((m: any) => m.providerId === 'imap-bridge')
          .map((m: any) => m.id)
        setImapAccountIds(ids)
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    void checkBridge()
    void loadImapAccounts()
  }, [checkBridge, loadImapAccounts])

  // Tracked timer ID for the post-uninstall recheck. Stored in a ref so we can
  // clear it on unmount and prevent state updates after the component is gone.
  const recheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => {
      if (recheckTimerRef.current !== null) {
        clearTimeout(recheckTimerRef.current)
        recheckTimerRef.current = null
      }
    }
  }, [])

  // Re-check bridge status when page becomes visible again.
  // Throttled to at most once per 2 minutes to prevent spam.
  const lastCheckAtRef = useRef<number>(Date.now())
  useEffect(() => {
    const THROTTLE_MS = 2 * 60 * 1000 // 2 minutes

    const handleVisibilityChange = () => {
      if (document.hidden) return
      const now = Date.now()
      if (now - lastCheckAtRef.current >= THROTTLE_MS) {
        lastCheckAtRef.current = now
        void checkBridge()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [checkBridge])

  const handleUninstallClick = useCallback(async () => {
    // Re-check bridge before opening modal (user may have already deleted it)
    try {
      const client = getNativeClient()
      const ping = await client.ping()
      // Refresh metadata from fresh ping so modal gets current installInfo,
      // and ensure status reflects the verified connection.
      setStatus('connected')
      setVersion(ping.version || null)
      setInstallInfo(ping.installInfo)
      await loadImapAccounts()
      setShowUninstall(true)
    } catch {
      // Bridge is already gone, update state
      setStatus('disconnected')
      setVersion(null)
      setInstallInfo(undefined)
    }
  }, [loadImapAccounts])

  const handleUninstallComplete = useCallback(() => {
    setShowUninstall(false)
    // Show "Checking..." while we verify the uninstall.
    // The Done button was clicked, but the user may not have actually deleted
    // the native app. Wait 1500ms for Chrome's native-host registration cache
    // to clear (empirical; ping() can return stale success for ~1s after
    // uninstall on Windows), then re-check. If the bridge is really gone, the
    // ping fails and disconnected state stays. Tracked in recheckTimerRef so
    // we can clear it on unmount.
    setStatus('checking')
    setVersion(null)
    setInstallInfo(undefined)
    if (recheckTimerRef.current !== null) clearTimeout(recheckTimerRef.current)
    recheckTimerRef.current = setTimeout(() => {
      recheckTimerRef.current = null
      void checkBridge()
    }, 1500)
  }, [checkBridge])

  const handleUninstallCancel = useCallback(() => {
    setShowUninstall(false)
    // User cancelled: do a real check (bridge may or may not still be there)
    void checkBridge()
  }, [checkBridge])

  return (
    <>
      <div className="bridge-status-row">
        <div className="bridge-status-row__info">
          <span className="bridge-status-row__label">InboxBridge</span>
          <span className="bridge-status-row__detail">
            {t('settings_bridge_description')}
          </span>
        </div>

        {status === 'checking' && (
          <span className="bridge-status-row__status bridge-status-row__status--checking">
            {t('settings_bridge_checking')}
          </span>
        )}

        {status === 'connected' && (
          <>
            <span className="bridge-status-row__status bridge-status-row__status--ok">
              <span className="bridge-status-row__dot bridge-status-row__dot--ok" />
              {version ? `v${version}` : t('settings_bridge_connected')}
            </span>
            <button
              className="bridge-status-row__btn bridge-status-row__btn--danger"
              type="button"
              onClick={handleUninstallClick}
            >
              {t('settings_bridge_uninstall')}
            </button>
          </>
        )}

        {status === 'disconnected' && (
          <span className="bridge-status-row__status bridge-status-row__status--off">
            <span className="bridge-status-row__dot bridge-status-row__dot--off" />
            {t('settings_bridge_not_installed')}
          </span>
        )}
      </div>

      {showUninstall && (
        <UninstallBridgeModal
          imapAccountIds={imapAccountIds}
          installInfo={installInfo}
          onComplete={handleUninstallComplete}
          onCancel={handleUninstallCancel}
        />
      )}
    </>
  )
}
