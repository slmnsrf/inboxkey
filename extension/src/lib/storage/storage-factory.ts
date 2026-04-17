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
   * Singleton PlaintextStorage instance. Every caller (popup, service
   * worker, content script, telemetry writes, blacklist mutators) must
   * share the same instance for the PlaintextStorage mutex to provide
   * real cross-caller serialization. Returning `new PlaintextStorage()`
   * per call gave every caller its own mutex - no serialization at all.
   */
  private static instance: IStorage | null = null

  static async create(): Promise<IStorage> {
    if (!this.instance) {
      this.instance = new PlaintextStorage()
    }
    return this.instance
  }

  static createSync(): IStorage {
    if (!this.instance) {
      this.instance = new PlaintextStorage()
    }
    return this.instance
  }
}
