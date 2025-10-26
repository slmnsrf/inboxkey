import React, { useMemo, useState } from 'react'
import { t } from '@/lib/i18n'
import { getAccountStatus } from './account-status'
import { Modal } from '../Modal'

interface GmailAccountRowProps {
  email: string
  lastSyncedLabel?: string
  lastSyncedAt?: number
  tokenExpiresAt?: number
  isSyncing?: boolean
  lastSyncError?: string
  onDisconnect: () => void
  disabled?: boolean
}

export function GmailAccountRow({
  email,
  lastSyncedLabel,
  lastSyncedAt,
  tokenExpiresAt,
  isSyncing,
  lastSyncError,
  onDisconnect,
  disabled = false,
}: GmailAccountRowProps) {
  const [showLimitModal, setShowLimitModal] = useState(false)

  const handleDisconnect = () => {
    if (disabled) return
    onDisconnect()
  }

  const { status, label: statusLabel } = useMemo(
    () =>
      getAccountStatus({
        tokenExpiresAt,
        lastSyncedAt,
        lastSyncError,
        isSyncing,
      }),
    [tokenExpiresAt, lastSyncedAt, lastSyncError, isSyncing]
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
          {email}
        </span>
        {lastSyncedLabel && (
          <span className="imap-subtext">
            {t('accounts_last_synced', lastSyncedLabel)}
          </span>
        )}
        <span className="imap-subtext" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
          <span aria-hidden="true">ℹ️</span>
          {t('accounts_microcopy_gmail_limit')}
          <button
            type="button"
            onClick={() => setShowLimitModal(true)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-primary)',
              cursor: 'pointer',
              padding: 0,
              textDecoration: 'underline',
              fontSize: 'inherit',
            }}
            aria-label="Learn why only one Gmail account is allowed"
          >
            {t('accounts_gmail_limit_learn_why')}
          </button>
        </span>
      </div>
      <div className="imap-actions">
        <button
          type="button"
          className="btn btn--danger"
          onClick={handleDisconnect}
          disabled={disabled}
          aria-label={t('aria_disconnect_gmail', [email])}
        >
          {t('accounts_disconnect')}
        </button>
      </div>

      <Modal
        isOpen={showLimitModal}
        onClose={() => setShowLimitModal(false)}
        title={t('accounts_gmail_limit_modal_title')}
        size="medium"
      >
        <p style={{ whiteSpace: 'pre-line', lineHeight: '1.6' }}>
          {t('accounts_gmail_limit_modal_body')}
        </p>
      </Modal>
    </div>
  )
}
