import { KeyManager } from '../crypto/key-manager'
import { encrypt, decrypt } from '../crypto/encryption'
import { deriveKey } from '../crypto/encryption'
import { StorageError } from './errors'
import { STORAGE_KEYS } from './schema'
import type { Mailbox, StoredCode } from './schema'

/**
 * Result of a migration operation
 */
interface MigrationResult {
  success: boolean
  mailboxesMigrated: number
  codesMigrated: number
  error?: string
}

/**
 * Backup data structure
 */
interface BackupData {
  [key: string]: any
}

/**
 * Migrates data from plaintext to encrypted storage
 *
 * @param password - Password to derive encryption key from
 * @returns Migration result with counts and status
 * @throws StorageError if migration fails and rollback is unsuccessful
 */
export async function migrateToEncrypted(password: string): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: false,
    mailboxesMigrated: 0,
    codesMigrated: 0,
  }

  let backup: BackupData = {}
  let encryptionKey: CryptoKey | null = null

  try {
    // Validate password
    if (!password || password.trim().length === 0) {
      throw new StorageError('Password cannot be empty', 'INVALID_INPUT')
    }

    // Derive encryption key from password
    try {
      encryptionKey = await deriveKey(password)
    } catch (error) {
      throw new StorageError(
        'Failed to derive encryption key from password',
        'ENCRYPTION_ERROR',
        error
      )
    }

    // Create backup of source data before migration
    const backupKeys = [STORAGE_KEYS.MAILBOXES_PLAIN, STORAGE_KEYS.RECENT_CODES_PLAIN]
    backup = await createBackup(backupKeys)

    // Read plaintext data
    const plaintextData = await chrome.storage.local.get([
      STORAGE_KEYS.MAILBOXES_PLAIN,
      STORAGE_KEYS.RECENT_CODES_PLAIN,
    ])

    const mailboxes: Mailbox[] = plaintextData[STORAGE_KEYS.MAILBOXES_PLAIN] || []
    const recentCodes: StoredCode[] = plaintextData[STORAGE_KEYS.RECENT_CODES_PLAIN] || []

    // Validate data integrity before migration
    if (!Array.isArray(mailboxes)) {
      throw new StorageError('Invalid mailboxes data structure', 'INVALID_DATA')
    }
    if (!Array.isArray(recentCodes)) {
      throw new StorageError('Invalid recent codes data structure', 'INVALID_DATA')
    }

    // Encrypt mailboxes
    const encryptedMailboxes: Mailbox[] = []
    for (const mailbox of mailboxes) {
      try {
        const encryptedMailbox: Mailbox = {
          ...mailbox,
          imap: mailbox.imap ? {
            ...mailbox.imap,
            password: await encrypt(mailbox.imap.password, encryptionKey),
          } : undefined,
          smtp: mailbox.smtp ? {
            ...mailbox.smtp,
            password: await encrypt(mailbox.smtp.password, encryptionKey),
          } : undefined,
        }
        encryptedMailboxes.push(encryptedMailbox)
        result.mailboxesMigrated++
      } catch (error) {
        throw new StorageError(
          `Failed to encrypt mailbox: ${mailbox.email}`,
          'ENCRYPTION_ERROR',
          error
        )
      }
    }

    // Encrypt recent codes
    const encryptedCodes: StoredCode[] = []
    for (const code of recentCodes) {
      try {
        const encryptedCode: StoredCode = {
          ...code,
          code: await encrypt(code.code, encryptionKey),
        }
        encryptedCodes.push(encryptedCode)
        result.codesMigrated++
      } catch (error) {
        throw new StorageError(
          `Failed to encrypt code from: ${code.from}`,
          'ENCRYPTION_ERROR',
          error
        )
      }
    }

    // Validate migration before committing
    if (!validateMigration(mailboxes, encryptedMailboxes)) {
      throw new StorageError('Mailbox migration validation failed', 'VALIDATION_ERROR')
    }
    if (!validateMigration(recentCodes, encryptedCodes)) {
      throw new StorageError('Codes migration validation failed', 'VALIDATION_ERROR')
    }

    // Write encrypted data (atomic operation)
    try {
      await chrome.storage.local.set({
        [STORAGE_KEYS.MAILBOXES]: encryptedMailboxes,
        [STORAGE_KEYS.RECENT_CODES]: encryptedCodes,
      })
    } catch (error) {
      throw new StorageError(
        'Failed to write encrypted data to storage',
        'STORAGE_WRITE_ERROR',
        error
      )
    }

    // Delete plaintext keys on success
    try {
      await chrome.storage.local.remove([
        STORAGE_KEYS.MAILBOXES_PLAIN,
        STORAGE_KEYS.RECENT_CODES_PLAIN,
      ])
    } catch (error) {
      // Non-critical error - encrypted data is already saved
      console.error('Warning: Failed to delete plaintext keys after migration:', error)
    }

    result.success = true
    return result

  } catch (error) {
    // Rollback on failure
    result.error = error instanceof Error ? error.message : 'Unknown error during migration'
    console.error('Migration to encrypted failed, attempting rollback:', error)

    try {
      await restoreBackup(backup)
      console.log('Rollback successful')
    } catch (rollbackError) {
      console.error('Rollback failed:', rollbackError)
      throw new StorageError(
        'Migration failed and rollback unsuccessful. Data may be in inconsistent state.',
        'MIGRATION_ROLLBACK_FAILED',
        rollbackError
      )
    }

    return result
  }
}

