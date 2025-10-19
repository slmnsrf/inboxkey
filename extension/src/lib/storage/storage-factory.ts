/**
 * Storage Factory
 *
 * Factory pattern for creating storage instances.
 * Always returns PlaintextStorage as the lock/unlock feature has been removed.
 *
 * Thread Safety:
 * - Safe for concurrent calls within the same service worker context
 *
 * @example
 * const storage = await StorageFactory.create()
 * await storage.addMailbox(mailbox)
 */

import type { IStorage } from './storage-interface'
import { PlaintextStorage } from './plaintext-storage'

export class StorageFactory {
  /**
   * Create a storage instance
   *
   * Returns PlaintextStorage (the only storage implementation).
   *
   * @returns Promise resolving to PlaintextStorage instance
   *
   * @example
   * const storage = await StorageFactory.create()
   * await storage.addMailbox(mailbox)
   */
  static async create(): Promise<IStorage> {
    return new PlaintextStorage()
  }

  /**
   * Create storage instance synchronously
   *
   * @returns PlaintextStorage instance
   *
   * @example
   * const storage = StorageFactory.createSync()
   * await storage.addMailbox(mailbox)
   */
  static createSync(): IStorage {
    return new PlaintextStorage()
  }
}
