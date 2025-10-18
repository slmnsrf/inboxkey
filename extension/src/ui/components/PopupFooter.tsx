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
      <div className="popup-footer__trust">
        <span className="trust-tag">{t('trust_open_source')}</span>
        <span className="trust-tag">{t('trust_local_only')}</span>
        <span className="trust-tag">{t('trust_read_only')}</span>
      </div>

      <BuyMeACoffeeButton
        variant="popup"
        label={t('footer_buy_coffee_link')}
        ariaLabel={t('about_buy_coffee')}
        className="popup-footer__support"
      />
    </footer>
  )
}