/**
 * Migrates data from encrypted to plaintext storage
 *
 * @param password - Password to decrypt data
 * @returns Migration result with counts and status
 * @throws StorageError if migration fails and rollback is unsuccessful
 */
export async function migrateToPlaintext(password: string): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: false,
    mailboxesMigrated: 0,
    codesMigrated: 0,
  }

  let backup: BackupData = {}
  let encryptionKey: CryptoKey | null = null

  try {
    // Validate password
    if (!password || password.trim().length === 0) {
      throw new StorageError('Password cannot be empty', 'INVALID_INPUT')
    }

    // Derive encryption key from password
    try {
      encryptionKey = await deriveKey(password)
    } catch (error) {
      throw new StorageError(
        'Failed to derive encryption key from password',
        'ENCRYPTION_ERROR',
        error
      )
    }

    // Create backup of source data before migration
    const backupKeys = [STORAGE_KEYS.MAILBOXES, STORAGE_KEYS.RECENT_CODES]
    backup = await createBackup(backupKeys)

    // Read encrypted data
    const encryptedData = await chrome.storage.local.get([
      STORAGE_KEYS.MAILBOXES,
      STORAGE_KEYS.RECENT_CODES,
    ])

    const mailboxes: Mailbox[] = encryptedData[STORAGE_KEYS.MAILBOXES] || []
    const recentCodes: StoredCode[] = encryptedData[STORAGE_KEYS.RECENT_CODES] || []

    // Validate data integrity before migration
    if (!Array.isArray(mailboxes)) {
      throw new StorageError('Invalid mailboxes data structure', 'INVALID_DATA')
    }
    if (!Array.isArray(recentCodes)) {
      throw new StorageError('Invalid recent codes data structure', 'INVALID_DATA')
    }

    // Verify password is correct by attempting to decrypt first mailbox
    if (mailboxes.length > 0 && mailboxes[0].imap) {
      try {
        await decrypt(mailboxes[0].imap.password, encryptionKey)
      } catch (error) {
        throw new StorageError(
          'Incorrect password or corrupted data',
          'DECRYPTION_ERROR',
          error
        )
      }
    }

    // Decrypt mailboxes
    const decryptedMailboxes: Mailbox[] = []
    for (const mailbox of mailboxes) {
      try {
        const decryptedMailbox: Mailbox = {
          ...mailbox,
          imap: mailbox.imap ? {
            ...mailbox.imap,
            password: await decrypt(mailbox.imap.password, encryptionKey),
          } : undefined,
          smtp: mailbox.smtp ? {
            ...mailbox.smtp,
            password: await decrypt(mailbox.smtp.password, encryptionKey),
          } : undefined,
        }
        decryptedMailboxes.push(decryptedMailbox)
        result.mailboxesMigrated++
      } catch (error) {
        throw new StorageError(
          `Failed to decrypt mailbox: ${mailbox.email}`,
          'DECRYPTION_ERROR',
          error
        )
      }
    }

    // Decrypt recent codes
    const decryptedCodes: StoredCode[] = []
    for (const code of recentCodes) {
      try {
        const decryptedCode: StoredCode = {
          ...code,
          code: await decrypt(code.code, encryptionKey),
        }
        decryptedCodes.push(decryptedCode)
        result.codesMigrated++
      } catch (error) {
        throw new StorageError(
          `Failed to decrypt code from: ${code.from}`,
          'DECRYPTION_ERROR',
          error
        )
      }
    }

    // Validate migration before committing
    if (!validateMigration(mailboxes, decryptedMailboxes)) {
      throw new StorageError('Mailbox migration validation failed', 'VALIDATION_ERROR')
    }
    if (!validateMigration(recentCodes, decryptedCodes)) {
      throw new StorageError('Codes migration validation failed', 'VALIDATION_ERROR')
    }

    // Write plaintext data (atomic operation)
    try {
      await chrome.storage.local.set({
        [STORAGE_KEYS.MAILBOXES_PLAIN]: decryptedMailboxes,
        [STORAGE_KEYS.RECENT_CODES_PLAIN]: decryptedCodes,
      })
    } catch (error) {
      throw new StorageError(
        'Failed to write plaintext data to storage',
        'STORAGE_WRITE_ERROR',
        error
      )
    }

    // Delete encrypted keys on success
    try {
      await chrome.storage.local.remove([
        STORAGE_KEYS.MAILBOXES,
        STORAGE_KEYS.RECENT_CODES,
      ])
    } catch (error) {
      // Non-critical error - plaintext data is already saved
      console.error('Warning: Failed to delete encrypted keys after migration:', error)
    }

    result.success = true
    return result

  } catch (error) {
    // Rollback on failure
    result.error = error instanceof Error ? error.message : 'Unknown error during migration'
    console.error('Migration to plaintext failed, attempting rollback:', error)

    try {
      await restoreBackup(backup)
      console.log('Rollback successful')
    } catch (rollbackError) {
      console.error('Rollback failed:', rollbackError)
      throw new StorageError(
        'Migration failed and rollback unsuccessful. Data may be in inconsistent state.',
        'MIGRATION_ROLLBACK_FAILED',
        rollbackError
      )
    }

    return result
  }
}

