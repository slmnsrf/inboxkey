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
      senderDomain: item.senderETLD,
    }
  }, [item.from, item.subject, item.source, item.to, item.senderETLD])

  const timeLabel = timeAgoShort(item.receivedAt)

  // Debug scoring display (enabled via localStorage: inboxkey.debug.scoring = "true")
  const showDebugScoring = typeof window !== 'undefined' &&
    localStorage.getItem('inboxkey.debug.scoring') === 'true'

  return (
    <article className="item-card" data-kind="code" aria-labelledby={`code-${item.id}-from`}>
      <div className="item-card__top">
        {meta.senderDomain && (
          <span className="provider-badge">{meta.senderDomain}</span>
        )}
        <span className="time-pill" aria-label={t('aria_received_time', [timeLabel])}>
          {timeLabel}
        </span>
      </div>
      <div className="item-card__info">
        <span id={`code-${item.id}-from`} className="item-card__sender" title={meta.from}>
          {meta.from}
        </span>
        <span className="item-card__subject" title={meta.subject || undefined}>
          {meta.subject || t('value_not_available')}
        </span>
      </div>
      <div className="item-card__actions">
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
        <button
          type="button"
          className={`copy-button ${copying ? 'copy-button--success' : ''}`}
          onClick={handleCopy}
          disabled={copying}
          data-code={item.code}
          aria-label={t('aria_copy_code', [item.code, meta.from || item.source])}
        >
          {copying ? t('button_copied') : t('button_copy')}
        </button>
      </div>
      {showDebugScoring && item.totalScore !== undefined && (
        <div className="score-breakdown">
          <div className="score-breakdown__title">Debug Scoring</div>
          <div className="score-breakdown__grid">
            <span>Total:</span><span>{item.totalScore.toFixed(3)}</span>
            {item.domainAffinity !== undefined && (
              <>
                <span>Domain:</span><span>{item.domainAffinity.toFixed(3)}</span>
              </>
            )}
            {item.recencyScore !== undefined && (
              <>
                <span>Recency:</span><span>{item.recencyScore.toFixed(3)}</span>
              </>
            )}
            {item.sessionBoost !== undefined && item.sessionBoost > 0 && (
              <>
                <span>Session:</span><span>+{item.sessionBoost.toFixed(3)}</span>
              </>
            )}
            {item.shapeScore !== undefined && item.shapeScore !== 0 && (
              <>
                <span>Shape:</span><span>{item.shapeScore > 0 ? '+' : ''}{item.shapeScore.toFixed(3)}</span>
              </>
            )}
          </div>
        </div>
      )}
    </article>
  )
}
