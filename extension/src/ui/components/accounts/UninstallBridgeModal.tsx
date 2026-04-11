/**
 * UninstallBridgeModal -- danger-gated confirmation for removing InboxBridge.
 *
 * Flow:
 * 1. Show warning + consequences
 * 2. User must type "UNINSTALL" to enable the button
 * 3. On confirm: remove all IMAP accounts from extension storage
 * 4. Show OS-specific instructions for removing the InboxBridge app
 *
 * The done phase surfaces a checklist of what was removed plus a
 * per-platform action block (Windows deep-link, macOS Finder steps,
 * or a generic instruction for other systems). Install paths render
 * as copyable inline values so users can paste them into a file
 * manager or shell without retyping.
 *
 * Uses the shared Modal component for focus trap, ESC key, and accessibility.
 */

import React, { useState } from 'react'
import { AlertTriangle, CheckCircle2, ExternalLink } from 'lucide-react'
import { t } from '@/lib/i18n'
import { Modal } from '@/ui/components/Modal'
import { detectOS } from '@/lib/utils/detect-os'
import { GITHUB_REPO_URL } from '@/lib/constants'

type Phase = 'confirm' | 'cleaning' | 'done'
type OSBucket = 'windows' | 'macos' | 'other'

interface UninstallBridgeModalProps {
  imapAccountIds: string[]
  onComplete: () => void
  onCancel: () => void
}

function toOSBucket(os: ReturnType<typeof detectOS>): OSBucket {
  if (os === 'windows') return 'windows'
  if (os === 'macos') return 'macos'
  return 'other'
}

export function UninstallBridgeModal({
  imapAccountIds,
  onComplete,
  onCancel,
}: UninstallBridgeModalProps) {
  const [phase, setPhase] = useState<Phase>('confirm')
  const [confirmText, setConfirmText] = useState('')
  const [partialFailure, setPartialFailure] = useState(false)
  const [copiedPath, setCopiedPath] = useState(false)
  const confirmWord = t('bridge_uninstall_confirm_word')
  const isConfirmed = confirmText.trim().toUpperCase() === confirmWord.toUpperCase()
  const osBucket = toOSBucket(detectOS())

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

  const handleOpenWindowsSettings = () => {
    // ms-settings: URI opens the Settings app directly on Windows 10/11.
    // Chrome passes it through to the OS; no-op on other platforms but
    // this button only renders on Windows so that branch never runs.
    chrome.tabs.create({ url: 'ms-settings:appsfeatures' })
  }

  const handleCopyPath = async (path: string) => {
    try {
      await navigator.clipboard.writeText(path)
      setCopiedPath(true)
      window.setTimeout(() => setCopiedPath(false), 2000)
    } catch {
      // Clipboard permission denied or unavailable; leave the label unchanged
    }
  }

  // During cleaning, prevent all closing. During done, only allow the Close button.
  const preventClose = phase !== 'confirm'

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4, 16px)' }}>
          {partialFailure && (
            <p className="alert alert--warning" role="alert" style={{ margin: 0 }}>
              {t('bridge_uninstall_partial')}
            </p>
          )}

          <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
            {t('bridge_uninstall_done_subtitle')}
          </p>

          <section aria-labelledby="uninstall-removed-heading">
            <h3
              id="uninstall-removed-heading"
              style={{
                margin: '0 0 var(--space-2, 8px) 0',
                fontSize: 'var(--font-size-sm, 13px)',
                fontWeight: 600,
                color: 'var(--color-text-primary)',
              }}
            >
              {t('bridge_uninstall_done_removed_heading')}
            </h3>
            <ul
              role="list"
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-1, 4px)',
              }}
            >
              {[
                'bridge_uninstall_done_removed_accounts',
                'bridge_uninstall_done_removed_credentials',
                'bridge_uninstall_done_removed_codes',
              ].map((key) => (
                <li
                  key={key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2, 8px)',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  <CheckCircle2
                    size={16}
                    style={{ color: 'var(--color-success, #22c55e)', flexShrink: 0 }}
                    aria-hidden="true"
                  />
                  <span>{t(key)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="uninstall-step-heading">
            <h3
              id="uninstall-step-heading"
              style={{
                margin: '0 0 var(--space-2, 8px) 0',
                fontSize: 'var(--font-size-sm, 13px)',
                fontWeight: 600,
                color: 'var(--color-text-primary)',
              }}
            >
              {t('bridge_uninstall_done_step_heading')}
            </h3>

            {osBucket === 'windows' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3, 12px)' }}>
                <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
                  {t('bridge_uninstall_done_windows_steps')}
                </p>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={handleOpenWindowsSettings}
                  style={{ alignSelf: 'flex-start' }}
                >
                  {t('bridge_uninstall_done_windows_cta')}
                </button>
                <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm, 13px)' }}>
                  {t('bridge_uninstall_done_windows_manual')}
                </p>
                <PathRow
                  path={t('bridge_uninstall_done_windows_path')}
                  copied={copiedPath}
                  onCopy={handleCopyPath}
                />
              </div>
            )}

            {osBucket === 'macos' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3, 12px)' }}>
                <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
                  {t('bridge_uninstall_done_macos_steps')}
                </p>
                <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm, 13px)' }}>
                  {t('bridge_uninstall_done_macos_manual')}
                </p>
                <PathRow
                  path={t('bridge_uninstall_done_macos_path')}
                  copied={copiedPath}
                  onCopy={handleCopyPath}
                />
              </div>
            )}

            {osBucket === 'other' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3, 12px)' }}>
                <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
                  {t('bridge_uninstall_done_other_steps')}
                </p>
                <a
                  href={GITHUB_REPO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 'var(--space-1, 4px)',
                    color: 'var(--color-accent)',
                    textDecoration: 'none',
                    alignSelf: 'flex-start',
                  }}
                >
                  <ExternalLink size={14} aria-hidden="true" />
                  {t('bridge_uninstall_done_other_link')}
                </a>
              </div>
            )}
          </section>
        </div>
      )}
    </Modal>
  )
}

interface PathRowProps {
  path: string
  copied: boolean
  onCopy: (path: string) => void
}

function PathRow({ path, copied, onCopy }: PathRowProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2, 8px)',
        padding: 'var(--space-2, 8px) var(--space-3, 12px)',
        background: 'var(--color-surface-elev, rgba(255,255,255,0.04))',
        borderRadius: 'var(--radius-md, 6px)',
        border: '1px solid var(--color-border, rgba(255,255,255,0.08))',
      }}
    >
      <code
        style={{
          flex: 1,
          margin: 0,
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: 'var(--font-size-sm, 13px)',
          color: 'var(--color-text-primary)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {path}
      </code>
      <button
        type="button"
        className="btn btn--secondary btn--sm"
        onClick={() => onCopy(path)}
        aria-live="polite"
      >
        {copied
          ? t('bridge_uninstall_done_path_copied')
          : t('bridge_uninstall_done_path_copy')}
      </button>
    </div>
  )
}
