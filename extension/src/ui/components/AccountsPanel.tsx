/**
 * AccountsPanel Component (UI Rework)
 *
 * Presents Gmail/Outlook single-slot cards, IMAP placeholder section, and
 * recent email activity aligned with the inboxkey-accounts-single.v2.html design.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { useLockContext } from '../contexts/LockContext'
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
import type { ProviderKey, ProviderSlotState, ImapAccountRow, RecentItem } from './accounts/types'
import { ProviderSlotCard } from './accounts/ProviderSlotCard'
import { ImapAccountsSection } from './accounts/ImapAccountsSection'
import { RecentEmailsSection } from './accounts/RecentEmailsSection'

import './accounts/AccountsPanel.css'

interface MailboxInfo {
  id: string
  providerId: 'gmail' | 'outlook'
  email: string
  addedAt: number
  lastSyncedAt: number
  tokenExpiresAt: number
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
  const { isInitialized, isUnlocked } = useLockContext()
  const { showToast } = useToast()

  const [mailboxes, setMailboxes] = useState<MailboxInfo[]>([])
  const [connectingProvider, setConnectingProvider] = useState<ProviderKey | null>(null)
  const [connectionStage, setConnectionStage] = useState<ConnectionStage>(null)
  const [connectionError, setConnectionError] = useState<ConnectionError | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)

  const [recentItems, setRecentItems] = useState<RecentItem[]>([])
  const [recentLoading, setRecentLoading] = useState(false)

  useEffect(() => {
    if (isUnlocked || !isInitialized) {
      void loadMailboxes()
      void loadRecentItems()
    }
  }, [isUnlocked, isInitialized])

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
        showToast(errorMsg, 'error', 5000)
        return
      }

      if (provider === 'outlook' && !isOutlookConfigured()) {
        const errorMsg = t('toast_connect_invalid_credentials')
        setConnectionError({ provider, message: errorMsg })
        showToast(errorMsg, 'error', 5000)
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

      if (mode === 'connect' && existing) {
        showToast(t('toast_connect_duplicate'), 'error', 5000)
        setConnectionError({
          provider,
          message: t('toast_connect_duplicate'),
        })
        return
      }

      setConnectionStage('saving')
      const storeResponse = await chrome.runtime.sendMessage({
        type: 'STORE_MAILBOX',
        provider,
        email,
        tokens,
      })

      if (storeResponse.success) {
        if (existing) {
          await chrome.runtime.sendMessage({
            type: 'REMOVE_MAILBOX',
            mailboxId: existing.id,
          })
        }

        showToast(
          provider === 'gmail' ? t('toast_gmail_connected') : t('toast_outlook_connected'),
          'success',
          4000
        )
        await loadMailboxes()
        await loadRecentItems()
      } else {
        showToast(storeResponse.error || t('toast_connect_failed'), 'error', 5000)
      }
    } catch (error) {
      console.error('[AccountsPanel] Connection error:', error)
      const message = getConnectionErrorMessage(error)
      setConnectionError({ provider, message })
      showToast(message, 'error', 5000)
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
        showToast(t('toast_account_disconnected'), 'success', 4000)
        await loadMailboxes()
        await loadRecentItems()
      } else {
        showToast(t('toast_disconnect_failed'), 'error', 5000)
      }
    } catch (error) {
      console.error('[AccountsPanel] Disconnect failed:', error)
      showToast(t('toast_disconnect_failed'), 'error', 5000)
    }
  }

  const providerSlots = useMemo<ProviderSlotState[]>(() => {
    return (['gmail', 'outlook'] as ProviderKey[]).map((provider) => {
      const display = PROVIDER_DISPLAY[provider]
      const mailbox = mailboxes.find((mb) => mb.providerId === provider)
      const error =
        connectionError && connectionError.provider === provider
          ? connectionError.message
          : null

      const isLocked = isInitialized && !isUnlocked
      const isBusy = connectingProvider === provider && connectionStage !== null
      const status: ProviderSlotState['status'] = isLocked
        ? 'locked'
        : isBusy
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
        connectDisabled: isLocked,
      }
    })
  }, [
    mailboxes,
    connectionError,
    connectingProvider,
    connectionStage,
    isInitialized,
    isUnlocked,
  ])

  const imapAccounts: ImapAccountRow[] = useMemo(() => {
    return mailboxes
      .filter((mb) => mb.providerId === 'imap-bridge')
      .map((mb) => ({
        id: mb.id,
        email: mb.email,
        lastSyncedLabel: mb.lastSyncedAt ? timeAgo(mb.lastSyncedAt) : undefined,
      }))
  }, [mailboxes])

  const handleCopyCode = async (item: RecentItem) => {
    if (!item.code) return
    try {
      await navigator.clipboard.writeText(item.code)
      await chrome.runtime.sendMessage({ type: 'MARK_CODE_USED', code: item.code })
      showToast(t('toast_code_copied', item.code), 'success', 3000)
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
      const domain = item.domain || new URL(item.url).hostname
      showToast(`🔗 Opened ${domain}`, 'success', 3000)
    } catch (error) {
      console.error('[AccountsPanel] Failed to open link:', error)
      showToast(t('toast_error_link'), 'error', 5000)
    }
  }

  if (isInitialized && !isUnlocked) {
    return (
      <div className="accounts-panel accounts-panel--locked">
        <p className="accounts-panel__lock-message">{t('accounts_panel_locked')}</p>
      </div>
    )
  }

  return (
    <div className="accounts-panel">
      <section className="accounts-section" aria-labelledby="connected-accounts-title">
        <div className="accounts-section__header">
          <div>
            <h2 id="connected-accounts-title" className="accounts-section__title">
              {t('accounts_panel_heading')}
            </h2>
            <p className="accounts-section__description">
              {t('accounts_panel_summary')}
            </p>
          </div>
        </div>

        <div className="provider-grid">
          {providerSlots.map((slot) => (
            <ProviderSlotCard
              key={slot.provider}
              slot={slot}
              onConnect={() => handleConnect(slot.provider, 'connect')}
              onDisconnect={() => handleDisconnect(slot.provider)}
            />
          ))}
        </div>
      </section>

      <ImapAccountsSection
        accounts={imapAccounts}
        disabled
        isLocked={isInitialized && !isUnlocked}
      />

      <RecentEmailsSection
        items={recentItems}
        onCopyCode={handleCopyCode}
        onOpenLink={handleOpenLink}
        isLocked={isInitialized && !isUnlocked}
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
