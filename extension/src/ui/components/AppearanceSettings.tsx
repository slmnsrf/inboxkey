import React from 'react'
import { useTheme } from '@/ui/contexts/ThemeContext'
import { t } from '@/lib/i18n'

const THEME_OPTIONS = [
  { value: 'light', label: 'settings_theme_light' as const },
  { value: 'dark', label: 'settings_theme_dark' as const },
  { value: 'system', label: 'settings_theme_system' as const }
] as const

export function AppearanceSettings() {
  const { theme, resolvedTheme, setTheme } = useTheme()

  return (
    <div className="appearance-card">
      <div className="appearance-card__header">
        <h3 id="appearance-heading">{t('settings_appearance_heading')}</h3>
        <p className="appearance-card__description">{t('settings_appearance_description')}</p>
        <p className="appearance-card__status" role="status" aria-live="polite">
          {theme === 'system'
            ? t('settings_theme_system_status', t(`settings_theme_${resolvedTheme}`))
            : t('settings_theme_selected', t(`settings_theme_${theme}`))}
        </p>
      </div>

      <div
        className="theme-toggle"
        role="radiogroup"
        aria-labelledby="appearance-heading"
        aria-describedby="appearance-help"
      >
        {THEME_OPTIONS.map(option => {
          const isActive = theme === option.value
          return (
            <label
              key={option.value}
              className={`theme-toggle__option ${isActive ? 'theme-toggle__option--active' : ''}`}
            >
              <input
                type="radio"
                name="theme-toggle"
                value={option.value}
                checked={isActive}
                onChange={() => setTheme(option.value)}
              />
              <span>{t(option.label)}</span>
            </label>
          )
        })}
      </div>

      <p id="appearance-help" className="appearance-card__hint">
        {t('settings_appearance_hint')}
      </p>
    </div>
  )
}
