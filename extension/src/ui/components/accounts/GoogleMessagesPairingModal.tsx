/**
 * GoogleMessagesPairingModal Component
 *
 * Modal dialog for the Google Messages pairing flow. Contains 6 phases:
 * 1. Phone input: CountryPicker + phone number + disclosures + connect button
 * 2. Countdown: 3-second countdown before opening GM tab
 * 3. Pairing wait: Pulsing dots + scan QR instruction + fallback link (10s)
 * 4. Success: Green checkmark + masked phone number
 * 5. Connected: Compact card with Test/Disconnect actions
 * 6. Session expired: Error banner + Re-pair/Disconnect actions
 *
 * Communication with background via chrome.runtime.sendMessage:
 * - CONNECT_GOOGLE_MESSAGES, CHECK_GM_PAIRING_STATUS,
 *   CANCEL_GM_SETUP, DISCONNECT_GOOGLE_MESSAGES, TEST_MAILBOX_CONNECTION,
 *   FOCUS_EXTENSION_TAB
 */

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Smartphone, ChevronDown, Check, AlertTriangle } from 'lucide-react'
import { t } from '@/lib/i18n'
import { Modal } from '@/ui/components/Modal'
import {
  CountryPicker,
  detectCountryFromLocale,
  type CountryEntry,
} from '@/ui/components/options/CountryPicker'

// --- Types ---

type PairingPhase =
  | 'phone-input'
  | 'countdown'
  | 'pairing'
  | 'success'
  | 'connected'
  | 'session-expired'

export interface GoogleMessagesPairingModalProps {
  isOpen: boolean
  onClose: () => void
  onConnected: (phoneNumber: string) => void
  /** Pre-filled phone for re-pairing (session expired) */
  initialPhoneNumber?: string
  /** Existing mailbox ID (for connected/expired states) */
  mailboxId?: string
}

// --- Constants ---

const PAIRING_POLL_INTERVAL = 4000
const FALLBACK_LINK_DELAY = 10000
const SUCCESS_AUTO_CLOSE_DELAY = 3000
const GM_WEB_URL = 'https://messages.google.com/web/welcome'

// --- Helpers ---

function isValidPhoneNumber(value: string): boolean {
  const digits = value.replace(/[^\d]/g, '')
  return digits.length >= 7
}

/** Mask phone for display: +90 555 *** **67 */
function maskPhone(dial: string, national: string): string {
  const clean = national.replace(/[^\d]/g, '')
  if (clean.length < 4) return `${dial} ${clean}`
  const last2 = clean.slice(-2)
  const masked = clean.slice(0, -2).replace(/\d/g, '*')
  // Group in chunks for readability
  const full = masked + last2
  const groups = full.match(/.{1,3}/g) || [full]
  return `${dial} ${groups.join(' ')}`
}

// --- Component ---

