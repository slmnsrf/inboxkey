import React, { useState } from 'react'
import { useLockContext } from '@/ui/contexts/LockContext'
import { useToast } from '@/ui/contexts/ToastContext'
import { PasswordSetup } from './PasswordSetup'
import { ChangePasswordForm } from './ChangePasswordForm'
import { AutoLockConfig } from './AutoLockConfig'
import { LockScreen } from './LockScreen'
import { PasswordInput } from './PasswordInput'
import { t } from '@/lib/i18n'
import { PIN_LENGTH } from '@/lib/crypto/key-manager'

export interface SecuritySettingsProps {}

export function SecuritySettings(_props: SecuritySettingsProps): JSX.Element {
  const { isInitialized, isUnlocked, disablePasswordProtection, isLoading, lock } = useLockContext()
  const { showToast } = useToast()

  const [showPasswordSetup, setShowPasswordSetup] = useState(false)
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [showDisableSection, setShowDisableSection] = useState(false)
  const [disablePassword, setDisablePassword] = useState('')
  const [disableError, setDisableError] = useState('')
  const [isDisabling, setIsDisabling] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetPassword, setResetPassword] = useState('')
  const [resetError, setResetError] = useState('')
  const [isResetting, setIsResetting] = useState(false)
  const sanitizePin = (value: string) => value.replace(/\D/g, '').slice(0, PIN_LENGTH)

  const benefits = [
    t('security_benefit_encrypt'),
    t('security_benefit_autolock'),
    t('security_benefit_require_password'),
    t('security_benefit_secure_connections')
  ]

  const resetDisableState = () => {
    setShowDisableSection(false)
    setDisablePassword('')
    setDisableError('')
    setIsDisabling(false)
  }

  const resetDangerState = () => {
    setShowResetConfirm(false)
    setResetPassword('')
    setResetError('')
    setIsResetting(false)
  }

  const handleSetupSuccess = () => {
    setShowPasswordSetup(false)
  }

  const handleSetupCancel = () => {
    setShowPasswordSetup(false)
  }

  const handleChangePasswordSuccess = () => {
    setShowChangePassword(false)
  }

  const handleChangePasswordCancel = () => {
    setShowChangePassword(false)
  }

  const handleLockNow = async (): Promise<boolean> => {
    try {
      await lock()
      showToast(t('security_toast_locked'), 'success')
      return true
    } catch (error) {
      console.error('[SecuritySettings] Failed to lock immediately', error)
      showToast(t('security_toast_lock_failed'), 'error')
      return false
    }
  }

  const handleDisableProtection = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!disablePassword) {
      setDisableError(t('security_danger_confirm_message'))
      return
    }

    setIsDisabling(true)
    setDisableError('')

    try {
      await disablePasswordProtection(disablePassword)
      resetDisableState()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to disable password protection'
      setDisableError(message)
      setDisablePassword('')
    } finally {
      setIsDisabling(false)
    }
  }

  const handleUnlock = () => {
    resetDisableState()
    resetDangerState()
    setShowChangePassword(false)
    setShowPasswordSetup(false)
    showToast(t('security_toast_unlocked'), 'success')
  }

  const handleResetConfirmClick = () => {
    setShowResetConfirm(true)
    setResetPassword('')
    setResetError('')
  }

  const handleResetCancel = () => {
    resetDangerState()
  }

  const handleResetSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!resetPassword) {
      setResetError(t('security_danger_confirm_message'))
      return
    }

    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      setResetError(t('security_reset_failed'))
      return
    }

    setIsResetting(true)
    setResetError('')

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'RESET_EXTENSION',
        password: resetPassword
      })

      if (!response || typeof response !== 'object' || !('success' in response)) {
        setResetError(t('security_reset_failed'))
        return
      }

      const successResponse = response as { success: boolean; error?: string }

      if (!successResponse.success) {
        setResetError(successResponse.error || t('security_reset_failed'))
        return
      }

      showToast(t('security_reset_success'), 'success')
      resetDangerState()
    } catch (error) {
      const message = error instanceof Error ? error.message : t('security_reset_failed')
      setResetError(message)
    } finally {
      setIsResetting(false)
      setResetPassword('')
    }
  }

  if (isInitialized && !isUnlocked) {
    return (
      <div className="security-settings security-settings--locked">
        <LockScreen mode="settings" onUnlock={handleUnlock} />
        <p className="security-locked__message">{t('security_locked_message')}</p>
      </div>
    )
  }

  if (!isInitialized) {
    return (
      <div className="security-settings">
        <header className="security-settings__header">
          <h2 className="security-settings__title">{t('settings_tab_security')}</h2>
          <p className="security-settings__description">{t('security_setup_description')}</p>
        </header>

        <section className="security-card">
          <div className="security-card__header">
            <div className="security-card__summary">
              <h3 className="security-card__title">{t('security_setup_title')}</h3>
              <p className="security-card__subtitle">{t('security_setup_description')}</p>
            </div>
            <button
              type="button"
              className={`security-button ${showPasswordSetup ? 'security-button--secondary' : 'security-button--primary'}`}
              onClick={() => setShowPasswordSetup(prev => !prev)}
            >
              {showPasswordSetup ? t('button_cancel') : t('security_action_enable')}
            </button>
          </div>

          {showPasswordSetup ? (
            <div className="security-card__section">
              <PasswordSetup onSuccess={handleSetupSuccess} onCancel={handleSetupCancel} />
            </div>
          ) : (
            <ul className="security-benefits">
              {benefits.map((benefit, index) => (
                <li key={index}>{benefit}</li>
              ))}
            </ul>
          )}
        </section>
      </div>
    )
  }

  return (
    <div className="security-settings">
      <header className="security-settings__header">
        <h2 className="security-settings__title">{t('settings_tab_security')}</h2>
        <p className="security-settings__description">{t('security_status_active_description')}</p>
      </header>

      <section className="security-card">
        <div className="security-card__header">
            <div className="security-card__summary">
              <h3 className="security-card__title">{t('security_password_protection')}</h3>
              <p className="security-card__subtitle">{t('security_status_active_description')}</p>
          </div>
          <span className="security-pill security-pill--success">{t('security_status_active')}</span>
        </div>

        <div className="security-actions">
          <button
            type="button"
            className="security-button security-button--primary"
            onClick={() => setShowChangePassword(true)}
          >
            {t('security_action_change_password')}
          </button>
          <button
            type="button"
            className="security-button security-button--secondary"
            onClick={() => setShowDisableSection(true)}
            disabled={isLoading}
          >
            {t('security_action_disable')}
          </button>
        </div>

        {showChangePassword && (
          <div className="security-card__section">
            <ChangePasswordForm
              onSuccess={handleChangePasswordSuccess}
              onCancel={handleChangePasswordCancel}
            />
          </div>
        )}

        <div className="security-card__section">
          {showDisableSection ? (
            <form className="security-form" onSubmit={handleDisableProtection}>
              <div className="security-banner security-banner--critical">
                <span className="security-banner__icon" aria-hidden="true">⚠️</span>
                <div className="security-banner__content">
                  <strong>{t('security_disable_title')}</strong>
                  <p>{t('security_disable_description')}</p>
                </div>
              </div>

              <PasswordInput
                value={disablePassword}
                onChange={(e) => {
                  setDisablePassword(sanitizePin(e.target.value))
                  if (disableError) {
                    setDisableError('')
                  }
                }}
                label={t('security_danger_confirm_label')}
                placeholder={t('security_danger_confirm_message')}
                error={disableError}
                disabled={isDisabling || isLoading}
                name="disable-password"
                id="disable-password-confirm"
                maxLength={PIN_LENGTH}
                inputMode="numeric"
                pattern="\\d*"
                autoComplete="off"
              />

              <div className="security-actions security-actions--end">
                <button
                  type="button"
                  className="security-button security-button--secondary"
                  disabled={isDisabling || isLoading}
                  onClick={resetDisableState}
                >
                  {t('button_cancel')}
                </button>
                <button
                  type="submit"
                  className="security-button security-button--danger"
                  disabled={isDisabling || isLoading || !disablePassword}
                >
                  {isDisabling ? t('security_action_disabling') : t('security_action_disable')}
                </button>
              </div>
            </form>
          ) : (
            <div className="security-banner security-banner--warning">
              <span className="security-banner__icon" aria-hidden="true">⚠️</span>
              <div className="security-banner__content">
                <strong>{t('security_disable_title')}</strong>
                <p>{t('security_disable_description')}</p>
              </div>
              <button
                type="button"
                className="security-button security-button--danger"
                onClick={() => setShowDisableSection(true)}
                disabled={isLoading}
              >
                {t('security_action_disable')}
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="security-card">
        <AutoLockConfig onLockNow={handleLockNow} />
      </section>

      <section className="security-card security-card--danger">
        <div className="security-card__header">
          <div className="security-card__summary">
            <h3 className="security-card__title">{t('security_danger_zone')}</h3>
            <p className="security-card__subtitle">{t('security_danger_warning_title')}</p>
          </div>
        </div>

        <div className="security-card__section security-danger__body">
          <p className="security-danger__intro">{t('security_danger_warning_message')}</p>
          <ul className="security-danger__list">
            <li>{t('security_danger_delete_codes')}</li>
            <li>{t('security_danger_delete_settings')}</li>
            <li>{t('security_danger_disconnect_accounts')}</li>
          </ul>
          <p className="security-danger__disclaimer">{t('security_danger_irreversible')}</p>
        </div>

        <div className="security-card__section">
          {showResetConfirm ? (
            <form className="security-form" onSubmit={handleResetSubmit}>
              <PasswordInput
                value={resetPassword}
                onChange={(event) => {
                  setResetPassword(sanitizePin(event.target.value))
                  if (resetError) {
                    setResetError('')
                  }
                }}
                label={t('security_danger_confirm_label')}
                placeholder={t('security_danger_confirm_message')}
                error={resetError}
                disabled={isResetting || isLoading}
                name="reset-password"
                id="reset-password-confirm"
                maxLength={PIN_LENGTH}
                inputMode="numeric"
                pattern="\\d*"
                autoComplete="off"
              />

              <div className="security-actions security-actions--end">
                <button
                  type="button"
                  className="security-button security-button--secondary"
                  onClick={handleResetCancel}
                  disabled={isResetting || isLoading}
                >
                  {t('button_cancel')}
                </button>
                <button
                  type="submit"
                  className="security-button security-button--danger"
                  disabled={isResetting || isLoading || !resetPassword}
                >
                  {isResetting ? t('security_action_resetting') : t('security_danger_confirm_button')}
                </button>
              </div>
            </form>
          ) : (
            <div className="security-actions">
              <button
                type="button"
                className="security-button security-button--danger"
                onClick={handleResetConfirmClick}
                disabled={isLoading}
              >
                {t('security_danger_button')}
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
