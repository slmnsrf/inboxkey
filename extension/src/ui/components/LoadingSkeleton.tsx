/**
 * LoadingSkeleton Component
 *
 * Displays a loading skeleton while data is being fetched.
 */

import React from 'react'

export function LoadingSkeleton() {
  return (
    <div className="popup-loading">
      <div className="skeleton skeleton--header" />
      <div className="skeleton skeleton--card" />
      <div className="skeleton skeleton--card" />
      <div className="skeleton skeleton--card" />
    </div>
  )
}
