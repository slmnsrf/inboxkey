/**
 * BridgeStatusRow Component
 *
 * Settings tab row showing InboxBridge connection status with version
 * and Uninstall action. Placed after Automation, before Appearance.
 */

import React, { useEffect, useState, useCallback } from 'react'
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

  const handleUninstallClick = useCallback(async () => {
    // Re-check bridge before opening modal (user may have already deleted it)
    try {
      const client = getNativeClient()
      const ping = await client.ping()
      // Refresh metadata from fresh ping so modal gets current installInfo
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

  const handleModalClose = useCallback(() => {
    setShowUninstall(false)
    // Always do a real check after the modal closes (whether completed or cancelled)
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
          onComplete={handleModalClose}
          onCancel={handleModalClose}
        />
      )}
    </>
  )
}
