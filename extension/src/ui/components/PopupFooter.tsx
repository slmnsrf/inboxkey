/**
 * PopupFooter Component
 *
 * Displays domain toggle and support CTA in popup footer.
 * Non-intrusive placement per design guidelines.
 *
 * Reference: ui-components.md - "Support Button" and "Privacy Status Line"
 */

import React from 'react'
import { t } from '@/lib/i18n'
import { BuyMeACoffeeButton } from './BuyMeACoffeeButton'
import { DomainToggle } from './DomainToggle'

export function PopupFooter() {
  return (
    <footer className="popup-footer">
      <DomainToggle />

      <BuyMeACoffeeButton
        variant="popup"
        label={t('footer_buy_coffee')}
        ariaLabel={t('about_buy_coffee')}
        className="popup-footer__support"
      />
    </footer>
  )
}
