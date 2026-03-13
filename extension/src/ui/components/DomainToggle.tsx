/**
 * DomainToggle Component
 *
 * Displays per-domain enable/disable toggle in popup footer.
 * Allows users to control whether InboxKey is active on the current domain.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Ban } from 'lucide-react'
import { PopupBridge } from '@/ui/services/popup-bridge'
import { t } from '@/lib/i18n'

const bridge = new PopupBridge()

export function DomainToggle() {
  const [domain, setDomain] = useState<string>('')
  const [enabled, setEnabled] = useState<boolean>(true)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string>('')
  const [urlBlacklisted, setUrlBlacklisted] = useState<boolean>(false)
  const [feedbackText, setFeedbackText] = useState<string>('')
  const [feedbackType, setFeedbackType] = useState<'enabled' | 'paused'>('enabled')
  const [feedbackVisible, setFeedbackVisible] = useState<boolean>(false)
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    loadDomainState()
  }, [])

  const loadDomainState = async () => {
    try {
      setLoading(true)
      setError('')

      // Get current tab's URL and domain
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
      const currentUrl = tabs[0]?.url
      if (!currentUrl) return

      const currentDomain = await bridge.getCurrentTabDomain()
      setDomain(currentDomain)

      // Get domain preference
      const isEnabled = await bridge.getDomainPreference(currentDomain)
      setEnabled(isEnabled)

      // Check if current URL is blacklisted
      const { isBlacklisted } = await import('@/lib/utils/blacklist')
      const blacklisted = await isBlacklisted(currentUrl)
      setUrlBlacklisted(blacklisted)
    } catch (err) {
      console.error('[DomainToggle] Failed to load domain state:', err)
      setError(t('error_domain_load'))
    } finally {
      setLoading(false)
    }
  }

  const showFeedback = useCallback((text: string, type: 'enabled' | 'paused') => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
    setFeedbackText(text)
    setFeedbackType(type)
    setFeedbackVisible(true)
    feedbackTimer.current = setTimeout(() => setFeedbackVisible(false), 3000)
  }, [])

  useEffect(() => {
    return () => { if (feedbackTimer.current) clearTimeout(feedbackTimer.current) }
  }, [])

  const handleToggle = async () => {
    if (!domain) return

    try {
      const newState = !enabled
      setEnabled(newState) // Optimistic update

      // Save to storage
      await bridge.setDomainPreference(domain, newState)

      // Inline feedback
      showFeedback(
        newState ? t('domain_toggle_enabled') : t('domain_toggle_paused'),
        newState ? 'enabled' : 'paused'
      )

      console.log(`[DomainToggle] Domain ${domain} ${newState ? 'enabled' : 'disabled'}`)
    } catch (err) {
      console.error('[DomainToggle] Failed to toggle domain:', err)
      setEnabled(!enabled)
      setError(t('error_domain_update'))
    }
  }

  const handleOpenBlacklist = () => {
    chrome.runtime.openOptionsPage()
    // Send message to open blacklist modal on URLs tab
    chrome.runtime.sendMessage({
      type: 'OPEN_BLACKLIST_MODAL',
      tab: 'urls'
    })
    window.close() // Close popup
  }

  if (loading) {
    return (
      <div className="domain-toggle domain-toggle--loading" role="status" aria-busy="true">
        <span className="domain-toggle__label">{t('domain_toggle_label')}</span>
        <span className="domain-toggle__status">{t('status_loading')}</span>
      </div>
    )
  }

  if (error || !domain) {
    return (
      <div className="domain-toggle domain-toggle--error" role="alert">
        <span className="domain-toggle__error">{t('error_generic')}</span>
      </div>
    )
  }

  return (
    <div className={`domain-toggle-inline ${!enabled ? 'domain-toggle-inline--off' : ''}`}>
      <div className="domain-toggle-inline__row">
        <label className="mini-toggle" aria-label={`${t('domain_toggle_label')} ${domain}`}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={handleToggle}
          />
          <span className="slider" />
        </label>
        <span className="domain-toggle-inline__off-icon" aria-hidden="true">
          <Ban size={12} />
        </span>
        <span className="domain-toggle-inline__domain">{domain}</span>
        <span
          className={`domain-toggle-inline__feedback ${feedbackVisible ? 'domain-toggle-inline__feedback--visible' : ''} ${feedbackVisible ? `domain-toggle-inline__feedback--${feedbackType}` : ''}`}
          aria-live="polite"
        >
          {feedbackText}
        </span>
      </div>
      {!enabled && (
        <span className="domain-toggle__warning">
          {t('domain_toggle_disabled_warning')}
        </span>
      )}
      {enabled && urlBlacklisted && (
        <div className="domain-toggle__url-warning" role="status" aria-live="polite">
          <span className="domain-toggle__url-warning-text">
            {t('domain_toggle_url_warning')}
          </span>
          <button
            type="button"
            className="domain-toggle__url-warning-link"
            onClick={handleOpenBlacklist}
          >
            {t('domain_toggle_manage_settings')}
          </button>
        </div>
      )}
    </div>
  )
}
