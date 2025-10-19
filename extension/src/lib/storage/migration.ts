/**
 * Storage migration utilities (STUB - to be removed in Phase 3)
 *
 * This file exists temporarily to maintain compatibility during Phase 1.
 * It will be properly implemented in Phase 3 (Migration).
 */

export interface MigrationResult {
  success: boolean
  error?: string
  mailboxesMigrated: number
  codesMigrated: number
}

/**
 * Stub function - to be implemented in Phase 3
 */
export async function migrateToEncrypted(password: string): Promise<MigrationResult> {
  throw new Error('migrateToEncrypted not yet implemented - Phase 3')
}

/**
 * Stub function - to be implemented in Phase 3
 */
export async function migrateToPlaintext(password: string): Promise<MigrationResult> {
  throw new Error('migrateToPlaintext not yet implemented - Phase 3')
}
