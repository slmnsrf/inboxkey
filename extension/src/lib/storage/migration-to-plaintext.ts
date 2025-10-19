/**
 * Migration from encrypted storage to plaintext storage (Phase 3)
 *
 * CRITICAL: This module handles one-time migration of user data from encrypted
 * to plaintext storage. User data safety is paramount.
 *
 * Migration strategy:
 * 1. Detect if encrypted data exists (check for salt, keyVerification, lockState)
 * 2. Prompt user for password
 * 3. Create backup before migration
 * 4. Decrypt all encrypted data
 * 5. Save to plaintext storage
 * 6. Clean up encryption-related keys
 * 7. Rollback on any failure
 */

import { deriveKey, decrypt, type EncryptedData } from '../crypto/encryption'
import { getSavedSalt } from '../crypto/crypto-utils'
import { PlaintextStorage } from './plaintext-storage'
import { STORAGE_KEYS } from './schema'
import type { Mailbox, StoredCode } from './schema'

export interface MigrationResult {
  status: 'success' | 'not_needed' | 'user_cancelled' | 'failed'
  error?: string
  details?: {
    mailboxesMigrated: number
    codesMigrated: number
  }
}

/**
 * Encrypted mailbox structure (from old EncryptedStorage)
 */
interface EncryptedMailbox {
  id: string
  providerId: string
  email: string
  accessToken: EncryptedData
  refreshToken?: EncryptedData
  tokenExpiresAt: number
  addedAt: number
  lastSyncedAt: number
}

/**
 * Encrypted code structure (from old EncryptedStorage)
 */
interface EncryptedStoredCode {
  code: EncryptedData
  timestamp: number
  source: string
  siteMatch?: string
  used: boolean
  mailboxId?: string
}

/**
 * Check if user has encrypted data that needs migration
 */
export async function needsMigration(): Promise<boolean> {
  const storage = await chrome.storage.local.get([
    'masterKeySalt',
    'keyVerification',
    'lockState',
    STORAGE_KEYS.MAILBOXES,
    STORAGE_KEYS.RECENT_CODES
  ])

  // If any lock-related keys exist, migration needed
  const hasLockKeys = !!(
    storage.masterKeySalt ||
    storage.keyVerification ||
    storage.lockState !== undefined
  )

  // Also check if we have encrypted data (old format uses STORAGE_KEYS.MAILBOXES directly)
  // Encrypted storage used "mailboxes" and "recent_codes"
  // Plaintext storage uses "mailboxes_plain" and "recent_codes_plain"
  const hasEncryptedData = !!(
    storage[STORAGE_KEYS.MAILBOXES] ||
    storage[STORAGE_KEYS.RECENT_CODES]
  )

  return hasLockKeys || hasEncryptedData
}

/**
 * Attempt to migrate encrypted data to plaintext
 * @param password User's 6-digit PIN
 * @returns Migration result with status and details
 */
export async function migrateToPlaintext(password: string): Promise<MigrationResult> {
  try {
    console.log('[Migration] Starting migration to plaintext...')

    // 1. Get saved salt (throws if not found)
    const salt = await getSavedSalt()

    if (!salt) {
      console.warn('[Migration] No salt found, checking if data exists...')

      // Check if there's any encrypted data without salt
      const storage = await chrome.storage.local.get([
        STORAGE_KEYS.MAILBOXES,
        STORAGE_KEYS.RECENT_CODES
      ])

      if (!storage[STORAGE_KEYS.MAILBOXES] && !storage[STORAGE_KEYS.RECENT_CODES]) {
        console.log('[Migration] No encrypted data found, migration not needed')
        return {
          status: 'not_needed',
          details: {
            mailboxesMigrated: 0,
            codesMigrated: 0
          }
        }
      }

      return {
        status: 'failed',
        error: 'Encrypted data found but no encryption key available. Please use "Skip Migration" to reset.'
      }
    }

    // 2. Derive key from password
    console.log('[Migration] Deriving key from password...')
    const { key } = await deriveKey(password, salt)

    // 3. Verify password is correct by decrypting verification data
    const verificationData = await chrome.storage.local.get('keyVerification')
    if (verificationData.keyVerification) {
      try {
        await decrypt(verificationData.keyVerification, key)
        console.log('[Migration] Password verified successfully')
      } catch (error) {
        console.error('[Migration] Password verification failed:', error)
        return {
          status: 'failed',
          error: 'Incorrect password. Please try again.'
        }
      }
    }

    // 4. Create backup before migration
    console.log('[Migration] Creating backup...')
    const backup = await createBackup()

    try {
      // 5. Decrypt and migrate mailboxes
      console.log('[Migration] Migrating mailboxes...')
      const mailboxesKey = STORAGE_KEYS.MAILBOXES // "mailboxes"
      const encryptedMailboxesData = await chrome.storage.local.get(mailboxesKey)
      let mailboxesMigrated = 0

      if (encryptedMailboxesData[mailboxesKey]) {
        const decryptedMailboxes = await decryptMailboxes(
          encryptedMailboxesData[mailboxesKey],
          key
        )

        const storage = new PlaintextStorage()
        for (const mailbox of decryptedMailboxes) {
          await storage.addMailbox(mailbox)
          mailboxesMigrated++
        }
        console.log(`[Migration] Migrated ${mailboxesMigrated} mailboxes`)
      }

      // 6. Decrypt and migrate recent codes
      console.log('[Migration] Migrating codes...')
      const codesKey = STORAGE_KEYS.RECENT_CODES // "recent_codes"
      const encryptedCodesData = await chrome.storage.local.get(codesKey)
      let codesMigrated = 0

      if (encryptedCodesData[codesKey]) {
        const decryptedCodes = await decryptCodes(
          encryptedCodesData[codesKey],
          key
        )

        const storage = new PlaintextStorage()
        for (const code of decryptedCodes) {
          await storage.addCode(code)
          codesMigrated++
        }
        console.log(`[Migration] Migrated ${codesMigrated} codes`)
      }

      // 7. Clean up lock-related storage keys and old encrypted data
      console.log('[Migration] Cleaning up encryption keys...')
      await chrome.storage.local.remove([
        'lockState',
        'masterKeySalt',
        'keyVerification',
        'lastUnlockedAt',
        'autoLockTimeout',
        mailboxesKey, // Remove old encrypted mailboxes
        codesKey // Remove old encrypted codes
      ])

      await chrome.storage.sync.remove(['lockEnabled', 'lockTimeoutMinutes'])

      // 8. Clear backup after successful migration
      await chrome.storage.local.remove('migration_backup')

      console.log('[Migration] Migration completed successfully')
      return {
        status: 'success',
        details: {
          mailboxesMigrated,
          codesMigrated
        }
      }

    } catch (error) {
      // Rollback on failure
      console.error('[Migration] Migration failed, rolling back:', error)
      await restoreBackup(backup)
      throw error
    }

  } catch (error) {
    console.error('[Migration] Migration error:', error)
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error occurred during migration'
    }
  }
}

