import React from 'react';
import { Server } from 'lucide-react';
import { t } from '@/lib/i18n';
import { InlineAlert } from './InlineAlert';

import gmailLogo from 'url:~assets/providers/gmail.svg';
import outlookLogo from 'url:~assets/providers/microsoft-outlook.svg';
import googleMessagesLogo from 'url:~assets/providers/google-messages.svg';

type ProviderType = 'gmail' | 'outlook' | 'imap-bridge' | 'google-messages';
type FeedbackType = 'success' | 'error' | 'warning' | 'info';

/** Maps provider type to the imported logo URL (null = use icon fallback). */
const PROVIDER_LOGOS: Record<ProviderType, string | null> = {
  gmail: gmailLogo,
  outlook: outlookLogo,
  'imap-bridge': null,
  'google-messages': googleMessagesLogo,
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
  feedbackAutoDismiss?: boolean;
  feedbackDismissDelay?: number;
  className?: string;
}

/**
 * AccountSection - Header wrapper for provider sections
 *
 * Provides consistent structure across all provider cards:
 * - Header with provider logo, name, optional counter, and status chip
 * - Children content (account rows or empty state)
 * - Description text (microcopy) after the content
 * - Inline feedback for success/error states
 *
 * Used by Gmail, Outlook, IMAP, and Google Messages sections.
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
  feedbackAutoDismiss = true,
  feedbackDismissDelay = 6500,
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
            {PROVIDER_LOGOS[provider] ? (
              <img
                src={PROVIDER_LOGOS[provider]!}
                alt=""
                className="provider-logo"
                width="18"
                height="18"
              />
            ) : (
              <Server size={16} className="provider-logo provider-logo--imap" aria-hidden="true" />
            )}
            {displayName}
            {provider === 'google-messages' && (
              <span className="source-type-badge">SMS</span>
            )}
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
          autoDismiss={feedbackAutoDismiss}
          dismissDelay={feedbackDismissDelay}
        />
      )}
    </section>
  );
}
