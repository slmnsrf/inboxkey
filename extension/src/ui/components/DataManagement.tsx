import React, { useState } from 'react'
import { useToast } from '@/ui/contexts/ToastContext'
import { LoadingSpinner } from './icons/LoadingSpinner'
import { t } from '@/lib/i18n'
import { RotateCcw } from 'lucide-react'

type ConfirmingAction = 'codes' | 'cache' | 'reset' | null

export function DataManagement() {
  const { showToast } = useToast()
  const [isClearing, setIsClearing] = useState(false)
  const [isClearingCache, setIsClearingCache] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [confirmingAction, setConfirmingAction] = useState<ConfirmingAction>(null)

  const handleClearAllCodes = async () => {
    setConfirmingAction(null)
    setIsClearing(true)
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CLEAR_ALL_CODES'
      })

      if (response.success) {
        showToast(t('toast_codes_cleared'), 'success')
      } else {
        showToast(t('toast_clear_codes_failed'), 'error')
      }
    } catch (error) {
      console.error('[DataManagement] Failed to clear codes:', error)
      showToast(t('toast_clear_codes_failed'), 'error')
    } finally {
      setIsClearing(false)
    }
  }

  const handleClearCache = async () => {
    setConfirmingAction(null)
    setIsClearingCache(true)
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CLEAR_CACHE'
      })

      if (response?.success) {
        showToast(t('toast_cache_cleared'), 'success')
      } else {
        showToast(t('toast_clear_cache_failed'), 'error')
      }
    } catch (error) {
      console.error('[DataManagement] Failed to clear cache:', error)
      showToast(t('toast_clear_cache_failed'), 'error')
    } finally {
      setIsClearingCache(false)
    }
  }

  const handleResetDefaults = async () => {
    setConfirmingAction(null)
    setIsResetting(true)
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'RESET_SETTINGS'
      })

      if (response?.success) {
        showToast(t('toast_settings_reset'), 'success')
      } else {
        showToast(t('toast_settings_reset_failed'), 'error')
      }
    } catch (error) {
      console.error('[DataManagement] Failed to reset settings:', error)
      showToast(t('toast_settings_reset_failed'), 'error')
    } finally {
      setIsResetting(false)
    }
  }

  return (
    <div className="data-management-card">
      <div className="data-management-card__actions">
        {/* Clear Codes */}
        <div className="data-action-card">
          <div className="data-action-card__title">
            {t('button_clear_all_codes')}
          </div>
          <p className="data-action-card__desc">
            {t('data_clear_codes_description')}
          </p>

          {confirmingAction === 'codes' ? (
            <div
              className="data-action-confirm"
              role="alertdialog"
              aria-label={t('data_clear_codes_confirm_label')}
            >
              <span className="data-action-confirm__message">
                {t('data_clear_codes_confirm_message')}
              </span>
              <div className="data-action-confirm__actions">
                <button
                  onClick={handleClearAllCodes}
                  disabled={isClearing}
                  className="btn btn-danger btn-sm"
                  aria-busy={isClearing}
                >
                  {isClearing ? (
                    <>
                      <LoadingSpinner size="small" />
                      {t('data_clearing')}
                    </>
                  ) : (
                    t('data_clear_codes_yes')
                  )}
                </button>
                <button
                  onClick={() => setConfirmingAction(null)}
                  className="btn btn-ghost btn-sm"
                  disabled={isClearing}
                >
                  {t('data_cancel')}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingAction('codes')}
              disabled={isClearing}
              className="btn btn-danger btn-sm"
              aria-busy={isClearing}
            >
              {isClearing ? (
                <>
                  <LoadingSpinner size="small" />
                  {t('data_clearing')}
                </>
              ) : (
                t('button_clear_all_codes')
              )}
            </button>
          )}
        </div>

        {/* Clear Cache */}
        <div className="data-action-card">
          <div className="data-action-card__title">
            {t('button_clear_cache')}
          </div>
          <p className="data-action-card__desc">
            {t('data_clear_cache_description')}
          </p>

          {confirmingAction === 'cache' ? (
            <div
              className="data-action-confirm"
              role="alertdialog"
              aria-label={t('data_clear_cache_confirm_label')}
            >
              <span className="data-action-confirm__message">
                {t('data_clear_cache_confirm_message')}
              </span>
              <div className="data-action-confirm__actions">
                <button
                  onClick={handleClearCache}
                  disabled={isClearingCache}
                  className="btn btn-danger btn-sm"
                  aria-busy={isClearingCache}
                >
                  {isClearingCache ? (
                    <>
                      <LoadingSpinner size="small" />
                      {t('data_clearing')}
                    </>
                  ) : (
                    t('data_clear_cache_yes')
                  )}
                </button>
                <button
                  onClick={() => setConfirmingAction(null)}
                  className="btn btn-ghost btn-sm"
                  disabled={isClearingCache}
                >
                  {t('data_cancel')}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingAction('cache')}
              disabled={isClearingCache}
              className="btn btn-secondary btn-sm"
              aria-busy={isClearingCache}
            >
              {isClearingCache ? (
                <>
                  <LoadingSpinner size="small" />
                  {t('data_clearing')}
                </>
              ) : (
                t('button_clear_cache')
              )}
            </button>
          )}
        </div>

        {/* Reset to Defaults */}
        <div className="data-action-card">
          <div className="data-action-card__title">
            {t('data_reset_defaults_title')}
          </div>
          <p className="data-action-card__desc">
            {t('data_reset_defaults_description')}
          </p>

          {confirmingAction === 'reset' ? (
            <div
              className="data-action-confirm"
              role="alertdialog"
              aria-label={t('data_reset_defaults_confirm_label')}
            >
              <span className="data-action-confirm__message">
                {t('data_reset_defaults_confirm_message')}
              </span>
              <div className="data-action-confirm__actions">
                <button
                  onClick={handleResetDefaults}
                  disabled={isResetting}
                  className="btn btn-danger btn-sm"
                  aria-busy={isResetting}
                >
                  {isResetting ? (
                    <>
                      <LoadingSpinner size="small" />
                      {t('data_clearing')}
                    </>
                  ) : (
                    t('data_reset_defaults_yes')
                  )}
                </button>
                <button
                  onClick={() => setConfirmingAction(null)}
                  className="btn btn-ghost btn-sm"
                  disabled={isResetting}
                >
                  {t('data_cancel')}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingAction('reset')}
              disabled={isResetting}
              className="btn btn-secondary btn-sm"
              aria-busy={isResetting}
            >
              <RotateCcw size={14} aria-hidden="true" />
              {t('data_reset_defaults_button')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
