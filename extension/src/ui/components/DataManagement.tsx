import React, { useState } from 'react'
import { useToast } from '@/ui/contexts/ToastContext'
import { LoadingSpinner } from './icons/LoadingSpinner'
import { t } from '@/lib/i18n'

export function DataManagement() {
  const { showToast } = useToast()
  const [isClearing, setIsClearing] = useState(false)

  const handleClearAllCodes = async () => {
    if (!confirm(t('clear_codes_confirm'))) {
      return
    }

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

  return (
    <div className="data-management-card">
      <div className="data-management-card__header">
        <h3>{t('data_management_heading')}</h3>
        <p className="data-management-card__description">
          {t('data_management_description')}
        </p>
      </div>

      <button
        onClick={handleClearAllCodes}
        disabled={isClearing}
        className="btn btn-danger data-management-card__clear-button"
        aria-busy={isClearing}
      >
        {isClearing ? (
          <>
            <LoadingSpinner size="small" />
            Clearing...
          </>
        ) : (
          t('button_clear_all_codes')
        )}
      </button>
    </div>
  )
}
