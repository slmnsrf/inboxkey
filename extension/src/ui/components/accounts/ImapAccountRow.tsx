import React, { useMemo } from 'react'
import { t } from '@/lib/i18n'
import type { ImapAccountRow } from './types'
import { getAccountStatus } from './account-status'

interface ImapAccountRowProps {
  account: ImapAccountRow
  onReconnect?: (id: string) => void
  onRemove?: (id: string) => void
  disabled?: boolean
}

export function ImapAccountRowComponent({
  account,
  onReconnect,
  onRemove,
  disabled = false,
}: ImapAccountRowProps) {
  const handleReconnect = () => {
    if (disabled || !onReconnect) return
    onReconnect(account.id)
  }

  const handleRemove = () => {
    if (disabled || !onRemove) return
    onRemove(account.id)
  }

  const { status, label: statusLabel } = useMemo(
    () =>
      getAccountStatus({
        lastSyncedAt: account.lastSyncedAt,
        lastSyncError: account.lastSyncError,
        isSyncing: account.isSyncing,
      }),
    [account.lastSyncedAt, account.lastSyncError, account.isSyncing]
  )

  return (
    <div className="imap-row">
      <div className="imap-meta">
        <span className="imap-email">
          <span
            className={`status-dot status-dot--${status}`}
            role="status"
            aria-label={statusLabel}
          />
          {account.email}
        </span>
        <span className="imap-subtext">
          {account.host
            ? t('accounts_imap_host', account.host)
            : t('accounts_imap_generic_host')}
        </span>
        {account.lastSyncedLabel && (
          <span className="imap-subtext">
            {t('accounts_last_synced', account.lastSyncedLabel)}
          </span>
        )}
      </div>
      <div className="imap-actions">
        <button
          type="button"
          className="btn btn--secondary"
          onClick={handleReconnect}
          disabled={disabled}
          aria-label={t('aria_reconnect_imap', [account.email])}
        >
          {t('accounts_reconnect')}
        </button>
        <button
          type="button"
          className="btn btn--danger"
          onClick={handleRemove}
          disabled={disabled}
          aria-label={t('aria_remove_imap', [account.email])}
        >
          {t('accounts_remove_button')}
        </button>
      </div>
    </div>
  )
}
