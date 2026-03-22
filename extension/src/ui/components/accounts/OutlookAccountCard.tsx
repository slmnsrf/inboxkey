/**
 * OutlookAccountCard - Outlook-specific account card (Phase 3)
 *
 * Implements unified provider card pattern with:
 * - StatefulButton for Add/Reconnect/Remove operations
 * - AccountSection wrapper for consistency
 * - AccountRow layout primitive
 * - Multi-account support (unlike Gmail)
 * - Local state management for connection flows
 *
 * Target: ~220 LOC
 */

import React, { useState } from 'react'
import { Mail } from 'lucide-react'
import { t } from '@/lib/i18n'
import { authenticateOutlook } from '@/lib/providers/outlook/chrome-auth'
import { fetchOutlookProfile } from '@/lib/providers/outlook/profile'
import { isOutlookConfigured } from '@/lib/providers/outlook/config'
import { getAccountStatus } from './account-status'
import { AccountSection } from './shared/AccountSection'
import { AccountRow } from './shared/AccountRow'
import { StatefulButton } from './shared/StatefulButton'
import { getConnectionErrorMessage } from './shared/connection-errors'

interface OutlookAccountCardProps {
  accounts: Array<{
    id: string
    email: string
    lastSyncedLabel?: string
    lastSyncedAt?: number
    tokenExpiresAt?: number
    isSyncing?: boolean
    lastSyncError?: string
  }>
  onAccountChanged: () => Promise<void>
  disabled?: boolean
  maxAccounts?: number
}

type ConnectionState = 'idle' | 'loading' | 'success' | 'error'
type ConnectionStage = 'authenticating' | 'loading_profile' | 'saving' | null

