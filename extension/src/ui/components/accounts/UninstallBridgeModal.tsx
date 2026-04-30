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
import { AlertTriangle, Check, ExternalLink, Trash2 } from 'lucide-react'
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
              <Trash2 size={14} aria-hidden="true" />
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
        <div className="uninstall-confirm">
          <div className="danger-warning">
            <span className="danger-warning__icon">
              <AlertTriangle size={18} aria-hidden="true" />
            </span>
            <div className="danger-warning__body">
              <p className="danger-warning__title">
                {t('bridge_uninstall_warning')}
              </p>
              <p className="danger-warning__detail">
                {t('bridge_uninstall_warning_detail')}
              </p>
            </div>
          </div>

          <div className="confirm-field">
            <label className="confirm-field__label" htmlFor="uninstall-confirm-input">
              {t('bridge_uninstall_confirm_label')}
            </label>
            <input
              id="uninstall-confirm-input"
              type="text"
              className="confirm-field__input"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={confirmWord}
              autoComplete="off"
              spellCheck={false}
              autoFocus
            />
            <span className="confirm-field__hint">
              {t('bridge_uninstall_confirm_hint')}
            </span>
          </div>
        </div>
      )}

      {phase === 'cleaning' && (
        <div className="cleaning" role="status" aria-live="polite">
          <div className="cleaning__spinner" />
          <h3 className="cleaning__title">{t('bridge_uninstall_cleaning')}</h3>
          <p className="cleaning__detail">{t('bridge_uninstall_cleaning_detail')}</p>
        </div>
      )}

      {phase === 'done' && (
        <>
          {/* Bridge-outcome warning banner (takes precedence over per-account partial). */}
          {bridgeOutcome?.kind === 'unsupported' && (
            <p className="danger-warning__detail" role="alert">
              {t('bridge_uninstall_bridge_unsupported')}
            </p>
          )}
          {bridgeOutcome?.kind === 'unknown_failure' && (
            <p className="danger-warning__detail" role="alert">
              {t('bridge_uninstall_unknown_failure')}
            </p>
          )}
          {bridgeOutcome?.kind === 'succeeded' && keychainPartialCount > 0 && (
            <p className="danger-warning__detail" role="alert">
              {t('bridge_uninstall_keychain_partial')}
            </p>
          )}
          {bridgeOutcome?.kind === 'succeeded' &&
            bridgeOutcome.result.accountsFileDeleted === false && (
              <p className="cleaning__detail">
                {t('bridge_uninstall_state_file_partial')}
              </p>
            )}
          {partialFailure && (
            <p className="danger-warning__detail" role="alert">
              {t('bridge_uninstall_partial')}
            </p>
          )}

          <div className="done-check">
            <Check size={24} aria-hidden="true" />
          </div>
          <h3 className="done-title">{t('bridge_uninstall_done_success')}</h3>
          <p className="done-sub">{t('bridge_uninstall_done_subtitle')}</p>

          <div className="done-checklist">
            <span className="done-checklist__label">
              {t('bridge_uninstall_done_removed_heading')}
            </span>
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
          </div>

          <div className="done-next">
            <span className="done-next__label">
              {t('bridge_uninstall_done_step_heading')}
            </span>
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
          </div>
        </>
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
    <div className="done-checklist__item">
      <span className={`done-checklist__icon${warning ? ' done-checklist__icon--warning' : ''}`}>
        {warning ? (
          <AlertTriangle size={14} aria-hidden="true" />
        ) : (
          <Check size={14} aria-hidden="true" />
        )}
      </span>
      {label}
    </div>
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
    <>
      {showWindowsSettingsCta && (
        <button
          type="button"
          className="btn btn--primary"
          onClick={onOpenWindowsSettings}
        >
          {t('bridge_uninstall_done_windows_cta')}
        </button>
      )}
      <p className="done-next__instruction">{t(labelKey)}</p>
      <PathRow
        path={installInfo.uninstallTarget}
        copied={copiedPath}
        onCopy={onCopy}
      />
    </>
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
      <>
        <p className="done-next__instruction">
          {t('bridge_uninstall_done_windows_steps')}
        </p>
        <button
          type="button"
          className="btn btn--primary"
          onClick={onOpenWindowsSettings}
        >
          {t('bridge_uninstall_done_windows_cta')}
        </button>
        <p className="done-next__instruction">
          {t('bridge_uninstall_done_windows_manual')}
        </p>
        <PathRow
          path={t('bridge_uninstall_done_windows_path')}
          copied={copiedPath}
          onCopy={onCopy}
        />
      </>
    )
  }

  if (osBucket === 'macos') {
    return (
      <>
        <p className="done-next__instruction">
          {t('bridge_uninstall_done_macos_steps')}
        </p>
        <a
          href={UNINSTALL_GUIDE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="done-next__link"
        >
          <ExternalLink size={14} aria-hidden="true" />
          {t('bridge_uninstall_done_macos_manual')}
        </a>
      </>
    )
  }

  return (
    <>
      <p className="done-next__instruction">
        {t('bridge_uninstall_done_other_steps')}
      </p>
      <a
        href={UNINSTALL_GUIDE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="done-next__link"
      >
        <ExternalLink size={14} aria-hidden="true" />
        {t('bridge_uninstall_done_other_link')}
      </a>
    </>
  )
}

interface PathRowProps {
  path: string
  copied: boolean
  onCopy: (path: string) => void
}

function PathRow({ path, copied, onCopy }: PathRowProps) {
  return (
    <div className="done-next__path">
      <span className="done-next__path-text">{path}</span>
      <button
        type="button"
        className="done-next__copy"
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
