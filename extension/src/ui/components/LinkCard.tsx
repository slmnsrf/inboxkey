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
  const [justOpened, setJustOpened] = useState(false)

  const handleOpen = async () => {
    setOpening(true)
    try {
      await onOpen(item)
      setJustOpened(true)
      setTimeout(() => setJustOpened(false), 1500)
    } catch (err) {
      // Error handled by parent
    } finally {
      setTimeout(() => setOpening(false), 200)
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

  const linkDomain = (() => {
    try { return new URL(item.url).hostname } catch { return item.url }
  })()

  return (
    <article className="item-card" data-kind="link" aria-labelledby={`link-${item.id}-from`}>
      <div className="item-card__top">
        <span className="provider-badge">{meta.from.split('@')[1] || meta.from}</span>
        <span className="time-pill" aria-label={t('aria_received_time', [timeLabel])}>
          {timeLabel}
        </span>
      </div>
      <div className="item-card__info">
        <span id={`link-${item.id}-from`} className="item-card__sender" title={meta.from}>
          {meta.from}
        </span>
        <span className="item-card__subject" title={meta.subject || undefined}>
          {meta.subject || t('value_not_available')}
        </span>
      </div>
      <div className="item-card__actions">
        <span className="item-card__link-url" title={item.url}>{linkDomain}</span>
        <button
          type="button"
          className={`action-button action-button--secondary ${opening ? 'action-button--loading' : ''} ${justOpened ? 'action-button--success' : ''}`}
          onClick={handleOpen}
          disabled={opening || justOpened}
          aria-label={t('aria_open_link_simple', [meta.subject || meta.from || item.url])}
        >
          {opening ? t('button_opening') : justOpened ? t('button_opened') : t('button_open')}
        </button>
      </div>
    </article>
  )
}
