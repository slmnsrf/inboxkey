import React from 'react';
import { InlineAlert } from './InlineAlert';

type ProviderType = 'gmail' | 'outlook' | 'imap-bridge';
type FeedbackType = 'success' | 'error' | 'warning' | 'info';

interface AccountSectionProps {
  provider: ProviderType;
  displayName: string;
  description: React.ReactNode;
  accountCount?: number;
  maxAccounts?: number;
  actionButton?: React.ReactNode;
  children: React.ReactNode;
  feedbackMessage?: string;
  feedbackType?: FeedbackType;
  className?: string;
}

/**
 * AccountSection - Header wrapper for provider sections
 *
 * Provides consistent structure across all provider cards:
 * - Header with provider name and optional account counter
 * - Description text
 * - Optional action button (Connect, Add Account, etc.)
 * - Children content (account rows or empty state)
 * - Inline feedback for success/error states
 *
 * Used by Gmail, Outlook, and IMAP sections.
 */
export function AccountSection({
  provider,
  displayName,
  description,
  accountCount,
  maxAccounts,
  actionButton,
  children,
  feedbackMessage,
  feedbackType = 'error',
  className = '',
}: AccountSectionProps) {
  const showCounter = accountCount !== undefined && maxAccounts !== undefined;

  return (
    <section
      className={`accounts-section provider-card-section ${className}`.trim()}
      aria-label={`${displayName} accounts`}
      data-provider={provider}
    >
      <div className="accounts-section__header">
        <div className="provider-card-header">
          <h3 className="accounts-section__title">
            {displayName}
          </h3>
          {showCounter && (
            <span
              className="account-counter"
              aria-label={`${accountCount} of ${maxAccounts} accounts connected`}
            >
              {accountCount} / {maxAccounts}
            </span>
          )}
        </div>
        {actionButton && (
          <div className="accounts-section__action">
            {actionButton}
          </div>
        )}
      </div>

      <p className="accounts-section__description">
        {description}
      </p>

      <div className="accounts-section__content">
        {children}
      </div>

      {feedbackMessage && (
        <InlineAlert
          variant={feedbackType}
          message={feedbackMessage}
          autoDismiss={true}
          dismissDelay={6500}
        />
      )}
    </section>
  );
}