/**
 * Create backup of all storage before migration
 */
async function createBackup(): Promise<Record<string, any>> {
  const all = await chrome.storage.local.get(null)
  await chrome.storage.local.set({ 'migration_backup': all })
  console.log('[Migration] Backup created with', Object.keys(all).length, 'keys')
  return all
}

/**
 * Restore from backup if migration fails
 */
async function restoreBackup(backup: Record<string, any>): Promise<void> {
  console.log('[Migration] Restoring from backup...')
  await chrome.storage.local.clear()
  await chrome.storage.local.set(backup)
  console.log('[Migration] Backup restored')
}

/**
 * Decrypt array of mailboxes
 */
async function decryptMailboxes(encrypted: any[], key: CryptoKey): Promise<Mailbox[]> {
  const decrypted: Mailbox[] = []

  for (const item of encrypted) {
    const encMailbox = item as EncryptedMailbox

    try {
      // Decrypt tokens
      const accessToken = encMailbox.accessToken?.ciphertext
        ? await decrypt(encMailbox.accessToken, key)
        : encMailbox.accessToken

      let refreshToken: string | undefined = undefined
      if (encMailbox.refreshToken) {
        refreshToken = encMailbox.refreshToken.ciphertext
          ? await decrypt(encMailbox.refreshToken, key)
          : encMailbox.refreshToken as any
      }

      decrypted.push({
        id: encMailbox.id,
        providerId: encMailbox.providerId as any,
        email: encMailbox.email,
        accessToken,
        refreshToken,
        tokenExpiresAt: encMailbox.tokenExpiresAt,
        addedAt: encMailbox.addedAt,
        lastSyncedAt: encMailbox.lastSyncedAt
      })
    } catch (error) {
      console.error(`[Migration] Failed to decrypt mailbox ${encMailbox.id}:`, error)
      throw new Error(`Failed to decrypt mailbox ${encMailbox.email}: ${error instanceof Error ? error.message : 'unknown error'}`)
    }
  }

  return decrypted
}

/**
 * Decrypt array of codes
 */
async function decryptCodes(encrypted: any[], key: CryptoKey): Promise<StoredCode[]> {
  const decrypted: StoredCode[] = []

  for (const item of encrypted) {
    const encCode = item as EncryptedStoredCode

    try {
      // Decrypt code
      const code = encCode.code?.ciphertext
        ? await decrypt(encCode.code, key)
        : encCode.code as any

      decrypted.push({
        code,
        timestamp: encCode.timestamp,
        source: encCode.source,
        siteMatch: encCode.siteMatch,
        used: encCode.used,
        mailboxId: encCode.mailboxId
      })
    } catch (error) {
      console.error(`[Migration] Failed to decrypt code from ${encCode.source}:`, error)
      // Continue with other codes, log error but don't fail migration
      console.warn(`[Migration] Skipping code from ${encCode.source} due to decryption error`)
    }
  }

  return decrypted
}

/**
 * Skip migration and clear encrypted data (data loss warning given to user)
 */
export async function skipMigration(): Promise<void> {
  console.log('[Migration] Skipping migration, clearing all encryption-related data...')

  await chrome.storage.local.remove([
    'lockState',
    'masterKeySalt',
    'keyVerification',
    'lastUnlockedAt',
    'autoLockTimeout',
    STORAGE_KEYS.MAILBOXES, // Remove old encrypted mailboxes
    STORAGE_KEYS.RECENT_CODES, // Remove old encrypted codes
    'migration_backup'
  ])

  await chrome.storage.sync.remove(['lockEnabled', 'lockTimeoutMinutes'])

  console.log('[Migration] All encryption-related data cleared')
}
