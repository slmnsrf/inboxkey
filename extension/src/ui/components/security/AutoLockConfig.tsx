/**
 * AutoLockConfig Component
 *
 * Dropdown/select for auto-lock timeout configuration.
 * Persists to chrome.storage.sync and provides manual lock trigger.
 */

import React, { useState, useEffect } from 'react'
import { useLockContext } from '@/ui/contexts/LockContext'
import { t } from '@/lib/i18n'

/**
 * Props for AutoLockConfig component
 */
export interface AutoLockConfigProps {
  /** Callback when "Lock Now" button is clicked */
  onLockNow: () => Promise<boolean>
}

/**
 * Auto-lock timeout options (in milliseconds)
 */
const TIMEOUT_OPTIONS = [
  { labelKey: 'security_autolock_option_1m', value: 60000 },
  { labelKey: 'security_autolock_option_5m', value: 300000 },
  { labelKey: 'security_autolock_option_15m', value: 900000 },
  { labelKey: 'security_autolock_option_30m', value: 1800000 },
  { labelKey: 'security_autolock_option_60m', value: 3600000 },
  { labelKey: 'security_autolock_option_never', value: 0 },
] as const

/**
 * Default timeout: 5 minutes (300000 ms)
 */
const DEFAULT_TIMEOUT = 300000

/**
 * Storage key for auto-lock timeout
 */
const STORAGE_KEY = 'autoLockTimeout'

/**
 * AutoLockConfig Component
 *
 * Allows users to configure auto-lock timeout with dropdown selection.
 * Settings are persisted to chrome.storage.sync and apply immediately.
 *
 * Features:
 * - Dropdown with common timeout options
 * - Persists to chrome.storage.sync
 * - "Lock Now" button for manual locking
 * - Info message showing current selection
 *
 * @example
 * ```tsx
 * <AutoLockConfig
 *   onLockNow={() => lockService.lock()}
 * />
 * ```
 */
export function AutoLockConfig({ onLockNow }: AutoLockConfigProps): JSX.Element {
  const { isLoading } = useLockContext()
  const [timeout, setTimeout] = useState<number>(DEFAULT_TIMEOUT)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoadingLocal, setIsLoadingLocal] = useState(true)
  const [isLockingNow, setIsLockingNow] = useState(false)

  // Load timeout from storage on mount
  useEffect(() => {
    const loadTimeout = async () => {
      if (typeof chrome === 'undefined' || !chrome.storage?.sync) {
        setTimeout(DEFAULT_TIMEOUT)
        setIsLoadingLocal(false)
        return
      }

      try {
        const result = await chrome.storage.sync.get(STORAGE_KEY)
        const savedTimeout = result[STORAGE_KEY]

        if (typeof savedTimeout === 'number') {
          setTimeout(savedTimeout)
        } else {
          // If not set, save default
          await chrome.storage.sync.set({ [STORAGE_KEY]: DEFAULT_TIMEOUT })
          setTimeout(DEFAULT_TIMEOUT)
        }
      } catch (error) {
        console.error('[AutoLockConfig] Failed to load timeout:', error)
        setTimeout(DEFAULT_TIMEOUT)
      } finally {
        setIsLoadingLocal(false)
      }
    }

    loadTimeout()
  }, [])

  const handleTimeoutChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newTimeout = parseInt(e.target.value, 10)
    setTimeout(newTimeout)

    if (typeof chrome === 'undefined' || !chrome.storage?.sync) {
      return
    }

    setIsSaving(true)
    try {
      // Save to chrome.storage.sync
      await chrome.storage.sync.set({ [STORAGE_KEY]: newTimeout })

      // Broadcast change to background (background will update KeyManager)
      if (chrome.runtime?.sendMessage) {
        await chrome.runtime.sendMessage({
          type: 'AUTO_LOCK_TIMEOUT_CHANGED',
          timeout: newTimeout,
        })
      }
    } catch (error) {
      console.error('[AutoLockConfig] Failed to save timeout:', error)
      // Revert on error
      if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
        const result = await chrome.storage.sync.get(STORAGE_KEY)
        setTimeout(result[STORAGE_KEY] || DEFAULT_TIMEOUT)
      } else {
        setTimeout(DEFAULT_TIMEOUT)
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleLockNow = async () => {
    setIsLockingNow(true)
    try {
      await onLockNow()
    } catch (error) {
      console.error('[AutoLockConfig] Failed to lock:', error)
    }
    setIsLockingNow(false)
  }

  // Get current timeout label
  const currentOption = TIMEOUT_OPTIONS.find((opt) => opt.value === timeout) ?? TIMEOUT_OPTIONS[1]
  const timeoutLabel = t(currentOption.labelKey)

  const infoMessage =
    timeout === 0
      ? t('security_autolock_never')
      : t('security_autolock_timeout', timeoutLabel)

  const isDisabled = isLoading || isSaving || isLoadingLocal

  if (isLoadingLocal) {
    return (
      <div className="auto-lock-config auto-lock-config--loading">
        <div className="auto-lock-config__header">
          <h3 className="auto-lock-config__title">{t('security_autolock_title')}</h3>
        </div>
        <div className="auto-lock-config__loading">{t('security_autolock_loading')}</div>
      </div>
    )
  }

  return (
    <div className="auto-lock-config">
      <div className="auto-lock-config__header">
        <h3 className="auto-lock-config__title">{t('security_autolock_title')}</h3>
        <p className="auto-lock-config__description">{t('security_autolock_description')}</p>
      </div>

      <div className="auto-lock-config__content">
        {/* Timeout selector */}
        <div className="auto-lock-config__field">
          <label htmlFor="auto-lock-timeout" className="auto-lock-config__label">
            {t('security_autolock_label')}
          </label>
          <select
            id="auto-lock-timeout"
            value={timeout}
            onChange={handleTimeoutChange}
            disabled={isDisabled}
            className="auto-lock-config__select"
          >
            {TIMEOUT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.labelKey)}
              </option>
            ))}
          </select>
        </div>

        {/* Info message */}
        <div className="auto-lock-config__info">
          <span className="auto-lock-config__info-icon">ⓘ</span>
          <span className="auto-lock-config__info-text">{infoMessage}</span>
        </div>

        {/* Lock Now button */}
        <button
          type="button"
          onClick={handleLockNow}
          disabled={isDisabled || isLockingNow}
          className="security-button security-button--secondary auto-lock-config__lock-button"
        >
          {isLockingNow ? (
            <>
              <span className="security-button__spinner" aria-hidden="true" />
              {t('security_action_lock_now')}
            </>
          ) : (
            t('security_action_lock_now')
          )}
        </button>
      </div>
    </div>
  )
}