export function GoogleMessagesPairingModal({
  isOpen,
  onClose,
  onConnected,
  initialPhoneNumber,
  mailboxId,
}: GoogleMessagesPairingModalProps) {
  // Country picker state
  const [country, setCountry] = useState<CountryEntry>(detectCountryFromLocale)
  const [phone, setPhone] = useState('')
  const [phoneError, setPhoneError] = useState(false)
  const [phase, setPhase] = useState<PairingPhase>('phone-input')
  const [countdown, setCountdown] = useState(3)
  const [showFallback, setShowFallback] = useState(false)
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)

  // Connected/expired state
  const [testState, setTestState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')

  // Refs for timers/polling
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelledRef = useRef(false)
  const phoneInputRef = useRef<HTMLInputElement>(null)

  // --- Init ---

  // Pre-fill phone when re-pairing
  useEffect(() => {
    if (isOpen && initialPhoneNumber) {
      // initialPhoneNumber is stored as "+901234567" -- strip dial prefix
      const raw = initialPhoneNumber.replace(/^\+/, '')
      // Try to match country by dial prefix
      setPhone(raw)
    }
  }, [isOpen, initialPhoneNumber])

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      if (!initialPhoneNumber) {
        setPhase('phone-input')
        setPhone('')
      }
      setPhoneError(false)
      setFeedbackMessage(null)
      setCountdown(3)
      setShowFallback(false)
      cancelledRef.current = false
      setTestState('idle')
    }
    return () => {
      cleanupTimers()
    }
  }, [isOpen])

  // Focus phone input when phase enters phone-input
  useEffect(() => {
    if (phase !== 'phone-input' || !isOpen) return
    const timer = setTimeout(() => phoneInputRef.current?.focus(), 80)
    return () => clearTimeout(timer)
  }, [phase, isOpen])

  // --- Timer cleanup ---

  const cleanupTimers = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current)
      fallbackTimerRef.current = null
    }
  }, [])

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }, [])

  // --- Pairing polling ---

  const showPairingSuccess = useCallback(
    async (fullNumber: string) => {
      setPhase('success')

      try {
        await chrome.runtime.sendMessage({ type: 'FOCUS_EXTENSION_TAB' })
      } catch {
        // Best effort
      }

      await new Promise((r) => setTimeout(r, 500))

      setTimeout(() => {
        onConnected(fullNumber)
      }, SUCCESS_AUTO_CLOSE_DELAY)
    },
    [onConnected],
  )

  const startPairingPoll = useCallback(
    (fullNumber: string) => {
      stopPolling()
      pollingRef.current = setInterval(async () => {
        try {
          const response = await chrome.runtime.sendMessage({
            type: 'CHECK_GM_PAIRING_STATUS',
          })

          if (response.status === 'paired') {
            stopPolling()
            cleanupTimers()
            showPairingSuccess(fullNumber)
          } else if (response.status === 'not-open') {
            stopPolling()
            cleanupTimers()
            setPhase('phone-input')
            setFeedbackMessage(t('toast_connect_failed'))
          } else if (response.status === 'error') {
            stopPolling()
            cleanupTimers()
            setPhase('phone-input')
            setFeedbackMessage(response.error || t('toast_connect_failed'))
          }
          // 'unpaired' continues polling
        } catch (error) {
          console.warn('[GoogleMessagesPairingModal] Poll error:', error)
          stopPolling()
          cleanupTimers()
          setPhase('phone-input')
          setFeedbackMessage(t('toast_connect_failed'))
        }
      }, PAIRING_POLL_INTERVAL)
    },
    [stopPolling, cleanupTimers, showPairingSuccess],
  )

  // --- Handlers ---

  const handleConnect = async () => {
    setFeedbackMessage(null)

    if (!isValidPhoneNumber(phone)) {
      setPhoneError(true)
      return
    }

    setPhoneError(false)
    cancelledRef.current = false

    // Build full international number
    const digitsOnly = phone.replace(/[\s\-\(\)]/g, '')
    const fullNumber = `${country.dial}${digitsOnly}`

    // Countdown 3..2..1
    setPhase('countdown')
    setShowFallback(false)

    for (let i = 3; i >= 1; i--) {
      setCountdown(i)
      await new Promise((r) => setTimeout(r, 1000))
      if (cancelledRef.current) return
    }

    setPhase('pairing')

    // Show fallback link after 10s
    fallbackTimerRef.current = setTimeout(() => setShowFallback(true), FALLBACK_LINK_DELAY)

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CONNECT_GOOGLE_MESSAGES',
        phoneNumber: fullNumber,
      })

      if (cancelledRef.current) return

      if (response.status === 'paired') {
        cleanupTimers()
        showPairingSuccess(fullNumber)
      } else if (response.status === 'pairing') {
        startPairingPoll(fullNumber)
      } else {
        cleanupTimers()
        setPhase('phone-input')
        setFeedbackMessage(response.error || t('toast_connect_failed'))
      }
    } catch (error) {
      cleanupTimers()
      console.warn('[GoogleMessagesPairingModal] Connect error:', error)
      setPhase('phone-input')
      setFeedbackMessage(t('toast_connect_failed'))
    }
  }

  const handleCancel = async () => {
    cancelledRef.current = true
    cleanupTimers()
    try {
      await chrome.runtime.sendMessage({ type: 'CANCEL_GM_SETUP' })
    } catch {
      // Best effort
    }
    onClose()
  }

  const handleRepair = async () => {
    setFeedbackMessage(null)
    cancelledRef.current = false

    const digitsOnly = phone.replace(/[\s\-\(\)]/g, '')
    const fullNumber = `${country.dial}${digitsOnly}`

    // Skip countdown for re-pair, go straight to pairing
    setPhase('pairing')
    setShowFallback(false)

    fallbackTimerRef.current = setTimeout(() => setShowFallback(true), FALLBACK_LINK_DELAY)

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CONNECT_GOOGLE_MESSAGES',
        phoneNumber: fullNumber,
        repair: true,
      })

      if (response.status === 'paired') {
        cleanupTimers()
        showPairingSuccess(fullNumber)
      } else if (response.status === 'pairing') {
        startPairingPoll(fullNumber)
      } else {
        cleanupTimers()
        setPhase('session-expired')
        setFeedbackMessage(response.error || t('toast_connect_failed'))
      }
    } catch (error) {
      cleanupTimers()
      console.warn('[GoogleMessagesPairingModal] Re-pair error:', error)
      setPhase('session-expired')
      setFeedbackMessage(t('toast_connect_failed'))
    }
  }

  const handleTest = async () => {
    if (!mailboxId) return
    setTestState('loading')
    setFeedbackMessage(null)
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'TEST_MAILBOX_CONNECTION',
        mailboxId,
      })
      if (response.success) {
        setTestState('success')
        setTimeout(() => setTestState('idle'), 2000)
      } else {
        setTestState('error')
        setFeedbackMessage(response.error || 'Connection test failed')
        setTimeout(() => setTestState('idle'), 4000)
        if (response.error?.includes('expired')) {
          setPhase('session-expired')
        }
      }
    } catch {
      setTestState('error')
      setFeedbackMessage('Test failed unexpectedly')
      setTimeout(() => setTestState('idle'), 4000)
    }
  }

  const handleDisconnect = async () => {
    if (!mailboxId) return
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'DISCONNECT_GOOGLE_MESSAGES',
        mailboxId,
      })
      if (response.ok) {
        onClose()
      } else {
        setFeedbackMessage(t('toast_disconnect_failed'))
      }
    } catch (error) {
      console.warn('[GoogleMessagesPairingModal] Disconnect error:', error)
      setFeedbackMessage(t('toast_disconnect_failed'))
    }
  }

  const handlePhoneKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleConnect()
    }
  }

  // Prevent closing during active pairing (countdown/pairing phase)
  const canClose = phase === 'phone-input' || phase === 'success' || phase === 'connected' || phase === 'session-expired'

  const handleModalClose = () => {
    if (phase === 'countdown' || phase === 'pairing') {
      handleCancel()
    } else {
      onClose()
    }
  }

  // --- Render Helpers ---

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleModalClose}
      title={t('gm_connect_title')}
      size="medium"
      className="gm-pairing-modal"
      preventCloseOnOverlayClick={!canClose}
      preventCloseOnEscape={!canClose}
    >
      <div className="gm-pairing">
        {phase === 'phone-input' && renderPhoneInput()}
        {phase === 'countdown' && renderCountdown()}
        {phase === 'pairing' && renderPairingWait()}
        {phase === 'success' && renderSuccess()}
        {phase === 'connected' && renderConnected()}
        {phase === 'session-expired' && renderExpired()}
      </div>
    </Modal>
  )

  // --- Phase Renderers ---

  function renderPhoneInput() {
    return (
      <div className="gm-pairing__phone-phase">
        <p className="gm-pairing__intro">{t('gm_connect_intro')}</p>

        {/* Disclosure boxes */}
        <div className="gm-pairing__disclosures">
          <details className="gm-disclosure">
            <summary className="gm-disclosure__summary">
              {t('accounts_gm_disclosure_how_title')}
              <span className="gm-disclosure__chev"><ChevronDown size={14} /></span>
            </summary>
            <div className="gm-disclosure__body">
              {t('accounts_gm_disclosure_how_text')}
            </div>
          </details>
          <details className="gm-disclosure">
            <summary className="gm-disclosure__summary">
              {t('accounts_gm_disclosure_phone_title')}
              <span className="gm-disclosure__chev"><ChevronDown size={14} /></span>
            </summary>
            <div className="gm-disclosure__body">
              {t('accounts_gm_disclosure_phone_text')}
            </div>
          </details>
          <details className="gm-disclosure">
            <summary className="gm-disclosure__summary">
              {t('accounts_gm_disclosure_know_title')}
              <span className="gm-disclosure__chev"><ChevronDown size={14} /></span>
            </summary>
            <div className="gm-disclosure__body">
              {t('accounts_gm_disclosure_know_text')}
            </div>
          </details>
        </div>

        {/* Phone number field */}
        <div className="gm-pairing__phone-field">
          <label className="gm-pairing__phone-label" htmlFor="gm-modal-phone">
            {t('accounts_gm_phone_label')}
          </label>
          <div
            className={`gm-pairing__input-wrap${phoneError ? ' gm-pairing__input-wrap--invalid' : ''}`}
          >
            <CountryPicker
              value={{ code: country.code, dial: country.dial }}
              onChange={(c) => {
                setCountry(c)
                if (phoneError) setPhoneError(false)
              }}
            />
            <input
              ref={phoneInputRef}
              id="gm-modal-phone"
              type="tel"
              className="gm-pairing__phone-input"
              placeholder="555 123 4567"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value)
                if (phoneError) setPhoneError(false)
              }}
              onKeyDown={handlePhoneKeyDown}
              aria-required="true"
              aria-describedby="gm-modal-phone-hint gm-modal-phone-error"
              aria-invalid={phoneError}
            />
          </div>
          <span className="gm-pairing__phone-hint" id="gm-modal-phone-hint">
            {t('gm_phone_hint_v2')}
          </span>
          {phoneError && (
            <p className="gm-pairing__phone-error" id="gm-modal-phone-error" role="alert">
              {t('accounts_gm_phone_error')}
            </p>
          )}
        </div>

        {feedbackMessage && (
          <p className="gm-pairing__feedback" role="alert">{feedbackMessage}</p>
        )}

        <button
          type="button"
          className="gm-pairing__action-btn"
          onClick={handleConnect}
        >
          <Smartphone size={16} />
          {t('gm_connect_button')}
        </button>
      </div>
    )
  }

  function renderCountdown() {
    return (
      <div className="gm-pairing__countdown" role="status" aria-live="polite">
        <span className="gm-pairing__countdown-number">{countdown}</span>
        <p className="gm-pairing__countdown-text">{t('gm_countdown_text')}</p>
      </div>
    )
  }

  function renderPairingWait() {
    return (
      <div className="gm-pairing__wait" role="status" aria-live="polite">
        <div className="gm-pairing__dots" aria-hidden="true">
          <span className="gm-pairing__dot" />
          <span className="gm-pairing__dot" />
          <span className="gm-pairing__dot" />
        </div>
        <h3 className="gm-pairing__wait-title">{t('accounts_gm_pairing_title')}</h3>
        <p className="gm-pairing__wait-detail">{t('accounts_gm_pairing_instruction')}</p>
        {showFallback && (
          <p className="gm-pairing__fallback">
            {t('accounts_gm_pairing_fallback_prefix')}{' '}
            <a
              href={GM_WEB_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('accounts_gm_pairing_fallback_link')}
            </a>
          </p>
        )}
      </div>
    )
  }

  function renderSuccess() {
    return (
      <div className="gm-pairing__success" role="status" aria-live="polite">
        <span className="gm-pairing__success-icon">
          <Check size={28} />
        </span>
        <h3 className="gm-pairing__success-title">Phone connected</h3>
        <p className="gm-pairing__success-detail">
          SMS verification codes from {maskPhone(country.dial, phone)} will now appear in InboxKey.
        </p>
      </div>
    )
  }

  function renderConnected() {
    const displayPhone = phone
      ? maskPhone(country.dial, phone)
      : initialPhoneNumber || ''

    return (
      <div className="gm-pairing__connected">
        <div className="gm-connected-card">
          <span className="gm-connected-card__dot" />
          <div className="gm-connected-card__info">
            <span className="gm-connected-card__phone">{displayPhone}</span>
            <span className="gm-connected-card__meta">
              {t('accounts_gm_connected_meta')}
            </span>
          </div>
          <div className="gm-connected-card__actions">
            <button
              type="button"
              className="gm-small-btn"
              onClick={handleTest}
              disabled={testState !== 'idle'}
              aria-busy={testState === 'loading'}
            >
              {testState === 'loading' ? t('accounts_testing')
                : testState === 'success' ? t('accounts_test_success')
                : testState === 'error' ? t('accounts_test_failed')
                : t('accounts_test')}
            </button>
            <button
              type="button"
              className="gm-small-btn gm-small-btn--danger"
              onClick={handleDisconnect}
              aria-label={t('aria_disconnect_google_messages')}
            >
              {t('accounts_disconnect')}
            </button>
          </div>
        </div>
        {feedbackMessage && (
          <p className="gm-pairing__feedback" role="alert">{feedbackMessage}</p>
        )}
      </div>
    )
  }

  function renderExpired() {
    const displayPhone = phone
      ? maskPhone(country.dial, phone)
      : initialPhoneNumber || ''

    return (
      <div className="gm-pairing__expired">
        <div className="gm-expired-banner" role="alert">
          <span className="gm-expired-banner__icon">
            <AlertTriangle size={16} />
          </span>
          <span>{t('accounts_gm_session_expired_text')}</span>
        </div>
        <div className="gm-connected-card gm-connected-card--error">
          <span className="gm-connected-card__dot gm-connected-card__dot--error" />
          <div className="gm-connected-card__info">
            <span className="gm-connected-card__phone">{displayPhone}</span>
            <span className="gm-connected-card__meta gm-connected-card__meta--error">
              {t('accounts_gm_session_expired_meta')}
            </span>
          </div>
          <div className="gm-connected-card__actions">
            <button
              type="button"
              className="gm-pairing__action-btn gm-pairing__action-btn--inline"
              onClick={handleRepair}
            >
              {t('accounts_gm_repair')}
            </button>
            <button
              type="button"
              className="gm-small-btn gm-small-btn--danger"
              onClick={handleDisconnect}
              aria-label={t('aria_disconnect_google_messages')}
            >
              {t('accounts_disconnect')}
            </button>
          </div>
        </div>
        {feedbackMessage && (
          <p className="gm-pairing__feedback" role="alert">{feedbackMessage}</p>
        )}
      </div>
    )
  }
}
