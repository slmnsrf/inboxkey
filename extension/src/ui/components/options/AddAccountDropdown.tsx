import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, Plus, Server } from 'lucide-react'

import { t } from '@/lib/i18n'
import { ProviderLogo } from './ProviderLogo'

type Provider = 'gmail' | 'imap-bridge' | 'google-messages'

interface AddAccountDropdownProps {
  onSelect: (provider: Provider) => void
  disabled?: boolean
  imapDisabled?: boolean
  imapDisabledReason?: string
}

export function AddAccountDropdown({
  onSelect,
  disabled,
  imapDisabled,
  imapDisabledReason,
}: AddAccountDropdownProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const toggle = useCallback(() => {
    if (!disabled) setOpen((prev) => !prev)
  }, [disabled])

  const close = useCallback(() => setOpen(false), [])

  const handleSelect = useCallback(
    (provider: Provider) => {
      if (provider === 'imap-bridge' && imapDisabled) return
      onSelect(provider)
      close()
    },
    [onSelect, close, imapDisabled],
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
      </div>
    </div>
  )
}
