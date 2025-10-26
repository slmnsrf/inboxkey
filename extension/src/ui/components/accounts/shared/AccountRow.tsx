import React from 'react';

interface AccountRowProps {
  email: string;
  statusDot: React.ReactNode;
  statusLabel?: string;
  metadata?: string;
  actions: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

/**
 * AccountRow - Generic layout primitive for account rows across all providers
 *
 * Provides consistent structure:
 * - Left: Status dot + email + metadata
 * - Right: Action buttons
 * - Bottom: Optional additional content (children)
 *
 * Used by Gmail, Outlook, and IMAP account cards.
 */
export function AccountRow({
  email,
  statusDot,
  statusLabel,
  metadata,
  actions,
  children,
  className = '',
}: AccountRowProps) {
  return (
    <div className={`account-row ${className}`.trim()}>
      <div className="account-row__info">
        <div className="account-row__email">
          {statusDot}
          <span>
            {email}
            {statusLabel && (
              <span className="sr-only"> - {statusLabel}</span>
            )}
          </span>
        </div>
        {metadata && (
          <div className="account-row__meta" aria-label="Account metadata">
            {metadata}
          </div>
        )}
        {children}
      </div>
      <div className="account-row__actions">
        {actions}
      </div>
    </div>
  );
}
