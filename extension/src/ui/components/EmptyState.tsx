/**
 * EmptyState Component
 *
 * Displays an empty state message with i18n support.
 */

import React from 'react'
import { t } from '@/lib/i18n'

interface EmptyStateProps {
  variant: 'no-codes' | 'no-links' | 'no-items' | 'no-mailboxes' | 'error'
  message?: string // Optional custom message (overrides variant)
}

export function EmptyState({ variant, message }: EmptyStateProps) {
  // If custom message provided, use it
  if (message) {
    return (
      <div className="empty-state" role="note">
        <p>{message}</p>
      </div>
    )
  }

  // Otherwise, use i18n based on variant
  const variantConfig = {
    'no-codes': {
      title: t('empty_no_codes_title'),
      message: t('empty_no_codes_message'),
    },
    'no-links': {
      title: t('empty_no_links_title'),
      message: t('empty_no_links_message'),
    },
    'no-items': {
      title: t('empty_no_items_title'),
      message: t('empty_no_items_message'),
    },
    'no-mailboxes': {
      title: t('empty_no_mailboxes_title'),
      message: t('empty_no_mailboxes_message'),
    },
    error: {
      title: t('empty_error_title'),
      message: t('empty_error_message'),
    },
  }

  const config = variantConfig[variant]

  return (
    <div className="empty-state" role="note">
      <p className="empty-state-title">{config.title}</p>
      <p className="empty-state-message">{config.message}</p>
    </div>
  )
}
