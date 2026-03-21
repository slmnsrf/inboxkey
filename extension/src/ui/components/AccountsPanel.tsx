/**
 * AccountsPanel Component (UI Rework)
 *
 * Presents Gmail/Outlook single-slot cards, IMAP placeholder section, and
 * recent email activity aligned with the inboxkey-accounts-single.v2.html design.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { useToast } from '../contexts/ToastContext'
import { t, timeAgo } from '@/lib/i18n'
import type { UnifiedPopupCache } from '@/shared/popup-messages'
import type { ProviderKey, ImapAccountRow, OutlookAccountRow, RecentItem } from './accounts/types'
import { GmailAccountCard } from './accounts/GmailAccountCard'
import { OutlookAccountCard } from './accounts/OutlookAccountCard'
import { ImapAccountCard } from './accounts/ImapAccountCard'
import { RecentEmailsSection } from './accounts/RecentEmailsSection'
import { AddImapAccountModal } from './accounts/AddImapAccountModal'

import './accounts/AccountsPanel.css'

interface MailboxInfo {
  id: string
  providerId: 'gmail' | 'outlook' | 'imap-bridge'
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
}

type PopupResponseData = UnifiedPopupCache | null

export function AccountsPanel() {
  const { showToast } = useToast()

  const [mailboxes, setMailboxes] = useState<MailboxInfo[]>([])
  const [isConnecting, setIsConnecting] = useState(false)

  const [recentItems, setRecentItems] = useState<RecentItem[]>([])
  const [recentLoading, setRecentLoading] = useState(false)

  // IMAP modal state
  const [showAddImapModal, setShowAddImapModal] = useState(false)
  const [imapPrefillData, setImapPrefillData] = useState<{
    email: string
    server: string
    port: number
    label: string
  } | undefined>(undefined)

  useEffect(() => {
    void loadMailboxes()
    void loadRecentItems()
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
      console.error('[AccountsPanel] Failed to load mailboxes:', error)
    }
  }

  const loadRecentItems = async () => {
    setRecentLoading(true)
    try {
      const response = (await chrome.runtime.sendMessage({ type: 'GET_POPUP_DATA' })) as {
        success: boolean
        data?: PopupResponseData
        error?: string
      }

      if (!response.success || !response.data) {
        console.warn('[AccountsPanel] No recent popup data available:', response.error)
        setRecentItems([])
        return
      }

      setRecentItems(transformRecentItems(response.data))
    } catch (error) {
      console.error('[AccountsPanel] Failed to load recent items:', error)
      setRecentItems([])
    } finally {
      setRecentLoading(false)
    }
  }

  const handleAddImap = () => {
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
      console.error('[AccountsPanel] Failed to add IMAP account:', error)
      throw error
    }
  }

  const handleReconnectImap = async (mailboxId: string) => {
    const mailbox = mailboxes.find((mb) => mb.id === mailboxId)
    if (!mailbox) return

    // Use IMAP metadata from mailbox for reconnection
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

  const outlookAccounts: OutlookAccountRow[] = useMemo(() => {
    return mailboxes
      .filter((mb) => mb.providerId === 'outlook')
      .map((mb) => ({
        id: mb.id,
        email: mb.email,
        lastSyncedLabel: mb.lastSyncedAt ? timeAgo(mb.lastSyncedAt) : undefined,
        lastSyncedAt: mb.lastSyncedAt,
        tokenExpiresAt: mb.tokenExpiresAt,
        isSyncing: false,
        lastSyncError: mb.lastSyncError,
      }))
  }, [mailboxes])

  const handleCopyCode = async (item: RecentItem) => {
    if (!item.code) return
    try {
      await navigator.clipboard.writeText(item.code)
      await chrome.runtime.sendMessage({ type: 'MARK_CODE_USED', code: item.code })
      // Visual feedback via button text change - no toast needed
    } catch (error) {
      console.error('[AccountsPanel] Failed to copy code:', error)
      showToast(t('toast_error_copy'), 'error', 5000)
    }
  }

  const handleOpenLink = async (item: RecentItem) => {
    if (!item.url) return
    try {
      await chrome.runtime.sendMessage({ type: 'MARK_LINK_OPENED', url: item.url })
      await chrome.tabs.create({ url: item.url })
      // Visual feedback via button text color transition - no toast needed
    } catch (error) {
      console.error('[AccountsPanel] Failed to open link:', error)
      showToast(t('toast_error_link'), 'error', 5000)
    }
  }

  return (
    <div className="accounts-panel">
      <GmailAccountCard
        account={gmailAccount}
        onAccountChanged={async () => {
          await loadMailboxes()
          await loadRecentItems()
        }}
        disabled={isConnecting}
      />

      <OutlookAccountCard
        accounts={outlookAccounts}
        onAccountChanged={async () => {
          await loadMailboxes()
          await loadRecentItems()
        }}
        disabled={isConnecting}
        maxAccounts={10}
      />

      <ImapAccountCard
        accounts={imapAccounts}
        onAccountChanged={async () => {
          await loadMailboxes()
          await loadRecentItems()
        }}
        disabled={isConnecting}
        maxAccounts={10}
        onAddImap={handleAddImap}
        onReconnectImap={handleReconnectImap}
      />

      <AddImapAccountModal
        isOpen={showAddImapModal}
        onConfirm={handleImapAdded}
        onCancel={() => setShowAddImapModal(false)}
        prefillData={imapPrefillData}
      />

      <RecentEmailsSection
        items={recentItems}
        onCopyCode={handleCopyCode}
        onOpenLink={handleOpenLink}
        loading={recentLoading}
      />

    </div>
  )
}

function transformRecentItems(cache: UnifiedPopupCache): RecentItem[] {
  const codes = (cache.codes || []).map<RecentItem>((code) => ({
    id: `code:${code.code}:${code.receivedAt}`,
    kind: 'code',
    provider: mapProvider(code.providerId),
    from: code.from,
    subject: code.subject,
    receivedAt: code.receivedAt,
    receivedLabel: timeAgo(code.receivedAt),
    code: code.code,
  }))

  const links = (cache.magicLinks || []).map<RecentItem>((link) => ({
    id: `link:${link.url}:${link.receivedAt}`,
    kind: 'link',
    provider: mapProvider(link.providerId),
    from: link.from,
    subject: link.subject,
    receivedAt: link.receivedAt,
    receivedLabel: timeAgo(link.receivedAt),
    url: link.url,
    domain: link.source,
  }))

  return [...codes, ...links].sort((a, b) => b.receivedAt - a.receivedAt)
}

function mapProvider(providerId?: string): 'gmail' | 'outlook' | 'imap' | undefined {
  if (providerId === 'gmail' || providerId === 'outlook') return providerId
  if (providerId === 'imap-bridge') return 'imap'
  return undefined
}

