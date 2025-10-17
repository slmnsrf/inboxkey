/**
 * PopupLockOverlay Component
 *
 * Full-screen overlay specifically for popup context.
 * Wraps LockScreen component with popup-specific styling and dimensions.
 */

import React from 'react'
import { LockScreen } from './LockScreen'

/**
 * Props for PopupLockOverlay component
 */
export interface PopupLockOverlayProps {
  /** Callback when successfully unlocked */
  onUnlock: () => void
}

/**
 * PopupLockOverlay Component
 *
 * Renders a full-screen overlay specifically designed for the popup context.
 * Blocks access to the underlying OTP list with a centered lock screen.
 *
 * Features:
 * - Fixed dimensions for popup (350px width)
 * - High z-index to appear above all content
 * - Semi-transparent background
 * - Centered LockScreen component
 *
 * @example
 * ```tsx
 * {isLocked && (
 *   <PopupLockOverlay onUnlock={() => console.log('Unlocked!')} />
 * )}
 * ```
 */
export function PopupLockOverlay({ onUnlock }: PopupLockOverlayProps): JSX.Element {
  return (
    <div className="popup-lock-overlay">
      <div className="popup-lock-overlay__background" />
      <div className="popup-lock-overlay__content">
        <LockScreen mode="popup" onUnlock={onUnlock} showSettingsLink />
      </div>
    </div>
  )
}
