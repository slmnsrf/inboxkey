import React, { useState, useEffect } from 'react'
import { useToast } from '@/ui/contexts/ToastContext'
import { t } from '@/lib/i18n'
import type { AutomationLevel } from '@/lib/storage/schema'
import { Lock, ClipboardCopy, TextCursorInput, Bot, X } from 'lucide-react'
import { InfoIcon } from '@/ui/components/icons/StatusIcons'

interface AutomationOption {
  value: AutomationLevel
  dots: number
  icon: React.ReactNode
  titleKey: string
  descriptionKey: string
}

const AUTOMATION_LEVELS: AutomationOption[] = [
  {
    value: 'manual',
    dots: 1,
    icon: <Lock size={16} />,
    titleKey: 'automation_manual_title',
    descriptionKey: 'automation_manual_description',
  },
  {
    value: 'clipboard',
    dots: 2,
    icon: <ClipboardCopy size={16} />,
    titleKey: 'automation_clipboard_title',
    descriptionKey: 'automation_clipboard_description',
  },
  {
    value: 'autofill',
    dots: 3,
    icon: <TextCursorInput size={16} />,
    titleKey: 'automation_autofill_title',
    descriptionKey: 'automation_autofill_description',
  },
  {
    value: 'full-automation',
    dots: 4,
    icon: <Bot size={16} />,
    titleKey: 'automation_full_title',
    descriptionKey: 'automation_full_description',
  },
]

export function AutomationSettings() {
  const [level, setLevel] = useState<AutomationLevel>('autofill')
  const [isLoading, setIsLoading] = useState(true)
  const [warningDismissed, setWarningDismissed] = useState(false)
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
        console.warn('[AutomationSettings] Failed to load settings:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadSettings()
  }, [])

  // Save to storage on change
  const handleChange = async (newLevel: AutomationLevel) => {
    setLevel(newLevel)
    if (newLevel === 'full-automation') {
      setWarningDismissed(false)
    }

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
      console.warn('[AutomationSettings] Failed to save settings:', error)
      showToast(t('toast_settings_failed'), 'error')
    }
  }

  if (isLoading) {
    return (
      <div className="automation-settings-card">
        <p>{t('status_loading')}</p>
      </div>
    )
  }

  return (
    <div className="automation-settings-card">
      <div
        className="automation-level-selector"
        role="radiogroup"
        aria-label={t('automation_heading')}
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
                  <span className="automation-level-card__dots" aria-label={`Level ${option.dots} of 4`}>
                    {Array.from({ length: 4 }, (_, i) => (
                      <span
                        key={i}
                        className={`automation-dot${i < option.dots ? ' automation-dot--filled' : ''}`}
                      />
                    ))}
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

      {level === 'full-automation' && !warningDismissed && (
        <div className="automation-warning" role="alert">
          <InfoIcon size={16} />
          <span>{t('automation_full_warning')}</span>
          <button
            type="button"
            className="automation-warning__dismiss"
            onClick={() => setWarningDismissed(true)}
            aria-label={t('aria_dismiss_alert')}
          >
            <X size={14} />
          </button>
        </div>
      )}

      <p id="automation-help" className="automation-settings-card__hint">
        {t('automation_hint')}
      </p>
    </div>
  )
}
