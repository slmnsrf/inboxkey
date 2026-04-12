/**
 * AccountsPanel v2 - Unified Accounts Tab
 *
 * Replaces per-provider card layout with a single unified list:
 * - Health summary (quiet or full-hero based on problem count)
 * - Page banners (offline, OAuth cancelled)
 * - "Your accounts" heading + Add account dropdown
 * - Sorted account rows (problems first)
 * - Recent activity feed
 * - First-run welcome when zero accounts
 *
 * Business logic (OAuth, bridge detection, IMAP modal, GM pairing)
 * is preserved from the original provider cards and wired into the
 * unified row actions.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { t, timeAgo } from '@/lib/i18n'
import type { PopupCacheCode } from '@/shared/popup-messages'
import { authenticateGmail } from '@/lib/providers/gmail/chrome-auth'
import { fetchGmailProfile } from '@/lib/providers/gmail/profile'
import { isGmailConfigured } from '@/lib/providers/gmail/config'
import { getNativeClient } from '@/lib/native-messaging'
import { checkCompatibility, type CompatibilityStatus } from '@/lib/native-messaging/version-check'
import { getAccountStatus } from './accounts/account-status'
import { getConnectionErrorMessage } from './accounts/shared/connection-errors'
import { AddImapAccountModal } from './accounts/AddImapAccountModal'
import { HealthSummary, type HealthMode } from './options/HealthSummary'
import { PageBanner } from './options/PageBanner'
import { AddAccountDropdown } from './options/AddAccountDropdown'
import { FirstRunWelcome } from './options/FirstRunWelcome'
import { AccountRowUnified } from './options/AccountRowUnified'
import { RecentActivity, type RecentCode } from './options/RecentActivity'

/* ---------------------------------------------------------------
   Local types (MailboxInfo includes IMAP/GM fields not in the
   shared popup-messages type, since the background handler
   conditionally includes them)
   --------------------------------------------------------------- */

interface MailboxInfo {
  id: string
  providerId: 'gmail' | 'imap-bridge' | 'google-messages'
  email: string
  addedAt: number
  lastSyncedAt: number
  lastSyncError?: string
  tokenExpiresAt?: number
  imapServer?: string
  imapPort?: number
  gmPhoneNumber?: string
}

type Provider = 'gmail' | 'imap-bridge' | 'google-messages'

/* ---------------------------------------------------------------
   Helper: compute HealthMode from mailbox list
   --------------------------------------------------------------- */

function computeHealthMode(mailboxes: MailboxInfo[]): HealthMode {
  const problems = mailboxes.filter((m) => {
    const s = getAccountStatus({
      tokenExpiresAt: m.tokenExpiresAt,
      lastSyncedAt: m.lastSyncedAt,
      lastSyncError: m.lastSyncError,
    })
    return s.status !== 'online'
  })

  if (problems.length === 0) {
    return {
      type: 'quiet-ok',
      text: t('health_all_ok', [String(mailboxes.length)]),
    }
  }
  if (problems.length === 1) {
    return { type: 'quiet-attention', text: t('health_attention_one') }
  }
  return {
    type: 'full-error',
    title: t('health_attention_multi', [
      String(problems.length),
      String(mailboxes.length),
    ]),
    detail: `${problems.length} accounts need attention.`,
  }
}

/* ---------------------------------------------------------------
   Helper: sort mailboxes health-first (problems bubble to top)
   --------------------------------------------------------------- */

function sortByHealth(mailboxes: MailboxInfo[]): MailboxInfo[] {
  const priority: Record<string, number> = { offline: 0, warning: 1, online: 2 }
  return [...mailboxes].sort((a, b) => {
    const sa = getAccountStatus({
      tokenExpiresAt: a.tokenExpiresAt,
      lastSyncedAt: a.lastSyncedAt,
      lastSyncError: a.lastSyncError,
    })
    const sb = getAccountStatus({
      tokenExpiresAt: b.tokenExpiresAt,
      lastSyncedAt: b.lastSyncedAt,
      lastSyncError: b.lastSyncError,
    })
    return (priority[sa.status] ?? 2) - (priority[sb.status] ?? 2)
  })
}

/* ---------------------------------------------------------------
   Helper: build secondary meta text for a mailbox row
   --------------------------------------------------------------- */

