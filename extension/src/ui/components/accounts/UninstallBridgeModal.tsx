/**
 * UninstallBridgeModal -- danger-gated confirmation for removing InboxBridge.
 *
 * Flow:
 * 1. Confirmation phase: user types "UNINSTALL" to enable the action button.
 * 2. Cleaning phase: call `bridge.uninstall` RPC (new in InboxBridge 1.1.0)
 *    to atomically wipe keychain entries, delete `accounts.json`, and
 *    best-effort remove the lock file on the bridge side. Then remove
 *    mailbox records from extension storage.
 * 3. Done phase: show a checklist of what was removed plus an install-
 *    kind-aware block telling the user what file or folder to delete to
 *    finish uninstalling the native app.
 *
 * The bridge cleanup has three outcomes:
 *
 *   - `succeeded`: bridge.uninstall returned a structured result. Extension
 *     storage cleanup runs with `skipBridgeCall: true` so it does not spam
 *     account.remove at an already-empty bridge.
 *   - `unsupported`: bridge responded METHOD_NOT_FOUND (old bridge < 1.1.0).
 *     Fall back to the legacy per-account REMOVE_MAILBOX path and show a
 *     warning that keychain cleanup may be incomplete.
 *   - `unknown_failure`: any other error (transport drop, timeout, or a
 *     structured cleanup error like CLEANUP_SNAPSHOT_FAILED). The bridge
 *     may or may not have run cleanup; we cannot tell. Fall back to the
 *     legacy path so orphaned state gets another chance, and surface a
 *     generic "cleanup did not complete" warning.
 *
 * Install-kind rendering: when the bridge reports `installInfo` via
 * `bridge.ping`, the modal uses that to say "delete this file" vs
 * "delete this folder" vs "drag to Trash" and shows the actual path.
 * When `installInfo` is absent (old bridge or bridge unreachable), the
 * modal falls back to per-OS generic copy with a link to the uninstall
 * guide in `inboxbridge/README-SETUP.md#uninstall`.
 *
 * Uses the shared Modal component for focus trap, ESC key, and
 * accessibility.
 */

import React, { useState } from 'react'
import { AlertTriangle, CheckCircle2, ExternalLink } from 'lucide-react'
import { t } from '@/lib/i18n'
import { Modal } from '@/ui/components/Modal'
import { detectOS } from '@/lib/utils/detect-os'
import { GITHUB_REPO_URL } from '@/lib/constants'
import { getNativeClient, isMethodNotFound } from '@/lib/native-messaging'
import type { InstallInfo, UninstallResult } from '@/lib/native-messaging/types'

// Link into the bridge uninstall guide. Inlined here (not in @/lib/constants)
// to keep the B.1 hotfix scope contained; promote to a shared constant when
// a second consumer needs it.
const UNINSTALL_GUIDE_URL = `${GITHUB_REPO_URL}/blob/main/inboxbridge/README-SETUP.md#uninstall`

type Phase = 'confirm' | 'cleaning' | 'done'
type OSBucket = 'windows' | 'macos' | 'other'

/**
 * Three-outcome bridge cleanup result. Only `succeeded` justifies skipping
 * the per-account bridge call in extension-side cleanup. `unsupported` and
 * `unknown_failure` both fall back to the legacy per-account path so
 * orphaned state has a chance of being cleaned up.
 */
type BridgeCleanupOutcome =
  | { kind: 'succeeded'; result: UninstallResult }
  | { kind: 'unsupported' }
  | { kind: 'unknown_failure' }

