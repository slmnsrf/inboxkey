/**
 * RecentItemsSection Component
 *
 * Unified section that displays both verification codes and magic links
 * in a single priority-sorted list. Solves the empty section problem where
 * only one type of item arrives but wastes space.
 */

import React from 'react'
import { t } from '@/lib/i18n'
import { CodeCard } from './CodeCard'
import { LinkCard } from './LinkCard'
import { EmptyState } from './EmptyState'
import type { PopupItem, PopupCacheCode, PopupCacheMagicLink } from '@/shared/popup-messages'

interface RecentItemsSectionProps {
  items: PopupItem[]
  onCopyCode: (code: string) => Promise<void>
  onOpenLink: (link: PopupCacheMagicLink) => Promise<void>
}

export function RecentItemsSection({ items, onCopyCode, onOpenLink }: RecentItemsSectionProps) {
  if (items.length === 0) {
    return (
      <section className="popup-section" aria-label={t('section_recent_items')}>
        <h2 className="popup-section__title">{t('section_recent_items')}</h2>
        <EmptyState variant="no-items" />
      </section>
    )
  }

  return (
    <section className="popup-section" aria-label={t('section_recent_items')}>
      <h2 className="popup-section__title">{t('section_recent_items')}</h2>
      <div className="card-list card-list--unified">
        {items.map((item, i) => {
          if (item.kind === 'code') {
            // Convert PopupItem (V2) to PopupCacheCode (V1) for CodeCard
            const legacyCode: PopupCacheCode = {
              code: item.code,
              source: item.source,
              receivedAt: item.receivedAt,
              usedAt: item.usedAt,
              providerId: item.providerId === 'imap-bridge' ? undefined : item.providerId,
            }
            return <CodeCard key={`${item.code}-${i}`} item={legacyCode} onCopy={onCopyCode} />
          } else {
            // Convert PopupItem (V2) to PopupCacheMagicLink (V1) for LinkCard
            const legacyLink: PopupCacheMagicLink = {
              url: item.url,
              type: item.linkType,
              source: item.source,
              receivedAt: item.receivedAt,
              openedAt: item.openedAt,
              providerId: item.providerId === 'imap-bridge' ? undefined : item.providerId,
            }
            return <LinkCard key={`${item.url}-${i}`} item={legacyLink} onOpen={onOpenLink} />
          }
        })}
      </div>
    </section>
  )
}
