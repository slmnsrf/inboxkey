/**
 * BlacklistManageButton Component
 *
 * Button in settings that opens the blacklist management modal.
 * Simple, accessible button component.
 */

import React from 'react'
import { t } from '@/lib/i18n'

export interface BlacklistManageButtonProps {
  onClick: () => void
}

export function BlacklistManageButton({ onClick }: BlacklistManageButtonProps) {
  return (
    <div className="setting-row">
      <div className="setting-row__info">
        <p className="setting-row__label">{t('settings_blacklist_label')}</p>
        <p className="setting-row__description">
          {t('settings_blacklist_description')}
        </p>
      </div>
      <div className="setting-row__control">
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
  )
}