interface UninstallBridgeModalProps {
  imapAccountIds: string[]
  /**
   * Install-shape metadata from the most recent bridge.ping. Optional so
   * the modal works against older bridges that do not return it; in that
   * case the modal falls back to static per-OS copy.
   */
  installInfo?: InstallInfo
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
  installInfo,
  onComplete,
  onCancel,
}: UninstallBridgeModalProps) {
  const [phase, setPhase] = useState<Phase>('confirm')
  const [confirmText, setConfirmText] = useState('')
  const [partialFailure, setPartialFailure] = useState(false)
  const [copiedPath, setCopiedPath] = useState(false)
  const [bridgeOutcome, setBridgeOutcome] = useState<BridgeCleanupOutcome | null>(null)
  const confirmWord = t('bridge_uninstall_confirm_word')
  const isConfirmed = confirmText.trim().toUpperCase() === confirmWord.toUpperCase()
  const osBucket = toOSBucket(detectOS())

  const handleUninstall = async () => {
    setPhase('cleaning')

    // Step 1: attempt atomic bridge cleanup via bridge.uninstall (1.1.0+).
    //
    // Any non-METHOD_NOT_FOUND failure ends in the unknown_failure bucket.
    // The bucket itself does not tell us whether the bridge ran the
    // cleanup -- transport errors, structured cleanup errors, and
    // in-flight disconnects all look alike from here. The only thing we
    // can trust is that `kind === 'succeeded'` actually completed.
    let outcome: BridgeCleanupOutcome
    try {
      const client = getNativeClient()
      const result = await client.call<UninstallResult>('bridge.uninstall', {})
      outcome = { kind: 'succeeded', result }
    } catch (e) {
      if (isMethodNotFound(e)) {
        outcome = { kind: 'unsupported' }
      } else {
        outcome = { kind: 'unknown_failure' }
      }
    }
    setBridgeOutcome(outcome)

    // Step 2: extension-side storage cleanup.
    //
    // Only `succeeded` justifies skipping the per-account bridge call.
    // For `unsupported` (old bridge) and `unknown_failure` (bridge may
    // never have run), we fall back to the legacy REMOVE_MAILBOX path so
    // the bridge's own account.remove handler runs per-account -- best-
    // effort, but better than leaving orphaned state.
    const skipBridgeCall = outcome.kind === 'succeeded'
    let failedCount = 0
    for (const mailboxId of imapAccountIds) {
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'REMOVE_MAILBOX',
          mailboxId,
          skipBridgeCall,
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
    // Chrome passes it through to the OS; this button only renders on
    // Windows so the pass-through branch never runs elsewhere.
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

  // Checklist visibility: the credentials item is only truthful when the
  // bridge confirmed cleanup ran. Hide it otherwise so the UI does not
  // claim something it cannot verify.
  const showCredentialsItem = bridgeOutcome?.kind === 'succeeded'
  const keychainPartialCount =
    bridgeOutcome?.kind === 'succeeded' ? bridgeOutcome.result.keychainEntriesFailed.length : 0

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
          {/* Bridge-outcome warning banner (takes precedence over per-account partial). */}
          {bridgeOutcome?.kind === 'unsupported' && (
            <p className="alert alert--warning" role="alert" style={{ margin: 0 }}>
              {t('bridge_uninstall_bridge_unsupported')}
            </p>
          )}
          {bridgeOutcome?.kind === 'unknown_failure' && (
            <p className="alert alert--warning" role="alert" style={{ margin: 0 }}>
              {t('bridge_uninstall_unknown_failure')}
            </p>
          )}
          {bridgeOutcome?.kind === 'succeeded' && keychainPartialCount > 0 && (
            <p className="alert alert--warning" role="alert" style={{ margin: 0 }}>
              {t('bridge_uninstall_keychain_partial')}
            </p>
          )}
          {bridgeOutcome?.kind === 'succeeded' &&
            bridgeOutcome.result.accountsFileDeleted === false && (
              <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm, 13px)' }}>
                {t('bridge_uninstall_state_file_partial')}
              </p>
            )}
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
              <ChecklistItem
                label={t('bridge_uninstall_done_removed_accounts')}
                warning={partialFailure}
              />
              {showCredentialsItem && (
                <ChecklistItem
                  label={t('bridge_uninstall_done_removed_credentials')}
                  warning={keychainPartialCount > 0}
                />
              )}
              <ChecklistItem
                label={t('bridge_uninstall_done_removed_codes')}
                warning={partialFailure}
              />
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

            {/* Install-kind-driven rendering takes priority when the bridge
                reported installInfo. Fallback to OS bucket for old bridges. */}
            {installInfo ? (
              <InstallTargetBlock
                installInfo={installInfo}
                osBucket={osBucket}
                copiedPath={copiedPath}
                onCopy={handleCopyPath}
                onOpenWindowsSettings={handleOpenWindowsSettings}
              />
            ) : (
              <OSBucketFallback
                osBucket={osBucket}
                copiedPath={copiedPath}
                onCopy={handleCopyPath}
                onOpenWindowsSettings={handleOpenWindowsSettings}
              />
            )}
          </section>
        </div>
      )}
    </Modal>
  )
}

