import React from 'react'
import { useTheme } from '@/ui/contexts/ThemeContext'
import { t } from '@/lib/i18n'
import { Sun, Moon, Monitor, Check } from 'lucide-react'

const THEME_OPTIONS = [
  {
    value: 'light' as const,
    label: 'settings_theme_light' as const,
    icon: Sun,
    previewClass: 'theme-card__preview--light',
  },
  {
    value: 'dark' as const,
    label: 'settings_theme_dark' as const,
    icon: Moon,
    previewClass: 'theme-card__preview--dark',
  },
  {
    value: 'system' as const,
    label: 'settings_theme_system' as const,
    icon: Monitor,
    previewClass: 'theme-card__preview--system',
  },
]

function ThemePreview({ variant }: { variant: string }) {
  // System preview uses neutral bar colors via inline styles
  if (variant === 'theme-card__preview--system') {
    return (
      <div className={`theme-card__preview ${variant}`}>
        <div className="preview-ui">
          <div className="preview-ui__bar preview-ui__bar--header" style={{ background: '#007AFF' }} />
          <div className="preview-ui__bar preview-ui__bar--line" style={{ background: 'rgba(150,150,150,0.4)' }} />
          <div className="preview-ui__bar preview-ui__bar--short" style={{ background: 'rgba(150,150,150,0.3)' }} />
          <div className="preview-ui__bar preview-ui__bar--line" style={{ background: 'rgba(150,150,150,0.4)' }} />
        </div>
      </div>
    )
  }

  return (
    <div className={`theme-card__preview ${variant}`}>
      <div className="preview-ui">
        <div className="preview-ui__bar preview-ui__bar--header" />
        <div className="preview-ui__bar preview-ui__bar--line" />
        <div className="preview-ui__bar preview-ui__bar--short" />
        <div className="preview-ui__bar preview-ui__bar--line" />
      </div>
    </div>
  )
}

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
              <ThemePreview variant={option.previewClass} />
              <span className="theme-card__label">
                <Icon size={14} aria-hidden="true" />
                {t(option.label)}
                <span className="theme-card__check" aria-hidden="true">
                  <Check size={14} />
                </span>
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
