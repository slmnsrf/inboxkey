/**
 * CodeCard Component
 *
 * Displays a single verification code with copy button.
 */

import React, { useMemo, useState } from 'react'
import { t, timeAgoShort } from '@/lib/i18n'
import type { PopupCacheCode } from '@/shared/popup-messages'

interface CodeCardProps {
  item: PopupCacheCode
  onCopy: (code: string) => Promise<void>
}

export function CodeCard({ item, onCopy }: CodeCardProps) {
  const [copying, setCopying] = useState(false)

  const handleCopy = async () => {
    setCopying(true)
    try {
      await onCopy(item.code)
    } finally {
      setTimeout(() => setCopying(false), 2000)
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
    <article className="code-card" data-kind="code">
      <div className="code-card__body">
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
          <dt className="meta-grid__label">{t('label_code')}</dt>
          <dd className="meta-grid__value meta-grid__value--code">
            <button
              type="button"
              className={`code-pill ${copying ? 'code-pill--copied' : ''}`}
              data-code={item.code}
              onClick={handleCopy}
              disabled={copying}
              aria-label={t('aria_copy_code', [item.code, meta.from || item.source])}
            >
              <span className="code-pill__text">{item.code}</span>
            </button>
          </dd>
        </dl>
      </div>
      <div className="code-card__actions">
        <button
          type="button"
          className={`action-button action-button--primary ${copying ? 'action-button--success' : ''}`}
          onClick={handleCopy}
          disabled={copying}
          data-code={item.code}
        >
          {copying ? t('button_copied') : t('button_copy')}
        </button>
      </div>
    </article>
  )
}
