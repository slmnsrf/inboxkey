/**
 * BlacklistManageButton Component
 *
 * Button in settings that opens the blacklist management modal.
 * Simple, accessible button component.
 */

import React from 'react'

export interface BlacklistManageButtonProps {
  onClick: () => void
}

export function BlacklistManageButton({ onClick }: BlacklistManageButtonProps) {
  return (
    <div className="setting-row">
      <div className="setting-row__info">
        <p className="setting-row__label">Manage Ignored Sites</p>
        <p className="setting-row__description">
          Prevent InboxKey from starting sessions on specific domains or URLs
        </p>
      </div>
      <div className="setting-row__control">
        <button
          type="button"
          className="btn btn--secondary"
          onClick={onClick}
          data-testid="blacklist-manage-button"
        >
          Manage
        </button>
      </div>
    </div>
  )
}
