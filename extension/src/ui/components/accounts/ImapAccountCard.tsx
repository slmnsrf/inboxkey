/**
 * ImapAccountCard - IMAP-specific account card (Phase 3)
 *
 * Implements unified provider card pattern with:
 * - AccountSection wrapper for consistency
 * - AccountRow layout primitive
 * - Multi-account support
 * - Modal-based Add/Reconnect flows (managed by parent)
 * - Plain buttons for Retry/Remove/Refresh operations
 *
 * Target: ~220 LOC
 */

import React, { useState, useEffect } from 'react'
import { Server, Plus } from 'lucide-react'
import { t } from '@/lib/i18n'
import { getAccountStatus } from './account-status'
import { AccountSection } from './shared/AccountSection'
import { AccountRow } from './shared/AccountRow'
import { getNativeClient } from '@/lib/native-messaging'

interface ImapAccountCardProps {
  accounts: Array<{
    id: string
    email: string
    host?: string
    lastSyncedLabel?: string
    lastSyncedAt?: number
    isSyncing?: boolean
    lastSyncError?: string
  }>
  onAccountChanged: () => Promise<void>
  disabled?: boolean
  maxAccounts?: number
  onAddImap: () => void
  onReconnectImap?: (mailboxId: string) => void
}

type RemoveState = 'idle' | 'loading' | 'success' | 'error'

