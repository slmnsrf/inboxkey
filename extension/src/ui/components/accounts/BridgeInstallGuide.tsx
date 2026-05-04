/**
 * BridgeInstallGuide -- 3-step wizard shown when InboxBridge is not installed.
 *
 * Steps:
 *   1. Download  (OS-specific button + security note)
 *   2. Install   (instruction + "I completed installation" button)
 *   3. Connect   (auto-checks on entry + inline checking/success/fail states,
 *                 with a manual "Check connection" retry on failure)
 *
 * Chrome does NOT need to be restarted -- native messaging hosts are
 * discovered on every `connectNative()` call (verified against Chromium's
 * `NativeMessageProcessHost` + `NativeProcessLauncherImpl` source). The
 * old "restart Chrome" step was a conservative myth that cost users a
 * browser cycle for no functional benefit.
 *
 * Detects user OS for download links, filenames, and unsigned-installer warnings.
 */

import React, { useState, useCallback } from 'react'
import { Download, Plug, CheckCircle, XCircle } from 'lucide-react'
import { t } from '@/lib/i18n'
import { GITHUB_REPO_URL, INBOXBRIDGE_RELEASES_URL } from '@/lib/constants'
import { getNativeClient } from '@/lib/native-messaging'
import type { PingResult } from '@/lib/native-messaging/types'
import { detectOS } from '@/lib/utils/detect-os'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Step = 'download' | 'install' | 'check'
type CheckState = 'idle' | 'checking' | 'success' | 'fail'

type OSKey = 'windows' | 'macos' | 'linux'

interface OSConfig {
  labelKey: string
  filename: string
  size: string
  hasSecurityNote: boolean
}

/* ------------------------------------------------------------------ */
/*  OS-specific download metadata                                      */
/* ------------------------------------------------------------------ */

const OS_CONFIGS: Record<OSKey, OSConfig> = {
  windows: {
    labelKey: 'bridge_install_download_windows',
    filename: 'InboxBridge-x64.exe',
    size: '8.4 MB',
    hasSecurityNote: true,
  },
  macos: {
    labelKey: 'bridge_install_download_macos',
    filename: 'InboxBridge.dmg',
    size: '12.1 MB',
    hasSecurityNote: true,
  },
  linux: {
    labelKey: 'bridge_install_download_linux',
    filename: 'InboxBridge-x64.AppImage',
    size: '15.3 MB',
    hasSecurityNote: false,
  },
}

const STEP_INDEX: Record<Step, number> = {
  download: 0,
  install: 1,
  check: 2,
}

/* ------------------------------------------------------------------ */
/*  Step indicator helpers                                             */
/* ------------------------------------------------------------------ */

function stepClass(stepIdx: number, currentIdx: number): string {
  if (stepIdx < currentIdx) return 'step step--done'
  if (stepIdx === currentIdx) return 'step step--current'
  return 'step step--upcoming'
}

/* ------------------------------------------------------------------ */
/*  Security note sub-component                                        */
/* ------------------------------------------------------------------ */

