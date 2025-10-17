/**
 * BuyMeACoffeeButton Component
 *
 * Renders a reusable support CTA styled to match the official Buy Me a Coffee widget.
 * Keeps the experience local-only (no remote script) while honoring product guardrails.
 */

import React from 'react'

const BUY_ME_A_COFFEE_URL = 'https://buymeacoffee.com/inboxkey'

type BuyMeACoffeeVariant = 'popup' | 'options' | 'about'

export interface BuyMeACoffeeButtonProps
  extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  /** Visual variant tuned for popup vs settings/about layouts */
  variant?: BuyMeACoffeeVariant
  /** Visible label (localized at call site) */
  label: string
  /** Custom aria-label if different from the visible label */
  ariaLabel?: string
}

export function BuyMeACoffeeButton({
  variant = 'options',
  label,
  ariaLabel,
  className,
  children,
  ...anchorProps
}: BuyMeACoffeeButtonProps): JSX.Element {
  const composedClassName = [
    'buy-coffee-button',
    `buy-coffee-button--${variant}`,
    className
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <a
      href={BUY_ME_A_COFFEE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={composedClassName}
      aria-label={ariaLabel ?? label}
      data-name="bmc-button"
      data-slug="inboxkey"
      data-color="#FFDD00"
      data-emoji=""
      data-font="Lato"
      data-text={label}
      data-outline-color="#000000"
      data-font-color="#000000"
      data-coffee-color="#ffffff"
      {...anchorProps}
    >
      <span className="buy-coffee-button__emoji" aria-hidden="true">
        ☕
      </span>
      <span className="buy-coffee-button__label">{label}</span>
      {children}
    </a>
  )
}
