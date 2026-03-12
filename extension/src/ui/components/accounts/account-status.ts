/**
 * Account status logic for mailbox health indicators
 */

import { t } from '@/lib/i18n'

export type AccountStatus = 'online' | 'offline'

export interface AccountStatusResult {
  status: AccountStatus
  label: string
}

interface AccountData {
  tokenExpiresAt?: number
  lastSyncedAt?: number
  lastSyncError?: string
  isSyncing?: boolean
}

/**
 * Determine account status based on token expiry and sync errors
 *
 * Binary status system:
 * 1. Offline (token expired or sync error)
 * 2. Online (healthy state)
 */
export function getAccountStatus(account: AccountData): AccountStatusResult {
  const now = Date.now()

  // Offline conditions (RED - critical issues)
  if (account.tokenExpiresAt && account.tokenExpiresAt < now) {
    return {
      status: 'offline',
      label: t('status_offline_token_expired'),
    }
  }

  if (account.lastSyncError) {
    return {
      status: 'offline',
      label: account.lastSyncError,
    }
  }

  // Online (GREEN - healthy state)
  return {
    status: 'online',
    label: t('status_online_label'),
  }
}
