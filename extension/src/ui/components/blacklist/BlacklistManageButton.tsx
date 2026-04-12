/**
 * BlacklistManageButton Component
 *
 * Inline display showing the count of excluded sites with a "Manage" button
 * that opens the blacklist management modal.
 */

import React, { useState, useEffect } from 'react'
import { StorageFactory } from '@/lib/storage/storage-factory'
import { t } from '@/lib/i18n'

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
        console.warn('[BlacklistManageButton] Failed to load blacklist count:', error)
      }
    }
    loadCount()
  }, [])

  const isEmpty = ignoredCount === 0

  return (
    <div className={`excluded${isEmpty ? ' excluded--empty' : ''}`}>
      {isEmpty ? (
        <p className="excluded__empty-text">
          {t('settings_blacklist_empty')}
        </p>
      ) : (
        <div className="excluded__footer">
          <span className="excluded__count">
            {t('settings_blacklist_description')}
          </span>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={onClick}
            data-testid="blacklist-manage-button"
          >
            {t('settings_blacklist_manage_button')} ({ignoredCount})
          </button>
        </div>
      )}
    </div>
  )
}
