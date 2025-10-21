/**
 * DomainToggle Component
 *
 * Displays per-domain enable/disable toggle in popup footer.
 * Allows users to control whether InboxKey is active on the current domain.
 */

import React, { useState, useEffect } from 'react'
import { PopupBridge } from '@/ui/services/popup-bridge'
import { t } from '@/lib/i18n'

const bridge = new PopupBridge()

export function DomainToggle() {
  const [domain, setDomain] = useState<string>('')
  const [enabled, setEnabled] = useState<boolean>(true)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string>('')

  useEffect(() => {
    loadDomainState()
  }, [])

  const loadDomainState = async () => {
    try {
      setLoading(true)
      setError('')

      // Get current tab's domain
      const currentDomain = await bridge.getCurrentTabDomain()
      setDomain(currentDomain)

      // Get domain preference
      const isEnabled = await bridge.getDomainPreference(currentDomain)
      setEnabled(isEnabled)
    } catch (err) {
      console.error('[DomainToggle] Failed to load domain state:', err)
      setError(t('error_domain_load'))
    } finally {
      setLoading(false)
    }
  }

  const handleToggle = async () => {
    if (!domain) return

    try {
      const newState = !enabled
      setEnabled(newState) // Optimistic update

      // Save to storage
      await bridge.setDomainPreference(domain, newState)

      // Notify user via badge/icon update (handled by background script)
      console.log(`[DomainToggle] Domain ${domain} ${newState ? 'enabled' : 'disabled'}`)
    } catch (err) {
      console.error('[DomainToggle] Failed to toggle domain:', err)
      // Revert on error
      setEnabled(!enabled)
      setError(t('error_domain_update'))
    }
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
    <div className="domain-toggle">
      <span className="domain-toggle__label">{t('domain_toggle_label')}</span>
      <label className="toggle">
        <input
          type="checkbox"
          checked={enabled}
          onChange={handleToggle}
          aria-label={`${t('domain_toggle_label')} ${domain}`}
        />
        <span className="slider" />
      </label>
      {!loading && !error && !enabled && (
        <span className="domain-toggle__warning">
          ⚠️ InboxKey disabled on this site
        </span>
      )}
    </div>
  )
}
