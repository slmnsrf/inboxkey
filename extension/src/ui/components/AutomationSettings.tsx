import React, { useState, useEffect } from 'react'
import { useToast } from '@/ui/contexts/ToastContext'
import { t } from '@/lib/i18n'
import type { AutomationLevel } from '@/lib/storage/schema'
import { LockIcon, InfoIcon, CheckIcon } from '@/ui/components/icons/StatusIcons'

interface AutomationOption {
  value: AutomationLevel
  icon: React.ReactNode
  titleKey: string
  descriptionKey: string
}

const AUTOMATION_LEVELS: AutomationOption[] = [
  {
    value: 'manual',
    icon: <LockIcon size={20} />,
    titleKey: 'automation_manual_title',
    descriptionKey: 'automation_manual_description',
  },
  {
    value: 'clipboard',
    icon: <InfoIcon size={20} />,
    titleKey: 'automation_clipboard_title',
    descriptionKey: 'automation_clipboard_description',
  },
  {
    value: 'autofill',
    icon: <CheckIcon size={20} />,
    titleKey: 'automation_autofill_title',
    descriptionKey: 'automation_autofill_description',
  },
  {
    value: 'full-automation',
    icon: <CheckIcon size={20} />,
    titleKey: 'automation_full_title',
    descriptionKey: 'automation_full_description',
  },
]

export function AutomationSettings() {
  const [level, setLevel] = useState<AutomationLevel>('autofill')
  const [isLoading, setIsLoading] = useState(true)
  const { showToast } = useToast()

  // Load from storage on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const result = await chrome.storage.local.get('settings')
        if (result.settings?.automationLevel) {
          setLevel(result.settings.automationLevel)
        }
      } catch (error) {
        console.error('[AutomationSettings] Failed to load settings:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadSettings()
  }, [])

  // Save to storage on change
  const handleChange = async (newLevel: AutomationLevel) => {
    setLevel(newLevel)

    try {
      // Send message to background to update settings
      const response = await chrome.runtime.sendMessage({
        type: 'SET_AUTOMATION_LEVEL',
        level: newLevel,
      })

      if (response?.success) {
        showToast(t('toast_settings_saved'), 'success')
      } else {
        showToast(t('toast_settings_failed'), 'error')
      }
    } catch (error) {
      console.error('[AutomationSettings] Failed to save settings:', error)
      showToast(t('toast_settings_failed'), 'error')
    }
  }

  if (isLoading) {
    return (
      <div className="automation-settings-card">
        <p>{t('accounts_loading_profile')}</p>
      </div>
    )
  }

  return (
    <div className="automation-settings-card">
      <div className="automation-settings-card__header">
        <h3 id="automation-heading">{t('automation_heading')}</h3>
        <p className="automation-settings-card__description">
          {t('automation_description')}
        </p>
      </div>

      <div
        className="automation-level-selector"
        role="radiogroup"
        aria-labelledby="automation-heading"
        aria-describedby="automation-help"
      >
        {AUTOMATION_LEVELS.map((option) => {
          const isActive = level === option.value
          return (
            <label
              key={option.value}
              className={`automation-level-card ${
                isActive ? 'automation-level-card--active' : ''
              }`}
            >
              <input
                type="radio"
                name="automation-level"
                value={option.value}
                checked={isActive}
                onChange={() => handleChange(option.value)}
              />
              <div className="automation-level-card__content">
                <div className="automation-level-card__header">
                  <span className="automation-level-card__icon">
                    {option.icon}
                  </span>
                  <span className="automation-level-card__title">
                    {t(option.titleKey)}
                  </span>
                </div>
                <p className="automation-level-card__description">
                  {t(option.descriptionKey)}
                </p>
              </div>
            </label>
          )
        })}
      </div>

      {level === 'full-automation' && (
        <div className="automation-warning">
          <InfoIcon size={16} />
          <span>{t('automation_full_warning')}</span>
        </div>
      )}

      <p id="automation-help" className="automation-settings-card__hint">
        {t('automation_hint')}
      </p>
    </div>
  )
}
