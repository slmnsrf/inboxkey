/**
 * Trust Indicator Component
 *
 * Displays security and privacy information to build user trust.
 * Shows encryption, read-only access, and local storage details.
 */

import React from 'react'
import { t } from '@/lib/i18n'

export function TrustIndicator() {
  return (
    <div className="trust-indicator">
      <svg
        className="trust-indicator__icon"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M12 2L3 7v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z"
          fill="currentColor"
          opacity="0.2"
        />
        <path
          d="M10 17l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"
          fill="currentColor"
        />
      </svg>
      <div className="trust-indicator__content">
        <strong className="trust-indicator__title">{t('trust_indicator_title')}</strong>
        <ul className="trust-indicator__list">
          <li>{t('trust_indicator_readonly')}</li>
          <li>{t('trust_indicator_local_storage')}</li>
          <li>{t('trust_indicator_local')}</li>
        </ul>
      </div>
    </div>
  )
}
