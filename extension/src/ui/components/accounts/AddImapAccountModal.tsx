/**
 * AddImapAccountModal Component (v2 - Stepped Flow)
 *
 * Two-step wizard for adding IMAP accounts via InboxBridge:
 * Step 1: Provider selection grid (Gmail, Yahoo, Outlook, iCloud, ProtonMail, Yandex, Custom)
 * Step 2: Credentials form with provider-specific guide banner, collapsible advanced settings
 *
 * Reference: prototypes/dialogs/add-imap-stepped.html
 */

import React, { useEffect, useState, useCallback } from 'react'
import { t } from '@/lib/i18n'
import { useFocusTrap, useEscapeKey } from '@/ui/hooks/useFocusTrap'
import { getNativeClient } from '@/lib/native-messaging'
import { AlertTriangle, ArrowLeft, Code2, Download, Info, Loader2, ChevronRight } from 'lucide-react'

import gmailIcon from 'data-base64:~/assets/providers/gmail.svg'
import yahooIcon from 'data-base64:~/assets/providers/yahoo.svg'
import outlookIcon from 'data-base64:~/assets/providers/microsoft-outlook.svg'
import icloudIcon from 'data-base64:~/assets/providers/icloud.svg'
import protonmailIcon from 'data-base64:~/assets/providers/protonmail.svg'
import yandexIcon from 'data-base64:~/assets/providers/yandex.png'

/* ---------------------------------------------------------------
   Types & Presets
   --------------------------------------------------------------- */

interface AddImapAccountModalProps {
  isOpen: boolean
  onConfirm: (accountData: {
    accountId: string
    email: string
    server: string
    port: number
    label: string
  }) => void | Promise<void>
  onCancel: () => void
  prefillData?: {
    email: string
    server: string
    port: number
    label: string
  }
  /** When true, show bridge-required banner and disable provider selection */
  bridgeDisconnected?: boolean
  /** Called when user clicks "Set up InboxBridge" in the banner */
  onBridgeSetup?: () => void
}

type ProviderId = 'gmail' | 'yahoo' | 'outlook' | 'icloud' | 'protonmail' | 'yandex' | 'custom'
type TestState = 'idle' | 'testing' | 'adding' | 'success' | 'error'

interface ProviderPreset {
  name: string
  icon: string | null
  server: string
  port: number
  tls: boolean
  passwordLabel: string
  placeholder: string
  emailPlaceholder: string
  hint: string
  guide: string
  guideLink: string
  guideLinkText: string
}

const PRESETS: Record<ProviderId, ProviderPreset> = {
  gmail: {
    name: 'Gmail', icon: gmailIcon,
    server: 'imap.gmail.com', port: 993, tls: true,
    passwordLabel: 'App password', placeholder: 'xxxx xxxx xxxx xxxx',
    emailPlaceholder: 'you@gmail.com',
    hint: 'Paste the app password you generated from your Google Account.',
    guide: 'Gmail requires an app password for third-party mail access. You need to have 2-Step Verification enabled on your Google Account first, then generate an app password.',
    guideLink: 'https://myaccount.google.com/apppasswords',
    guideLinkText: 'Create a Gmail app password',
  },
  yahoo: {
    name: 'Yahoo Mail', icon: yahooIcon,
    server: 'imap.mail.yahoo.com', port: 993, tls: true,
    passwordLabel: 'App password', placeholder: 'xxxx xxxx xxxx xxxx',
    emailPlaceholder: 'you@yahoo.com',
    hint: 'Paste the app password you generated from Yahoo Account Security.',
    guide: 'Yahoo requires an app password for third-party mail access. Your regular Yahoo password will not work here.',
    guideLink: 'https://login.yahoo.com/account/security/app-passwords',
    guideLinkText: 'How to create a Yahoo app password',
  },
  outlook: {
    name: 'Outlook', icon: outlookIcon,
    server: 'outlook.office365.com', port: 993, tls: true,
    passwordLabel: 'Password', placeholder: '',
    emailPlaceholder: 'you@outlook.com',
    hint: 'Use your regular password. If you have two-factor authentication enabled, you will need an app password instead.',
    guide: 'If you have two-factor authentication enabled on your Microsoft account, you need to create an app password. If not, your regular password works.',
    guideLink: 'https://account.live.com/proofs/AppPassword',
    guideLinkText: 'Microsoft Account Security settings',
  },
  icloud: {
    name: 'iCloud Mail', icon: icloudIcon,
    server: 'imap.mail.me.com', port: 993, tls: true,
    passwordLabel: 'App-specific password', placeholder: 'xxxx-xxxx-xxxx-xxxx',
    emailPlaceholder: 'you@icloud.com',
    hint: 'Paste the app-specific password you generated from your Apple ID settings.',
    guide: 'iCloud requires an app-specific password. Generate one from your Apple ID account page under Sign-In and Security.',
    guideLink: 'https://appleid.apple.com/account/manage',
    guideLinkText: 'Manage your Apple ID',
  },
  protonmail: {
    name: 'ProtonMail', icon: protonmailIcon,
    server: '127.0.0.1', port: 1143, tls: false,
    passwordLabel: 'Bridge password', placeholder: '',
    emailPlaceholder: 'you@proton.me',
    hint: 'Use the password shown in the ProtonMail Bridge app, not your ProtonMail login password.',
    guide: 'ProtonMail requires the ProtonMail Bridge desktop app to be installed and running on your computer. InboxBridge connects to it locally. If you have not installed Proton Bridge yet, do that first.',
    guideLink: 'https://proton.me/mail/bridge',
    guideLinkText: 'Download ProtonMail Bridge',
  },
  yandex: {
    name: 'Yandex Mail', icon: yandexIcon,
    server: 'imap.yandex.com', port: 993, tls: true,
    passwordLabel: 'App password', placeholder: '',
    emailPlaceholder: 'you@yandex.com',
    hint: 'Paste the app password you created in your Yandex ID settings.',
    guide: 'Yandex requires an app password for third-party mail access. Create one in your Yandex ID account under Security settings.',
    guideLink: 'https://id.yandex.com/security/app-passwords',
    guideLinkText: 'Create a Yandex app password',
  },
  custom: {
    name: 'Custom Server', icon: null,
    server: '', port: 993, tls: true,
    passwordLabel: 'Password', placeholder: '',
    emailPlaceholder: 'you@example.com',
    hint: '', guide: '', guideLink: '', guideLinkText: '',
  },
}

