/**
 * Header Component
 *
 * Displays InboxKey title, mailbox count, last sync time, and settings button.
 */

import React from 'react'
import { t, plural, timeAgo } from '@/lib/i18n'

const SettingsIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
    <path d="M17.43 10.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C12.46.19 12.25 0 12 0h-4c-.25 0-.46.19-.49.44l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.25.24.44.49.44h4c.25 0 .46-.19.49-.44l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM10 13c-1.65 0-3-1.35-3-3s1.35-3 3-3 3 1.35 3 3-1.35 3-3 3z"/>
  </svg>
)

const RefreshIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
  </svg>
)

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
          <h1 className="popup-title">{t('popup_title')}</h1>
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
              <RefreshIcon />
            </button>
          )}
          <button
            type="button"
            onClick={() => chrome.runtime.openOptionsPage()}
            className="icon-button icon-button--settings"
            aria-label={t('aria_open_settings')}
            title={t('aria_open_settings')}
          >
            <SettingsIcon />
          </button>
        </div>
      </div>
    </header>
  )
}
