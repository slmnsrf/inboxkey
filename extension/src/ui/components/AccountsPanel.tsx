/**
 * AccountsPanel Component
 *
 * Displays connected email accounts and allows users to add/remove mailboxes.
 * Handles OAuth flows for Gmail and Outlook providers.
 */

import React, { useState, useEffect } from 'react'
import { useLockContext } from '../contexts/LockContext'
import { useToast } from '../contexts/ToastContext'
import { authenticateGmail } from '@/lib/providers/gmail/chrome-auth'
import { authenticateOutlook } from '@/lib/providers/outlook/chrome-auth'
import { fetchGmailProfile } from '@/lib/providers/gmail/profile'
import { fetchOutlookProfile } from '@/lib/providers/outlook/profile'
import { isGmailConfigured } from '@/lib/providers/gmail/config'
import { isOutlookConfigured } from '@/lib/providers/outlook/config'
import { ProviderIcon } from './icons/ProviderIcon'
import { LoadingSpinner } from './icons/LoadingSpinner'
import { TrustIndicator } from './TrustIndicator'
import { t, timeAgo } from '@/lib/i18n'

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
  provider: 'gmail' | 'outlook'
  message: string
}

type ProviderConfig = {
  id: 'gmail' | 'outlook'
  displayName: string
  badgeClass: string
  mailboxes: MailboxInfo[]
  onConnect: () => Promise<void>
  connectLabel: string
}

