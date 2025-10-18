/**
 * LinkCard Component
 *
 * Displays a single magic link with open button.
 */

import React, { useMemo, useState } from 'react'
import { t, timeAgoShort } from '@/lib/i18n'
import type { PopupCacheMagicLink } from '@/shared/popup-messages'

interface LinkCardProps {
  item: PopupCacheMagicLink
  onOpen: (link: PopupCacheMagicLink) => Promise<void>
}

export function LinkCard({ item, onOpen }: LinkCardProps) {
  const [opening, setOpening] = useState(false)

  const handleOpen = async () => {
    setOpening(true)
    try {
      await onOpen(item)
    } finally {
      setTimeout(() => setOpening(false), 2000)
    }
  }

  const meta = useMemo(() => {
    const from = item.from ?? item.source?.split(' - ')[0] ?? ''
    const subjectParts = item.subject
      ? [item.subject]
      : item.source?.split(' - ').slice(1)
    const subject = subjectParts?.length ? subjectParts.join(' - ') : ''
    return {
      from,
      to: item.to ?? undefined,
      subject,
    }
  }, [item.from, item.subject, item.source, item.to])

  const timeLabel = timeAgoShort(item.receivedAt)

  return (
    <article className="link-card" data-kind="link">
      <div className="link-card__body">
        <div className="card-head">
          <span className="time-pill" aria-label={t('aria_received_time', [timeLabel])}>
            {timeLabel}
          </span>
        </div>
        <dl className="meta-grid">
          <dt className="meta-grid__label">{t('label_from')}</dt>
          <dd className="meta-grid__value" title={meta.from}>
            {meta.from}
          </dd>
          <dt className="meta-grid__label">{t('label_to')}</dt>
          <dd className="meta-grid__value" title={meta.to || undefined}>
            {meta.to ?? t('value_not_available')}
          </dd>
          <dt className="meta-grid__label">{t('label_subject')}</dt>
          <dd className="meta-grid__value" title={meta.subject || undefined}>
            {meta.subject || t('value_not_available')}
          </dd>
        </dl>
      </div>
      <div className="link-card__actions">
        <button
          type="button"
          className={`action-button action-button--secondary ${opening ? 'action-button--loading' : ''}`}
          onClick={handleOpen}
          disabled={opening}
          aria-label={t('aria_open_link_simple', [meta.subject || meta.from || item.url])}
        >
          {opening ? t('button_opening') : t('button_open')}
        </button>
      </div>
    </article>
  )
}
