import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, Plus, Server, X } from 'lucide-react'

import { t } from '@/lib/i18n'
import { ProviderLogo } from './ProviderLogo'

type Provider = 'gmail' | 'imap-bridge' | 'google-messages'

interface AddAccountDropdownProps {
  onSelect: (provider: Provider) => void
  disabled?: boolean
  imapDisabled?: boolean
  imapDisabledReason?: string
  gmailConnected?: boolean
  gmConnected?: boolean
}

export function AddAccountDropdown({
  onSelect,
  disabled,
  imapDisabled,
  imapDisabledReason,
  gmailConnected,
  gmConnected,
}: AddAccountDropdownProps) {
  const [open, setOpen] = useState(false)
  const [showGmailLimitModal, setShowGmailLimitModal] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const toggle = useCallback(() => {
    if (!disabled) setOpen((prev) => !prev)
  }, [disabled])

  const close = useCallback(() => setOpen(false), [])

  const handleSelect = useCallback(
    (provider: Provider) => {
      if (provider === 'imap-bridge' && imapDisabled) return
      if (provider === 'gmail' && gmailConnected) return
      if (provider === 'google-messages' && gmConnected) return
      onSelect(provider)
      close()
    },
    [onSelect, close, imapDisabled, gmailConnected, gmConnected],
  )

  // Close on outside click
  useEffect(() => {
    if (!open) return

    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close()
      }
    }

    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open, close])

  // Close on Escape
  useEffect(() => {
    if (!open) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, close])

  return (
    <div className="add-account" ref={containerRef}>
      <button
        className="add-account__btn"
        onClick={toggle}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Plus size={14} aria-hidden="true" />
        {t('add_account')}
        <ChevronDown size={14} aria-hidden="true" />
      </button>

      <div className={`add-account__menu${open ? ' open' : ''}`} role="menu">
        {/* Gmail */}
        {gmailConnected ? (
          <div
            className="add-account__option add-account__option--disabled"
            role="menuitem"
            aria-disabled="true"
          >
            <span className="add-account__option-icon add-account__option-icon--gmail">
              <ProviderLogo provider="gmail" size={20} />
            </span>
            <span className="add-account__option-text">
              <span className="add-account__option-title">
                Gmail
                <span className="add-account__option-tag add-account__option-tag--max">
                  {t('add_account_connected')}
                </span>
              </span>
              <span className="add-account__option-detail">
                {t('add_account_gmail_limit_hint')}{' '}
                <button
                  className="add-account__why-link"
                  type="button"
                  onClick={() => { setShowGmailLimitModal(true); close() }}
                  aria-label={t('accounts_gmail_limit_learn_why_aria')}
                >
                  {t('add_account_why')}
                </button>
              </span>
            </span>
          </div>
        ) : (
          <button
            className="add-account__option"
            role="menuitem"
            onClick={() => handleSelect('gmail')}
          >
            <span className="add-account__option-icon add-account__option-icon--gmail">
              <ProviderLogo provider="gmail" size={20} />
            </span>
            <span className="add-account__option-text">
              <span className="add-account__option-title">
                Gmail
                <span className="add-account__option-tag">{t('add_account_recommended')}</span>
              </span>
              <span className="add-account__option-detail">{t('add_account_gmail_detail')}</span>
            </span>
          </button>
        )}

        {/* IMAP / Other email providers */}
        <button
          className={`add-account__option${imapDisabled ? ' add-account__option--disabled' : ''}`}
          role="menuitem"
          onClick={() => handleSelect('imap-bridge')}
          aria-disabled={imapDisabled || undefined}
        >
          <span className="add-account__option-icon add-account__option-icon--imap">
            <Server size={18} aria-hidden="true" />
          </span>
          <span className="add-account__option-text">
            <span className="add-account__option-title">
              {t('add_account_imap_title')}
              {imapDisabled && imapDisabledReason && (
                <span className="add-account__option-tag add-account__option-tag--max">
                  {imapDisabledReason}
                </span>
              )}
            </span>
            <span className="add-account__option-detail">{t('add_account_imap_detail')}</span>
          </span>
        </button>

        {/* Google Messages / Phone (Android) */}
        {gmConnected ? (
          <div
            className="add-account__option add-account__option--disabled"
            role="menuitem"
            aria-disabled="true"
          >
            <span className="add-account__option-icon add-account__option-icon--gm">
              <ProviderLogo provider="google-messages" size={20} />
            </span>
            <span className="add-account__option-text">
              <span className="add-account__option-title">
                {t('add_account_gm_title')}
                <span className="add-account__option-tag add-account__option-tag--max">
                  {t('add_account_connected')}
                </span>
              </span>
              <span className="add-account__option-detail">
                {t('add_account_gm_limit_hint')}
              </span>
            </span>
          </div>
        ) : (
          <button
            className="add-account__option"
            role="menuitem"
            onClick={() => handleSelect('google-messages')}
          >
            <span className="add-account__option-icon add-account__option-icon--gm">
              <ProviderLogo provider="google-messages" size={20} />
            </span>
            <span className="add-account__option-text">
              <span className="add-account__option-title">{t('add_account_gm_title')}</span>
              <span className="add-account__option-detail">{t('add_account_gm_detail')}</span>
            </span>
          </button>
        )}
      </div>

      {/* Gmail limit explanation modal */}
      {showGmailLimitModal && (
        <div
          className="gmail-limit-overlay"
          onClick={() => setShowGmailLimitModal(false)}
          role="presentation"
        >
          <div
            className="gmail-limit-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="gmail-limit-title"
          >
            <div className="gmail-limit-modal__header">
              <h3 id="gmail-limit-title" className="gmail-limit-modal__title">
                {t('accounts_gmail_limit_modal_title')}
              </h3>
              <button
                className="gmail-limit-modal__close"
                onClick={() => setShowGmailLimitModal(false)}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            {/*
              i18n key `accounts_gmail_limit_modal_body` is also used as the
              answer for FAQ #1 in FAQsSection.tsx. Keep the string context-
              neutral if you edit it (no "close this modal" / "dismiss" etc).
            */}
            <div className="gmail-limit-modal__body">
              {t('accounts_gmail_limit_modal_body').split('\n\n').map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
