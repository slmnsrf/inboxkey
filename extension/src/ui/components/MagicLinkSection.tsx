/**
 * MagicLinkSection Component
 *
 * Displays a list of recent magic links or empty state.
 */

import React from 'react'
import { t } from '@/lib/i18n'
import { LinkCard } from './LinkCard'
import { EmptyState } from './EmptyState'
import type { PopupCacheMagicLink } from '@/shared/popup-messages'

interface MagicLinkSectionProps {
  links: PopupCacheMagicLink[]
  onOpen: (link: PopupCacheMagicLink) => Promise<void>
}

export function MagicLinkSection({ links, onOpen }: MagicLinkSectionProps) {
  if (links.length === 0) {
    return (
      <section className="popup-section" aria-label={t('section_magic_links')}>
        <h2 className="popup-section__title">{t('section_magic_links')}</h2>
        <EmptyState variant="no-links" />
      </section>
    )
  }

  return (
    <section className="popup-section" aria-label={t('section_magic_links')}>
      <h2 className="popup-section__title">{t('section_magic_links')}</h2>
      <div className="card-list card-list--links">
        {links.map((item, i) => (
          <LinkCard key={`${item.url}-${i}`} item={item} onOpen={onOpen} />
        ))}
      </div>
    </section>
  )
}