const PROVIDER_CARDS: { id: ProviderId; hint: string }[] = [
  { id: 'gmail', hint: 'App password required' },
  { id: 'yahoo', hint: 'App password required' },
  { id: 'outlook', hint: 'Hotmail, Office 365' },
  { id: 'icloud', hint: 'App-specific password' },
  { id: 'protonmail', hint: 'Requires Proton Bridge' },
  { id: 'yandex', hint: 'App password required' },
  { id: 'custom', hint: 'Any IMAP server' },
]

/* ---------------------------------------------------------------
   Component
   --------------------------------------------------------------- */

export function AddImapAccountModal({
  isOpen,
  onConfirm,
  onCancel,
  prefillData,
  bridgeDisconnected,
  onBridgeSetup,
}: AddImapAccountModalProps) {
  const modalRef = useFocusTrap(isOpen)

  // Wizard state
  const [step, setStep] = useState<1 | 2>(1)
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>('custom')

  // Form state
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [label, setLabel] = useState('')
  const [server, setServer] = useState('')
  const [port, setPort] = useState('993')
  const [tlsEnabled, setTlsEnabled] = useState(true)
  const [advancedOpen, setAdvancedOpen] = useState(false)

  // Validation state (errors shown after blur, cleared on change)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [submitAttempted, setSubmitAttempted] = useState(false)

  // Test state
  const [testState, setTestState] = useState<TestState>('idle')
  const [testError, setTestError] = useState<string | null>(null)

  const isBusy = testState === 'testing' || testState === 'adding'
  const preset = PRESETS[selectedProvider]

  /* ---- Validation helpers ---- */
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const APP_PASSWORD_PROVIDERS: ProviderId[] = ['gmail', 'yahoo', 'icloud', 'yandex']

  function validateEmail(val: string): string | null {
    if (!val.trim()) return t('accounts_imap_validation_email_required')
    if (!EMAIL_RE.test(val.trim())) return t('accounts_imap_validation_email_invalid')
    return null
  }

  function validatePassword(val: string): string | null {
    if (!val) return t('accounts_imap_validation_password_required', preset.passwordLabel)
    const stripped = val.replace(/[\s\-]/g, '')
    if (APP_PASSWORD_PROVIDERS.includes(selectedProvider)) {
      if (stripped.length < 8) return t('accounts_imap_validation_app_password_short')
      if (stripped.length > 64) return t('accounts_imap_validation_app_password_long')
    } else {
      if (stripped.length < 4) return t('accounts_imap_validation_password_short')
      if (stripped.length > 256) return t('accounts_imap_validation_password_long')
    }
    return null
  }

  function validateServer(val: string): string | null {
    if (!val.trim()) return t('accounts_imap_validation_server_required')
    if (!/^[\w.\-:]+$/.test(val.trim())) return t('accounts_imap_validation_server_invalid')
    return null
  }

  function validatePort(val: string): string | null {
    const n = parseInt(val, 10)
    if (!val || isNaN(n)) return t('accounts_imap_validation_port_required')
    if (n < 1 || n > 65535) return t('accounts_imap_validation_port_invalid')
    return null
  }

  const errors = {
    email: validateEmail(email),
    password: validatePassword(password),
    server: validateServer(server),
    port: validatePort(port),
  }

  /** Show error only if field was touched or submit was attempted */
  function fieldError(field: keyof typeof errors): string | null {
    if (!touched[field] && !submitAttempted) return null
    return errors[field]
  }

  const hasErrors = Object.values(errors).some(Boolean)

  const handleCancel = useCallback(() => {
    if (isBusy) return
    onCancel()
  }, [isBusy, onCancel])

  useEscapeKey(handleCancel, isOpen)

  // Reset when modal opens
  useEffect(() => {
    if (!isOpen) return

    if (prefillData) {
      // Edit/reconnect: skip to step 2 with data pre-filled
      setStep(2)
      setEmail(prefillData.email)
      setServer(prefillData.server)
      setPort(String(prefillData.port))
      setLabel(prefillData.label || prefillData.email)
      setAdvancedOpen(true)
      const found = Object.entries(PRESETS).find(([, p]) => p.server === prefillData.server)
      setSelectedProvider((found?.[0] as ProviderId) || 'custom')
    } else {
      setStep(1)
      setSelectedProvider('custom')
      setEmail('')
      setPassword('')
      setLabel('')
      setServer('')
      setPort('993')
      setTlsEnabled(true)
      setAdvancedOpen(false)
    }
    setTouched({})
    setSubmitAttempted(false)
    setTestState('idle')
    setTestError(null)
  }, [isOpen, prefillData])

  // Note: no body scroll lock needed - fixed overlay prevents background interaction

  /* ---- Provider selection ---- */
  const handleSelectProvider = useCallback((id: ProviderId) => {
    setSelectedProvider(id)
    const p = PRESETS[id]
    setServer(p.server)
    setPort(String(p.port))
    setTlsEnabled(p.tls)
    setAdvancedOpen(id === 'custom')
    setEmail('')
    setPassword('')
    setLabel('')
    setTouched({})
    setSubmitAttempted(false)
    setTestState('idle')
    setTestError(null)
    setStep(2)
  }, [])

  /* ---- Blur handler for touched state ---- */
  const handleBlur = useCallback((field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }))
  }, [])

  /* ---- Test & Connect ---- */
  const handleTestAndAdd = async () => {
    setSubmitAttempted(true)
    if (hasErrors) {
      // Auto-expand advanced if server/port has errors but section is collapsed
      if ((errors.server || errors.port) && !advancedOpen) setAdvancedOpen(true)
      return
    }

    setTestState('testing')
    setTestError(null)

    try {
      const client = getNativeClient()
      const result = await client.call<{ success: boolean; error?: string }>('account.test', {
        host: server,
        port: parseInt(port, 10),
        tls: tlsEnabled,
        username: email,
        password,
      })

      if (result.success) {
        setTestState('adding')
        const trimmedLabel = label?.trim() || email
        const configResult = await client.call<{ accountId: string }>('account.add', {
          label: trimmedLabel,
          host: server,
          port: parseInt(port, 10),
          tls: tlsEnabled,
          username: email,
          password,
        })

        try {
          await onConfirm({
            accountId: configResult.accountId,
            email,
            server,
            port: parseInt(port, 10),
            label: trimmedLabel,
          })
          setTestState('success')
        } catch {
          setTestState('error')
          setTestError(t('accounts_imap_error_generic'))
        }
      } else {
        setTestState('error')
        setTestError(result.error || t('accounts_imap_error_generic'))
      }
    } catch (error) {
      setTestState('error')
      if (error instanceof Error) {
        if (error.message.includes('Failed to connect to InboxBridge')) {
          setTestError(t('accounts_imap_bridge_not_installed'))
        } else if (error.message.includes('AUTH') || error.message.includes('authentication')) {
          setTestError(t('accounts_imap_error_auth'))
        } else if (error.message.includes('timeout')) {
          setTestError(t('accounts_imap_error_timeout'))
        } else if (error.message.includes('TLS') || error.message.includes('SSL')) {
          setTestError(t('accounts_imap_error_tls'))
        } else {
          setTestError(error.message || t('accounts_imap_error_generic'))
        }
      } else {
        setTestError(t('toast_imap_test_failed'))
      }
    }
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={handleCancel} role="presentation">
      <div
        ref={modalRef as React.RefObject<HTMLDivElement>}
        className="imap-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-imap-title"
      >
        {/* ==================== STEP 1: Provider Selection ==================== */}
        {step === 1 && (
          <>
            <div className="imap-modal__header">
              <h2 id="add-imap-title" className="imap-modal__title">
                {t('accounts_imap_add_title')}
              </h2>
              <button className="imap-modal__close" onClick={handleCancel} aria-label="Close">
                &times;
              </button>
            </div>

            <div className="imap-step-dots">
              <span className="imap-step-dot imap-step-dot--active" />
              <span className="imap-step-dot" />
            </div>

            <div className="imap-modal__body">
              {/* Bridge-required banner */}
              {bridgeDisconnected && (
                <div className="imap-bridge-banner">
                  <span className="imap-bridge-banner__icon">
                    <AlertTriangle size={16} aria-hidden="true" />
                  </span>
                  <div className="imap-bridge-banner__content">
                    <p className="imap-bridge-banner__title">{t('bridge_install_required_title')}</p>
                    <p className="imap-bridge-banner__detail">{t('bridge_install_required_detail')}</p>
                    <button
                      className="imap-bridge-banner__action"
                      type="button"
                      onClick={() => onBridgeSetup?.()}
                    >
                      <Download size={14} aria-hidden="true" />
                      {t('bridge_install_setup_btn')}
                    </button>
                  </div>
                </div>
              )}

              <div className={`imap-provider-grid${bridgeDisconnected ? ' imap-provider-grid--disabled' : ''}`}>
                {PROVIDER_CARDS.map(({ id, hint }) => (
                  <button
                    key={id}
                    className="imap-provider-card"
                    type="button"
                    disabled={!!bridgeDisconnected}
                    onClick={() => handleSelectProvider(id)}
                  >
                    <span className={`imap-provider-card__icon${id === 'custom' ? ' imap-provider-card__icon--custom' : ''}`}>
                      {PRESETS[id].icon ? (
                        <img src={PRESETS[id].icon!} alt="" width={24} height={24} />
                      ) : (
                        <Code2 size={18} />
                      )}
                    </span>
                    <span className="imap-provider-card__info">
                      <span className="imap-provider-card__name">{PRESETS[id].name}</span>
                      <span className="imap-provider-card__hint">{hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ==================== STEP 2: Credentials ==================== */}
        {step === 2 && (
          <>
            <div className="imap-modal__header">
              {!prefillData && (
                <button
                  className="imap-modal__back"
                  onClick={() => { setStep(1); setTestState('idle'); setTestError(null) }}
                  aria-label="Back"
                >
                  <ArrowLeft size={18} />
                </button>
              )}
              <h2 id="add-imap-title" className="imap-modal__title">
                {prefillData ? t('accounts_imap_reconnect_title') : preset.name}
              </h2>
              <button className="imap-modal__close" onClick={handleCancel} aria-label="Close">
                &times;
              </button>
            </div>

            <div className="imap-step-dots">
              <span className="imap-step-dot" />
              <span className="imap-step-dot imap-step-dot--active" />
            </div>

            <div className="imap-modal__body">
              {/* Provider-specific guide banner. The "create app password"
                  link is rendered next to the password field instead of
                  inside the banner — its action belongs where the user
                  needs it. */}
              {preset.guide && (
                <div className="imap-guide-banner">
                  <span className="imap-guide-banner__icon">
                    <Info size={16} />
                  </span>
                  <div className="imap-guide-banner__content">{preset.guide}</div>
                </div>
              )}

              {/* Privacy Reassurance (REQUIRED per ui-ux-principles.md DoD) */}
              <p className="imap-privacy-note">{t('accounts_imap_privacy_reassurance')}</p>

              {/* Email */}
              <div className="imap-form-group">
                <label className="imap-form-label" htmlFor="imap-email">{t('accounts_imap_email_label')}</label>
                <input
                  className={`imap-form-input${fieldError('email') ? ' imap-form-input--error' : ''}`}
                  type="email"
                  id="imap-email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => handleBlur('email')}
                  placeholder={preset.emailPlaceholder}
                  autoFocus
                  aria-invalid={!!fieldError('email')}
                  aria-describedby={fieldError('email') ? 'imap-email-error' : undefined}
                />
                {fieldError('email') && (
                  <p className="imap-form-error" id="imap-email-error" role="alert">{fieldError('email')}</p>
                )}
              </div>

              {/* Password */}
              <div className="imap-form-group">
                <label className="imap-form-label" htmlFor="imap-password">{preset.passwordLabel}</label>
                <input
                  className={`imap-form-input${fieldError('password') ? ' imap-form-input--error' : ''}`}
                  type="password"
                  id="imap-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => handleBlur('password')}
                  placeholder={preset.placeholder || undefined}
                  autoComplete="off"
                  aria-invalid={!!fieldError('password')}
                  aria-describedby={fieldError('password') ? 'imap-password-error' : 'imap-password-hint'}
                />
                {fieldError('password') ? (
                  <p className="imap-form-error" id="imap-password-error" role="alert">{fieldError('password')}</p>
                ) : preset.hint ? (
                  <p className="imap-form-hint" id="imap-password-hint">{preset.hint}</p>
                ) : null}
                {preset.guideLink && (
                  <a
                    href={preset.guideLink}
                    className="imap-form-action-link"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {preset.guideLinkText} &rarr;
                  </a>
                )}
              </div>

              {/* Label (optional) */}
              <div className="imap-form-group">
                <label className="imap-form-label" htmlFor="imap-label">
                  {t('accounts_imap_label_label')} <span className="imap-form-optional">{t('accounts_imap_label_optional')}</span>
                </label>
                <input
                  className="imap-form-input"
                  type="text"
                  id="imap-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder={`e.g. Personal ${preset.name}`}
                />
              </div>

              {/* Advanced settings */}
              <button
                className="imap-advanced-toggle"
                type="button"
                onClick={() => setAdvancedOpen(!advancedOpen)}
              >
                <span className={`imap-advanced-toggle__arrow${advancedOpen ? ' open' : ''}`}>
                  <ChevronRight size={12} />
                </span>
                {t('accounts_imap_advanced_settings')}
              </button>

              {advancedOpen && (
                <div className="imap-advanced-fields">
                  <div className="imap-advanced-row imap-form-group">
                    <div>
                      <label className="imap-form-label" htmlFor="imap-server">{t('accounts_imap_server_label')}</label>
                      <input
                        className={`imap-form-input${fieldError('server') ? ' imap-form-input--error' : ''}`}
                        type="text"
                        id="imap-server"
                        value={server}
                        onChange={(e) => setServer(e.target.value)}
                        onBlur={() => handleBlur('server')}
                        placeholder="imap.example.com"
                        aria-invalid={!!fieldError('server')}
                      />
                      {fieldError('server') && (
                        <p className="imap-form-error" role="alert">{fieldError('server')}</p>
                      )}
                    </div>
                    <div>
                      <label className="imap-form-label" htmlFor="imap-port">{t('accounts_imap_port_label')}</label>
                      <input
                        className={`imap-form-input${fieldError('port') ? ' imap-form-input--error' : ''}`}
                        type="number"
                        id="imap-port"
                        value={port}
                        onChange={(e) => setPort(e.target.value)}
                        onBlur={() => handleBlur('port')}
                        min="1"
                        max="65535"
                        aria-invalid={!!fieldError('port')}
                      />
                      {fieldError('port') && (
                        <p className="imap-form-error" role="alert">{fieldError('port')}</p>
                      )}
                    </div>
                  </div>
                  <label className="imap-tls-toggle">
                    <input
                      type="checkbox"
                      checked={tlsEnabled}
                      onChange={(e) => setTlsEnabled(e.target.checked)}
                    />
                    {t('accounts_imap_tls_recommended')}
                  </label>
                </div>
              )}

              {/* Connection test error */}
              {testState === 'error' && testError && (
                <div className="imap-test-error" role="alert">
                  {testError}
                </div>
              )}

              {/* Actions */}
              <div className="imap-modal__actions">
                <button
                  className="btn btn--primary imap-modal__submit"
                  type="button"
                  onClick={handleTestAndAdd}
                  disabled={isBusy || testState === 'success'}
                >
                  {testState === 'testing' && <><Loader2 size={14} className="spin" /> {t('accounts_imap_testing_connection')}</>}
                  {testState === 'adding' && <><Loader2 size={14} className="spin" /> {t('accounts_imap_adding')}</>}
                  {testState === 'success' && <>{t('accounts_imap_connected')}</>}
                  {(testState === 'idle' || testState === 'error') && t('accounts_imap_test_and_connect')}
                </button>
              </div>
            </div>
          </>
        )}

        {/* Screen reader announcements */}
        <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {testState === 'testing' && t('accounts_imap_testing')}
          {testState === 'success' && t('accounts_imap_test_success')}
          {testState === 'error' && testError}
        </div>
      </div>
    </div>
  )
}
