/**
 * SecurityBanner Component
 *
 * Banner prompting users to set up password protection when uninitialized.
 * Dismissible for the current session (no persistence).
 */

import React from 'react'
import { Info } from 'lucide-react'
import { t } from '@/lib/i18n'

/**
 * Props for SecurityBanner component
 */
export interface SecurityBannerProps {
  /** Callback when "Set Up Password" button is clicked */
  onSetupClick: () => void
  /** Callback when "Maybe Later" button is clicked */
  onDismiss: () => void
}

/**
 * SecurityBanner Component
 *
 * Displays a dismissible banner prompting users to enable password protection.
 *
 * @example
 * ```tsx
 * <SecurityBanner
 *   onSetupClick={() => chrome.runtime.openOptionsPage()}
 *   onDismiss={() => setShowBanner(false)}
 * />
 * ```
 */
export function SecurityBanner({ onSetupClick, onDismiss }: SecurityBannerProps): JSX.Element {
  return (
    <div className="security-banner" role="banner">
      <div className="security-banner__content">
        <div className="security-banner__info">
          <span className="security-banner__icon" aria-hidden="true">
            <Info size={16} />
          </span>
          <span className="security-banner__text">
            {t('security_banner_setup')}
          </span>
        </div>

        <div className="security-banner__actions">
          <button
            type="button"
            onClick={onSetupClick}
            className="security-banner__button security-banner__button--primary"
          >
            {t('security_banner_setup_password')}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="security-banner__button security-banner__button--secondary"
          >
            {t('security_banner_not_now')}
          </button>
        </div>
      </div>
    </div>
  )
}