/**
 * Creates a backup of specified storage keys
 *
 * @param keys - Storage keys to backup
 * @returns Backup data object
 */
async function createBackup(keys: string[]): Promise<BackupData> {
  try {
    const data = await chrome.storage.local.get(keys)
    return data
  } catch (error) {
    throw new StorageError(
      'Failed to create backup',
      'BACKUP_ERROR',
      error
    )
  }
}

/**
 * Restores data from backup
 *
 * @param backup - Backup data to restore
 */
async function restoreBackup(backup: BackupData): Promise<void> {
  try {
    // Only restore if backup has data
    if (Object.keys(backup).length > 0) {
      await chrome.storage.local.set(backup)
    }
  } catch (error) {
    throw new StorageError(
      'Failed to restore backup',
      'RESTORE_ERROR',
      error
    )
  }
}

/**
 * Validates that migration preserved data integrity
 *
 * @param source - Source data array
 * @param destination - Destination data array
 * @returns True if validation passes
 */
function validateMigration(source: any[], destination: any[]): boolean {
  // Check array lengths match
  if (source.length !== destination.length) {
    console.error('Validation failed: Array length mismatch', {
      sourceLength: source.length,
      destinationLength: destination.length,
    })
    return false
  }

  // Check that all items have corresponding items in destination
  for (let i = 0; i < source.length; i++) {
    const sourceItem = source[i]
    const destItem = destination[i]

    // Validate basic structure preservation
    if (!sourceItem || !destItem) {
      console.error('Validation failed: Missing item at index', i)
      return false
    }

    // For mailboxes, check email matches
    if (sourceItem.email && destItem.email) {
      if (sourceItem.email !== destItem.email) {
        console.error('Validation failed: Email mismatch at index', i)
        return false
      }
    }

    // For codes, check timestamp matches
    if (sourceItem.timestamp && destItem.timestamp) {
      if (sourceItem.timestamp !== destItem.timestamp) {
        console.error('Validation failed: Timestamp mismatch at index', i)
        return false
      }
    }
  }

  return true
}
