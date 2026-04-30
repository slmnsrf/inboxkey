import React from 'react'
import { useTheme } from '@/ui/contexts/ThemeContext'
import { t } from '@/lib/i18n'
import { Sun, Moon, Monitor } from 'lucide-react'

const THEME_OPTIONS = [
  {
    value: 'light' as const,
    label: 'settings_theme_light' as const,
    icon: Sun,
    previewClass: 'theme-card__preview--light',
    hasBar: true,
  },
  {
    value: 'dark' as const,
    label: 'settings_theme_dark' as const,
    icon: Moon,
    previewClass: 'theme-card__preview--dark',
    hasBar: true,
  },
  {
    value: 'system' as const,
    label: 'settings_theme_system' as const,
    icon: Monitor,
    previewClass: 'theme-card__preview--system',
    hasBar: false,
  },
]

export function AppearanceSettings() {
  const { theme, resolvedTheme, setTheme } = useTheme()

  return (
    <div className="appearance-settings">
      <div
        className="theme-grid"
        role="radiogroup"
        aria-label={t('settings_appearance_heading')}
      >
        {THEME_OPTIONS.map(option => {
          const isActive = theme === option.value
          const Icon = option.icon
          return (
            <label
              key={option.value}
              className={`theme-card ${isActive ? 'theme-card--active' : ''}`}
            >
              <input
                type="radio"
                name="theme-select"
                value={option.value}
                checked={isActive}
                onChange={() => setTheme(option.value)}
              />
              <div className={`theme-card__preview ${option.previewClass}`}>
                {option.hasBar && <span className="theme-card__preview-bar" />}
              </div>
              <span className="theme-card__label">
                <span className="theme-card__icon">
                  <Icon size={16} aria-hidden="true" />
                </span>
                <span className="theme-card__label-text">{t(option.label)}</span>
              </span>
            </label>
          )
        })}
      </div>

      <p className="settings-hint" role="status" aria-live="polite">
        {theme === 'system'
          ? t('settings_theme_system_status', t(`settings_theme_${resolvedTheme}`))
          : t('settings_theme_selected', t(`settings_theme_${theme}`))}
      </p>
    </div>
  )
}
