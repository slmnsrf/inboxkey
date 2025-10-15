/**
 * BridgeInstallGuide -- shown when InboxBridge is not installed.
 *
 * Flow: Download -> Install -> Restart Chrome -> Check Connection
 * Detects user OS for download hints and unsigned warnings.
 */

import React, { useState } from 'react'
import { Download, ExternalLink, RefreshCw } from 'lucide-react'
import { t } from '@/lib/i18n'
import { GITHUB_REPO_URL, INBOXBRIDGE_RELEASES_URL } from '@/lib/constants'
import { getNativeClient } from '@/lib/native-messaging'
import type { PingResult } from '@/lib/native-messaging/types'
import { detectOS } from '@/lib/utils/detect-os'

type Step = 'download' | 'restart' | 'check'
type CheckResult = 'idle' | 'checking' | 'success' | 'fail'

function getDownloadHint(os: 'windows' | 'macos' | 'linux'): string {
  return t(`bridge_install_hint_${os}`)
}

function getWarningKey(os: 'windows' | 'macos' | 'linux'): string | null {
  if (os === 'windows') return 'bridge_warning_windows'
  if (os === 'macos') return 'bridge_warning_macos'
  return null
}

interface BridgeInstallGuideProps {
  onConnected: (ping: PingResult) => void
}

export function BridgeInstallGuide({ onConnected }: BridgeInstallGuideProps) {
  const [step, setStep] = useState<Step>('download')
  const [checkResult, setCheckResult] = useState<CheckResult>('idle')
  const os = detectOS()
  const warningKey = getWarningKey(os)

  const handleCheck = async () => {
    setCheckResult('checking')
    try {
      const client = getNativeClient()
      const ping = await client.ping()
      setCheckResult('success')
      onConnected(ping)
    } catch {
      setCheckResult('fail')
    }
  }

  return (
    <div className="bridge-install-guide" role="region" aria-label={t('bridge_install_heading')}>
      <h3 className="bridge-install-guide__heading">{t('bridge_install_heading')}</h3>

      <p className="bridge-install-guide__description">{t('bridge_install_what')}</p>

      {step === 'download' && (
        <>
          <a
            href={`${INBOXBRIDGE_RELEASES_URL}/latest`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn--primary"
          >
            <Download size={14} aria-hidden="true" />
            {t('bridge_install_download')}
          </a>

          <p className="bridge-install-guide__hint">{getDownloadHint(os)}</p>

          {warningKey && (
            <p className="bridge-install-guide__warning">{t(warningKey)}</p>
          )}

          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => setStep('restart')}
          >
            {t('bridge_install_installed')}
          </button>
        </>
      )}

      {step === 'restart' && (
        <>
          <p className="bridge-install-guide__restart" role="status">
            {t('bridge_install_restart')}
          </p>

          <button
            type="button"
            className="btn btn--primary"
            onClick={() => { setStep('check'); handleCheck() }}
            disabled={checkResult === 'checking'}
            aria-busy={checkResult === 'checking'}
          >
            <RefreshCw size={14} aria-hidden="true" />
            {checkResult === 'checking' ? t('bridge_install_checking') : t('bridge_install_check')}
          </button>
        </>
      )}

      {step === 'check' && (checkResult === 'fail' || checkResult === 'checking') && (
        <>
          {checkResult === 'fail' && (
            <p className="bridge-install-guide__fail" role="alert">
              {t('bridge_install_retry_fail')}
            </p>
          )}

          <button
            type="button"
            className="btn btn--primary"
            onClick={handleCheck}
            disabled={checkResult === 'checking'}
            aria-busy={checkResult === 'checking'}
          >
            <RefreshCw size={14} aria-hidden="true" />
            {checkResult === 'checking' ? t('bridge_install_checking') : t('bridge_install_check')}
          </button>
        </>
      )}

      <a
        href={GITHUB_REPO_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="bridge-install-guide__source"
      >
        <ExternalLink size={12} aria-hidden="true" />
        {t('bridge_install_source')}
      </a>
    </div>
  )
}