export function OutlookAccountCard({
  accounts,
  onAccountChanged,
  disabled = false,
  maxAccounts = 10,
}: OutlookAccountCardProps) {
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle')
  const [connectionStage, setConnectionStage] = useState<ConnectionStage>(null)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [reconnectingId, setReconnectingId] = useState<string | null>(null)
  const [confirmingRemoveId, setConfirmingRemoveId] = useState<string | null>(null)

  const handleAdd = async () => {
    setConnectionState('loading')
    setConnectionError(null)

    try {
      // 1. Check config
      if (!isOutlookConfigured()) {
        setConnectionState('idle')
        setConnectionError(t('toast_connect_invalid_credentials'))
        return
      }

      // 2. Authenticate
      setConnectionStage('authenticating')
      const tokens = await authenticateOutlook()

      // 3. Load profile
      setConnectionStage('loading_profile')
      const email = await fetchOutlookProfile(tokens.accessToken)

      // 4. Save
      setConnectionStage('saving')
      const storeResponse = await chrome.runtime.sendMessage({
        type: 'STORE_MAILBOX',
        provider: 'outlook',
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

  const handleReconnect = async (mailboxId: string) => {
    const account = accounts.find((a) => a.id === mailboxId)
    if (!account) return

    const expectedEmail = account.email
    setReconnectingId(mailboxId)
    setConnectionState('loading')
    setConnectionError(null)

    try {
      setConnectionStage('authenticating')
      const tokens = await authenticateOutlook()

      setConnectionStage('loading_profile')
      const actualEmail = await fetchOutlookProfile(tokens.accessToken)

      // Validate correct account
      if (actualEmail.toLowerCase() !== expectedEmail.toLowerCase()) {
        setConnectionState('idle')
        setConnectionError(
          t('accounts_mismatch_error', [expectedEmail, actualEmail])
        )
        return
      }

      setConnectionStage('saving')

      // Remove old account FIRST
      const removeResponse = await chrome.runtime.sendMessage({
        type: 'REMOVE_MAILBOX',
        mailboxId,
      })

      if (!removeResponse.success) {
        setConnectionState('idle')
        setConnectionError(removeResponse.error || t('toast_disconnect_failed'))
        return
      }

      // Then store new account with fresh tokens
      const storeResponse = await chrome.runtime.sendMessage({
        type: 'STORE_MAILBOX',
        provider: 'outlook',
        email: actualEmail,
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
      setReconnectingId(null)
      setConnectionStage(null)
    }
  }

  const handleRemove = async (mailboxId: string) => {
    setConfirmingRemoveId(null)
    setConnectionState('loading')
    setConnectionError(null)

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'REMOVE_MAILBOX',
        mailboxId,
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
      provider="outlook"
      displayName={t('accounts_provider_outlook')}
      description={t('accounts_microcopy_outlook')}
      accountCount={accounts.length}
      maxAccounts={maxAccounts}
      isConnected={accounts.length > 0}
      feedbackMessage={connectionError || undefined}
      feedbackType="error"
      feedbackAutoDismiss={connectionError !== t('toast_oauth_cancelled')}
      actionButton={
        connectionState === 'loading' && !reconnectingId ? (
          <div className="connecting-status" role="status" aria-live="polite">
            <span className="connecting-spinner" aria-hidden="true" />
            <span>{getStageLabel(connectionStage)}</span>
          </div>
        ) : (
          <StatefulButton
            state={reconnectingId ? 'idle' : connectionState}
            onClick={handleAdd}
            idleText={t('accounts_connect_outlook')}
            loadingText={getStageLabel(connectionStage)}
            variant="primary"
            disabled={disabled}
            aria-label={t('aria_add_outlook_account')}
          />
        )
      }
    >
      {accounts.length > 0 ? (
        accounts.map((account) => {
          const { status, label: statusLabel } = getAccountStatus({
            tokenExpiresAt: account.tokenExpiresAt,
            lastSyncedAt: account.lastSyncedAt,
            lastSyncError: account.lastSyncError,
            isSyncing: account.isSyncing,
          })

          const isThisReconnecting = reconnectingId === account.id

          if (confirmingRemoveId === account.id) {
            return (
              <div key={account.id} className="confirm-replace" role="alertdialog" aria-label={t('accounts_remove_confirm')}>
                <p className="confirm-replace__text">{t('accounts_remove_confirm')}</p>
                <div className="confirm-replace__actions">
                  <button
                    type="button"
                    className="btn btn--danger-ghost btn--sm"
                    onClick={() => handleRemove(account.id)}
                    disabled={disabled || connectionState === 'loading'}
                    aria-busy={connectionState === 'loading'}
                  >
                    {connectionState === 'loading' ? t('accounts_removing') : t('accounts_remove_confirm_button')}
                  </button>
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={() => setConfirmingRemoveId(null)}
                    disabled={disabled || connectionState === 'loading'}
                  >
                    {t('accounts_remove_cancel')}
                  </button>
                </div>
              </div>
            )
          }

          return (
            <AccountRow
              key={account.id}
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
                <>
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      onClick={() => handleReconnect(account.id)}
                      disabled={disabled || connectionState === 'loading'}
                      aria-label={t('aria_reconnect_account', [account.email])}
                    >
                      {isThisReconnecting && connectionState === 'loading' ? t('accounts_reconnecting') : t('accounts_reconnect')}
                    </button>
                    <button
                      type="button"
                      className="btn btn--danger-ghost btn--sm"
                      onClick={() => setConfirmingRemoveId(account.id)}
                      disabled={disabled || connectionState === 'loading'}
                      aria-label={t('aria_remove_account', [account.email])}
                    >
                      {t('accounts_remove_button')}
                    </button>
                  </>
              }
            />
          )
        })
      ) : (
        <div className="empty-slot" role="note">
          <div className="empty-slot__icon">
            <Mail size={24} aria-hidden="true" />
          </div>
          <p className="empty-slot__text">{t('accounts_empty_outlook')}</p>
          {connectionState === 'loading' && !reconnectingId && (
            <div className="connecting-status" role="status" aria-live="polite">
              <span className="connecting-spinner" aria-hidden="true" />
              <span>{getStageLabel(connectionStage)}</span>
            </div>
          )}
        </div>
      )}
    </AccountSection>
  )
}
