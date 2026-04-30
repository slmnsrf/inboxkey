/**
 * CodeListSection Component
 *
 * Displays a list of recent verification codes or empty state.
 */

import React from 'react'
import { t } from '@/lib/i18n'
import { CodeCard } from './CodeCard'
import { EmptyState } from './EmptyState'
import type { PopupCacheCode } from '@/shared/popup-messages'

interface CodeListSectionProps {
  codes: PopupCacheCode[]
  onCopy: (code: string) => Promise<void>
}

export function CodeListSection({ codes, onCopy }: CodeListSectionProps) {
  if (codes.length === 0) {
    return (
      <section className="popup-section" aria-label={t('section_recent_codes')}>
        <h2 className="popup-section__title">{t('section_recent_codes')}</h2>
        <EmptyState variant="no-codes" />
      </section>
    )
  }

  return (
    <section className="popup-section" aria-label={t('section_recent_codes')}>
      <h2 className="popup-section__title">{t('section_recent_codes')}</h2>
      <div className="card-list card-list--codes">
        {codes.map((item, i) => (
          <CodeCard key={`${item.code}-${i}`} item={item} onCopy={onCopy} />
        ))}
      </div>
    </section>
  )
}
