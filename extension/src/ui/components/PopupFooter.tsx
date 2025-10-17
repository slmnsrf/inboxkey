/**
 * PopupFooter Component
 *
 * Displays privacy status and support CTA in popup footer.
 * Non-intrusive placement per design guidelines.
 *
 * Reference: ui-components.md - "Support Button" and "Privacy Status Line"
 */

import React from 'react'
import { t } from '@/lib/i18n'
import { BuyMeACoffeeButton } from './BuyMeACoffeeButton'

export function PopupFooter() {
  return (
    <footer className="popup-footer">
      <div className="popup-footer__privacy">
        <svg
          className="popup-footer__icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <span>{t('footer_local_only')}</span>
      </div>

      <BuyMeACoffeeButton
        variant="popup"
        label={t('footer_buy_coffee')}
        ariaLabel={t('about_buy_coffee')}
        className="popup-footer__support"
      />
    </footer>
  )
}
