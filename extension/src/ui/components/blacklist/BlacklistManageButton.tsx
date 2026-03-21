/**
 * BlacklistManageButton Component
 *
 * Styled card in settings that shows ignored site count and opens the
 * blacklist management modal. Shows dashed empty state when no sites are ignored.
 */

import React, { useState, useEffect } from 'react'
import { StorageFactory } from '@/lib/storage/storage-factory'
import { t } from '@/lib/i18n'
import { Ban } from 'lucide-react'

export interface BlacklistManageButtonProps {
  onClick: () => void
}

export function BlacklistManageButton({ onClick }: BlacklistManageButtonProps) {
  const [ignoredCount, setIgnoredCount] = useState(0)

  useEffect(() => {
    const loadCount = async () => {
      try {
        const storage = await StorageFactory.create()
        const settings = await storage.getSettings()
        const domains = settings.blacklistedDomains?.length || 0
        const urls = settings.blacklistedUrls?.length || 0
        setIgnoredCount(domains + urls)
      } catch (error) {
        console.error('[BlacklistManageButton] Failed to load blacklist count:', error)
      }
    }
    loadCount()
  }, [])

  const isEmpty = ignoredCount === 0

  return (
    <div className={`blacklist-card${isEmpty ? ' blacklist-card--empty' : ''}`}>
      <div className="blacklist-card__row">
        <div className="blacklist-card__icon">
          <Ban size={18} />
        </div>
        <div className="blacklist-card__info">
          <div className="blacklist-card__label-row">
            <span className="blacklist-card__label">
              {t('settings_blacklist_label')}
            </span>
            {!isEmpty && (
              <span className="blacklist-card__count">{ignoredCount}</span>
            )}
          </div>
          {isEmpty ? (
            <p className="blacklist-card__empty-text">
              {t('settings_blacklist_empty')}
            </p>
          ) : (
            <p className="blacklist-card__description">
              {t('settings_blacklist_description')}
            </p>
          )}
        </div>
        <div className="blacklist-card__action">
          <button
            type="button"
            className="btn btn--secondary"
            onClick={onClick}
            data-testid="blacklist-manage-button"
          >
            {t('settings_blacklist_manage_button')}
          </button>
        </div>
      </div>
    </div>
  )
}
