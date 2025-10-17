/**
 * LinkCard Component
 *
 * Displays a single magic link with open button.
 */

import React, { useState } from 'react'
import { t } from '@/lib/i18n'
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

  const getDomain = (url: string) => {
    try {
      return new URL(url).hostname
    } catch {
      return url
    }
  }

  const getTypeLabel = (type: string) => {
    const typeKeys: Record<string, string> = {
      login: 'link_type_login',
      verify: 'link_type_verify',
      reset: 'link_type_reset',
    }
    const key = typeKeys[type]
    return key ? t(key) : type
  }

  const domain = getDomain(item.url)
  const typeLabel = getTypeLabel(item.type)

  return (
    <div className="link-card">
      <div className="link-info">
        <div className="link-header">
          <span className={`link-type link-type--${item.type}`}>
            {typeLabel}
          </span>
          {item.providerName && (
            <span className="provider-badge" data-provider={item.providerId}>
              {item.providerName}
            </span>
          )}
        </div>
        <span className="link-domain">{domain}</span>
      </div>
      <button
        className={`link-open-button ${opening ? 'link-open-button--opened' : ''}`}
        onClick={handleOpen}
        disabled={opening}
        aria-label={t('aria_open_link', [typeLabel, domain])}
      >
        {opening ? t('button_opened') : t('button_open')}
      </button>
    </div>
  )
}
