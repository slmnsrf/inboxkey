import React, { useCallback, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'

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
  /** Unique account identifier for key/tracking */
  id: string
  /** Email address or phone number */
  email: string
  /** Provider type: 'gmail' | 'imap-bridge' | 'google-messages' */
  provider: string
  /** For IMAP accounts, the server hostname (resolves correct logo) */
  imapHost?: string
  /** Maps to dot color: green (online), amber (warning), red (offline) */
  status: 'online' | 'warning' | 'offline'
  /** Accessible label for the status dot */
  statusLabel: string
  /** Secondary line (e.g., "Gmail - Last code: github.com, 2 min ago") */
  metaText: string
  /** If true, show inline "Reconnect" button for problem/error rows */
  showReconnect?: boolean
  onReconnect?: () => void
  onTest?: () => void
  onEdit?: () => void
  onRemove?: () => void
}

/** Status value to CSS dot modifier class */
const DOT_CLASS: Record<AccountRowUnifiedProps['status'], string> = {
  online: 'account-row__dot--ok',
  warning: 'account-row__dot--warning',
  offline: 'account-row__dot--error',
}

/** Status value to row background modifier class */
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
  onReconnect,
  onTest,
  onEdit,
  onRemove,
}: AccountRowUnifiedProps) {
  const [confirming, setConfirming] = useState(false)
  const [removing, setRemoving] = useState(false)
  const rowRef = useRef<HTMLDivElement>(null)

  /* ------ Build row class list ------ */
  const rowClasses = [
    'account-row',
    ROW_CLASS[status],
    !showReconnect ? 'account-row--no-action' : '',
    confirming ? 'account-row--confirming' : '',
  ]
    .filter(Boolean)
    .join(' ')

  /* ------ Inline remove confirmation ------ */
  const handleRemoveRequest = useCallback(() => {
    setConfirming(true)
  }, [])

  const handleCancelConfirm = useCallback(() => {
    setConfirming(false)
  }, [])

  const handleConfirmRemove = useCallback(() => {
    setRemoving(true)

    // Fade out, then fire the callback
    if (rowRef.current) {
      rowRef.current.style.transition = 'opacity 200ms ease-out'
      rowRef.current.style.opacity = '0'
    }

    setTimeout(() => {
      onRemove?.()
    }, 200)
  }, [onRemove])

  /* ------ Noop handlers for optional callbacks ------ */
  const handleTest = useCallback(() => onTest?.(), [onTest])
  const handleEdit = useCallback(() => onEdit?.(), [onEdit])
  const handleReconnect = useCallback(() => onReconnect?.(), [onReconnect])

  if (removing) {
    // Row is fading out; still render so the transition plays
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
        <span className="account-row__meta">{metaText}</span>
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
        onTest={handleTest}
        onEdit={handleEdit}
        onRemove={handleRemoveRequest}
      />

      {/* Confirmation overlay (rendered inside the grid, hidden elements handled by CSS) */}
      {confirming && (
        <>
          <span className="account-row__confirm-icon">
            <AlertTriangle size={18} aria-hidden="true" />
          </span>
          <span className="account-row__confirm-text">
            {t('row_remove_confirm', email)}
          </span>
          <span className="account-row__confirm-actions">
            <button
              className="confirm-btn confirm-btn--cancel"
              type="button"
              onClick={handleCancelConfirm}
            >
              {t('button_cancel')}
            </button>
            <button
              className="confirm-btn confirm-btn--remove"
              type="button"
              onClick={handleConfirmRemove}
            >
              {t('row_remove')}
            </button>
          </span>
        </>
      )}
    </div>
  )
}
