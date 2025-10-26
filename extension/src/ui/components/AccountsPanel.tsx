/**
 * AccountsPanel Component (UI Rework)
 *
 * Presents Gmail/Outlook single-slot cards, IMAP placeholder section, and
 * recent email activity aligned with the inboxkey-accounts-single.v2.html design.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { useToast } from '../contexts/ToastContext'
import { authenticateGmail } from '@/lib/providers/gmail/chrome-auth'
import { authenticateOutlook } from '@/lib/providers/outlook/chrome-auth'
import { fetchGmailProfile } from '@/lib/providers/gmail/profile'
import { fetchOutlookProfile } from '@/lib/providers/outlook/profile'
import { isGmailConfigured } from '@/lib/providers/gmail/config'
import { isOutlookConfigured } from '@/lib/providers/outlook/config'
import { TrustIndicator } from './TrustIndicator'
import { t, timeAgo } from '@/lib/i18n'
import type { PopupCache } from '@/shared/popup-messages'
import type { ProviderKey, ProviderSlotState, ImapAccountRow, OutlookAccountRow, RecentItem } from './accounts/types'
import { ProviderSlotCard } from './accounts/ProviderSlotCard'
import { GmailAccountCard } from './accounts/GmailAccountCard'
import { OutlookAccountCard } from './accounts/OutlookAccountCard'
import { ImapAccountCard } from './accounts/ImapAccountCard'
import { RecentEmailsSection } from './accounts/RecentEmailsSection'
import { AddImapAccountModal } from './accounts/AddImapAccountModal'
import { getNativeClient } from '@/lib/providers/imap-bridge/native-client'

import './accounts/AccountsPanel.css'

interface MailboxInfo {
  id: string
  providerId: 'gmail' | 'outlook' | 'imap-bridge'
  email: string
  addedAt: number
  lastSyncedAt: number
  /** OAuth token expiry (undefined for IMAP providers) */
  tokenExpiresAt?: number
  /** IMAP server host (only for IMAP providers) */
  imapServer?: string
}

type ConnectionStage = 'authenticating' | 'loading_profile' | 'saving' | null

interface ConnectionError {
  provider: ProviderKey
  message: string
}

type PopupResponseData = PopupCache | null

const PROVIDER_DISPLAY: Record<ProviderKey, { name: string; microcopy: string; empty: string }> = {
  gmail: {
    name: t('accounts_provider_gmail'),
    microcopy: t('accounts_microcopy_gmail'),
    empty: t('accounts_empty_gmail'),
  },
  outlook: {
    name: t('accounts_provider_outlook'),
    microcopy: t('accounts_microcopy_outlook'),
    empty: t('accounts_empty_outlook'),
  },
}

