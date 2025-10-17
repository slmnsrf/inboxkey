/**
 * LockScreen Component
 *
 * Shared lock screen used in popup and settings pages.
 * Handles password input, unlock flow, error display, and rate limiting UI.
 */

import React, { useState, useEffect } from 'react'
import { useLockContext } from '@/ui/contexts/LockContext'
import { PasswordInput } from './PasswordInput'
import { t } from '@/lib/i18n'
import { PIN_LENGTH } from '@/lib/crypto/key-manager'

/**
 * Props for LockScreen component
 */
export interface LockScreenProps {
  /** Display mode: popup (compact) or settings (full-page) */
  mode: 'popup' | 'settings'
  /** Callback when successfully unlocked */
  onUnlock: () => void
  /** Show settings link in popup mode */
  showSettingsLink?: boolean
}

/**
 * LockScreen Component
 *
 * Displays unlock interface with password input, loading state,
 * error messages, and rate limiting countdown.
 *
 * @example
 * ```tsx
 * <LockScreen
 *   mode="popup"
 *   onUnlock={() => console.log('Unlocked!')}
 *   showSettingsLink
 * />
 * ```
 */
export function LockScreen({
  mode,
  onUnlock,
  showSettingsLink = false,
}: LockScreenProps): JSX.Element {
  const { unlock, isLoading } = useLockContext()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Clear password after failed attempt
  useEffect(() => {
    if (error) {
      setPassword('')
    }
  }, [error])

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value)
    // Clear error when user starts typing
    if (error) {
      setError('')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!password) {
      setError(t('security_pin_error_missing_current'))
      return
    }

    setIsSubmitting(true)
    setError('')

    try {
      const result = await unlock(password)

      if (result.success) {
        // Success - call onUnlock callback
        onUnlock()
      } else {
        // Failed - show error message
        setError(result.error || t('lock_screen_wrong_password'))
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred'
      setError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSettingsClick = () => {
    chrome.runtime.openOptionsPage()
  }

  const isDisabled = isLoading || isSubmitting

  return (
    <div className={`lock-screen lock-screen--${mode}`}>
      <div className="lock-screen__container">
        {/* Header */}
        <div className="lock-screen__header">
          <div className="lock-screen__icon">🔒</div>
          <h2 className="lock-screen__title">{t('lock_screen_title')}</h2>
          <p className="lock-screen__description">{t('lock_screen_prompt')}</p>
        </div>

        {/* Unlock form */}
        <form className="lock-screen__form" onSubmit={handleSubmit}>
          <PasswordInput
            value={password}
            onChange={handlePasswordChange}
            placeholder={t('security_pin_placeholder')}
            label={t('security_pin_label_current')}
            error={error}
            autoFocus
            disabled={isDisabled}
            maxLength={PIN_LENGTH}
            inputMode="numeric"
            pattern="\\d*"
            autoComplete="off"
          />

          {/* Submit button */}
          <button
            type="submit"
            disabled={isDisabled || !password}
            className="lock-screen__button"
          >
            {isSubmitting ? (
              <>
                <span className="lock-screen__spinner" />
                {t('lock_screen_unlock')}
              </>
            ) : (
              t('lock_screen_unlock')
            )}
          </button>
        </form>

        {/* Settings link (popup mode only) */}
        {mode === 'popup' && showSettingsLink && (
          <div className="lock-screen__footer">
            <button
              type="button"
              onClick={handleSettingsClick}
              className="lock-screen__settings-link"
              disabled={isDisabled}
            >
              {t('settings_tab_security')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
