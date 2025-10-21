/**
 * AdvancedSettings Component
 *
 * Displays advanced settings including domain preferences.
 */

import React, { useState, useEffect } from 'react'
import { StorageFactory } from '@/lib/storage/storage-factory'
import { useToast } from '@/ui/contexts/ToastContext'
import { t } from '@/lib/i18n'

export function AdvancedSettings() {
  const { showToast } = useToast()
  const [domainsEnabledByDefault, setDomainsEnabledByDefault] = useState<boolean>(true)
  const [loading, setLoading] = useState<boolean>(true)
  const [isExpanded, setIsExpanded] = useState<boolean>(false)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      setLoading(true)
      const storage = await StorageFactory.create()
      const settings = await storage.getSettings()
      setDomainsEnabledByDefault(settings.domainsEnabledByDefault ?? true)
    } catch (error) {
      console.error('[AdvancedSettings] Failed to load settings:', error)
      showToast('Failed to load settings', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleToggle = async () => {
    try {
      const newValue = !domainsEnabledByDefault
      setDomainsEnabledByDefault(newValue) // Optimistic update

      const storage = await StorageFactory.create()
      await storage.updateSettings({ domainsEnabledByDefault: newValue })

      showToast(t('toast_settings_saved'), 'success')
    } catch (error) {
      console.error('[AdvancedSettings] Failed to save setting:', error)
      // Revert on error
      setDomainsEnabledByDefault(!domainsEnabledByDefault)
      showToast('Failed to save setting', 'error')
    }
  }

  return (
    <div className="advanced-settings-card">
      <div className="advanced-settings-card__header">
        <button
          className="advanced-settings-card__toggle"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-expanded={isExpanded}
          aria-controls="advanced-settings-content"
        >
          <span className="advanced-settings-card__toggle-icon" aria-hidden="true">
            {isExpanded ? '▼' : '▶'}
          </span>
          <h3 id="advanced-heading">{t('settings_advanced_section')}</h3>
        </button>
      </div>

      {isExpanded && (
        <div id="advanced-settings-content" className="advanced-settings-card__content">
          <div className="setting-row">
            <div className="setting-row__info">
              <label htmlFor="domains-enabled-by-default" className="setting-row__label">
                {t('settings_advanced_default_enabled')}
              </label>
              <p className="setting-row__description">
                {t('settings_advanced_default_enabled_desc')}
              </p>
            </div>
            <div className="setting-row__control">
              <label className="toggle">
                <input
                  id="domains-enabled-by-default"
                  type="checkbox"
                  checked={domainsEnabledByDefault}
                  onChange={handleToggle}
                  disabled={loading}
                  aria-describedby="domains-enabled-help"
                />
                <span className="slider" />
              </label>
            </div>
          </div>

          <p id="domains-enabled-help" className="advanced-settings-card__hint">
            When enabled, InboxKey will work on all domains by default. You can still disable it for specific domains using the toggle in the popup.
          </p>
        </div>
      )}
    </div>
  )
}
