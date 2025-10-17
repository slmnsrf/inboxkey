/**
 * LockedState Component
 *
 * Displays when the extension is locked.
 */

import React from 'react'

export function LockedState() {
  return (
    <div className="popup-locked">
      <h2>🔒 InboxKey is Locked</h2>
      <p>Please unlock the extension to access your codes.</p>
    </div>
  )
}
