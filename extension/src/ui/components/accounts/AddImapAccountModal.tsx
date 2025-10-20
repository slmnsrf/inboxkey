/**
 * AddImapAccountModal Component
 *
 * Modal for adding/editing IMAP accounts via InboxBridge native app.
 * Includes connection testing and error handling for common scenarios.
 */

import React, { useEffect, useState } from 'react'
import { t } from '@/lib/i18n'
import { useFocusTrap, useEscapeKey } from '@/ui/hooks/useFocusTrap'
import { getNativeClient } from '@/lib/providers/imap-bridge/native-client'
import { INBOXBRIDGE_RELEASES_URL } from '@/lib/constants'

interface AddImapAccountModalProps {
  isOpen: boolean
  onConfirm: (accountData: {
    accountId: string
    email: string
    server: string
    port: number
    label: string
  }) => void
  onCancel: () => void
  /** Prefilled data for reconnect/edit */
  prefillData?: {
    email: string
    server: string
    port: number
    label: string
  }
}

type TestState = 'idle' | 'testing' | 'success' | 'error'

export function AddImapAccountModal({
  isOpen,
  onConfirm,
  onCancel,
  prefillData,
}: AddImapAccountModalProps) {
  const modalRef = useFocusTrap(isOpen)
  useEscapeKey(onCancel, isOpen)

  // Form state
  const [email, setEmail] = useState('')
  const [server, setServer] = useState('')
  const [port, setPort] = useState('993')
  const [password, setPassword] = useState('')
  const [label, setLabel] = useState('')
  const [tlsEnabled, setTlsEnabled] = useState(true)

  // Connection test state
  const [testState, setTestState] = useState<TestState>('idle')
  const [testError, setTestError] = useState<string | null>(null)
  const [bridgeInstalled, setBridgeInstalled] = useState<boolean | null>(null)
  const [accountId, setAccountId] = useState<string | null>(null)

  // Check if InboxBridge is installed when modal opens
  useEffect(() => {
    if (isOpen) {
      checkBridgeInstallation()

      // Prefill form if editing/reconnecting
      if (prefillData) {
        setEmail(prefillData.email)
        setServer(prefillData.server)
        setPort(String(prefillData.port))
        setLabel(prefillData.label || prefillData.email)
      } else {
        // Reset form for new account
        setEmail('')
        setServer('')
        setPort('993')
        setPassword('')
        setLabel('')
        setTlsEnabled(true)
        setTestState('idle')
        setTestError(null)
        setAccountId(null)
      }
    }
  }, [isOpen, prefillData])

  // Auto-disable TLS for port 993 (standard IMAPS port)
  useEffect(() => {
    if (port === '993') {
      setTlsEnabled(true)
    }
  }, [port])

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }

    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const checkBridgeInstallation = async () => {
    try {
      const client = getNativeClient()
      const status = await client.checkInstallStatus()
      setBridgeInstalled(status.installed)
    } catch (error) {
      setBridgeInstalled(false)
    }
  }

  const handleTestConnection = async () => {
    setTestState('testing')
    setTestError(null)

    try {
      const client = getNativeClient()
      const result = await client.call('account.test', {
        host: server,
        port: parseInt(port, 10),
        tls: tlsEnabled,
        username: email,
        password: password,
      })

      if (result.success) {
        setTestState('success')

        // If test succeeded, configure the account
        const configResult = await client.call('account.add', {
          label: label || email,
          host: server,
          port: parseInt(port, 10),
          tls: tlsEnabled,
          username: email,
          password: password,
        })

        setAccountId(configResult.accountId)
      } else {
        setTestState('error')
        setTestError(t('toast_imap_test_failed') + ': ' + (result.error || 'Unknown error'))
      }
    } catch (error) {
      setTestState('error')

      if (error instanceof Error) {
        if (error.message.includes('Failed to connect to InboxBridge')) {
          setTestError(t('accounts_imap_bridge_not_installed'))
          setBridgeInstalled(false)
        } else if (error.message.includes('AUTH')) {
          setTestError(t('accounts_imap_error_auth'))
        } else if (error.message.includes('timeout')) {
          setTestError(t('accounts_imap_error_timeout'))
        } else if (error.message.includes('keychain')) {
          setTestError(t('accounts_imap_error_keychain'))
        } else {
          setTestError(error.message)
        }
      } else {
        setTestError(t('toast_imap_test_failed'))
      }
    }
  }

  const handleAdd = () => {
    if (!accountId) return

    onConfirm({
      accountId,
      email,
      server,
      port: parseInt(port, 10),
      label: label || email,
    })
  }

  if (!isOpen) return null

  const isFormValid = email && server && port && password
  const canTest = isFormValid && testState !== 'testing'
  const canAdd = testState === 'success' && accountId

  return (
    <div
      className="modal-overlay"
      onClick={onCancel}
      role="presentation"
    >
      <div
        ref={modalRef as React.RefObject<HTMLDivElement>}
        className="modal-content modal-content--large"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-imap-title"
        aria-describedby="add-imap-description"
      >
        <div className="modal-header">
          <h2 id="add-imap-title" className="modal-title">
            {prefillData ? t('accounts_imap_reconnect_title') : t('accounts_imap_add_title')}
          </h2>
        </div>

        <div id="add-imap-description" className="modal-body">
          {bridgeInstalled === false && (
            <div className="alert alert--warning" role="alert">
              <p>
                <strong>{t('accounts_imap_bridge_not_installed')}</strong>
              </p>
              <p>{t('accounts_imap_bridge_install_instructions')}</p>
              <a
                href={INBOXBRIDGE_RELEASES_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn--primary btn--sm"
              >
                {t('accounts_imap_install_bridge')}
              </a>
            </div>
          )}

          <form className="imap-form" onSubmit={(e) => e.preventDefault()}>
            <div className="form-group">
              <label htmlFor="imap-email" className="form-label">
                {t('accounts_imap_email_label')}
              </label>
              <input
                id="imap-email"
                type="email"
                className="form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                required
                aria-required="true"
                disabled={bridgeInstalled === false}
              />
            </div>

            <div className="form-group">
              <label htmlFor="imap-server" className="form-label">
                {t('accounts_imap_server_label')}
              </label>
              <input
                id="imap-server"
                type="text"
                className="form-input"
                value={server}
                onChange={(e) => setServer(e.target.value)}
                placeholder="imap.gmail.com"
                required
                aria-required="true"
                disabled={bridgeInstalled === false}
              />
              <p className="form-hint">{t('accounts_imap_server_hint')}</p>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="imap-port" className="form-label">
                  {t('accounts_imap_port_label')}
                </label>
                <input
                  id="imap-port"
                  type="number"
                  className="form-input"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  placeholder="993"
                  required
                  aria-required="true"
                  min="1"
                  max="65535"
                  disabled={bridgeInstalled === false}
                />
              </div>

              <div className="form-group">
                <label htmlFor="imap-tls" className="form-label">
                  {t('accounts_imap_tls_label')}
                </label>
                <div className="form-checkbox">
                  <input
                    id="imap-tls"
                    type="checkbox"
                    checked={tlsEnabled}
                    onChange={(e) => setTlsEnabled(e.target.checked)}
                    disabled={bridgeInstalled === false || port === '993'}
                  />
                  <label htmlFor="imap-tls" className="form-checkbox-label">
                    {t('accounts_imap_tls_enabled')}
                  </label>
                </div>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="imap-password" className="form-label">
                {t('accounts_imap_password_label')}
              </label>
              <input
                id="imap-password"
                type="password"
                className="form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                aria-required="true"
                autoComplete="off"
                disabled={bridgeInstalled === false}
              />
              <p className="form-hint">{t('accounts_imap_password_hint')}</p>
            </div>

            <div className="form-group">
              <label htmlFor="imap-label" className="form-label">
                {t('accounts_imap_label_label')}
              </label>
              <input
                id="imap-label"
                type="text"
                className="form-input"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={email || 'My IMAP Account'}
                disabled={bridgeInstalled === false}
              />
              <p className="form-hint">{t('accounts_imap_label_hint')}</p>
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="btn btn--secondary"
                onClick={handleTestConnection}
                disabled={!canTest || bridgeInstalled === false}
              >
                {testState === 'testing'
                  ? t('accounts_imap_testing')
                  : t('accounts_imap_test_connection')}
              </button>
            </div>

            {testState === 'success' && (
              <div className="alert alert--success" role="status">
                ✓ {t('accounts_imap_test_success')}
              </div>
            )}

            {testState === 'error' && testError && (
              <div className="alert alert--error" role="alert">
                {testError}
                {bridgeInstalled === false && (
                  <p>
                    <a
                      href={INBOXBRIDGE_RELEASES_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn--primary btn--sm"
                      style={{ marginTop: 'var(--space-2)' }}
                    >
                      {t('accounts_imap_install_bridge')}
                    </a>
                  </p>
                )}
              </div>
            )}
          </form>
        </div>

        <div className="modal-footer">
          <button
            type="button"
            onClick={onCancel}
            className="btn btn--secondary"
          >
            {t('modal_cancel')}
          </button>
          <button
            type="button"
            onClick={handleAdd}
            className="btn btn--primary"
            disabled={!canAdd}
          >
            {prefillData ? t('accounts_imap_update') : t('accounts_imap_add_button')}
          </button>
        </div>
      </div>
    </div>
  )
}
