import React from 'react'
import { t } from '@/lib/i18n'
import type { ImapAccountRow } from './types'

interface ImapAccountsSectionProps {
  accounts: ImapAccountRow[]
  limit?: number
  onAdd?: () => void
  onReconnect?: (id: string) => void
  onRemove?: (id: string) => void
  isLocked?: boolean
  disabled?: boolean
}

export function ImapAccountsSection({
  accounts,
  limit = 10,
  onAdd,
  onReconnect,
  onRemove,
  isLocked = false,
  disabled = true,
}: ImapAccountsSectionProps) {
  const countLabel = t('accounts_imap_counter', [
    String(Math.min(accounts.length, limit)),
    String(limit),
  ])

  const handleAdd = () => {
    if (disabled || !onAdd) return
    onAdd()
  }

  const actionDisabled = disabled || isLocked
  const addDisabled = actionDisabled || accounts.length >= limit

  return (
    <section className="accounts-section" aria-labelledby="imap-accounts-title">
      <div className="accounts-section__header">
        <div className="imap-header">
          <h3 id="imap-accounts-title" className="accounts-section__title">
            {t('accounts_imap_title')}
          </h3>
          <span className="imap-counter" aria-live="polite">
            {countLabel}
          </span>
        </div>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={handleAdd}
          disabled={addDisabled}
          aria-label={t('accounts_imap_add')}
        >
          {t('accounts_imap_add')}
        </button>
      </div>

      <p className="accounts-section__description">
        {t('accounts_imap_description')}
      </p>

      {accounts.length === 0 ? (
        <div className="empty-state" role="note">
          {disabled
            ? t('accounts_imap_placeholder')
            : t('accounts_imap_empty')}
        </div>
      ) : (
        <div className="imap-list">
          {accounts.map((account) => (
            <div key={account.id} className="imap-row">
              <div className="imap-meta">
                <span className="imap-email">{account.email}</span>
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
                  onClick={() => onReconnect?.(account.id)}
                  disabled={actionDisabled}
                >
                  {t('accounts_reconnect')}
                </button>
                <button
                  type="button"
                  className="btn btn--danger"
                  onClick={() => onRemove?.(account.id)}
                  disabled={actionDisabled}
                >
                  {t('accounts_remove_button')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
