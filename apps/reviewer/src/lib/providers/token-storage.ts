/**
 * Token Storage for Reviewer
 * Simple chrome.storage.local utilities for storing OAuth tokens
 */

import type { StoredAccount, OAuthTokens } from './types'

const STORAGE_PREFIX = 'reviewer_account_'

/**
 * Save account tokens to storage
 */
export async function saveAccount(
  provider: 'gmail' | 'outlook',
  email: string,
  tokens: OAuthTokens
): Promise<void> {
  const key = `${STORAGE_PREFIX}${provider}_${email}`
  const account: StoredAccount = {
    provider,
    email,
    tokens,
    lastSync: Date.now()
  }

  await chrome.storage.local.set({ [key]: account })
}

/**
 * Get account tokens from storage
 */
export async function getAccount(
  provider: 'gmail' | 'outlook',
  email: string
): Promise<StoredAccount | null> {
  const key = `${STORAGE_PREFIX}${provider}_${email}`
  const result = await chrome.storage.local.get(key)
  return result[key] || null
}

/**
 * Get all stored accounts
 */
export async function getAllAccounts(): Promise<StoredAccount[]> {
  const result = await chrome.storage.local.get(null)
  const accounts: StoredAccount[] = []

  for (const key in result) {
    if (key.startsWith(STORAGE_PREFIX)) {
      accounts.push(result[key])
    }
  }

  return accounts
}

/**
 * Remove account from storage
 */
export async function removeAccount(
  provider: 'gmail' | 'outlook',
  email: string
): Promise<void> {
  const key = `${STORAGE_PREFIX}${provider}_${email}`
  await chrome.storage.local.remove(key)
}

/**
 * Update last sync time for an account
 */
export async function updateLastSync(
  provider: 'gmail' | 'outlook',
  email: string
): Promise<void> {
  const account = await getAccount(provider, email)
  if (account) {
    account.lastSync = Date.now()
    const key = `${STORAGE_PREFIX}${provider}_${email}`
    await chrome.storage.local.set({ [key]: account })
  }
}
