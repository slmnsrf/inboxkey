/**
 * SessionChipSettings Component
 *
 * Controls visibility of in-page session status chips (floating notifications).
 */

import React, { useState, useEffect } from 'react'
import { StorageFactory } from '@/lib/storage/storage-factory'
import { useToast } from '@/ui/contexts/ToastContext'
import { t } from '@/lib/i18n'

export function SessionChipSettings() {
  const { showToast } = useToast()
  const [showSessionChips, setShowSessionChips] = useState<boolean>(true)
  const [loading, setLoading] = useState<boolean>(true)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      setLoading(true)
      const storage = await StorageFactory.create()
      const settings = await storage.getSettings()
      setShowSessionChips(settings.showSessionChips ?? true)
    } catch (error) {
      console.error('[SessionChipSettings] Failed to load settings:', error)
      showToast(t('error_generic'), 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleToggle = async () => {
    try {
      const newValue = !showSessionChips
      setShowSessionChips(newValue) // Optimistic update

      const storage = await StorageFactory.create()
      await storage.updateSettings({ showSessionChips: newValue })

      // Update ARIA live region for screen readers
      const statusEl = document.getElementById('session-chip-status')
      if (statusEl) {
        statusEl.textContent = `Session status chips ${newValue ? 'enabled' : 'disabled'}`
      }

      showToast(t('toast_settings_saved'), 'success')
    } catch (error) {
      console.error('[SessionChipSettings] Failed to save setting:', error)
      // Revert on error
      setShowSessionChips(!showSessionChips)

      // Announce error to screen readers
      const statusEl = document.getElementById('session-chip-status')
      if (statusEl) {
        statusEl.textContent = 'Failed to save session chip setting'
      }

      showToast(t('error_generic'), 'error')
    }
  }

  return (
    <div className="session-chip-settings-card">
      <div className="session-chip-settings-card__header">
        <h3 id="session-chips-heading">{t('settings_session_chips_heading')}</h3>
        <p className="session-chip-settings-card__description">
          {t('settings_session_chips_description')}
        </p>
      </div>

      <div className="settings-card__content">
        <div className="setting-row" aria-labelledby="session-chips-heading">
          <div className="setting-row__info">
            <label htmlFor="show-session-chips" className="setting-row__label">
              {t('settings_session_chips_toggle_label')}
            </label>
            <p className="setting-row__description">
              {t('settings_session_chips_toggle_description')}
            </p>
          </div>
          <div className="setting-row__control">
            <label className="toggle">
              <input
                id="show-session-chips"
                type="checkbox"
                checked={showSessionChips}
                onChange={handleToggle}
                disabled={loading}
                aria-describedby="session-chip-help"
              />
              <span className="slider" />
            </label>
          </div>
        </div>

        <p id="session-chip-help" className="session-chip-settings-card__hint">
          {t('settings_session_chips_hint')}
        </p>

        <span id="session-chip-status" className="sr-only" role="status" aria-live="polite" aria-atomic="true"></span>
      </div>
    </div>
  )
}
