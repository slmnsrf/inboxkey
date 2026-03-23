/**
 * GoogleMessagesCard - Google Messages SMS provider card
 *
 * Manages the full lifecycle of Google Messages integration:
 * 1. Not connected (empty state with connect CTA)
 * 2. Phone input (disclosure sections + phone number form)
 * 3. Pairing (spinner dots + instruction while waiting for QR pairing)
 * 4. Connected (phone number display with status dot)
 * 5. Disconnect confirm (inline red confirmation panel)
 * 6. Session expired (error banner + re-pair/disconnect actions)
 *
 * Communication with background via chrome.runtime.sendMessage:
 * - CONNECT_GOOGLE_MESSAGES, CHECK_GM_PAIRING_STATUS,
 *   CANCEL_GM_SETUP, DISCONNECT_GOOGLE_MESSAGES
 */

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Smartphone, Info, Eye, AlertCircle } from 'lucide-react'
import { t } from '@/lib/i18n'
import { AccountSection } from './shared/AccountSection'

import googleMessagesLogo from 'url:~assets/providers/google-messages.svg'

type CardState =
  | 'not-connected'
  | 'phone-input'
  | 'countdown'
  | 'pairing'
  | 'pairing-success'
  | 'connected'
  | 'disconnect-confirm'
  | 'session-expired'

interface GoogleMessagesCardProps {
  mailbox?: {
    id: string
    gmPhoneNumber?: string
    lastSyncError?: string
  }
  onUpdate?: () => void
}

const PAIRING_POLL_INTERVAL = 4000

/** Validate international phone number: starts with +, at least 7 digits. */
function isValidPhoneNumber(value: string): boolean {
  const stripped = value.replace(/[\s\-\(\)]/g, '')
  const digits = stripped.replace(/[^\d]/g, '')
  return stripped.startsWith('+') && digits.length >= 7
}

