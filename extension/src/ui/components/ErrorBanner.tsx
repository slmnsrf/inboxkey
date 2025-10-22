/**
 * ErrorBanner Component
 *
 * Persistent banner for sync/auth/network errors in popup UI.
 * Complements the sync error badge (red X on extension icon).
 *
 * Standards:
 * - Colors: docs/ui-ux/font-and-colors.md (WCAG AA compliant)
 * - Spacing: docs/ui-ux/spacing-and-sizes.md (4px grid, 44px touch targets)
 * - Motion: docs/ui-ux/motion-and-feedback.md (300ms slide-in, reduced-motion)
 * - A11y: docs/ui-ux/accessibility.md (WCAG AA, ARIA live regions, keyboard)
 *
 * Features:
 * - 3 variants: error (red), warning (amber), info (blue)
 * - Dismissible with close button + Escape key
 * - Persistent until dismissed (per-session)
 * - Positioned below Header, above quick actions
 * - Uses design tokens only
 * - Keyboard accessible, screen reader friendly
 * - Reduced-motion support
 */

import React, { useEffect, useRef } from 'react'
import { LiveRegion } from './LiveRegion'
import './ErrorBanner.css'

export type BannerVariant = 'error' | 'warning' | 'info'
export type BannerType = 'sync-failed' | 'auth-expired' | 'network-offline'

export interface ErrorBannerProps {
  variant: BannerVariant
  type: BannerType
  message: string
  actionLabel?: string
  onAction?: () => void
  onDismiss?: () => void
  dismissible?: boolean
}

export function ErrorBanner({
  variant,
  type,
  message,
  actionLabel,
  onAction,
  onDismiss,
  dismissible = true,
}: ErrorBannerProps) {
  const bannerRef = useRef<HTMLDivElement>(null)

  // Handle Escape key dismissal
  useEffect(() => {
    if (!dismissible || !onDismiss) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onDismiss()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [dismissible, onDismiss])

  // Determine icon and ARIA role based on variant
  const icon = variant === 'info' ? 'ℹ️' : '⚠️'
  const role = variant === 'error' ? 'alert' : 'status'
  const politeness = variant === 'error' ? 'assertive' : 'polite'

  return (
    <>
      <LiveRegion message={message} politeness={politeness} />
      <div
        ref={bannerRef}
        role={role}
        className={`error-banner error-banner--${variant}`}
        data-type={type}
        data-testid="error-banner"
      >
        <span className="error-banner__icon" aria-hidden="true">
          {icon}
        </span>
        <span className="error-banner__message" data-testid="error-banner-message">
          {message}
        </span>
        {actionLabel && onAction && (
          <button
            type="button"
            className="error-banner__action"
            onClick={onAction}
            data-testid="error-banner-action"
          >
            {actionLabel}
          </button>
        )}
        {dismissible && onDismiss && (
          <button
            type="button"
            className="error-banner__close"
            onClick={onDismiss}
            aria-label={`Dismiss ${variant} notification: ${message}`}
            data-testid="error-banner-close"
          >
            ✕
          </button>
        )}
      </div>
    </>
  )
}
