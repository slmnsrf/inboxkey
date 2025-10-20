/**
 * Loading Spinner Component
 *
 * Professional SVG spinner animation to replace emoji spinner.
 * Accessible and performant across all platforms.
 */

import React from 'react'

interface LoadingSpinnerProps {
  size?: 'xsmall' | 'small' | 'medium' | 'large'
  className?: string
}

export function LoadingSpinner({ size = 'medium', className = '' }: LoadingSpinnerProps) {
  return (
    <svg
      className={`loading-spinner loading-spinner--${size} ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      role="status"
    >
      <circle
        className="loading-spinner__track"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        opacity="0.25"
      />
      <path
        className="loading-spinner__indicator"
        fill="currentColor"
        d="M12 2a10 10 0 0 1 10 10h-3a7 7 0 0 0-7-7V2z"
      />
    </svg>
  )
}
