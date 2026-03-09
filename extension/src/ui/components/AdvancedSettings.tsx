/**
 * AdvancedSettings Component
 *
 * Displays advanced settings including domain preferences.
 */

import React, { useState, useEffect } from 'react'
import { StorageFactory } from '@/lib/storage/storage-factory'
import { useToast } from '@/ui/contexts/ToastContext'
import { t } from '@/lib/i18n'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { WarningIcon } from '@/ui/components/icons/StatusIcons'
import type { AutomationLevel } from '@/lib/storage/schema'

export function AdvancedSettings() {
  const { showToast } = useToast()
  const [domainsEnabledByDefault, setDomainsEnabledByDefault] = useState<boolean>(true)
  const [extendedButtonDetection, setExtendedButtonDetection] = useState<boolean>(false)
  const [automationLevel, setAutomationLevel] = useState<AutomationLevel>('autofill')
  const [disableOnBankingSites, setDisableOnBankingSites] = useState<boolean>(false)
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
      setExtendedButtonDetection(settings.extendedButtonDetection ?? false)
      setAutomationLevel(settings.automationLevel || 'autofill')
      setDisableOnBankingSites(settings.disableOnBankingSites ?? false)
    } catch (error) {
      console.error('[AdvancedSettings] Failed to load settings:', error)
      showToast(t('toast_settings_failed'), 'error')
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
      showToast(t('toast_settings_failed'), 'error')
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
        statusEl.textContent = `Extended button detection ${newValue ? 'enabled' : 'disabled'}`
      }

      showToast(t('toast_settings_saved'), 'success')
    } catch (error) {
      console.error('[AdvancedSettings] Failed to save extended button detection:', error)
      // Revert on error
      setExtendedButtonDetection(!extendedButtonDetection)

      // Announce error to screen readers
      const statusEl = document.getElementById('extended-button-status')
      if (statusEl) {
        statusEl.textContent = 'Failed to save extended button detection setting'
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
        statusEl.textContent = `Banking site blocklist ${newValue ? 'enabled' : 'disabled'}`
      }

      showToast(t('toast_settings_saved'), 'success')
    } catch (error) {
      console.error('[AdvancedSettings] Failed to save banking blocklist setting:', error)
      setDisableOnBankingSites(!disableOnBankingSites) // Revert on error

      // Announce error to screen readers
      const statusEl = document.getElementById('banking-blocklist-status')
      if (statusEl) {
        statusEl.textContent = 'Failed to save banking blocklist setting'
      }

      showToast(t('toast_settings_failed'), 'error')
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
            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
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

          <div className="setting-divider" />

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
            Covers 150+ major banks worldwide. You can still enable InboxKey for specific banks using the toggle in the popup.
          </p>
          <span id="banking-blocklist-status" className="sr-only" role="status" aria-live="polite" aria-atomic="true"></span>

          {automationLevel === 'full-automation' && (
            <>
              <div className="setting-divider" />

              <div className="setting-row setting-row--beta">
                <div className="setting-row__info">
                  <label htmlFor="extended-button-detection" className="setting-row__label">
                    <span className="beta-badge">BETA</span>
                    Extended Button Detection
                  </label>
                  <p className="setting-row__description">
                    Detects custom button components (Vue.js, React) used by modern websites.
                  </p>
                  <div className="setting-row__warning">
                    <span className="warning-icon">
                      <WarningIcon size={16} />
                    </span>
                    <span className="warning-text">
                      <strong>Note:</strong> May occasionally interact with navigation elements.
                      Only enable if your sites use custom button components.
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
                <summary className="setting-details__summary">What does this detect?</summary>
                <div className="setting-details__content">
                  <div className="detection-types">
                    <div className="detection-type">
                      <strong className="detection-type__label">Standard (always enabled):</strong>
                      <code className="detection-type__code">&lt;button&gt;</code>,
                      <code className="detection-type__code">&lt;input type="submit"&gt;</code>
                    </div>
                    <div className="detection-type">
                      <strong className="detection-type__label">Extended (when enabled):</strong>
                      <code className="detection-type__code">&lt;a&gt;</code> tags,
                      <code className="detection-type__code">role="button"</code> elements
                    </div>
                  </div>
                  <p className="setting-details__note">
                    <strong>Safety:</strong> Extended detection includes 11 protection layers to prevent clicking dangerous buttons.
                  </p>
                </div>
              </details>

              <p id="extended-button-detection-help" className="advanced-settings-card__hint">
                This feature is in beta and may occasionally click unintended buttons. Monitor its behavior and disable if issues occur.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
