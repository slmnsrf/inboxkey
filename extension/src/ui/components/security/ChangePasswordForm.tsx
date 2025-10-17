import React, { useState } from 'react'
import { useLockContext } from '@/ui/contexts/LockContext'
import { usePasswordValidation } from '@/ui/hooks/usePasswordValidation'
import { PasswordInput } from './PasswordInput'
import { t } from '@/lib/i18n'
import { PIN_LENGTH } from '@/lib/crypto/key-manager'

export interface ChangePasswordFormProps {
  onSuccess: () => void
  onCancel: () => void
}

export function ChangePasswordForm({ onSuccess, onCancel }: ChangePasswordFormProps): JSX.Element {
  const { changePassword, isLoading } = useLockContext()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)

  const { isValid } = usePasswordValidation(newPassword)
  const passwordsMatch = newPassword === confirmPassword && confirmPassword !== ''
  const passwordsDontMatch = confirmPassword !== '' && !passwordsMatch
  const isFormValid =
    currentPassword.length > 0 && isValid && passwordsMatch && newPassword.length > 0

  const resetForm = () => {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setError('')
  }

  const sanitizePin = (value: string) => value.replace(/\D/g, '').slice(0, PIN_LENGTH)

  const handleCurrentPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentPassword(sanitizePin(e.target.value))
    if (error) {
      setError('')
    }
  }

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

    if (!currentPassword) {
      setError(t('security_pin_error_missing_current'))
      return
    }

    if (!isValid) {
      setError(t('security_pin_error_invalid'))
      return
    }

    if (!passwordsMatch) {
      setError(t('security_pin_error_mismatch'))
      return
    }

    if (currentPassword === newPassword) {
      setError(t('security_pin_error_same'))
      return
    }

    setIsSubmitting(true)
    setError('')

    try {
      await changePassword(currentPassword, newPassword)
      setShowSuccess(true)
      resetForm()
      setTimeout(() => {
        onSuccess()
      }, 1200)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to change password'
      setError(message)
      resetForm()
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancelClick = () => {
    resetForm()
    onCancel()
  }

  const isDisabled = isLoading || isSubmitting

  if (showSuccess) {
    return (
      <div className="security-feedback security-feedback--success">
        <span className="security-feedback__icon" aria-hidden="true">✓</span>
        <p className="security-feedback__message">{t('security_change_success')}</p>
      </div>
    )
  }

  return (
    <div className="security-flow security-flow--nested">
      <div className="security-flow__header">
        <h3 className="security-flow__title">{t('security_action_change_password')}</h3>
      </div>

      <form className="security-form security-form--stack" onSubmit={handleSubmit}>
        <PasswordInput
          value={currentPassword}
          onChange={handleCurrentPasswordChange}
          label={t('security_pin_label_current')}
          placeholder={t('security_pin_placeholder')}
          autoFocus
          disabled={isDisabled}
          name="current-password"
          id="change-password-current"
          maxLength={PIN_LENGTH}
          inputMode="numeric"
          pattern="\\d*"
          autoComplete="off"
        />

        <PasswordInput
          value={newPassword}
          onChange={handleNewPasswordChange}
          label={t('security_pin_label_new')}
          placeholder={t('security_pin_placeholder')}
          disabled={isDisabled}
          name="new-password"
          id="change-password-new"
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
          name="confirm-new-password"
          id="change-password-confirm"
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
          <button
            type="button"
            onClick={handleCancelClick}
            disabled={isDisabled}
            className="security-button security-button--secondary"
          >
            {t('button_cancel')}
          </button>

          <button
            type="submit"
            disabled={isDisabled || !isFormValid}
            className="security-button security-button--primary"
          >
            {isSubmitting ? (
              <>
                <span className="security-button__spinner" aria-hidden="true" />
                {t('security_change_submitting')}
              </>
            ) : (
              t('security_change_submit')
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