function buildMetaText(mailbox: MailboxInfo): string {
  const providerLabels: Record<string, string> = {
    gmail: 'Gmail',
    'imap-bridge': mailbox.imapServer || 'IMAP',
    'google-messages': 'Google Messages',
  }
  const parts: string[] = [providerLabels[mailbox.providerId] || mailbox.providerId]
  if (mailbox.lastSyncedAt) {
    parts.push(t('accounts_last_synced', timeAgo(mailbox.lastSyncedAt)))
  }
  return parts.join(' \u00B7 ')
}

/* ---------------------------------------------------------------
   Helper: format phone number for display
   --------------------------------------------------------------- */

function formatPhoneDisplay(raw?: string): string {
  if (!raw) return ''
  return raw.startsWith('+') ? raw : `+${raw}`
}

/* ---------------------------------------------------------------
   Helper: map PopupCacheCode to RecentCode for the activity feed
   --------------------------------------------------------------- */

function mapToRecentCode(c: PopupCacheCode): RecentCode {
  return {
    code: c.code,
    domain: c.senderETLD || c.source.split('@').pop()?.split(' ')[0] || '',
    email: c.to || c.from || '',
    provider: c.providerId || 'gmail',
    timeAgo: c.receivedAt ? timeAgo(c.receivedAt) : '',
  }
}

/* ===============================================================
   AccountsPanel Component
   =============================================================== */

