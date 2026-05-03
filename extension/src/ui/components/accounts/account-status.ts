/**
 * Account status logic for mailbox health indicators
 */

import { t } from '@/lib/i18n'

export type AccountStatus = 'online' | 'offline' | 'warning'

export interface AccountStatusResult {
  status: AccountStatus
  label: string
}

interface AccountData {
  lastSyncedAt?: number
  lastSyncError?: string
  isSyncing?: boolean
}

/**
 * Determine account status based on sync errors
 *
 * Binary status system:
 * 1. Offline (sync error)
 * 2. Online (healthy state)
 */
export function getAccountStatus(account: AccountData): AccountStatusResult {
  // Offline condition (RED - sync failures)
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
