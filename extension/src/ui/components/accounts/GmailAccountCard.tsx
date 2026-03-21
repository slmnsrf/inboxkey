/**
 * GmailAccountCard - Gmail-specific account card (Phase 2 pilot)
 *
 * Implements the new unified provider card pattern with:
 * - StatefulButton for connection/disconnection
 * - AccountSection wrapper for consistency
 * - AccountRow layout primitive
 * - Preserved Gmail limitation info (ℹ️ icon, "Learn why" link, modal)
 * - Local state management for connection flows
 *
 * Target: ~180 LOC
 */

import React, { useState, useMemo } from 'react'
import { Mail } from 'lucide-react'
import { t } from '@/lib/i18n'
import { authenticateGmail } from '@/lib/providers/gmail/chrome-auth'
import { fetchGmailProfile } from '@/lib/providers/gmail/profile'
import { isGmailConfigured } from '@/lib/providers/gmail/config'
import { getAccountStatus } from './account-status'
import { AccountSection } from './shared/AccountSection'
import { AccountRow } from './shared/AccountRow'
import { StatefulButton } from './shared/StatefulButton'
import { Modal } from '../Modal'

interface GmailAccountCardProps {
  account: {
    id: string
    email: string
    lastSyncedLabel?: string
    lastSyncedAt?: number
    tokenExpiresAt?: number
    isSyncing?: boolean
    lastSyncError?: string
  } | null
  onAccountChanged: () => Promise<void>
  disabled?: boolean
}

type ConnectionState = 'idle' | 'loading' | 'success' | 'error'
type ConnectionStage = 'authenticating' | 'loading_profile' | 'saving' | null

