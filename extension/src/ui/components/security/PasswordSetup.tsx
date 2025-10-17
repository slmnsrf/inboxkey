import React, { useState } from 'react'
import { useLockContext } from '@/ui/contexts/LockContext'
import { usePasswordValidation } from '@/ui/hooks/usePasswordValidation'
import { PasswordInput } from './PasswordInput'
import { t } from '@/lib/i18n'
import { PIN_LENGTH } from '@/lib/crypto/key-manager'

export interface PasswordSetupProps {
  onSuccess: () => void
  onCancel?: () => void
}

export function PasswordSetup({ onSuccess, onCancel }: PasswordSetupProps): JSX.Element {
  const { initialize, isLoading } = useLockContext()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)

  const { isValid } = usePasswordValidation(newPassword)
  const passwordsMatch = newPassword === confirmPassword && confirmPassword !== ''
  const passwordsDontMatch = confirmPassword !== '' && !passwordsMatch
  const isFormValid = isValid && passwordsMatch && newPassword.length > 0

  const sanitizePin = (value: string) => value.replace(/\D/g, '').slice(0, PIN_LENGTH)

  const handleNewPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewPassword(sanitizePin(e.target.value))
    if (error) {
      setError('')
    }
  }

  const handleConfirmPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfirmPassword(sanitizePin(e.target.value))
    if (error) {
      setError('')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!isValid) {
      setError(t('security_pin_error_invalid'))
      return
    }

    if (!passwordsMatch) {
      setError(t('security_pin_error_mismatch'))
      return
    }

    setIsSubmitting(true)
    setError('')

    try {
      await initialize(newPassword)
      setShowSuccess(true)
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => {
        onSuccess()
      }, 1000)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to set up password protection'
      setError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancel = () => {
    setNewPassword('')
    setConfirmPassword('')
    setError('')
    onCancel?.()
  }

  const isDisabled = isLoading || isSubmitting

  if (showSuccess) {
    return (
      <div className="security-feedback security-feedback--success">
        <span className="security-feedback__icon" aria-hidden="true">✓</span>
        <p className="security-feedback__message">{t('security_setup_success')}</p>
      </div>
    )
  }

  return (
    <div className="security-flow">
      <div className="security-flow__header">
        <h3 className="security-flow__title">{t('security_setup_title')}</h3>
        <p className="security-flow__subtitle">{t('security_setup_description')}</p>
      </div>

      <form className="security-form security-form--stack" onSubmit={handleSubmit}>
        <div className="security-stack">
          <div className="security-banner security-banner--critical">
            <span className="security-banner__icon" aria-hidden="true">⚠️</span>
            <div className="security-banner__content">
              <strong>{t('security_no_recovery_title')}</strong>
              <p>{t('security_no_recovery_message')}</p>
            </div>
          </div>

          <div className="security-banner security-banner--info">
            <span className="security-banner__icon" aria-hidden="true">ℹ️</span>
            <div className="security-banner__content">
              <strong>{t('security_password_tips')}</strong>
              <ul className="security-list">
                <li>{t('security_tip_memorable')}</li>
                <li>{t('security_tip_unique')}</li>
                <li>{t('security_tip_strength')}</li>
              </ul>
            </div>
          </div>
        </div>

        <PasswordInput
          value={newPassword}
          onChange={handleNewPasswordChange}
          label={t('security_pin_label_new')}
          placeholder={t('security_pin_placeholder')}
          autoFocus
          disabled={isDisabled}
          name="new-password"
          id="password-setup-new"
          maxLength={PIN_LENGTH}
          inputMode="numeric"
          pattern="\\d*"
          autoComplete="off"
        />

        <PasswordInput
          value={confirmPassword}
          onChange={handleConfirmPasswordChange}
          label={t('security_pin_label_confirm')}
          placeholder={t('security_pin_placeholder_confirm')}
          disabled={isDisabled}
          error={passwordsDontMatch ? t('security_pin_error_mismatch') : undefined}
          name="confirm-password"
          id="password-setup-confirm"
          maxLength={PIN_LENGTH}
          inputMode="numeric"
          pattern="\\d*"
          autoComplete="off"
        />

        {passwordsMatch && (
          <div className="security-inline-success">
            <span aria-hidden="true">✓</span>
            <span>{t('security_pins_match')}</span>
          </div>
        )}

        {error && (
          <div className="security-error" role="alert">
            {error}
          </div>
        )}

        <div className="security-actions security-actions--end">
          {onCancel && (
            <button
              type="button"
              onClick={handleCancel}
              disabled={isDisabled}
              className="security-button security-button--secondary"
            >
              {t('button_cancel')}
            </button>
          )}

          <button
            type="submit"
            disabled={isDisabled || !isFormValid}
            className="security-button security-button--primary"
          >
            {isSubmitting ? (
              <>
                <span className="security-button__spinner" aria-hidden="true" />
                {t('security_setup_submitting')}
              </>
            ) : (
              t('security_setup_submit')
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
