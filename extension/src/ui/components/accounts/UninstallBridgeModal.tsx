/**
 * UninstallBridgeModal -- danger-gated confirmation for removing InboxBridge.
 *
 * Flow:
 * 1. Show warning + consequences
 * 2. User must type "UNINSTALL" to enable the button
 * 3. On confirm: remove all IMAP accounts, call bridge.cleanup via native messaging
 * 4. Show OS-specific instructions for deleting the binary
 *
 * Uses the shared Modal component for focus trap, ESC key, and accessibility.
 */

import React, { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { t } from '@/lib/i18n'
import { getNativeClient } from '@/lib/native-messaging'
import { Modal } from '@/ui/components/Modal'

type Phase = 'confirm' | 'cleaning' | 'done'

function detectOS(): 'windows' | 'macos' | 'linux' {
  const platform = (navigator as any).userAgentData?.platform
  if (platform) {
    if (platform === 'Windows') return 'windows'
    if (platform === 'macOS') return 'macos'
    return 'linux'
  }
  const ua = navigator.platform
  if (ua.startsWith('Win')) return 'windows'
  if (ua.startsWith('Mac')) return 'macos'
  return 'linux'
}

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
  const confirmWord = t('bridge_uninstall_confirm_word')
  const isConfirmed = confirmText.trim().toUpperCase() === confirmWord.toUpperCase()
  const os = detectOS()

  const handleUninstall = async () => {
    setPhase('cleaning')

    // 1. Remove all IMAP accounts from extension storage
    for (const mailboxId of imapAccountIds) {
      try {
        await chrome.runtime.sendMessage({
          type: 'REMOVE_MAILBOX',
          mailboxId,
        })
      } catch {
        // Best effort -- continue even if one fails
      }
    }

    // 2. Call InboxBridge --cleanup to clear keychain entries
    try {
      const client = getNativeClient()
      await client.request('bridge.cleanup', {}, { timeout: 10000 })
    } catch {
      // Bridge may not support this RPC -- that's OK
      // The OS uninstaller (or manual rm) will handle it
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
        <p>{t(`bridge_uninstall_done_${os}`)}</p>
      )}
    </Modal>
  )
}
