import React from 'react'
import { formatProvider, t } from '@/lib/i18n'
import type { RecentItem } from './types'

interface RecentEmailsSectionProps {
  items: RecentItem[]
  onCopyCode?: (item: RecentItem) => Promise<void>
  onOpenLink?: (item: RecentItem) => Promise<void>
  loading?: boolean
}

export function RecentEmailsSection({
  items,
  onCopyCode,
  onOpenLink,
  loading = false,
}: RecentEmailsSectionProps) {
  const visibleItems = items.slice(0, 5)
  const disabled = loading

  return (
    <section className="accounts-section" aria-labelledby="recent-emails-title">
      <div className="accounts-section__header">
        <h3 id="recent-emails-title" className="accounts-section__title">
          {t('accounts_recent_title')}
        </h3>
      </div>

      <p className="accounts-section__description">
        {t('accounts_recent_description')}
      </p>

      {disabled && (
        <div className="empty-state" role="status">
          {t('accounts_recent_loading')}
        </div>
      )}

      {!disabled && visibleItems.length === 0 && (
        <div className="empty-state" role="note">
          {t('accounts_recent_empty')}
        </div>
      )}

      {!disabled && visibleItems.length > 0 && (
        <div className="recent-list">
          {visibleItems.map((item) => {
            const providerLabel = item.provider
              ? formatProvider(item.provider)
              : t('value_not_available')

            return (
              <article key={item.id} className="recent-card">
                <header className="recent-card__meta">
                  <span>{providerLabel}</span>
                  <span aria-label={t('aria_received_time', [item.receivedLabel])}>
                    {item.receivedLabel}
                  </span>
                </header>
                <h4 className="recent-card__title">
                  {item.subject || t('value_not_available')}
                </h4>
                <p className="accounts-section__description">
                  {item.from || t('value_not_available')}
                </p>
                <div className="recent-actions">
                  {item.kind === 'code' && item.code && (
                    <>
                      <span className="recent-code">{item.code}</span>
                      <button
                        type="button"
                        className="btn btn--secondary"
                        onClick={() => onCopyCode?.(item)}
                      >
                        {t('button_copy')}
                      </button>
                    </>
                  )}
                  {item.kind === 'link' && item.url && (
                    <button
                      type="button"
                      className="btn btn--primary"
                      onClick={() => onOpenLink?.(item)}
                    >
                      {t('button_open')}
                    </button>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