export function AccountsPanel() {
  const { isInitialized, isUnlocked } = useLockContext()
  const { showToast } = useToast()
  const [mailboxes, setMailboxes] = useState<MailboxInfo[]>([])
  const [connectingProvider, setConnectingProvider] = useState<'gmail' | 'outlook' | null>(null)
  const [connectionStage, setConnectionStage] = useState<ConnectionStage>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectionError, setConnectionError] = useState<ConnectionError | null>(null)

  useEffect(() => {
    // Load mailboxes if unlocked OR if passwordless mode (not initialized)
    if (isUnlocked || !isInitialized) {
      loadMailboxes()
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

  const handleConnectGmail = async () => {
    // Prevent race conditions - only one connection at a time
    if (isConnecting) {
      console.log('[AccountsPanel] Connection already in progress, ignoring')
      return
    }

    try {
      // Clear any previous errors
      setConnectionError(null)

      // Validate OAuth configuration
      if (!isGmailConfigured()) {
        console.error('[AccountsPanel] Gmail OAuth client ID not configured')
        const errorMsg = t('toast_connect_invalid_credentials')
        setConnectionError({ provider: 'gmail', message: errorMsg })
        showToast(errorMsg, 'error')
        return
      }

      console.log('[AccountsPanel] Starting Gmail connection...')
      setIsConnecting(true)
      setConnectingProvider('gmail')
      setConnectionStage('authenticating')

      // Step 1: Authenticate with OAuth
      console.log('[AccountsPanel] Calling authenticateGmail()...')
      const tokens = await authenticateGmail()
      console.log('[AccountsPanel] OAuth tokens received:', {
        hasAccessToken: !!tokens.accessToken,
        hasRefreshToken: !!tokens.refreshToken,
        expiresIn: tokens.expiresIn
      })

      setConnectionStage('loading_profile')

      // Step 2: Fetch user profile
      const email = await fetchGmailProfile(tokens.accessToken)

      // Check for duplicate
      if (mailboxes.some(mb => mb.email === email && mb.providerId === 'gmail')) {
        showToast(t('toast_connect_duplicate'), 'error')
        return
      }

      setConnectionStage('saving')

      // Step 3: Store mailbox
      const response = await chrome.runtime.sendMessage({
        type: 'STORE_MAILBOX',
        provider: 'gmail',
        email,
        tokens
      })

      if (response.success) {
        showToast(t('toast_gmail_connected'), 'success')
        await loadMailboxes()
      } else {
        showToast(response.error || t('toast_connect_failed'), 'error')
      }
    } catch (error) {
      console.error('[AccountsPanel] Gmail connection error:', error)
      console.error('[AccountsPanel] Error type:', error instanceof Error ? error.constructor.name : typeof error)
      console.error('[AccountsPanel] Error message:', error instanceof Error ? error.message : String(error))
      console.error('[AccountsPanel] Error stack:', error instanceof Error ? error.stack : 'No stack trace')

      let message = t('toast_connect_failed')
      let detailedMessage = ''

      if (error instanceof Error) {
        detailedMessage = error.message

        // Handle specific error cases
        if (error.message.includes('cancelled') || error.message.includes('OAuth cancelled')) {
          message = t('toast_oauth_cancelled')
        } else if (error.message.includes('PROFILE_')) {
          message = t('toast_connect_profile_failed')
        } else if (error.message.includes('network') || error.message.includes('Network error')) {
          message = t('toast_connect_network_error')
        } else if (error.message.includes('credentials') || error.message.includes('invalid_client')) {
          message = t('toast_connect_invalid_credentials')
        } else if (error.message === 'No redirect URL received from OAuth flow') {
          message = t('toast_connect_popup_blocked')
        } else {
          // Include actual error in message for debugging
          message = `${t('toast_connect_failed')}: ${error.message}`
        }
      }

      console.error('[AccountsPanel] User-facing error message:', message)
      setConnectionError({ provider: 'gmail', message })
      showToast(message, 'error')
    } finally {
      setIsConnecting(false)
      setConnectingProvider(null)
      setConnectionStage(null)
    }
  }

  const handleConnectOutlook = async () => {
    // Prevent race conditions - only one connection at a time
    if (isConnecting) {
      console.log('[AccountsPanel] Connection already in progress, ignoring')
      return
    }

    try {
      // Clear any previous errors
      setConnectionError(null)

      // Validate OAuth configuration
      if (!isOutlookConfigured()) {
        console.error('[AccountsPanel] Outlook OAuth client ID not configured')
        const errorMsg = t('toast_connect_invalid_credentials')
        setConnectionError({ provider: 'outlook', message: errorMsg })
        showToast(errorMsg, 'error')
        return
      }

      setIsConnecting(true)
      setConnectingProvider('outlook')
      setConnectionStage('authenticating')

      // Step 1: Authenticate with OAuth
      const tokens = await authenticateOutlook()

      setConnectionStage('loading_profile')

      // Step 2: Fetch user profile
      const email = await fetchOutlookProfile(tokens.accessToken)

      // Check for duplicate
      if (mailboxes.some(mb => mb.email === email && mb.providerId === 'outlook')) {
        showToast(t('toast_connect_duplicate'), 'error')
        return
      }

      setConnectionStage('saving')

      // Step 3: Store mailbox
      const response = await chrome.runtime.sendMessage({
        type: 'STORE_MAILBOX',
        provider: 'outlook',
        email,
        tokens
      })

      if (response.success) {
        showToast(t('toast_outlook_connected'), 'success')
        await loadMailboxes()
      } else {
        showToast(response.error || t('toast_connect_failed'), 'error')
      }
    } catch (error) {
      console.error('[AccountsPanel] Outlook connection error:', error)

      let message = t('toast_connect_failed')

      if (error instanceof Error) {
        // Handle specific error cases
        if (error.message.includes('cancelled') || error.message.includes('OAuth cancelled')) {
          message = t('toast_oauth_cancelled')
        } else if (error.message.includes('PROFILE_')) {
          message = t('toast_connect_profile_failed')
        } else if (error.message.includes('network') || error.message.includes('Network error')) {
          message = t('toast_connect_network_error')
        } else if (error.message.includes('credentials') || error.message.includes('invalid_client')) {
          message = t('toast_connect_invalid_credentials')
        } else if (error.message === 'OAuth cancelled by user') {
          message = t('toast_oauth_cancelled')
        }
      }

      setConnectionError({ provider: 'outlook', message })
      showToast(message, 'error')
    } finally {
      setIsConnecting(false)
      setConnectingProvider(null)
      setConnectionStage(null)
    }
  }

  const handleRemoveMailbox = async (mailboxId: string) => {
    if (!confirm(t('accounts_remove_confirm'))) {
      return
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'REMOVE_MAILBOX',
        mailboxId
      })

      if (response.success) {
        showToast(t('toast_account_disconnected'), 'success')
        await loadMailboxes()
      } else {
        showToast(t('toast_disconnect_failed'), 'error')
      }
    } catch (error) {
      showToast(t('toast_disconnect_failed'), 'error')
    }
  }

  // Only show locked state if password IS SET but user is locked
  // Passwordless users (!isInitialized) should see connect buttons
  if (isInitialized && !isUnlocked) {
    return (
      <div className="accounts-panel accounts-panel--locked">
        <p className="accounts-panel__lock-message">
          {t('accounts_panel_locked')}
        </p>
      </div>
    )
  }

  const gmailMailboxes = mailboxes.filter(mb => mb.providerId === 'gmail')
  const outlookMailboxes = mailboxes.filter(mb => mb.providerId === 'outlook')

  const getProviderStageLabel = () => {
    if (!connectionStage) return ''
    if (connectionStage === 'authenticating') return t('accounts_authenticating')
    if (connectionStage === 'loading_profile') return t('accounts_loading_profile')
    if (connectionStage === 'saving') return t('accounts_saving')
    return ''
  }

  const providers: ProviderConfig[] = [
    {
      id: 'gmail',
      displayName: t('accounts_provider_gmail'),
      badgeClass: 'badge badge-gmail',
      mailboxes: gmailMailboxes,
      onConnect: handleConnectGmail,
      connectLabel: t('accounts_connect_gmail')
    },
    {
      id: 'outlook',
      displayName: t('accounts_provider_outlook'),
      badgeClass: 'badge badge-outlook',
      mailboxes: outlookMailboxes,
      onConnect: handleConnectOutlook,
      connectLabel: t('accounts_connect_outlook')
    }
  ]

  const renderMailboxList = (config: ProviderConfig) => {
    if (config.mailboxes.length === 0) {
      return (
        <div className="account-card__empty" role="note">
          <p>{t('accounts_empty_provider', config.displayName)}</p>
        </div>
      )
    }

    return (
      <ul className="account-card__list">
        {config.mailboxes.map(mailbox => (
          <li key={mailbox.id} className="account-card__list-item">
            <div className="account-card__identity">
              <span className="account-card__email">{mailbox.email}</span>
              <span className="account-card__meta">
                {t('accounts_last_synced', timeAgo(mailbox.lastSyncedAt))}
              </span>
            </div>
            <button
              onClick={() => handleRemoveMailbox(mailbox.id)}
              className="account-card__disconnect"
              aria-label={t('aria_remove_account', mailbox.email)}
            >
              {t('accounts_remove_button')}
            </button>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className="accounts-panel">
      <header className="accounts-panel__header">
        <h2 className="accounts-panel__heading">{t('accounts_panel_heading')}</h2>
        {mailboxes.length === 0 && (
          <p className="accounts-panel__description">{t('accounts_panel_empty')}</p>
        )}
      </header>

      <div className="accounts-panel__cards">
        {providers.map(provider => {
          const isProviderConnecting = connectingProvider === provider.id
          const error =
            connectionError && connectionError.provider === provider.id
              ? connectionError.message
              : null
          const isActive = provider.mailboxes.length > 0
          const statusLabel = isActive
            ? t('accounts_status_connected')
            : t('accounts_status_not_connected')
          const statusIcon = isActive ? '✓' : '✕'

          return (
            <article key={provider.id} className="account-card">
              <div className="account-card__head">
                <div>
                  <div className="account-card__provider">
                    {provider.displayName}{' '}
                    <span className={provider.badgeClass} aria-hidden="true">
                      {provider.displayName}
                    </span>
                  </div>
                </div>
                <span
                  className={`account-card__status ${
                    isActive
                      ? 'account-card__status--active'
                      : 'account-card__status--inactive'
                  }`}
                  aria-live="polite"
                >
                  <span aria-hidden="true">{statusIcon}</span>
                  <span>{statusLabel}</span>
                </span>
              </div>

              {renderMailboxList(provider)}

              <div className="account-card__actions">
                <button
                  onClick={provider.onConnect}
                  disabled={isProviderConnecting || isConnecting}
                  className={`btn ${
                    provider.id === 'gmail' ? 'btn-gmail' : 'btn-outlook'
                  } account-card__connect ${isProviderConnecting ? 'account-card__connect--loading' : ''}`}
                  aria-label={
                    provider.id === 'gmail' ? t('aria_connect_gmail') : t('aria_connect_outlook')
                  }
                  aria-busy={isProviderConnecting}
                  aria-describedby={
                    error ? `${provider.id}-connection-error` : undefined
                  }
                  aria-invalid={Boolean(error)}
                >
                  {isProviderConnecting ? (
                    <>
                      <LoadingSpinner size="small" />
                      {getProviderStageLabel()}
                    </>
                  ) : (
                    <>
                      <ProviderIcon provider={provider.id} />
                      {provider.connectLabel}
                    </>
                  )}
                </button>
              </div>

              {error && (
                <div
                  id={`${provider.id}-connection-error`}
                  className="account-card__error"
                  role="alert"
                >
                  <svg
                    className="account-card__error-icon"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      fill="currentColor"
                      d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"
                    />
                  </svg>
                  <span>{error}</span>
                </div>
              )}
            </article>
          )
        })}
      </div>

      <TrustIndicator />

      {/* Live region for screen reader announcements */}
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