export function AccountsPanel() {
  const { showToast } = useToast()

  const [mailboxes, setMailboxes] = useState<MailboxInfo[]>([])
  const [connectingProvider, setConnectingProvider] = useState<ProviderKey | null>(null)
  const [connectionStage, setConnectionStage] = useState<ConnectionStage>(null)
  const [connectionError, setConnectionError] = useState<ConnectionError | null>(null)
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

  const getProviderStageLabel = () => {
    if (!connectionStage) return ''
    if (connectionStage === 'authenticating') return t('accounts_authenticating')
    if (connectionStage === 'loading_profile') return t('accounts_loading_profile')
    if (connectionStage === 'saving') return t('accounts_saving')
    return ''
  }

  const handleConnect = async (provider: ProviderKey, mode: 'connect' | 'reconnect' = 'connect') => {
    if (isConnecting) {
      console.log('[AccountsPanel] Connection already in progress, ignoring')
      return
    }

    try {
      setConnectionError(null)

      if (provider === 'gmail' && !isGmailConfigured()) {
        const errorMsg = t('toast_connect_invalid_credentials')
        setConnectionError({ provider, message: errorMsg })
        return
      }

      if (provider === 'outlook' && !isOutlookConfigured()) {
        const errorMsg = t('toast_connect_invalid_credentials')
        setConnectionError({ provider, message: errorMsg })
        return
      }

      setIsConnecting(true)
      setConnectingProvider(provider)
      setConnectionStage('authenticating')

      const authenticate =
        provider === 'gmail' ? authenticateGmail : authenticateOutlook
      const fetchProfile =
        provider === 'gmail' ? fetchGmailProfile : fetchOutlookProfile

      const tokens = await authenticate()
      setConnectionStage('loading_profile')

      const email = await fetchProfile(tokens.accessToken)
      const existing = mailboxes.find((mb) => mb.providerId === provider)

      // Gmail limited to 1 account (Chrome Identity API constraint)
      // Outlook supports multiple accounts (PKCE-based)
      if (mode === 'connect' && provider === 'gmail' && existing) {
        setConnectionError({
          provider,
          message: t('toast_connect_duplicate'),
        })
        return
      }

      setConnectionStage('saving')

      // If reconnecting (same email) or Gmail (single account only), remove old account FIRST
      if (existing && (existing.email === email || provider === 'gmail')) {
        const removeResponse = await chrome.runtime.sendMessage({
          type: 'REMOVE_MAILBOX',
          mailboxId: existing.id,
        })

        if (!removeResponse.success) {
          setConnectionError({
            provider,
            message: removeResponse.error || t('toast_disconnect_failed'),
          })
          return
        }
      }

      const storeResponse = await chrome.runtime.sendMessage({
        type: 'STORE_MAILBOX',
        provider,
        email,
        tokens,
      })

      if (storeResponse.success) {
        await loadMailboxes()
        await loadRecentItems()
      } else {
        setConnectionError({
          provider,
          message: storeResponse.error || t('toast_connect_failed'),
        })
      }
    } catch (error) {
      console.error('[AccountsPanel] Connection error:', error)
      const message = getConnectionErrorMessage(error)
      setConnectionError({ provider, message })
    } finally {
      setIsConnecting(false)
      setConnectingProvider(null)
      setConnectionStage(null)
    }
  }

  const handleDisconnect = async (provider: ProviderKey) => {
    const mailbox = mailboxes.find((mb) => mb.providerId === provider)
    if (!mailbox) return

    if (!confirm(t('accounts_remove_confirm'))) {
      return
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'REMOVE_MAILBOX',
        mailboxId: mailbox.id,
      })

      if (response.success) {
        await loadMailboxes()
        await loadRecentItems()
      } else {
        console.error('[AccountsPanel] Disconnect failed:', response.error)
      }
    } catch (error) {
      console.error('[AccountsPanel] Disconnect failed:', error)
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
        console.error('[AccountsPanel] Failed to add IMAP account:', response.error)
      }
    } catch (error) {
      console.error('[AccountsPanel] Failed to add IMAP account:', error)
    }
  }

  const handleReconnectImap = async (mailboxId: string) => {
    const mailbox = mailboxes.find((mb) => mb.id === mailboxId)
    if (!mailbox) return

    // Extract IMAP metadata from mailbox (we'll need to store this)
    // For now, we'll open the modal with just the email prefilled
    setImapPrefillData({
      email: mailbox.email,
      server: '', // TODO: Store server info in mailbox metadata
      port: 993,
      label: mailbox.email,
    })
    setShowAddImapModal(true)
  }

  const providerSlots = useMemo<ProviderSlotState[]>(() => {
    return (['gmail', 'outlook'] as ProviderKey[]).map((provider) => {
      const display = PROVIDER_DISPLAY[provider]
      const mailbox = mailboxes.find((mb) => mb.providerId === provider)
      const error =
        connectionError && connectionError.provider === provider
          ? connectionError.message
          : null

      const isBusy = connectingProvider === provider && connectionStage !== null
      const status: ProviderSlotState['status'] = isBusy
        ? 'connecting'
        : mailbox
        ? 'connected'
        : 'disconnected'

      const infoLine =
        mailbox && mailbox.email
          ? mailbox.email
          : display.empty

      const lastSyncedLabel =
        mailbox && mailbox.lastSyncedAt
          ? timeAgo(mailbox.lastSyncedAt)
          : undefined

      return {
        provider,
        displayName: display.name,
        status,
        email: mailbox?.email,
        infoLine,
        microcopy: display.microcopy,
        lastSyncedLabel,
        isBusy,
        stageLabel: isBusy ? getProviderStageLabel() : undefined,
        errorMessage: error,
        connectDisabled: false,
      }
    })
  }, [
    mailboxes,
    connectionError,
    connectingProvider,
    connectionStage,
  ])

  const imapAccounts: ImapAccountRow[] = useMemo(() => {
    return mailboxes
      .filter((mb) => mb.providerId === 'imap-bridge')
      .map((mb) => ({
        id: mb.id,
        email: mb.email,
        host: mb.imapServer,
        lastSyncedLabel: mb.lastSyncedAt ? timeAgo(mb.lastSyncedAt) : undefined,
        lastSyncedAt: mb.lastSyncedAt,
        isSyncing: false, // TODO: Track syncing state
        lastSyncError: undefined, // TODO: Track sync errors
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
      isSyncing: false, // TODO: Track syncing state
      lastSyncError: undefined, // TODO: Track sync errors
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
        isSyncing: false, // TODO: Track syncing state
        lastSyncError: undefined, // TODO: Track sync errors
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

      <TrustIndicator />

      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {connectingProvider && connectionStage && (
          <>
            {connectingProvider === 'gmail' && 'Connecting Gmail: '}
            {connectingProvider === 'outlook' && 'Connecting Outlook: '}
            {connectionStage === 'authenticating' && 'Step 1 of 3: ' + t('accounts_authenticating')}
            {connectionStage === 'loading_profile' && 'Step 2 of 3: ' + t('accounts_loading_profile')}
            {connectionStage === 'saving' && 'Step 3 of 3: ' + t('accounts_saving')}
          </>
        )}
      </div>
    </div>
  )
}

function transformRecentItems(cache: PopupCache): RecentItem[] {
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
