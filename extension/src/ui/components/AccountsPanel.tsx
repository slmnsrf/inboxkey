/**
 * AccountsPanel Component (UI Rework)
 *
 * Presents Gmail single-slot card, Google Messages SMS card,
 * IMAP placeholder section, and recent email activity aligned with
 * the inboxkey-accounts-single.v2.html design.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { t } from '@/lib/i18n'
import type { ImapAccountRow } from './accounts/types'
import { GmailAccountCard } from './accounts/GmailAccountCard'
import { ImapAccountCard } from './accounts/ImapAccountCard'
import { GoogleMessagesCard } from './accounts/GoogleMessagesCard'
import { AddImapAccountModal } from './accounts/AddImapAccountModal'

import './accounts/AccountsPanel.css'

interface MailboxInfo {
  id: string
  providerId: 'gmail' | 'imap-bridge' | 'google-messages'
  email: string
  addedAt: number
  lastSyncedAt: number
  /** Last sync error message (undefined = no error) */
  lastSyncError?: string
  /** OAuth token expiry (undefined for IMAP providers) */
  tokenExpiresAt?: number
  /** IMAP server host (only for IMAP providers) */
  imapServer?: string
  /** IMAP server port (only for IMAP providers) */
  imapPort?: number
  /** Google Messages phone number (only for google-messages provider) */
  gmPhoneNumber?: string
}

type PopupResponseData = UnifiedPopupCache | null

export function AccountsPanel() {

  const [mailboxes, setMailboxes] = useState<MailboxInfo[]>([])
  const [isConnecting, setIsConnecting] = useState(false)


  // IMAP modal state
  const [showAddImapModal, setShowAddImapModal] = useState(false)
  const [reconnectingMailboxId, setReconnectingMailboxId] = useState<string | null>(null)
  const [imapPrefillData, setImapPrefillData] = useState<{
    email: string
    server: string
    port: number
    label: string
  } | undefined>(undefined)

  useEffect(() => {
    void loadMailboxes()
  }, [])

  const loadMailboxes = async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_MAILBOXES' })
      if (response.success) {
        setMailboxes(response.mailboxes)
      } else {
        console.warn('[AccountsPanel] Failed to load mailboxes:', response.error)
      }
    } catch (error) {
      console.warn('[AccountsPanel] Failed to load mailboxes:', error)
    }
  }


  const handleAddImap = () => {
    setReconnectingMailboxId(null)
    setImapPrefillData(undefined)
    setShowAddImapModal(true)
  }

  const handleImapAdded = async (accountData: {
    accountId: string
    email: string
    server: string
    port: number
    label: string
  }) => {
    try {
      // If reconnecting, remove old mailbox first to avoid duplicate rejection
      if (reconnectingMailboxId) {
        const removeResponse = await chrome.runtime.sendMessage({
          type: 'REMOVE_MAILBOX',
          mailboxId: reconnectingMailboxId,
        })
        if (!removeResponse.success) {
          throw new Error(removeResponse.error || t('toast_disconnect_failed'))
        }
        setReconnectingMailboxId(null)
      }

      const response = await chrome.runtime.sendMessage({
        type: 'STORE_IMAP_MAILBOX',
        accountId: accountData.accountId,
        email: accountData.email,
        server: accountData.server,
        port: accountData.port,
        label: accountData.label,
      })

      if (response.success) {
        await loadMailboxes()
        await loadRecentItems()
        setShowAddImapModal(false)
      } else {
        throw new Error(response.error || t('toast_connect_failed'))
      }
    } catch (error) {
      console.warn('[AccountsPanel] Failed to add IMAP account:', error)
      throw error
    }
  }

  const handleReconnectImap = async (mailboxId: string) => {
    const mailbox = mailboxes.find((mb) => mb.id === mailboxId)
    if (!mailbox) return

    // Track which mailbox is being reconnected so handleImapAdded removes it first
    setReconnectingMailboxId(mailboxId)
    setImapPrefillData({
      email: mailbox.email,
      server: mailbox.imapServer || '',
      port: mailbox.imapPort || 993,
      label: mailbox.email,
    })
    setShowAddImapModal(true)
  }

  const imapAccounts: ImapAccountRow[] = useMemo(() => {
    return mailboxes
      .filter((mb) => mb.providerId === 'imap-bridge')
      .map((mb) => ({
        id: mb.id,
        email: mb.email,
        host: mb.imapServer,
        lastSyncedLabel: mb.lastSyncedAt ? timeAgo(mb.lastSyncedAt) : undefined,
        lastSyncedAt: mb.lastSyncedAt,
        isSyncing: false,
        lastSyncError: mb.lastSyncError,
      }))
  }, [mailboxes])

  const gmailAccount = useMemo(() => {
    const mailbox = mailboxes.find((mb) => mb.providerId === 'gmail')
    if (!mailbox) return null
    return {
      id: mailbox.id,
      email: mailbox.email,
      lastSyncedLabel: mailbox.lastSyncedAt ? timeAgo(mailbox.lastSyncedAt) : undefined,
      lastSyncedAt: mailbox.lastSyncedAt,
      tokenExpiresAt: mailbox.tokenExpiresAt,
      isSyncing: false,
      lastSyncError: mailbox.lastSyncError,
    }
  }, [mailboxes])

  const googleMessagesMailbox = useMemo(() => {
    const mailbox = mailboxes.find((mb) => mb.providerId === 'google-messages')
    if (!mailbox) return undefined
    return {
      id: mailbox.id,
      gmPhoneNumber: mailbox.gmPhoneNumber,
      lastSyncError: mailbox.lastSyncError,
    }
  }, [mailboxes])

  return (
    <div className="accounts-panel">
      <GmailAccountCard
        account={gmailAccount}
        onAccountChanged={async () => {
          await loadMailboxes()
        }}
        disabled={isConnecting}
      />

      <ImapAccountCard
        accounts={imapAccounts}
        onAccountChanged={async () => {
          await loadMailboxes()
        }}
        disabled={isConnecting}
        maxAccounts={10}
        onAddImap={handleAddImap}
        onReconnectImap={handleReconnectImap}
      />

      <GoogleMessagesCard
        mailbox={googleMessagesMailbox}
        onUpdate={async () => {
          await loadMailboxes()
        }}
      />

      <AddImapAccountModal
        isOpen={showAddImapModal}
        onConfirm={handleImapAdded}
        onCancel={() => setShowAddImapModal(false)}
        prefillData={imapPrefillData}
      />

    </div>
  )
}


