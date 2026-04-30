import React, { useState, useEffect, useRef, useCallback } from 'react'
import { StorageFactory } from '@/lib/storage/storage-factory'
import { useToast } from '@/ui/contexts/ToastContext'
import { t } from '@/lib/i18n'
import type { AutomationLevel } from '@/lib/storage/schema'
import { Lock, ClipboardCopy, TextCursorInput, Bot } from 'lucide-react'
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

/** Auto-dismiss duration for the Full Automation info banner (ms). */
const INFO_BANNER_DURATION = 7_000
/** Fade begins this many ms before full dismissal. */
const INFO_FADE_LEAD = 500

export function AutomationSettings() {
  const [level, setLevel] = useState<AutomationLevel>('autofill')
  const [isLoading, setIsLoading] = useState(true)
  const [infoBannerVisible, setInfoBannerVisible] = useState(false)
  const [infoBannerFading, setInfoBannerFading] = useState(false)
  const { showToast } = useToast()

  // Session timeout (inline parameter row)
  const [sessionTimeoutSeconds, setSessionTimeoutSeconds] = useState<number>(60)
  const [displayTimeout, setDisplayTimeout] = useState<number>(60)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const infoBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (infoBannerTimerRef.current) clearTimeout(infoBannerTimerRef.current)
    }
  }, [])

  // Load all settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const storage = await StorageFactory.create()
        const settings = await storage.getSettings()

        // Automation level
        const savedLevel = settings.automationLevel || 'autofill'
        setLevel(savedLevel)

        // Session timeout
        const timeout = settings.sessionTimeoutSeconds ?? 60
        setSessionTimeoutSeconds(timeout)
        setDisplayTimeout(timeout)

        // Show info banner if full-automation is already active on load
        if (savedLevel === 'full-automation') {
          showInfoBanner()
        }
      } catch (error) {
        console.warn('[AutomationSettings] Failed to load settings:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadSettings()
  }, [])

  // Info banner: show with 7-second auto-dismiss + fade at 6.5s
  const showInfoBanner = useCallback(() => {
    if (infoBannerTimerRef.current) clearTimeout(infoBannerTimerRef.current)
    setInfoBannerFading(false)
    setInfoBannerVisible(true)

    infoBannerTimerRef.current = setTimeout(() => {
      setInfoBannerFading(true)
      infoBannerTimerRef.current = setTimeout(() => {
        setInfoBannerVisible(false)
        setInfoBannerFading(false)
        infoBannerTimerRef.current = null
      }, INFO_FADE_LEAD)
    }, INFO_BANNER_DURATION - INFO_FADE_LEAD)
  }, [])

  const hideInfoBanner = useCallback(() => {
    if (infoBannerTimerRef.current) {
      clearTimeout(infoBannerTimerRef.current)
      infoBannerTimerRef.current = null
    }
    setInfoBannerVisible(false)
    setInfoBannerFading(false)
  }, [])

  // Save automation level
  const handleLevelChange = async (newLevel: AutomationLevel) => {
    setLevel(newLevel)

    if (newLevel === 'full-automation') {
      showInfoBanner()
    } else {
      hideInfoBanner()
    }

    try {
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

  // Session timeout: debounced save
  const saveTimeout = useCallback(async (value: number) => {
    try {
      const storage = await StorageFactory.create()
      await storage.updateSettings({ sessionTimeoutSeconds: value })
      setSessionTimeoutSeconds(value)

      const statusEl = document.getElementById('session-chip-status')
      if (statusEl) {
        statusEl.textContent = t('aria_check_duration_set', [String(value)])
      }

      showToast(t('toast_settings_saved'), 'success')
    } catch (error) {
      console.warn('[AutomationSettings] Failed to save timeout:', error)
      setDisplayTimeout(sessionTimeoutSeconds) // revert on error

      const statusEl = document.getElementById('session-chip-status')
      if (statusEl) {
        statusEl.textContent = t('aria_save_timeout_failed')
      }

      showToast(t('error_generic'), 'error')
    }
  }, [showToast, sessionTimeoutSeconds])

  const handleTimeoutChange = (value: number) => {
    setDisplayTimeout(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      saveTimeout(value)
    }, 500)
  }

  if (isLoading) {
    return (
      <section className="auto-hero" aria-labelledby="auto-hero-heading">
        <p>{t('status_loading')}</p>
      </section>
    )
  }

  return (
    <section className="auto-hero" aria-labelledby="auto-hero-heading">
      {/* Hero header */}
      <div className="auto-hero__head">
        <span className="auto-hero__eyebrow">{t('automation_heading')}</span>
        <h2 id="auto-hero-heading" className="auto-hero__headline">
          {t('settings_auto_hero_headline')}
        </h2>
        <p className="auto-hero__sub">{t('settings_auto_hero_sub')}</p>
      </div>

      {/* Automation level radio group */}
      <div
        className="auto-options"
        role="radiogroup"
        aria-label={t('automation_heading')}
      >
        {AUTOMATION_LEVELS.map((option) => {
          const isActive = level === option.value
          return (
            <label
              key={option.value}
              className={`auto-option${isActive ? ' auto-option--active' : ''}`}
            >
              <input
                type="radio"
                name="automation-level"
                value={option.value}
                checked={isActive}
                onChange={() => handleLevelChange(option.value)}
              />
              <div className="auto-option__top">
                <span className="auto-option__icon">
                  {option.icon}
                </span>
                <span className="auto-option__dots" aria-label={`Level ${option.dots} of 4`}>
                  {Array.from({ length: 4 }, (_, i) => (
                    <span
                      key={i}
                      className={i < option.dots ? 'on' : undefined}
                    />
                  ))}
                </span>
              </div>
              <h3 className="auto-option__title">
                {t(option.titleKey)}
              </h3>
              <p className="auto-option__detail">
                {t(option.descriptionKey)}
              </p>
            </label>
          )
        })}
      </div>

      {/* Inline parameter row: session timeout slider */}
      <div className="auto-param">
        <div className="auto-param__info">
          <p className="auto-param__label">
            {t('settings_session_timeout_label')}
          </p>
          <p className="auto-param__detail">
            {t('settings_session_chips_description_v2')}
          </p>
        </div>
        <div className="auto-param__control">
          <input
            id="session-timeout"
            type="range"
            className="auto-param__slider"
            min="30"
            max="120"
            step="10"
            value={displayTimeout}
            onChange={(e) => handleTimeoutChange(Number(e.target.value))}
            disabled={isLoading}
            aria-label={t('settings_session_timeout_label')}
          />
          <output htmlFor="session-timeout" className="auto-param__value">
            {displayTimeout}s
          </output>
        </div>
      </div>

      {/* ARIA live region for slider save feedback */}
      <span id="session-chip-status" className="sr-only" role="status" aria-live="polite" aria-atomic="true" />

      {/* Info banner: shown when Full Automation is selected, auto-dismisses after 7s */}
      {infoBannerVisible && (
        <div
          className={`auto-info${infoBannerFading ? ' auto-info--fading' : ''}`}
          role="status"
          aria-live="polite"
        >
          <span className="auto-info__icon">
            <InfoIcon size={16} />
          </span>
          <p className="auto-info__text">{t('settings_auto_info')}</p>
        </div>
      )}
    </section>
  )
}
