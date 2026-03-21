import React from 'react';
import { t } from '@/lib/i18n';
import { InlineAlert } from './InlineAlert';

type ProviderType = 'gmail' | 'outlook' | 'imap-bridge';
type FeedbackType = 'success' | 'error' | 'warning' | 'info';

/** Maps provider type to the CSS modifier class for the colored dot. */
const PROVIDER_DOT_CLASS: Record<ProviderType, string> = {
  gmail: 'provider-dot--gmail',
  outlook: 'provider-dot--outlook',
  'imap-bridge': 'provider-dot--imap',
};

interface AccountSectionProps {
  provider: ProviderType;
  displayName: string;
  description: React.ReactNode;
  accountCount?: number;
  maxAccounts?: number;
  isConnected?: boolean;
  statusLabel?: string;
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
 * - Header with provider dot, name, optional counter, and status chip
 * - Children content (account rows or empty state)
 * - Description text (microcopy) after the content
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
  isConnected,
  statusLabel,
  actionButton,
  children,
  feedbackMessage,
  feedbackType = 'error',
  className = '',
}: AccountSectionProps) {
  const showCounter = accountCount !== undefined && maxAccounts !== undefined;
  const showStatusChip = isConnected !== undefined;

  return (
    <section
      className={`accounts-section provider-card-section ${className}`.trim()}
      aria-label={`${displayName} accounts`}
      data-provider={provider}
    >
      <div className="accounts-section__header">
        <div className="provider-card-header">
          <h3 className="accounts-section__title">
            <span
              className={`provider-dot ${PROVIDER_DOT_CLASS[provider]}`}
              aria-hidden="true"
            />
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          {showStatusChip && (
            <span className={`status-chip ${isConnected ? 'status-chip--connected' : 'status-chip--disconnected'}`}>
              {statusLabel || (isConnected ? t('accounts_status_connected') : t('accounts_status_not_connected'))}
            </span>
          )}
          {actionButton && (
            <div className="accounts-section__action">
              {actionButton}
            </div>
          )}
        </div>
      </div>

      <div className="accounts-section__content">
        {children}
      </div>

      <p className="accounts-section__description">
        {description}
      </p>

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
