/**
 * UninstallBridgeModal -- danger-gated confirmation for removing InboxBridge.
 *
 * Flow:
 * 1. Show warning + consequences
 * 2. User must type "UNINSTALL" to enable the button
 * 3. On confirm: remove all IMAP accounts from extension storage
 * 4. Show OS-specific instructions for deleting the binary
 *
 * Uses the shared Modal component for focus trap, ESC key, and accessibility.
 */

import React, { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { t } from '@/lib/i18n'
import { Modal } from '@/ui/components/Modal'
import { detectOS } from '@/lib/utils/detect-os'

type Phase = 'confirm' | 'cleaning' | 'done'

interface UninstallBridgeModalProps {
  imapAccountIds: string[]
  onComplete: () => void
  onCancel: () => void
}

export function UninstallBridgeModal({
  imapAccountIds,
  onComplete,
  onCancel,
}: UninstallBridgeModalProps) {
  const [phase, setPhase] = useState<Phase>('confirm')
  const [confirmText, setConfirmText] = useState('')
  const [partialFailure, setPartialFailure] = useState(false)
  const confirmWord = t('bridge_uninstall_confirm_word')
  const isConfirmed = confirmText.trim().toUpperCase() === confirmWord.toUpperCase()
  const os = detectOS()

  const handleUninstall = async () => {
    setPhase('cleaning')

    // Remove all IMAP accounts from extension storage
    let failedCount = 0
    for (const mailboxId of imapAccountIds) {
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'REMOVE_MAILBOX',
          mailboxId,
        })
        if (!response?.success) failedCount++
      } catch {
        failedCount++
      }
    }

    if (failedCount > 0) {
      setPartialFailure(true)
    }

    setPhase('done')
  }

  // During cleaning, prevent all closing. During done, only allow the Done button.
  const preventClose = phase !== 'confirm'

  // Determine the modal title based on phase
  const title = phase === 'done'
    ? t('bridge_uninstall_done_title')
    : t('bridge_uninstall_title')

  return (
    <Modal
      isOpen={true}
      onClose={onCancel}
      title={title}
      size="small"
      preventCloseOnOverlayClick={preventClose}
      preventCloseOnEscape={preventClose}
      footer={
        phase === 'confirm' ? (
          <>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={onCancel}
            >
              {t('bridge_uninstall_cancel')}
            </button>
            <button
              type="button"
              className="btn btn--danger"
              onClick={handleUninstall}
              disabled={!isConfirmed}
            >
              {t('bridge_uninstall_action')}
            </button>
          </>
        ) : phase === 'done' ? (
          <button
            type="button"
            className="btn btn--primary"
            onClick={onComplete}
          >
            {t('bridge_uninstall_done_close')}
          </button>
        ) : undefined
      }
    >
      {phase === 'confirm' && (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 'var(--space-3, 12px)',
              marginBottom: 'var(--space-4, 16px)',
            }}
          >
            <AlertTriangle
              size={20}
              style={{ color: 'var(--color-danger)', flexShrink: 0, marginTop: '2px' }}
              aria-hidden="true"
            />
            <p style={{ margin: 0, color: 'var(--color-text-primary)' }}>
              {t('bridge_uninstall_warning')}
            </p>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="uninstall-confirm-input">
              {t('bridge_uninstall_confirm_label')}
            </label>
            <input
              id="uninstall-confirm-input"
              type="text"
              className="form-input"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={confirmWord}
              autoComplete="off"
              spellCheck={false}
              autoFocus
            />
          </div>
        </>
      )}

      {phase === 'cleaning' && (
        <div role="status" aria-live="polite">
          <p>{t('bridge_uninstall_cleaning')}</p>
        </div>
      )}

      {phase === 'done' && (
        <>
          {partialFailure && (
            <p className="alert alert--warning" role="alert" style={{ marginBottom: 'var(--space-3, 12px)' }}>
              {t('bridge_uninstall_partial')}
            </p>
          )}
          <p>{t(`bridge_uninstall_done_${os}`)}</p>
        </>
      )}
    </Modal>
  )
}
