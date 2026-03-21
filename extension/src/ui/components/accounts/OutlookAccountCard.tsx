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
          `Account mismatch. Expected ${expectedEmail} but got ${actualEmail}. Please sign in with the correct account.`
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
      actionButton={
        <StatefulButton
          state={connectionState}
          onClick={handleAdd}
          idleText={t('accounts_connect_outlook')}
          loadingText={getStageLabel(connectionStage)}
          variant="primary"
          disabled={disabled}
          aria-label="Add Outlook account"
        />
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
                confirmingRemoveId === account.id ? (
                  <div className="confirm-inline" role="alertdialog" aria-label={t('accounts_remove_confirm')}>
                    <p className="confirm-inline__text">{t('accounts_remove_confirm')}</p>
                    <div className="confirm-inline__actions">
                      <StatefulButton
                        state={connectionState}
                        onClick={() => handleRemove(account.id)}
                        idleText={t('accounts_remove_confirm_button')}
                        loadingText={t('accounts_removing')}
                        variant="danger"
                        disabled={disabled}
                      />
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
                ) : (
                  <>
                    <StatefulButton
                      state={isThisReconnecting ? connectionState : 'idle'}
                      onClick={() => handleReconnect(account.id)}
                      idleText={t('accounts_reconnect')}
                      loadingText={t('accounts_reconnecting')}
                      variant="secondary"
                      disabled={disabled || connectionState === 'loading'}
                      aria-label={`Reconnect ${account.email}`}
                    />
                    <StatefulButton
                      state="idle"
                      onClick={() => setConfirmingRemoveId(account.id)}
                      idleText={t('accounts_remove_button')}
                      loadingText={t('accounts_removing')}
                      variant="danger"
                      disabled={disabled || connectionState === 'loading'}
                      aria-label={`Remove ${account.email}`}
                    />
                  </>
                )
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