export function AccountsPanel() {
  /* ---- Core state ---- */
  const [mailboxes, setMailboxes] = useState<MailboxInfo[] | null>(null)
  const [fetchError, setFetchError] = useState(false)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [recentCodes, setRecentCodes] = useState<RecentCode[]>([])

  /* ---- IMAP modal state ---- */
  const [showAddImapModal, setShowAddImapModal] = useState(false)
  const [reconnectingMailboxId, setReconnectingMailboxId] = useState<string | null>(null)
  const [imapPrefillData, setImapPrefillData] = useState<{
    email: string; server: string; port: number; label: string
  } | undefined>(undefined)

  /* ---- Bridge state (for IMAP provider) ---- */
  const [bridgeStatus, setBridgeStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking')
  const [bridgeCompat, setBridgeCompat] = useState<CompatibilityStatus | null>(null)

  /* ---- Dismissable banners ---- */
  const [oauthCancelled, setOauthCancelled] = useState(false)

  /* ==================== Data loading ==================== */

  const loadMailboxes = useCallback(async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_MAILBOXES' })
      if (response.success) {
        setMailboxes(response.mailboxes)
        setFetchError(false)
      } else {
        setFetchError(true)
      }
    } catch (error) {
      console.warn('[AccountsPanel] Failed to fetch mailboxes:', error)
      setFetchError(true)
    }
  }, [])

  useEffect(() => {
    void loadMailboxes()
  }, [loadMailboxes])

  /* ---- Fetch recent codes when mailboxes change ---- */
  useEffect(() => {
    if (!mailboxes || mailboxes.length === 0) return

    const fetchRecent = async () => {
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'GET_POPUP_DATA',
        })
        if (response?.success !== false && response?.codes) {
          setRecentCodes(response.codes.slice(0, 3).map(mapToRecentCode))
        }
      } catch { /* ignore */ }
    }
    fetchRecent()
  }, [mailboxes])

  /* ---- Check bridge status ---- */
  useEffect(() => {
    let cancelled = false
    const checkBridge = async () => {
      try {
        const client = getNativeClient()
        const ping = await client.ping()
        if (cancelled) return
        setBridgeStatus('connected')
        setBridgeCompat(checkCompatibility(ping))
      } catch {
        if (!cancelled) {
          setBridgeStatus('disconnected')
          setBridgeCompat(null)
        }
      }
    }
    checkBridge()
    return () => { cancelled = true }
  }, [mailboxes?.length])

  /* ---- Online/offline listener ---- */
  useEffect(() => {
    const goOnline = () => setIsOnline(true)
    const goOffline = () => setIsOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  /* ==================== Derived data ==================== */

  const healthMode = useMemo<HealthMode>(() => {
    if (!mailboxes || mailboxes.length === 0) return { type: 'hidden' }
    return computeHealthMode(mailboxes)
  }, [mailboxes])

  const sortedMailboxes = useMemo(() => {
    if (!mailboxes) return []
    return sortByHealth(mailboxes)
  }, [mailboxes])

  const imapBlocked = bridgeCompat !== null && !bridgeCompat.compatible

  /* ==================== Provider handlers ==================== */

  const handleProviderSelect = useCallback(async (provider: Provider) => {
    if (provider === 'gmail') {
      await handleConnectGmail()
    } else if (provider === 'imap-bridge') {
      if (bridgeStatus === 'disconnected') {
        // TODO: Show bridge install guide banner or redirect
        // For now, open the IMAP modal anyway (it will show bridge status)
      }
      setReconnectingMailboxId(null)
      setImapPrefillData(undefined)
      setShowAddImapModal(true)
    } else if (provider === 'google-messages') {
      // Open Google Messages settings tab with the connection flow
      // For now, navigate to the accounts page with GM focus
      // The GoogleMessagesCard handles its own lifecycle in the old system.
      // TODO: Wire into unified flow in Phase 7
      try {
        await chrome.runtime.sendMessage({
          type: 'CONNECT_GOOGLE_MESSAGES',
          phoneNumber: '', // Will be handled by the GM flow
        })
      } catch {
        // Best effort - GM flow is complex and handled by its own card
      }
    }
  }, [bridgeStatus])

  /* ---- Gmail connect ---- */
  const handleConnectGmail = useCallback(async () => {
    try {
      if (!isGmailConfigured()) return

      const tokens = await authenticateGmail()
      const email = await fetchGmailProfile(tokens.accessToken)

      // Check if Gmail is already connected (single-slot)
      const existing = mailboxes?.find((m) => m.providerId === 'gmail')
      if (existing) {
        if (email !== existing.email) {
          // Mismatch - cannot reconnect with a different account
          return
        }
        await chrome.runtime.sendMessage({
          type: 'REMOVE_MAILBOX',
          mailboxId: existing.id,
          skipRevoke: true,
        })
      }

      const storeResponse = await chrome.runtime.sendMessage({
        type: 'STORE_MAILBOX',
        provider: 'gmail',
        email,
        tokens,
      })

      if (storeResponse.success) {
        await loadMailboxes()
      }
    } catch (error) {
      const msg = getConnectionErrorMessage(error)
      if (msg === t('toast_oauth_cancelled')) {
        setOauthCancelled(true)
      }
    }
  }, [mailboxes, loadMailboxes])

  /* ---- Reconnect handler ---- */
  const handleReconnect = useCallback((mailbox: MailboxInfo) => {
    if (mailbox.providerId === 'gmail') {
      void handleConnectGmail()
    } else if (mailbox.providerId === 'imap-bridge') {
      setReconnectingMailboxId(mailbox.id)
      setImapPrefillData({
        email: mailbox.email,
        server: mailbox.imapServer || '',
        port: mailbox.imapPort || 993,
        label: mailbox.email,
      })
      setShowAddImapModal(true)
    }
    // Google Messages reconnect is handled by its own card state machine
  }, [handleConnectGmail])

  /* ---- Test connection ---- */
  const handleTest = useCallback(async (mailbox: MailboxInfo) => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'TEST_MAILBOX_CONNECTION',
        mailboxId: mailbox.id,
      })
      if (!response.success) {
        await loadMailboxes()
      }
    } catch {
      await loadMailboxes()
    }
  }, [loadMailboxes])

  /* ---- Remove account ---- */
  const handleRemove = useCallback(async (mailbox: MailboxInfo) => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: mailbox.providerId === 'google-messages'
          ? 'DISCONNECT_GOOGLE_MESSAGES'
          : 'REMOVE_MAILBOX',
        mailboxId: mailbox.id,
      })
      if (response.success || response.ok) {
        await loadMailboxes()
      }
    } catch {
      // Best effort
    }
  }, [loadMailboxes])

  /* ---- IMAP modal confirm ---- */
  const handleImapAdded = useCallback(async (accountData: {
    accountId: string; email: string; server: string; port: number; label: string
  }) => {
    try {
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
        setShowAddImapModal(false)
      } else {
        throw new Error(response.error || t('toast_connect_failed'))
      }
    } catch (error) {
      console.warn('[AccountsPanel] Failed to add IMAP account:', error)
      throw error
    }
  }, [reconnectingMailboxId, loadMailboxes])

  /* ==================== Render states ==================== */

  // Loading state
  if (mailboxes === null && !fetchError) {
    return (
      <div className="accounts">
        <div className="accounts-list">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton-row">
              <span className="skeleton-bar skeleton-bar--dot" />
              <span className="skeleton-bar skeleton-bar--icon" />
              <div className="skeleton-bar--lines">
                <span className="skeleton-bar skeleton-bar--line-1" />
                <span className="skeleton-bar skeleton-bar--line-2" />
              </div>
              <span className="skeleton-bar skeleton-bar--button" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Fetch error state
  if (fetchError) {
    return (
      <div className="accounts">
        <PageBanner
          variant="required"
          action={{ label: t('button_retry') || 'Retry', onClick: () => { setFetchError(false); void loadMailboxes() } }}
        >
          {t('health_fetch_failed')}
        </PageBanner>
      </div>
    )
  }

  // First-run (zero accounts)
  if (mailboxes && mailboxes.length === 0) {
    return (
      <>
        <FirstRunWelcome onProviderSelect={handleProviderSelect} />
        <AddImapAccountModal
          isOpen={showAddImapModal}
          onConfirm={handleImapAdded}
          onCancel={() => setShowAddImapModal(false)}
          prefillData={imapPrefillData}
        />
      </>
    )
  }

  // Management view (has accounts)
  return (
    <div className="accounts">
      {/* Page banners */}
      <div className="page-banners">
        {!isOnline && (
          <PageBanner variant="offline">
            {t('banner_offline')}
          </PageBanner>
        )}
        {oauthCancelled && (
          <PageBanner variant="info" dismissable onDismiss={() => setOauthCancelled(false)}>
            {t('banner_oauth_cancelled')}
          </PageBanner>
        )}
      </div>

      {/* Health summary */}
      <HealthSummary mode={healthMode} />

      {/* Add bar: heading + dropdown */}
      <div className="add-bar">
        <h2 className="add-bar__title">
          {t('accounts_panel_heading')}
        </h2>
        <AddAccountDropdown
          onSelect={handleProviderSelect}
          imapDisabled={imapBlocked}
          imapDisabledReason={imapBlocked ? t('bridge_update_required') : undefined}
        />
      </div>

      {/* Unified accounts list */}
      <div className="accounts-list">
        {sortedMailboxes.map((mailbox) => {
          const status = getAccountStatus({
            tokenExpiresAt: mailbox.tokenExpiresAt,
            lastSyncedAt: mailbox.lastSyncedAt,
            lastSyncError: mailbox.lastSyncError,
          })

          // Override status when bridge is disconnected for IMAP accounts
          const effectiveStatus = (
            mailbox.providerId === 'imap-bridge' && bridgeStatus === 'disconnected'
          ) ? 'offline' : status.status
          const effectiveLabel = (
            mailbox.providerId === 'imap-bridge' && bridgeStatus === 'disconnected'
          ) ? t('accounts_imap_bridge_not_installed') : status.label

          const displayEmail = mailbox.providerId === 'google-messages'
            ? formatPhoneDisplay(mailbox.gmPhoneNumber)
            : mailbox.email

          return (
            <AccountRowUnified
              key={mailbox.id}
              id={mailbox.id}
              email={displayEmail}
              provider={mailbox.providerId}
              imapHost={mailbox.imapServer}
              status={effectiveStatus}
              statusLabel={effectiveLabel}
              metaText={buildMetaText(mailbox)}
              showReconnect={effectiveStatus !== 'online'}
              onReconnect={() => handleReconnect(mailbox)}
              onTest={() => handleTest(mailbox)}
              onRemove={() => handleRemove(mailbox)}
            />
          )
        })}
      </div>

      {/* Recent activity */}
      <RecentActivity codes={recentCodes} />

      {/* IMAP modal (shared between add and reconnect flows) */}
      <AddImapAccountModal
        isOpen={showAddImapModal}
        onConfirm={handleImapAdded}
        onCancel={() => setShowAddImapModal(false)}
        prefillData={imapPrefillData}
      />
    </div>
  )
}
