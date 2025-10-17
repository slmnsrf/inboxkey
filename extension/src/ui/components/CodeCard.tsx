/**
 * CodeCard Component
 *
 * Displays a single verification code with copy button.
 */

import React, { useState } from 'react'
import { t } from '@/lib/i18n'
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

  const formatTime = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000)
    if (seconds < 60) return t('time_just_now')
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    return `${hours}h ago`
  }

  // Parse sender and subject from source ("from@email.com - Subject")
  const parseSource = (source: string) => {
    const parts = source.split(' - ')
    return {
      sender: parts[0] || source,
      subject: parts.slice(1).join(' - ') || ''
    }
  }

  const { sender, subject } = parseSource(item.source)

  return (
    <div className="code-card">
      <div className="code-header">
        <div className="code-display">{item.code}</div>
        {item.providerName && (
          <span className="provider-badge" data-provider={item.providerId}>
            {item.providerName}
          </span>
        )}
      </div>
      <div className="code-meta">
        <div className="code-source-sender">{sender}</div>
        {subject && <div className="code-source-subject">{subject}</div>}
        <div className="code-time">{formatTime(item.receivedAt)}</div>
      </div>
      <button
        className={`code-copy-button ${copying ? 'code-copy-button--copied' : ''}`}
        onClick={handleCopy}
        disabled={copying}
        aria-label={t('aria_copy_code', [item.code, item.source])}
      >
        {copying ? t('button_copied') : t('button_copy')}
      </button>
    </div>
  )
}
