import React from 'react'
import { Inbox, Copy, ExternalLink } from 'lucide-react'
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
        <h3 id="recent-emails-title" className="accounts-section__title" style={{ fontSize: 'var(--font-size-lg)' }}>
          {t('accounts_recent_title')}
        </h3>
      </div>

      {disabled && (
        <div className="empty-state" role="status">
          {t('accounts_recent_loading')}
        </div>
      )}

      {!disabled && visibleItems.length === 0 && (
        <div className="empty-state" role="note">
          <div className="empty-state__icon">
            <Inbox size={24} aria-hidden="true" />
          </div>
          <p>{t('accounts_recent_empty')}</p>
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
                        className="btn btn--primary btn--sm"
                        onClick={() => onCopyCode?.(item)}
                      >
                        <Copy size={13} aria-hidden="true" />
                        {t('button_copy')}
                      </button>
                    </>
                  )}
                  {item.kind === 'link' && item.url && (
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      onClick={() => onOpenLink?.(item)}
                    >
                      <ExternalLink size={13} aria-hidden="true" />
                      {t('button_open_link')}
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
