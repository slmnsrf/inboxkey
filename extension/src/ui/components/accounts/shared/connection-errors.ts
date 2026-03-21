/**
 * Shared connection error message resolver
 *
 * Extracts the duplicated getConnectionErrorMessage() function from
 * GmailAccountCard, OutlookAccountCard, and AccountsPanel into a
 * single shared utility.
 */

import { t } from '@/lib/i18n'

export function getConnectionErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes('cancelled')) return t('toast_oauth_cancelled')
    if (error.message.includes('PROFILE_')) return t('toast_connect_profile_failed')
    if (error.message.includes('network')) return t('toast_connect_network_error')
    if (error.message.includes('credentials') || error.message.includes('invalid_client')) {
      return t('toast_connect_invalid_credentials')
    }
    return `${t('toast_connect_failed')}: ${error.message}`
  }
  return t('toast_connect_failed')
}