export function GoogleMessagesCard({ mailbox, onUpdate }: GoogleMessagesCardProps) {
  const [cardState, setCardState] = useState<CardState>('not-connected')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [phoneError, setPhoneError] = useState(false)
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)
  const [isDisconnecting, setIsDisconnecting] = useState(false)

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const phoneInputRef = useRef<HTMLInputElement>(null)
  const cancelledRef = useRef(false)
  const manualLinkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Derive initial state from mailbox prop
  useEffect(() => {
    if (mailbox) {
      const isExpired = mailbox.lastSyncError === 'session_expired'
      setCardState(isExpired ? 'session-expired' : 'connected')
      if (mailbox.gmPhoneNumber) {
        setPhoneNumber(mailbox.gmPhoneNumber)
      }
    } else {
      setCardState('not-connected')
    }
  }, [mailbox?.id, mailbox?.lastSyncError])

  // Cleanup polling and timers on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
      if (manualLinkTimerRef.current) {
        clearTimeout(manualLinkTimerRef.current)
        manualLinkTimerRef.current = null
      }
    }
  }, [])

  // Focus phone input when entering phone-input state
  useEffect(() => {
    if (cardState !== 'phone-input') return
    // Slight delay so the DOM is rendered
    const timer = setTimeout(() => phoneInputRef.current?.focus(), 50)
    return () => clearTimeout(timer)
  }, [cardState])

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }, [])

  /** Show success state, focus settings tab, then transition to connected after 5s. */
  const showPairingSuccess = useCallback(async () => {
    setCardState('pairing-success')
    onUpdate?.()

    // Focus this settings tab first, then start the visible timer
    try {
      await chrome.runtime.sendMessage({ type: 'FOCUS_EXTENSION_TAB' })
    } catch {
      // Best effort
    }

    // Give the browser a moment to actually render the focused tab
    await new Promise(r => setTimeout(r, 500))

    // Now start the 5-second success display (user is guaranteed to see it)
    setTimeout(() => setCardState('connected'), 5000)
  }, [onUpdate])

  const startPairingPoll = useCallback(() => {
    stopPolling()
    pollingRef.current = setInterval(async () => {
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'CHECK_GM_PAIRING_STATUS',
        })
        if (response.status === 'paired') {
          stopPolling()
          if (manualLinkTimerRef.current) {
            clearTimeout(manualLinkTimerRef.current)
            manualLinkTimerRef.current = null
          }
          showPairingSuccess()
        } else if (response.status === 'not-open') {
          // Pending setup lost (SW restart?) -- stop polling, show error
          stopPolling()
          if (manualLinkTimerRef.current) {
            clearTimeout(manualLinkTimerRef.current)
            manualLinkTimerRef.current = null
          }
          setCardState('phone-input')
          setFeedbackMessage(t('toast_connect_failed'))
        } else if (response.status === 'error') {
          // Background returned an error -- stop polling, show message
          stopPolling()
          if (manualLinkTimerRef.current) {
            clearTimeout(manualLinkTimerRef.current)
            manualLinkTimerRef.current = null
          }
          setCardState('phone-input')
          setFeedbackMessage(response.error || t('toast_connect_failed'))
        }
        // 'unpaired' continues polling (expected during pairing)
      } catch (error) {
        console.error('[GoogleMessagesCard] Pairing poll error:', error)
        // Communication error -- stop polling, show error
        stopPolling()
        if (manualLinkTimerRef.current) {
          clearTimeout(manualLinkTimerRef.current)
          manualLinkTimerRef.current = null
        }
        setCardState('phone-input')
        setFeedbackMessage(t('toast_connect_failed'))
      }
    }, PAIRING_POLL_INTERVAL)
  }, [stopPolling, onUpdate])

  const [countdown, setCountdown] = useState(0)
  const [showManualLink, setShowManualLink] = useState(false)

  const handleConnect = async () => {
    setFeedbackMessage(null)

    if (!isValidPhoneNumber(phoneNumber)) {
      setPhoneError(true)
      return
    }

    setPhoneError(false)
    cancelledRef.current = false

    // Countdown from 3 before opening the tab
    setCardState('countdown')
    setCountdown(3)
    setShowManualLink(false)

    for (let i = 3; i >= 1; i--) {
      setCountdown(i)
      await new Promise(r => setTimeout(r, 1000))
      if (cancelledRef.current) return
    }

    setCardState('pairing')

    // Show "Tab didn't open?" link after 10 seconds
    manualLinkTimerRef.current = setTimeout(() => setShowManualLink(true), 10000)

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CONNECT_GOOGLE_MESSAGES',
        phoneNumber: phoneNumber.replace(/[\s\-\(\)]/g, ''),
      })

      if (cancelledRef.current) return

      if (response.status === 'paired') {
        if (manualLinkTimerRef.current) {
          clearTimeout(manualLinkTimerRef.current)
          manualLinkTimerRef.current = null
        }
        showPairingSuccess()
      } else if (response.status === 'pairing') {
        startPairingPoll()
      } else {
        if (manualLinkTimerRef.current) {
          clearTimeout(manualLinkTimerRef.current)
          manualLinkTimerRef.current = null
        }
        setCardState('phone-input')
        setFeedbackMessage(response.error || t('toast_connect_failed'))
      }
    } catch (error) {
      if (manualLinkTimerRef.current) {
        clearTimeout(manualLinkTimerRef.current)
        manualLinkTimerRef.current = null
      }
      console.error('[GoogleMessagesCard] Connect error:', error)
      setCardState('phone-input')
      setFeedbackMessage(t('toast_connect_failed'))
    }
  }

  const handleCancel = async () => {
    cancelledRef.current = true
    stopPolling()
    if (manualLinkTimerRef.current) {
      clearTimeout(manualLinkTimerRef.current)
      manualLinkTimerRef.current = null
    }
    try {
      await chrome.runtime.sendMessage({ type: 'CANCEL_GM_SETUP' })
    } catch {
      // Best effort
    }
    setCardState('not-connected')
    setPhoneNumber('')
    setPhoneError(false)
    setFeedbackMessage(null)
    setShowManualLink(false)
  }

  const handleDisconnect = async () => {
    if (!mailbox) return
    setIsDisconnecting(true)
    setFeedbackMessage(null)

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'DISCONNECT_GOOGLE_MESSAGES',
        mailboxId: mailbox.id,
      })

      if (response.ok) {
        setCardState('not-connected')
        setPhoneNumber('')
        onUpdate?.()
      } else {
        setFeedbackMessage(t('toast_disconnect_failed'))
        setCardState('connected')
      }
    } catch (error) {
      console.error('[GoogleMessagesCard] Disconnect error:', error)
      setFeedbackMessage(t('toast_disconnect_failed'))
      setCardState('connected')
    } finally {
      setIsDisconnecting(false)
    }
  }

  const handleRepair = () => {
    setCardState('pairing')
    setFeedbackMessage(null)

    chrome.runtime.sendMessage({
      type: 'CONNECT_GOOGLE_MESSAGES',
      phoneNumber: phoneNumber.replace(/[\s\-\(\)]/g, ''),
      repair: true,
    }).then((response) => {
      if (response.status === 'paired') {
        setCardState('connected')
        onUpdate?.()
      } else if (response.status === 'pairing') {
        startPairingPoll()
      } else {
        setCardState('session-expired')
        setFeedbackMessage(response.error || t('toast_connect_failed'))
      }
    }).catch((error) => {
      console.error('[GoogleMessagesCard] Re-pair error:', error)
      setCardState('session-expired')
      setFeedbackMessage(t('toast_connect_failed'))
    })
  }

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhoneNumber(e.target.value)
    if (phoneError) setPhoneError(false)
  }

  const handlePhoneKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleConnect()
    }
  }

  // Determine status chip props
  const isConnected = cardState === 'connected' || cardState === 'disconnect-confirm' || cardState === 'pairing-success'
  const statusLabel = getStatusLabel(cardState)

  // Determine description text (empty for most states per prototype)
  const description = getDescription(cardState)

  return (
    <AccountSection
      provider="google-messages"
      displayName={t('accounts_provider_google_messages')}
      description={
        cardState === 'not-connected'
          ? 'Got an Android phone? As the developer, I recommend using Google Messages as your default SMS app. The built-in spam protection is solid, and once connected here, InboxKey handles your SMS verification codes automatically.'
          : description
      }
      accountCount={mailbox ? 1 : 0}
      maxAccounts={1}
      isConnected={isConnected}
      statusLabel={statusLabel}
      feedbackMessage={feedbackMessage || undefined}
      feedbackType="error"
    >
      {renderStateContent()}
    </AccountSection>
  )

  function renderStateContent() {
    switch (cardState) {
      case 'not-connected':
        return renderNotConnected()
      case 'phone-input':
        return renderPhoneInput()
      case 'countdown':
        return renderCountdown()
      case 'pairing':
        return renderPairing()
      case 'pairing-success':
        return renderPairingSuccess()
      case 'connected':
        return renderConnected()
      case 'disconnect-confirm':
        return renderDisconnectConfirm()
      case 'session-expired':
        return renderSessionExpired()
      default:
        return null
    }
  }

  function renderNotConnected() {
    return (
      <div className="empty-slot" role="note">
        <div className="empty-slot__icon">
          <img
            src={googleMessagesLogo}
            alt=""
            width="32"
            height="32"
            aria-hidden="true"
          />
        </div>
        <p className="empty-slot__text">
          SMS verifications? There is a way.<br />
          Autofill SMS codes from Google Messages.
        </p>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => setCardState('phone-input')}
          aria-label={t('aria_connect_google_messages')}
        >
          <Smartphone size={14} aria-hidden="true" />
          {t('accounts_gm_connect')}
        </button>
      </div>
    )
  }

  function renderPhoneInput() {
    return (
      <div className="phone-input-group">
        {/* Disclosure: How this works */}
        <div className="disclosure-box" role="note" aria-label={t('accounts_gm_disclosure_how_title')}>
          <div className="disclosure-box__title">
            <Info size={14} aria-hidden="true" />
            {t('accounts_gm_disclosure_how_title')}
          </div>
          <p className="disclosure-box__text">
            {t('accounts_gm_disclosure_how_text')}
          </p>
        </div>

        {/* Disclosure: Why the phone number */}
        <div className="disclosure-box" role="note" aria-label={t('accounts_gm_disclosure_phone_title')}>
          <div className="disclosure-box__title">
            <Smartphone size={14} aria-hidden="true" />
            {t('accounts_gm_disclosure_phone_title')}
          </div>
          <p className="disclosure-box__text">
            {t('accounts_gm_disclosure_phone_text')}
          </p>
        </div>

        {/* Disclosure: Good to know */}
        <div className="disclosure-box" role="note" aria-label={t('accounts_gm_disclosure_know_title')}>
          <div className="disclosure-box__title">
            <Eye size={14} aria-hidden="true" />
            {t('accounts_gm_disclosure_know_title')}
          </div>
          <p className="disclosure-box__text">
            {t('accounts_gm_disclosure_know_text')}
          </p>
        </div>

        <label className="phone-input-group__label" htmlFor="gm-phone-input">
          {t('accounts_gm_phone_label')}
        </label>
        <input
          ref={phoneInputRef}
          type="tel"
          id="gm-phone-input"
          className={`form-input${phoneError ? ' form-input--invalid' : ''}`}
          placeholder={t('accounts_gm_phone_placeholder')}
          value={phoneNumber}
          onChange={handlePhoneChange}
          onKeyDown={handlePhoneKeyDown}
          aria-required="true"
          aria-describedby="gm-phone-hint gm-phone-error"
          aria-invalid={phoneError}
        />
        <p className="form-hint" id="gm-phone-hint">
          {t('accounts_gm_phone_hint')}
        </p>
        {phoneError && (
          <p className="form-error" id="gm-phone-error" role="alert">
            {t('accounts_gm_phone_error')}
          </p>
        )}
        <div className="phone-input-actions">
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={handleConnect}
          >
            {t('accounts_gm_continue')}
          </button>
          <button
            type="button"
            className="btn--link"
            onClick={handleCancel}
          >
            {t('accounts_gm_cancel')}
          </button>
        </div>
      </div>
    )
  }

  function renderCountdown() {
    return (
      <div className="connecting-stage" role="status" aria-live="polite">
        <div className="connecting-dots" aria-hidden="true">
          <span /><span /><span />
        </div>
        <div className="connecting-stage__text">
          <div>Opening Google Messages in {countdown}...</div>
        </div>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={handleCancel}
        >
          {t('accounts_gm_cancel')}
        </button>
      </div>
    )
  }

  function renderPairing() {
    return (
      <div className="connecting-stage" role="status" aria-live="polite">
        <div className="connecting-dots" aria-hidden="true">
          <span /><span /><span />
        </div>
        <div className="connecting-stage__text">
          <div>{t('accounts_gm_pairing_title')}</div>
          <div
            style={{
              fontWeight: 400,
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-text-secondary)',
              marginTop: '2px',
            }}
          >
            {t('accounts_gm_pairing_instruction')}
          </div>
          {showManualLink && (
            <div
              style={{
                fontWeight: 400,
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-text-tertiary)',
                marginTop: 'var(--space-2)',
              }}
            >
              {t('accounts_gm_pairing_fallback_prefix')}{' '}
              <a
                href="https://messages.google.com/web/welcome"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--color-primary)' }}
              >
                {t('accounts_gm_pairing_fallback_link')}
              </a>
            </div>
          )}
        </div>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={handleCancel}
        >
          {t('accounts_gm_cancel')}
        </button>
      </div>
    )
  }

  function renderPairingSuccess() {
    return (
      <div className="connecting-stage connecting-stage--success" role="status" aria-live="polite">
        <div className="success-checkmark" aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <div className="connecting-stage__text">
          <div style={{ fontWeight: 'var(--font-weight-semibold)' as any }}>
            Google Messages connected successfully.
          </div>
          <div
            style={{
              fontWeight: 400,
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-text-secondary)',
              marginTop: '2px',
            }}
          >
            SMS verification codes will be retrieved automatically when needed.
          </div>
        </div>
      </div>
    )
  }

  function renderConnected() {
    return (
      <div className="account-row">
        <div className="account-row__info">
          <span className="account-row__phone">
            <span
              className="status-dot status-dot--online"
              role="status"
              aria-label={t('accounts_status_connected')}
            />
            <span className="account-row__phone-text">{phoneNumber || mailbox?.gmPhoneNumber}</span>
          </span>
          <span className="account-row__meta">
            {t('accounts_gm_connected_meta')}
          </span>
        </div>
        <div className="account-row__actions">
          <button
            type="button"
            className="btn btn--danger-ghost btn--sm"
            onClick={() => setCardState('disconnect-confirm')}
            aria-label={t('aria_disconnect_google_messages')}
          >
            {t('accounts_disconnect')}
          </button>
        </div>
      </div>
    )
  }

  function renderDisconnectConfirm() {
    return (
      <div
        className="confirm-inline"
        role="alertdialog"
        aria-label={t('aria_disconnect_google_messages')}
      >
        <p className="confirm-inline__text">
          {t('accounts_gm_disconnect_confirm_text')}
        </p>
        <div className="confirm-inline__actions">
          <button
            type="button"
            className="btn btn--danger btn--sm"
            onClick={handleDisconnect}
            disabled={isDisconnecting}
            aria-busy={isDisconnecting}
          >
            {isDisconnecting ? t('accounts_disconnecting') : t('accounts_gm_disconnect_confirm_button')}
          </button>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => setCardState('connected')}
            disabled={isDisconnecting}
          >
            {t('accounts_gm_cancel')}
          </button>
        </div>
      </div>
    )
  }

  function renderSessionExpired() {
    return (
      <>
        <div className="error-banner" role="alert">
          <AlertCircle size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: '1px' }} />
          <span>{t('accounts_gm_session_expired_text')}</span>
        </div>
        <div className="account-row account-row--error" style={{ marginTop: 'var(--space-3)' }}>
          <div className="account-row__info">
            <span className="account-row__phone">
              <span
                className="status-dot status-dot--offline"
                role="status"
                aria-label={t('accounts_gm_status_expired')}
              />
              <span className="account-row__phone-text">{phoneNumber || mailbox?.gmPhoneNumber}</span>
            </span>
            <span className="account-row__meta">
              {t('accounts_gm_session_expired_meta')}
            </span>
          </div>
          <div className="account-row__actions">
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={handleRepair}
            >
              {t('accounts_gm_repair')}
            </button>
            <button
              type="button"
              className="btn btn--danger-ghost btn--sm"
              onClick={() => setCardState('disconnect-confirm')}
              aria-label={t('aria_disconnect_google_messages')}
            >
              {t('accounts_disconnect')}
            </button>
          </div>
        </div>
      </>
    )
  }
}

/** Map card state to status chip label. */
function getStatusLabel(state: CardState): string {
  switch (state) {
    case 'pairing-success':
    case 'connected':
    case 'disconnect-confirm':
      return t('accounts_status_connected')
    case 'countdown':
    case 'pairing':
      return t('accounts_gm_status_pairing')
    case 'phone-input':
      return t('accounts_gm_status_setting_up')
    case 'session-expired':
      return t('accounts_gm_status_expired')
    default:
      return t('accounts_status_not_connected')
  }
}

/** Get description text for the bottom of the card. Empty for most states. */
function getDescription(_state: CardState): string {
  // Per prototype: no description for setup states or connected/expired
  // (content is self-explanatory via disclosure boxes, account row meta, or error banner)
  return ''
}
