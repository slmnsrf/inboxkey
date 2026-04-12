import React, { useCallback, useRef, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'

import { t } from '@/lib/i18n'
import { ProviderLogo } from './ProviderLogo'
import { RowActionMenu } from './RowActionMenu'

/* ===========================
   AccountRowUnified
   ===========================
   A single account row in the unified accounts list.
   5-column CSS grid: dot | provider icon | info | inline action | "..." menu.
   Healthy rows hide the inline action column (--no-action modifier).
*/

interface AccountRowUnifiedProps {
  id: string
  email: string
  provider: string
  imapHost?: string
  status: 'online' | 'warning' | 'offline'
  statusLabel: string
  metaText: string
  showReconnect?: boolean
  testing?: boolean
  testResult?: 'success' | 'error'
  onReconnect?: () => void
  onTest?: () => void
  onEdit?: () => void
  editLabel?: string
  onRemove?: () => void
}

const DOT_CLASS: Record<AccountRowUnifiedProps['status'], string> = {
  online: 'account-row__dot--ok',
  warning: 'account-row__dot--warning',
  offline: 'account-row__dot--error',
}

const ROW_CLASS: Record<AccountRowUnifiedProps['status'], string> = {
  online: '',
  warning: 'account-row--problem',
  offline: 'account-row--error',
}

export function AccountRowUnified({
  id,
  email,
  provider,
  imapHost,
  status,
  statusLabel,
  metaText,
  showReconnect = false,
  testing = false,
  testResult,
  onReconnect,
  onTest,
  onEdit,
  editLabel,
  onRemove,
}: AccountRowUnifiedProps) {
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [removing, setRemoving] = useState(false)
  const rowRef = useRef<HTMLDivElement>(null)

  const rowClasses = [
    'account-row',
    ROW_CLASS[status],
    !showReconnect ? 'account-row--no-action' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const handleRemoveRequest = useCallback(() => {
    setShowConfirmModal(true)
  }, [])

  const handleConfirmRemove = useCallback(() => {
    setShowConfirmModal(false)
    setRemoving(true)

    if (rowRef.current) {
      rowRef.current.style.transition = 'opacity 200ms ease-out'
      rowRef.current.style.opacity = '0'
    }

    setTimeout(() => {
      onRemove?.()
    }, 200)
  }, [onRemove])

  const handleTest = useCallback(() => onTest?.(), [onTest])
  const handleEdit = useCallback(() => onEdit?.(), [onEdit])
  const handleReconnect = useCallback(() => onReconnect?.(), [onReconnect])

  if (removing) {
    return (
      <div
        ref={rowRef}
        className={rowClasses}
        data-account-id={id}
        style={{ opacity: 0, transition: 'opacity 200ms ease-out' }}
      />
    )
  }

  return (
    <>
      <div ref={rowRef} className={rowClasses} data-account-id={id}>
        {/* Col 1: Status dot */}
        <span
          className={`account-row__dot ${DOT_CLASS[status]}`}
          aria-label={statusLabel}
          role="img"
        />

        {/* Col 2: Provider icon */}
        <span className="account-row__icon">
          <ProviderLogo provider={provider} imapHost={imapHost} size={18} />
        </span>

        {/* Col 3: Info (email + meta) */}
        <div className="account-row__info">
          <span className="account-row__email" title={email}>
            {email}
          </span>
          <span className={`account-row__meta${
            testing ? ' account-row__meta--testing' :
            testResult === 'success' ? ' account-row__meta--success' :
            testResult === 'error' ? ' account-row__meta--error' : ''
          }`}>
            {testing ? t('row_testing') :
             testResult === 'success' ? t('row_test_ok') :
             testResult === 'error' ? t('row_test_fail') :
             metaText}
          </span>
        </div>

        {/* Col 4: Inline action (only when showReconnect is true) */}
        {showReconnect && (
          <div className="account-row__action">
            <button
              className="row-btn row-btn--primary"
              type="button"
              onClick={handleReconnect}
            >
              {t('accounts_reconnect')}
            </button>
          </div>
        )}

        {/* Col 5: "..." menu */}
        <RowActionMenu
          email={email}
          editLabel={editLabel}
          onTest={handleTest}
          onEdit={onEdit ? handleEdit : undefined}
          onRemove={handleRemoveRequest}
        />
      </div>

      {/* Remove confirmation modal */}
      {showConfirmModal && (
        <div
          className="confirm-modal-overlay"
          onClick={() => setShowConfirmModal(false)}
          role="presentation"
        >
          <div
            className="confirm-modal"
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-remove-title"
            aria-describedby="confirm-remove-desc"
          >
            <div className="confirm-modal__header">
              <span className="confirm-modal__icon">
                <AlertTriangle size={20} />
              </span>
              <h3 id="confirm-remove-title" className="confirm-modal__title">
                {t('row_remove_modal_title')}
              </h3>
              <button
                className="confirm-modal__close"
                onClick={() => setShowConfirmModal(false)}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            <p id="confirm-remove-desc" className="confirm-modal__body">
              {t('row_remove_modal_body', email)}
            </p>
            <div className="confirm-modal__actions">
              <button
                className="btn btn--secondary"
                type="button"
                onClick={() => setShowConfirmModal(false)}
              >
                {t('button_cancel')}
              </button>
              <button
                className="btn btn--danger"
                type="button"
                onClick={handleConfirmRemove}
                autoFocus
              >
                {t('row_remove')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
