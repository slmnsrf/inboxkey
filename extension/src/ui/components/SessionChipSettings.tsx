/**
 * SessionChipSettings Component
 *
 * Controls visibility of in-page session status chips (floating notifications).
 */

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { StorageFactory } from '@/lib/storage/storage-factory'
import { useToast } from '@/ui/contexts/ToastContext'
import { t } from '@/lib/i18n'
import type { AutomationLevel } from '@/lib/storage/schema'

export function SessionChipSettings() {
  const { showToast } = useToast()
  const [showSessionChips, setShowSessionChips] = useState<boolean>(true)
  const [sessionTimeoutSeconds, setSessionTimeoutSeconds] = useState<number>(20)
  const [displayTimeout, setDisplayTimeout] = useState<number>(20)
  const [automationLevel, setAutomationLevel] = useState<AutomationLevel>('autofill')
  const [loading, setLoading] = useState<boolean>(true)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      setLoading(true)
      const storage = await StorageFactory.create()
      const settings = await storage.getSettings()
      setShowSessionChips(settings.showSessionChips ?? true)
      setAutomationLevel(settings.automationLevel || 'autofill')
      const timeout = settings.sessionTimeoutSeconds ?? 20
      setSessionTimeoutSeconds(timeout)
      setDisplayTimeout(timeout)
    } catch (error) {
      console.warn('[SessionChipSettings] Failed to load settings:', error)
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
        statusEl.textContent = newValue
          ? t('aria_session_chip_enabled')
          : t('aria_session_chip_disabled')
      }

      showToast(t('toast_settings_saved'), 'success')
    } catch (error) {
      console.warn('[SessionChipSettings] Failed to save setting:', error)
      // Revert on error
      setShowSessionChips(!showSessionChips)

      // Announce error to screen readers
      const statusEl = document.getElementById('session-chip-status')
      if (statusEl) {
        statusEl.textContent = t('aria_save_indicator_failed')
      }

      showToast(t('error_generic'), 'error')
    }
  }

  const saveTimeout = useCallback(async (value: number) => {
    try {
      const storage = await StorageFactory.create()
      await storage.updateSettings({ sessionTimeoutSeconds: value })
      setSessionTimeoutSeconds(value)

      // Update ARIA live region for screen readers
      const statusEl = document.getElementById('session-chip-status')
      if (statusEl) {
        statusEl.textContent = t('aria_check_duration_set', [String(value)])
      }

      showToast(t('toast_settings_saved'), 'success')
    } catch (error) {
      console.warn('[SessionChipSettings] Failed to save timeout:', error)
      // Revert on error
      await loadSettings()

      // Announce error to screen readers
      const statusEl = document.getElementById('session-chip-status')
      if (statusEl) {
        statusEl.textContent = t('aria_save_timeout_failed')
      }

      showToast(t('error_generic'), 'error')
    }
  }, [showToast])

  const handleTimeoutChange = (value: number) => {
    // Update display immediately for responsive UI
    setDisplayTimeout(value)

    // Debounce the actual storage write
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      saveTimeout(value)
    }, 500)
  }

  const isManual = automationLevel === 'manual'

  return (
    <div className="session-chip-settings-card">
      <div className="settings-card__content">
        <div className={`setting-row${isManual ? ' setting-row--disabled' : ''}`} aria-label={t('settings_session_chips_heading')}>
          <div className="setting-row__info">
            <label htmlFor="show-session-chips" className="setting-row__label">
              {t('settings_session_chips_toggle_label')}
            </label>
            <p className="setting-row__description">
              {t('settings_session_chips_toggle_description')}
            </p>
            {isManual && (
              <p className="setting-row__disabled-hint">
                {t('settings_indicator_disabled_manual')}
              </p>
            )}
          </div>
          <div className="setting-row__control">
            <label className="toggle">
              <input
                id="show-session-chips"
                type="checkbox"
                checked={showSessionChips}
                onChange={handleToggle}
                disabled={loading || isManual}
                aria-describedby="session-chip-help"
              />
              <span className="slider" />
            </label>
          </div>
        </div>

        <p id="session-chip-help" className="session-chip-settings-card__hint">
          {t('settings_session_chips_hint')}
        </p>

        <div className="setting-row" aria-labelledby="session-timeout-label">
          <div className="setting-row__info">
            <label htmlFor="session-timeout" id="session-timeout-label" className="setting-row__label">
              {t('settings_session_timeout_label')}
            </label>
            <p className="setting-row__description">
              {t('settings_session_timeout_description')}
            </p>
          </div>
          <div className="setting-row__control range-slider-control">
            <input
              id="session-timeout"
              type="range"
              className="range-slider"
              min="10"
              max="120"
              step="10"
              value={displayTimeout}
              onChange={(e) => handleTimeoutChange(Number(e.target.value))}
              disabled={loading}
              aria-describedby="session-timeout-help"
            />
            <output htmlFor="session-timeout" className="range-slider-output">
              {displayTimeout}s
            </output>
          </div>
        </div>

        <p id="session-timeout-help" className="session-chip-settings-card__hint">
          {t('settings_session_timeout_hint')}
        </p>

        <span id="session-chip-status" className="sr-only" role="status" aria-live="polite" aria-atomic="true"></span>
      </div>
    </div>
  )
}
