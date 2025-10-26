import React from 'react'
import { t } from '@/lib/i18n'
import type { OutlookAccountRow } from './types'
import { OutlookAccountRowComponent } from './OutlookAccountRow'

interface OutlookAccountsSectionProps {
  accounts: OutlookAccountRow[]
  limit?: number
  onAdd: () => void
  onReconnect: (id: string) => void
  onRemove: (id: string) => void
  disabled?: boolean
}

export function OutlookAccountsSection({
  accounts,
  limit = 10,
  onAdd,
  onReconnect,
  onRemove,
  disabled = false,
}: OutlookAccountsSectionProps) {
  const countLabel = t('accounts_outlook_counter', String(accounts.length))
  const addDisabled = disabled || accounts.length >= limit

  return (
    <section className="accounts-section" aria-labelledby="outlook-accounts-title">
      <div className="accounts-section__header">
        <div className="imap-header">
          <h3 id="outlook-accounts-title" className="accounts-section__title">
            {t('accounts_outlook_title')}
          </h3>
          <span className="imap-counter">
            {countLabel}
          </span>
        </div>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={onAdd}
          disabled={addDisabled}
          aria-label={t('accounts_outlook_add')}
        >
          {t('accounts_outlook_add')}
        </button>
      </div>

      <p className="accounts-section__description">
        {t('accounts_outlook_description')}
      </p>

      {accounts.length === 0 ? (
        <div className="empty-state" role="note">
          {t('accounts_outlook_empty')}
        </div>
      ) : (
        <div className="imap-list outlook-list">
          {accounts.map((account) => (
            <OutlookAccountRowComponent
              key={account.id}
              account={account}
              onReconnect={onReconnect}
              onRemove={onRemove}
              disabled={disabled}
            />
          ))}
        </div>
      )}
    </section>
  )
}