// --- Presentational sub-components ---

interface ChecklistItemProps {
  label: string
  warning?: boolean
}

function ChecklistItem({ label, warning }: ChecklistItemProps) {
  return (
    <li
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2, 8px)',
        color: 'var(--color-text-secondary)',
      }}
    >
      {warning ? (
        <AlertTriangle
          size={16}
          style={{ color: 'var(--color-warning, #f59e0b)', flexShrink: 0 }}
          aria-hidden="true"
        />
      ) : (
        <CheckCircle2
          size={16}
          style={{ color: 'var(--color-success, #22c55e)', flexShrink: 0 }}
          aria-hidden="true"
        />
      )}
      <span>{label}</span>
    </li>
  )
}

interface InstallTargetBlockProps {
  installInfo: InstallInfo
  osBucket: OSBucket
  copiedPath: boolean
  onCopy: (path: string) => void
  onOpenWindowsSettings: () => void
}

/**
 * Install-kind-aware uninstall target rendering. Uses the bridge-reported
 * path as the canonical truth.
 *
 * The Windows "Open Windows Settings" CTA is gated on
 * `installInfo.hasOsInstallerEntry === true`. Portable Windows installs
 * (created by `install.ps1`) do not register a Programs and Features
 * entry, so that CTA would be a dead end. For those installs, the
 * copyable folder path below is the only correct action.
 */
function InstallTargetBlock({
  installInfo,
  osBucket,
  copiedPath,
  onCopy,
  onOpenWindowsSettings,
}: InstallTargetBlockProps) {
  const labelKey =
    installInfo.kind === 'directory'
      ? 'bridge_uninstall_target_folder'
      : installInfo.kind === 'app-bundle'
      ? 'bridge_uninstall_target_appbundle'
      : 'bridge_uninstall_target_file'

  const showWindowsSettingsCta =
    osBucket === 'windows' && installInfo.hasOsInstallerEntry === true

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3, 12px)' }}>
      {showWindowsSettingsCta && (
        <button
          type="button"
          className="btn btn--primary"
          onClick={onOpenWindowsSettings}
          style={{ alignSelf: 'flex-start' }}
        >
          {t('bridge_uninstall_done_windows_cta')}
        </button>
      )}
      <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm, 13px)' }}>
        {t(labelKey)}
      </p>
      <PathRow
        path={installInfo.uninstallTarget}
        copied={copiedPath}
        onCopy={onCopy}
      />
    </div>
  )
}

interface OSBucketFallbackProps {
  osBucket: OSBucket
  copiedPath: boolean
  onCopy: (path: string) => void
  onOpenWindowsSettings: () => void
}

/**
 * Fallback rendering when the bridge did not report installInfo (old
 * bridge or bridge unreachable). Uses static per-OS copy and a link to
 * the uninstall guide; shows a Windows CTA because the Settings deep-
 * link is always valid on that platform.
 */
function OSBucketFallback({
  osBucket,
  copiedPath,
  onCopy,
  onOpenWindowsSettings,
}: OSBucketFallbackProps) {
  if (osBucket === 'windows') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3, 12px)' }}>
        <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
          {t('bridge_uninstall_done_windows_steps')}
        </p>
        <button
          type="button"
          className="btn btn--primary"
          onClick={onOpenWindowsSettings}
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
          onCopy={onCopy}
        />
      </div>
    )
  }

  if (osBucket === 'macos') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3, 12px)' }}>
        <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
          {t('bridge_uninstall_done_macos_steps')}
        </p>
        <a
          href={UNINSTALL_GUIDE_URL}
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
          {t('bridge_uninstall_done_macos_manual')}
        </a>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3, 12px)' }}>
      <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
        {t('bridge_uninstall_done_other_steps')}
      </p>
      <a
        href={UNINSTALL_GUIDE_URL}
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
