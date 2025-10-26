/**
 * ImapAccountCard - IMAP-specific account card (Phase 3)
 *
 * Implements unified provider card pattern with:
 * - AccountSection wrapper for consistency
 * - AccountRow layout primitive
 * - Multi-account support
 * - Modal-based Add/Reconnect flows (managed by parent)
 * - StatefulButton for Remove operation only
 *
 * Target: ~220 LOC
 */

import React, { useState } from 'react'
import { t } from '@/lib/i18n'
import { getAccountStatus } from './account-status'
import { AccountSection } from './shared/AccountSection'
import { AccountRow } from './shared/AccountRow'
import { StatefulButton } from './shared/StatefulButton'
import { getNativeClient } from '@/lib/providers/imap-bridge/native-client'

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
  onReconnectImap: (mailboxId: string) => void
}

type RemoveState = 'idle' | 'loading' | 'success' | 'error'

export function ImapAccountCard({
  accounts,
  onAccountChanged,
  disabled = false,
  maxAccounts,
  onAddImap,
  onReconnectImap,
}: ImapAccountCardProps) {
  const [removeState, setRemoveState] = useState<RemoveState>('idle')
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const handleRemove = async (mailboxId: string) => {
    if (!confirm(t('accounts_remove_confirm'))) {
      return
    }

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

        // Also try to remove from native app
        try {
          const client = getNativeClient()
          await client.call('account.remove', { accountId: mailboxId })
        } catch (error) {
          console.warn('[ImapAccountCard] Failed to remove from native app:', error)
        }
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

  return (
    <AccountSection
      provider="imap-bridge"
      displayName={t('accounts_imap_heading')}
      description={t('accounts_imap_description')}
      accountCount={accounts.length}
      maxAccounts={maxAccounts}
      feedbackMessage={removeError || undefined}
      feedbackType="error"
      actionButton={
        <button
          type="button"
          className="btn btn--primary"
          onClick={onAddImap}
          disabled={disabled}
          aria-label="Add IMAP account"
        >
          {t('accounts_imap_add')}
        </button>
      }
    >
      {accounts.length > 0 ? (
        accounts.map((account) => {
          const { status, label: statusLabel } = getAccountStatus({
            lastSyncedAt: account.lastSyncedAt,
            lastSyncError: account.lastSyncError,
            isSyncing: account.isSyncing,
          })

          const isThisRemoving = removingId === account.id

          // Display label: host if available, otherwise generic
          const displayLabel = account.host
            ? t('accounts_imap_host', account.host)
            : t('accounts_imap_generic_host')

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
                    className="btn btn--secondary"
                    onClick={() => onReconnectImap(account.id)}
                    disabled={disabled}
                    aria-label={`Reconnect ${account.email}`}
                  >
                    {t('accounts_reconnect')}
                  </button>
                  <StatefulButton
                    state={isThisRemoving ? removeState : 'idle'}
                    onClick={() => handleRemove(account.id)}
                    idleText={t('accounts_remove_button')}
                    loadingText={t('accounts_removing')}
                    variant="danger"
                    disabled={disabled}
                    aria-label={`Remove ${account.email}`}
                  />
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
            </AccountRow>
          )
        })
      ) : (
        <div className="empty-state" role="note">
          {t('accounts_empty_imap')}
        </div>
      )}
    </AccountSection>
  )
}