export function ImapAccountCard({
  accounts,
  onAccountChanged,
  disabled = false,
  maxAccounts,
  onAddImap,
}: ImapAccountCardProps) {
  const [removeState, setRemoveState] = useState<RemoveState>('idle')
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [confirmingRemoveId, setConfirmingRemoveId] = useState<string | null>(null)
  const [bridgeStatus, setBridgeStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking')
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<Record<string, 'success' | 'error' | null>>({})

  // Check InboxBridge status when IMAP accounts exist
  useEffect(() => {
    if (accounts.length === 0) {
      setBridgeStatus('checking')
      return
    }

    let cancelled = false
    const checkBridge = async () => {
      try {
        const client = getNativeClient()
        const status = await client.checkInstallStatus()
        if (!cancelled) {
          setBridgeStatus(status.installed ? 'connected' : 'disconnected')
        }
      } catch {
        if (!cancelled) setBridgeStatus('disconnected')
      }
    }

    checkBridge()
    return () => { cancelled = true }
  }, [accounts.length])

  const handleRemove = async (mailboxId: string) => {
    setConfirmingRemoveId(null)
    setRemovingId(mailboxId)
    setRemoveState('loading')
    setRemoveError(null)

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'REMOVE_MAILBOX',
        mailboxId,
      })

      if (response.success) {
        setRemoveState('idle')
        setRemoveError(null)
        await onAccountChanged()
      } else {
        setRemoveState('idle')
        setRemoveError(t('toast_disconnect_failed'))
      }
    } catch (error) {
      setRemoveState('idle')
      setRemoveError(t('toast_disconnect_failed'))
    } finally {
      setRemovingId(null)
    }
  }

  const handleTest = async (accountId: string) => {
    setTestingId(accountId)
    setTestResult(prev => ({ ...prev, [accountId]: null }))
    setRemoveError(null)
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'TEST_MAILBOX_CONNECTION',
        mailboxId: accountId,
      })
      if (response.success) {
        setTestResult(prev => ({ ...prev, [accountId]: 'success' }))
        setTimeout(() => {
          setTestResult(prev => ({ ...prev, [accountId]: null }))
        }, 2000)
      } else {
        setTestResult(prev => ({ ...prev, [accountId]: 'error' }))
        setRemoveError(response.error || 'Connection test failed')
        setTimeout(() => {
          setTestResult(prev => ({ ...prev, [accountId]: null }))
        }, 4000)
      }
    } catch {
      setTestResult(prev => ({ ...prev, [accountId]: 'error' }))
      setRemoveError('Test failed unexpectedly')
      setTimeout(() => {
        setTestResult(prev => ({ ...prev, [accountId]: null }))
      }, 4000)
    } finally {
      setTestingId(null)
    }
  }

  return (
    <AccountSection
      provider="imap-bridge"
      displayName={t('accounts_imap_heading')}
      description={t('accounts_imap_description')}
      accountCount={accounts.length}
      maxAccounts={maxAccounts}
      isConnected={accounts.length > 0}
      feedbackMessage={removeError || undefined}
      feedbackType="error"
      actionButton={
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          onClick={onAddImap}
          disabled={disabled}
          aria-label={t('accounts_imap_add')}
        >
          <Plus size={14} aria-hidden="true" />
          {t('accounts_imap_add')}
        </button>
      }
    >
      {bridgeStatus === 'disconnected' && accounts.length > 0 && (
        <div className="alert alert--warning" role="alert" style={{ marginBottom: 'var(--space-3, 12px)' }}>
          <p>
            <strong>{t('accounts_imap_bridge_not_installed')}</strong>
          </p>
          <p style={{ fontSize: 'var(--font-size-sm)', marginTop: 'var(--space-1, 4px)' }}>
            {t('accounts_imap_bridge_install_instructions')}
          </p>
        </div>
      )}
      {accounts.length > 0 ? (
        accounts.map((account) => {
          const { status: accountStatus, label: accountLabel } = getAccountStatus({
            lastSyncedAt: account.lastSyncedAt,
            lastSyncError: account.lastSyncError,
            isSyncing: account.isSyncing,
          })

          // Override status when InboxBridge is disconnected
          const status = bridgeStatus === 'disconnected' ? 'offline' : accountStatus
          const statusLabel = bridgeStatus === 'disconnected'
            ? t('accounts_imap_bridge_not_installed')
            : accountLabel

          const isThisRemoving = removingId === account.id

          // Display label: host if available, otherwise generic
          const displayLabel = account.host
            ? t('accounts_imap_host', account.host)
            : t('accounts_imap_generic_host')

          if (confirmingRemoveId === account.id) {
            return (
              <div key={account.id} className="confirm-replace" role="alertdialog" aria-label={t('accounts_remove_confirm')}>
                <p className="confirm-replace__text">{t('accounts_remove_confirm')}</p>
                <div className="confirm-replace__actions">
                  <button
                    type="button"
                    className="btn btn--danger-ghost btn--sm"
                    onClick={() => handleRemove(account.id)}
                    disabled={disabled || (isThisRemoving && removeState === 'loading')}
                    aria-busy={isThisRemoving && removeState === 'loading'}
                  >
                    {isThisRemoving && removeState === 'loading' ? t('accounts_removing') : t('accounts_remove_confirm_button')}
                  </button>
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={() => setConfirmingRemoveId(null)}
                    disabled={disabled || removeState === 'loading'}
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
              className={account.lastSyncError ? 'account-row--error' : ''}
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
                      className={`btn btn--sm ${testResult[account.id] === 'success' ? 'btn--success-ghost' : testResult[account.id] === 'error' ? 'btn--danger-ghost' : 'btn--secondary'}`}
                      onClick={() => handleTest(account.id)}
                      disabled={disabled || testingId === account.id || testResult[account.id] != null}
                      aria-busy={testingId === account.id}
                    >
                      {testingId === account.id ? t('accounts_testing')
                        : testResult[account.id] === 'success' ? t('accounts_test_success')
                        : testResult[account.id] === 'error' ? t('accounts_test_failed')
                        : t('accounts_test')}
                    </button>
                    <button
                      type="button"
                      className="btn btn--danger-ghost btn--sm"
                      onClick={() => setConfirmingRemoveId(account.id)}
                      disabled={disabled}
                      aria-label={t('aria_remove_imap', [account.email])}
                    >
                      {t('accounts_remove_button')}
                    </button>
                  </>
              }
            >
              {/* Host info as additional metadata */}
              {account.host && (
                <span
                  className="imap-subtext"
                  style={{
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  {displayLabel}
                </span>
              )}
              {account.lastSyncError && (
                <div className="imap-error-detail">
                  <span className="imap-error-detail__message">
                    {account.lastSyncError}
                  </span>
                </div>
              )}
            </AccountRow>
          )
        })
      ) : (
        <div className="empty-slot" role="note">
          <div className="empty-slot__icon">
            <Server size={24} aria-hidden="true" />
          </div>
          <p className="empty-slot__text">{t('accounts_empty_imap')}</p>
          <button
            type="button"
            className="btn btn--primary"
            onClick={onAddImap}
            disabled={disabled}
          >
            {t('accounts_imap_add_cta')}
          </button>
        </div>
      )}
    </AccountSection>
  )
}
