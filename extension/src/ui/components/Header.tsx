/**
 * Header Component
 *
 * Displays InboxKey title, mailbox count, last sync time, and settings button.
 * Uses Lucide icons for consistency.
 */

import React from 'react'
import { Settings, RefreshCw } from 'lucide-react'
import { t, plural, timeAgo } from '@/lib/i18n'

interface HeaderProps {
  mailboxCount: number
  lastSync: number
  onSync?: () => void
  isSyncing?: boolean
  justSynced?: boolean
}

export function Header({
  mailboxCount,
  lastSync,
  onSync,
  isSyncing = false,
  justSynced = false
}: HeaderProps) {
  const mailboxLabel = plural('popup_mailbox', 'popup_mailboxes', mailboxCount)
  const syncLabel = isSyncing
    ? t('popup_syncing')
    : t('popup_synced_at', [timeAgo(lastSync)])

  return (
    <header className="popup-header">
      <div className="popup-header__row">
        <div className="popup-header__title-group">
          <h1 className="popup-title">
            <img
              src={chrome.runtime.getURL('assets/icon.svg')}
              alt=""
              className="popup-title__logo"
              width={20}
              height={20}
            />
            {t('popup_title')}
          </h1>
          <div className="popup-header__pills" role="status">
            <span className="header-pill" data-testid="mailbox-pill">
              {mailboxLabel}
            </span>
            <span
              className={`header-pill ${justSynced ? 'header-pill--success' : ''}`}
              data-testid="sync-pill"
              aria-live="polite"
              data-syncing={isSyncing}
            >
              {syncLabel}
            </span>
          </div>
        </div>
        <div className="popup-header__actions">
          {onSync && (
            <button
              type="button"
              onClick={onSync}
              className={`icon-button icon-button--refresh ${isSyncing ? 'is-active' : ''}`}
              aria-label={t('aria_manual_sync')}
              title={t('aria_manual_sync')}
              disabled={isSyncing}
            >
              <RefreshCw size={18} />
            </button>
          )}
          <button
            type="button"
            onClick={() => chrome.runtime.openOptionsPage()}
            className="icon-button icon-button--settings"
            aria-label={t('aria_open_settings')}
            title={t('aria_open_settings')}
          >
            <Settings size={20} />
          </button>
        </div>
      </div>
    </header>
  )
}