export function GmailAccountCard({
  account,
  onAccountChanged,
  disabled = false,
}: GmailAccountCardProps) {
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle')
  const [connectionStage, setConnectionStage] = useState<ConnectionStage>(null)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [showLimitModal, setShowLimitModal] = useState(false)
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false)

  // Calculate account status
  const { status, label: statusLabel } = useMemo(
    () =>
      account
        ? getAccountStatus({
            tokenExpiresAt: account.tokenExpiresAt,
            lastSyncedAt: account.lastSyncedAt,
            lastSyncError: account.lastSyncError,
            isSyncing: account.isSyncing,
          })
        : { status: 'offline' as const, label: '' },
    [account?.tokenExpiresAt, account?.lastSyncedAt, account?.lastSyncError, account?.isSyncing]
  )

  const handleConnect = async () => {
    setConnectionState('loading')
    setConnectionError(null)

    try {
      // 1. Check config
      if (!isGmailConfigured()) {
        setConnectionState('idle')
        setConnectionError(t('toast_connect_invalid_credentials'))
        return
      }

      // 2. Authenticate
      setConnectionStage('authenticating')
      const tokens = await authenticateGmail()

      // 3. Load profile
      setConnectionStage('loading_profile')
      const email = await fetchGmailProfile(tokens.accessToken)

      // 4. Save
      setConnectionStage('saving')
      const storeResponse = await chrome.runtime.sendMessage({
        type: 'STORE_MAILBOX',
        provider: 'gmail',
        email,
        tokens,
      })

      if (storeResponse.success) {
        setConnectionState('idle')
        setConnectionError(null)
        await onAccountChanged()
      } else {
        setConnectionState('idle')
        setConnectionError(storeResponse.error || t('toast_connect_failed'))
      }
    } catch (error) {
      setConnectionState('idle')
      setConnectionError(getConnectionErrorMessage(error))
    } finally {
      setConnectionStage(null)
    }
  }

  const handleDisconnect = async () => {
    if (!account) return

    setConnectionState('loading')
    setConnectionError(null)
    setConfirmingDisconnect(false)

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'REMOVE_MAILBOX',
        mailboxId: account.id,
      })

      if (response.success) {
        setConnectionState('idle')
        setConnectionError(null)
        await onAccountChanged()
      } else {
        setConnectionState('idle')
        setConnectionError(t('toast_disconnect_failed'))
      }
    } catch (error) {
      setConnectionState('idle')
      setConnectionError(t('toast_disconnect_failed'))
    }
  }

  const getStageLabel = (stage: ConnectionStage): string => {
    if (!stage) return t('accounts_connecting')
    if (stage === 'authenticating') return t('accounts_authenticating')
    if (stage === 'loading_profile') return t('accounts_loading_profile')
    if (stage === 'saving') return t('accounts_saving')
    return t('accounts_connecting')
  }

  return (
    <AccountSection
      provider="gmail"
      displayName={t('accounts_provider_gmail')}
      description={
        <>
          {t('accounts_microcopy_gmail')}{' '}
          <button
            type="button"
            onClick={() => setShowLimitModal(true)}
            className="inline-link-button"
            aria-label={t('accounts_gmail_limit_learn_why_aria')}
          >
            {t('accounts_gmail_limit_learn_why')}
          </button>
        </>
      }
      accountCount={account ? 1 : 0}
      maxAccounts={1}
      isConnected={!!account}
      feedbackMessage={connectionError || undefined}
      feedbackType="error"
    >
      {account ? (
        <>
          <AccountRow
            email={account.email}
            statusDot={
              <span
                className={`status-dot status-dot--${status}`}
                role="status"
                aria-label={statusLabel}
              />
            }
            statusLabel={statusLabel}
            metadata={
              account.lastSyncedLabel
                ? t('accounts_last_synced', account.lastSyncedLabel)
                : undefined
            }
            actions={
              confirmingDisconnect ? (
                <div className="confirm-inline" role="alertdialog" aria-label={t('accounts_remove_confirm')}>
                  <p className="confirm-inline__text">{t('accounts_remove_confirm')}</p>
                  <div className="confirm-inline__actions">
                    <StatefulButton
                      state={connectionState}
                      onClick={handleDisconnect}
                      idleText={t('accounts_remove_confirm_button')}
                      loadingText={t('accounts_disconnecting')}
                      variant="danger"
                      disabled={disabled}
                    />
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      onClick={() => setConfirmingDisconnect(false)}
                      disabled={disabled || connectionState === 'loading'}
                    >
                      {t('accounts_remove_cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <StatefulButton
                  state="idle"
                  onClick={() => setConfirmingDisconnect(true)}
                  idleText={t('accounts_disconnect')}
                  loadingText={t('accounts_disconnecting')}
                  variant="danger"
                  disabled={disabled}
                />
              )
            }
          />

          {/* Modal - PRESERVED from GmailAccountRow.tsx */}
          <Modal
            isOpen={showLimitModal}
            onClose={() => setShowLimitModal(false)}
            title={t('accounts_gmail_limit_modal_title')}
            size="medium"
          >
            <p style={{ whiteSpace: 'pre-line', lineHeight: '1.6' }}>
              {t('accounts_gmail_limit_modal_body')}
            </p>
          </Modal>
        </>
      ) : (
        // Empty state
        <div className="empty-slot" role="note">
          <div className="empty-slot__icon">
            <Mail size={24} aria-hidden="true" />
          </div>
          <p className="empty-slot__text">{t('accounts_empty_gmail')}</p>
          <StatefulButton
            state={connectionState}
            onClick={handleConnect}
            idleText={t('accounts_connect_gmail')}
            loadingText={getStageLabel(connectionStage)}
            variant="primary"
            disabled={disabled}
            aria-label="Connect Gmail account"
          />
        </div>
      )}
    </AccountSection>
  )
}

function getConnectionErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes('cancelled')) return t('toast_oauth_cancelled')
    if (error.message.includes('PROFILE_')) return t('toast_connect_profile_failed')
    if (error.message.includes('network')) return t('toast_connect_network_error')
    if (error.message.includes('credentials') || error.message.includes('invalid_client')) {
      return t('toast_connect_invalid_credentials')
    }
    return `${t('toast_connect_failed')}: ${error.message}`
  }
  return t('toast_connect_failed')
}