function SecurityNote({ os }: { os: OSKey }) {
  const leadKey = `bridge_warning_${os}_lead`
  const causeKey = `bridge_warning_${os}_cause`
  const actionKey = `bridge_warning_${os}_action`

  return (
    <div className="security-note" role="note">
      <p className="security-note__lead">
        <strong>{t(leadKey)}</strong>
      </p>
      <p>{t(causeKey)}</p>
      <p>
        {t(actionKey).split('GitHub').map((part, i, arr) =>
          i < arr.length - 1 ? (
            <React.Fragment key={i}>
              {part}
              <a
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub
              </a>
            </React.Fragment>
          ) : (
            <React.Fragment key={i}>{part}</React.Fragment>
          )
        )}
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

interface BridgeInstallGuideProps {
  onConnected: (ping: PingResult) => void
}

export function BridgeInstallGuide({ onConnected }: BridgeInstallGuideProps) {
  const [currentStep, setCurrentStep] = useState<Step>('download')
  const [checkState, setCheckState] = useState<CheckState>('idle')
  const os = detectOS()
  const config = OS_CONFIGS[os]
  const currentIdx = STEP_INDEX[currentStep]

  const handleCheck = useCallback(async () => {
    setCheckState('checking')
    try {
      const client = getNativeClient()
      const ping = await client.ping()
      setCheckState('success')
      onConnected(ping)
    } catch {
      setCheckState('fail')
    }
  }, [onConnected])

  const advanceToInstall = useCallback(() => {
    setCurrentStep('install')
  }, [])

  // Confirming installation auto-advances to the connect step AND fires the
  // ping immediately. Chrome doesn't need to be restarted to discover the
  // native host (per-connect manifest lookup), so making the user click a
  // separate "Check connection" button afterwards added a click for no
  // technical reason. Failure paths still expose the manual retry button.
  const advanceToCheckAndPing = useCallback(() => {
    setCurrentStep('check')
    void handleCheck()
  }, [handleCheck])

  return (
    <div
      className="wizard"
      role="region"
      aria-label={t('bridge_install_heading')}
    >
      {/* Header */}
      <div className="wizard__head">
        <h3 className="wizard__title">{t('bridge_install_heading')}</h3>
        <p className="wizard__sub">{t('bridge_install_what')}</p>
      </div>

      {/* Steps */}
      <ol className="steps">
        {/* Step 1: Download */}
        <li className={stepClass(0, currentIdx)}>
          <div className="step__indicator-col">
            <span className="step__circle">
              <span className="step__num">1</span>
            </span>
            <span className="step__line" />
          </div>
          <div className="step__content">
            <h4 className="step__title">{t('bridge_install_step1_title')}</h4>
            <div className="step__body">
              <a
                className="download-btn"
                href={`${INBOXBRIDGE_RELEASES_URL}/latest`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={advanceToInstall}
              >
                <span className="download-btn__icon">
                  <Download size={18} aria-hidden="true" />
                </span>
                <span className="download-btn__text">
                  <span className="download-btn__primary">
                    {t(config.labelKey)}
                  </span>
                  <span className="download-btn__meta">
                    {config.filename} &middot; {config.size}
                  </span>
                </span>
              </a>

              <div className="download-links">
                <a
                  href={INBOXBRIDGE_RELEASES_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('bridge_install_other_platforms')}
                </a>
                <span className="download-links__sep">&middot;</span>
                <a
                  href={INBOXBRIDGE_RELEASES_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('bridge_install_verify_checksum')}
                </a>
                <span className="download-links__sep">&middot;</span>
                <a
                  href={GITHUB_REPO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('bridge_install_view_source')}
                </a>
              </div>

              {config.hasSecurityNote && <SecurityNote os={os} />}
            </div>
          </div>
        </li>

        {/* Step 2: Restart Chrome */}
        <li className={stepClass(1, currentIdx)}>
          <div className="step__indicator-col">
            <span className="step__circle">
              <span className="step__num">2</span>
            </span>
            <span className="step__line" />
          </div>
          <div className="step__content">
            <h4 className="step__title">{t('bridge_install_step2_title')}</h4>
            <div className="step__body">
              <p className="step__instr">{t('bridge_install_step2_instr')}</p>
              <button
                type="button"
                className="primary-btn"
                onClick={advanceToCheckAndPing}
              >
                {t('bridge_install_step2_button')}
              </button>
            </div>
          </div>
        </li>

        {/* Step 3: Connect */}
        <li className={stepClass(2, currentIdx)}>
          <div className="step__indicator-col">
            <span className="step__circle">
              <span className="step__num">3</span>
            </span>
            <span className="step__line" />
          </div>
          <div className="step__content">
            <h4 className="step__title">{t('bridge_install_step3_title')}</h4>
            <div className="step__body">
              <p className="step__instr">{t('bridge_install_step3_instr')}</p>
              <div className="step3__row">
                {checkState !== 'success' && (
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={handleCheck}
                    disabled={checkState === 'checking'}
                    aria-busy={checkState === 'checking'}
                  >
                    <Plug size={14} aria-hidden="true" />
                    {t('bridge_install_check')}
                  </button>
                )}

                {checkState === 'checking' && (
                  <div
                    className="check-state check-state--checking"
                    role="status"
                    aria-live="polite"
                  >
                    <span className="check-state__icon">
                      <span className="spinner" />
                    </span>
                    <span className="check-state__text">
                      {t('bridge_install_checking')}
                    </span>
                  </div>
                )}

                {checkState === 'success' && (
                  <div
                    className="check-state check-state--success"
                    role="status"
                    aria-live="polite"
                  >
                    <span className="check-state__icon">
                      <CheckCircle size={18} aria-hidden="true" />
                    </span>
                    <span className="check-state__text">
                      {t('bridge_install_success')}
                    </span>
                  </div>
                )}

                {checkState === 'fail' && (
                  <div
                    className="check-state check-state--fail"
                    role="alert"
                  >
                    <span className="check-state__icon">
                      <XCircle size={18} aria-hidden="true" />
                    </span>
                    <span className="check-state__text">
                      {t('bridge_install_retry_fail')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </li>
      </ol>
    </div>
  )
}
