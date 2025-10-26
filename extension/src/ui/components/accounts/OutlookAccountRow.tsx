import React from 'react'
import { t } from '@/lib/i18n'
import type { OutlookAccountRow } from './types'

interface OutlookAccountRowProps {
  account: OutlookAccountRow
  onReconnect: (id: string) => void
  onRemove: (id: string) => void
  disabled?: boolean
}

export function OutlookAccountRowComponent({
  account,
  onReconnect,
  onRemove,
  disabled = false,
}: OutlookAccountRowProps) {
  const handleReconnect = () => {
    if (disabled) return
    onReconnect(account.id)
  }

  const handleRemove = () => {
    if (disabled) return
    onRemove(account.id)
  }

  return (
    <div className="imap-row">
      <div className="imap-meta">
        <span className="imap-email">{account.email}</span>
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
          aria-label={t('aria_reconnect_outlook', [account.email])}
        >
          {t('accounts_reconnect')}
        </button>
        <button
          type="button"
          className="btn btn--danger"
          onClick={handleRemove}
          disabled={disabled}
          aria-label={t('aria_remove_outlook', [account.email])}
        >
          {t('accounts_remove_button')}
        </button>
      </div>
    </div>
  )
}
