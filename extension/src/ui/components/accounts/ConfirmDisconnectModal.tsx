/**
 * ConfirmDisconnectModal Component
 *
 * Confirmation dialog for disconnecting provider accounts (Gmail/Outlook).
 * Prevents accidental disconnection by requiring explicit user confirmation.
 */

import React, { useEffect, useRef } from 'react'
import { t } from '@/lib/i18n'
import type { ProviderKey } from './types'

interface ConfirmDisconnectModalProps {
  isOpen: boolean
  provider: ProviderKey
  email: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDisconnectModal({
  isOpen,
  provider,
  email,
  onConfirm,
  onCancel
}: ConfirmDisconnectModalProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null)

  // Focus management
  useEffect(() => {
    if (isOpen) {
      // Focus cancel button (safe default)
      cancelButtonRef.current?.focus()

      // Prevent body scroll
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }

    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel() // ESC = Cancel (safe default)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onCancel])

  if (!isOpen) return null

  const providerName = provider === 'gmail' ? 'Gmail' : 'Outlook'

  return (
    <div
      className="modal-overlay"
      onClick={onCancel}
      role="presentation"
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="disconnect-title"
        aria-describedby="disconnect-description"
      >
        <div className="modal-header">
          <h2 id="disconnect-title" className="modal-title">
            ⚠️ {t('modal_disconnect_title', providerName)}
          </h2>
        </div>

        <div id="disconnect-description" className="modal-body">
          <p>{t('modal_disconnect_intro')}</p>
          <ul>
            <li>
              {t('modal_disconnect_stop_monitoring')} <strong>{email}</strong>
            </li>
            <li>{t('modal_disconnect_remove_data')}</li>
            <li>{t('modal_disconnect_clear_emails')}</li>
          </ul>
          <p className="modal-reassurance">
            {t('modal_disconnect_reassurance')}
          </p>
        </div>

        <div className="modal-footer">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onCancel}
            className="btn btn--secondary"
          >
            {t('modal_cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="btn btn--danger"
          >
            {t('modal_disconnect_confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
