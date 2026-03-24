/**
 * AdvancedSettings Component
 *
 * Displays advanced settings including domain preferences.
 */

import React, { useState, useEffect, useCallback } from 'react'
import { StorageFactory } from '@/lib/storage/storage-factory'
import { useToast } from '@/ui/contexts/ToastContext'
import { t } from '@/lib/i18n'
import { ChevronDown, RotateCcw } from 'lucide-react'
import { WarningIcon } from '@/ui/components/icons/StatusIcons'
import type { AutomationLevel } from '@/lib/storage/schema'

export function AdvancedSettings() {
  const { showToast } = useToast()
  const [extendedButtonDetection, setExtendedButtonDetection] = useState<boolean>(false)
  const [automationLevel, setAutomationLevel] = useState<AutomationLevel>('autofill')
  const [disableOnBankingSites, setDisableOnBankingSites] = useState<boolean>(true)
  const [loading, setLoading] = useState<boolean>(true)
  const [isExpanded, setIsExpanded] = useState<boolean>(false)
  const [confirmingReset, setConfirmingReset] = useState(false)

  const handleResetDefaults = useCallback(async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'RESET_SETTINGS' })
      if (!response?.success) {
        showToast(t('toast_settings_reset_failed'), 'error')
        setConfirmingReset(false)
        return
      }
      setConfirmingReset(false)
      showToast(t('toast_settings_reset'), 'success')
      setTimeout(() => window.location.reload(), 1000)
    } catch {
      showToast(t('toast_settings_reset_failed'), 'error')
      setConfirmingReset(false)
    }
  }, [showToast])

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      setLoading(true)
      const storage = await StorageFactory.create()
      const settings = await storage.getSettings()
      setExtendedButtonDetection(settings.extendedButtonDetection ?? false)
      setAutomationLevel(settings.automationLevel || 'autofill')
      setDisableOnBankingSites(settings.disableOnBankingSites ?? false)
    } catch (error) {
      console.warn('[AdvancedSettings] Failed to load settings:', error)
      showToast(t('toast_settings_failed'), 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleExtendedButtonDetectionToggle = async () => {
    try {
      const newValue = !extendedButtonDetection
      setExtendedButtonDetection(newValue) // Optimistic update

      const storage = await StorageFactory.create()
      await storage.updateSettings({ extendedButtonDetection: newValue })

      // Update ARIA live region for screen readers
      const statusEl = document.getElementById('extended-button-status')
      if (statusEl) {
        statusEl.textContent = newValue
          ? t('aria_extended_detection_enabled')
          : t('aria_extended_detection_disabled')
      }

      showToast(t('toast_settings_saved'), 'success')
    } catch (error) {
      console.warn('[AdvancedSettings] Failed to save extended button detection:', error)
      // Revert on error
      setExtendedButtonDetection(!extendedButtonDetection)

      // Announce error to screen readers
      const statusEl = document.getElementById('extended-button-status')
      if (statusEl) {
        statusEl.textContent = t('aria_save_extended_detection_failed')
      }

      showToast(t('toast_settings_failed'), 'error')
    }
  }

  const handleBankingBlocklistToggle = async () => {
    try {
      const newValue = !disableOnBankingSites
      setDisableOnBankingSites(newValue) // Optimistic update

      const storage = await StorageFactory.create()
      await storage.updateSettings({ disableOnBankingSites: newValue })

      // Update ARIA live region for screen readers
      const statusEl = document.getElementById('banking-blocklist-status')
      if (statusEl) {
        statusEl.textContent = newValue
          ? t('aria_banking_blocklist_enabled')
          : t('aria_banking_blocklist_disabled')
      }

      showToast(t('toast_settings_saved'), 'success')
    } catch (error) {
      console.warn('[AdvancedSettings] Failed to save banking blocklist setting:', error)
      setDisableOnBankingSites(!disableOnBankingSites) // Revert on error

      // Announce error to screen readers
      const statusEl = document.getElementById('banking-blocklist-status')
      if (statusEl) {
        statusEl.textContent = t('aria_save_banking_blocklist_failed')
      }

      showToast(t('toast_settings_failed'), 'error')
    }
  }

  return (
    <div className="advanced-settings-card">
      <button
        className="advanced-settings-card__toggle"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        aria-controls="advanced-settings-content"
      >
        <span className="advanced-settings-card__toggle-icon" aria-hidden="true">
          <ChevronDown size={14} />
        </span>
        <span className="advanced-settings-card__toggle-label">{t('settings_advanced_section_title')}</span>
        <span className="advanced-settings-card__hint-label">{t('settings_advanced_hint')}</span>
      </button>

      {isExpanded && (
        <div id="advanced-settings-content" className="advanced-settings-card__content">
          <div className="setting-row">
            <div className="setting-row__info">
              <label htmlFor="disable-on-banking-sites" className="setting-row__label">
                {t('settings_advanced_banking_blocklist')}
              </label>
              <p className="setting-row__description">
                {t('settings_advanced_banking_blocklist_desc')}
              </p>
            </div>
            <div className="setting-row__control">
              <label className="toggle">
                <input
                  id="disable-on-banking-sites"
                  type="checkbox"
                  checked={disableOnBankingSites}
                  onChange={handleBankingBlocklistToggle}
                  disabled={loading}
                  aria-describedby="banking-blocklist-help"
                />
                <span className="slider" />
              </label>
            </div>
          </div>

          <p id="banking-blocklist-help" className="advanced-settings-card__hint">
            {t('settings_advanced_banking_blocklist_hint')}
          </p>
          <span id="banking-blocklist-status" className="sr-only" role="status" aria-live="polite" aria-atomic="true"></span>

          {automationLevel === 'full-automation' && (
            <>
              <div className="setting-divider" />

              <div className="setting-row setting-row--beta">
                <div className="setting-row__info">
                  <label htmlFor="extended-button-detection" className="setting-row__label">
                    <span className="beta-badge">BETA</span>
                    {t('settings_advanced_extended_detection')}
                  </label>
                  <p className="setting-row__description">
                    {t('settings_advanced_extended_detection_desc')}
                  </p>
                  <div className="setting-row__warning">
                    <span className="warning-icon">
                      <WarningIcon size={16} />
                    </span>
                    <span className="warning-text">
                      {t('settings_advanced_extended_detection_warning')}
                    </span>
                  </div>
                </div>
                <div className="setting-row__control">
                  <label className="toggle">
                    <input
                      id="extended-button-detection"
                      type="checkbox"
                      checked={extendedButtonDetection}
                      onChange={handleExtendedButtonDetectionToggle}
                      disabled={loading}
                      aria-describedby="extended-button-detection-help"
                    />
                    <span className="slider" />
                  </label>
                </div>
              </div>
              <span id="extended-button-status" className="sr-only" role="status" aria-live="polite" aria-atomic="true"></span>

              <details className="setting-details">
                <summary className="setting-details__summary">{t('settings_advanced_extended_detection_details_summary')}</summary>
                <div className="setting-details__content">
                  <div className="detection-types">
                    <div className="detection-type">
                      <strong className="detection-type__label">{t('settings_advanced_detection_standard_label')}</strong>
                      <code className="detection-type__code">&lt;button&gt;</code>,
                      <code className="detection-type__code">&lt;input type="submit"&gt;</code>
                    </div>
                    <div className="detection-type">
                      <strong className="detection-type__label">{t('settings_advanced_detection_extended_label')}</strong>
                      <code className="detection-type__code">&lt;a&gt;</code> tags,
                      <code className="detection-type__code">role="button"</code> elements
                    </div>
                  </div>
                  <p className="setting-details__note">
                    {t('settings_advanced_detection_safety_note')}
                  </p>
                </div>
              </details>

              <p id="extended-button-detection-help" className="advanced-settings-card__hint">
                {t('settings_advanced_extended_detection_hint')}
              </p>
            </>
          )}

          {/* Reset Settings */}
          <div className="advanced-reset-section">
            <div className="setting-row">
              <div className="setting-row__info">
                <span className="setting-row__label">{t('data_reset_defaults_title')}</span>
                <p className="setting-row__description">{t('data_reset_defaults_description')}</p>
              </div>
              <div className="setting-row__control">
                {confirmingReset ? (
                  <div className="confirm-inline" role="alertdialog">
                    <p className="confirm-inline__text">{t('data_reset_defaults_confirm_message')}</p>
                    <div className="confirm-inline__actions">
                      <button
                        type="button"
                        className="btn btn--danger btn--sm"
                        onClick={handleResetDefaults}
                      >
                        {t('data_reset_defaults_yes')}
                      </button>
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                        onClick={() => setConfirmingReset(false)}
                      >
                        {t('data_cancel')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={() => setConfirmingReset(true)}
                  >
                    <RotateCcw size={14} />
                    {t('data_reset_defaults_button')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
