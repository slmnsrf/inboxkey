/**
 * SessionChipSettings Component
 *
 * Controls check duration (session timeout) for code polling.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { StorageFactory } from '@/lib/storage/storage-factory'
import { useToast } from '@/ui/contexts/ToastContext'
import { t } from '@/lib/i18n'

export function SessionChipSettings() {
  const { showToast } = useToast()
  const [sessionTimeoutSeconds, setSessionTimeoutSeconds] = useState<number>(60)
  const [displayTimeout, setDisplayTimeout] = useState<number>(60)
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
      const timeout = settings.sessionTimeoutSeconds ?? 60
      setSessionTimeoutSeconds(timeout)
      setDisplayTimeout(timeout)
    } catch (error) {
      console.warn('[SessionChipSettings] Failed to load settings:', error)
      showToast(t('error_generic'), 'error')
    } finally {
      setLoading(false)
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

  return (
    <div className="session-chip-settings-card">
      <div className="settings-card__content">
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
