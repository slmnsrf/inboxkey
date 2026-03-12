// seen-message-store.ts
// InboxKey - Persistent Duplicate Suppression
// -----------------------------------------------------------------------------
// Stores seen message IDs in chrome.storage.session with a 24-hour TTL.
// Survives across EmailPollingService instance lifetimes (within a browser
// session) so the same email is never re-processed even when the service
// worker restarts and creates a fresh EmailPollingService.
// -----------------------------------------------------------------------------

const STORAGE_KEY = 'inboxkey.seen_messages'
const TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

/**
 * Persistent duplicate suppression for email message IDs.
 * Stores Map<messageId, timestamp> in chrome.storage.session.
 * Prunes entries older than 24 hours on each write.
 */
export class SeenMessageStore {
  private entries: Map<string, number> = new Map()
  private loaded = false

  /**
   * Load persisted entries from chrome.storage.session.
   * Idempotent: no-op if already loaded.
   */
  async load(): Promise<void> {
    if (this.loaded) return

    try {
      const result = await chrome.storage.session.get(STORAGE_KEY)
      const raw = result[STORAGE_KEY]
      if (typeof raw === 'string') {
        const pairs: [string, number][] = JSON.parse(raw)
        const now = Date.now()
        for (const [id, ts] of pairs) {
          if (now - ts < TTL_MS) {
            this.entries.set(id, ts)
          }
        }
      }
    } catch {
      // Start fresh on parse error - better to re-process than to crash
      this.entries.clear()
    }
    this.loaded = true
  }

  /**
   * Check whether a message ID has been seen within the TTL window.
   * Lazy-loads from storage on first call.
   */
  async hasSeen(messageId: string): Promise<boolean> {
    await this.load()
    const ts = this.entries.get(messageId)
    if (ts === undefined) return false
    // Enforce TTL inline (handles entries that aged out after load)
    if (Date.now() - ts >= TTL_MS) {
      this.entries.delete(messageId)
      return false
    }
    return true
  }

  /**
   * Mark a single message ID as seen and persist immediately.
   */
  async add(messageId: string): Promise<void> {
    await this.load()
    this.entries.set(messageId, Date.now())
    await this.persist()
  }

  /**
   * Mark multiple message IDs as seen in a single write.
   * More efficient than calling add() in a loop.
   */
  async addBatch(messageIds: string[]): Promise<void> {
    await this.load()
    const now = Date.now()
    for (const id of messageIds) {
      this.entries.set(id, now)
    }
    await this.persist()
  }

  /**
   * Prune expired entries and write the current set to storage.
   */
  private async persist(): Promise<void> {
    const now = Date.now()
    for (const [id, ts] of this.entries) {
      if (now - ts >= TTL_MS) {
        this.entries.delete(id)
      }
    }
    const serialized = JSON.stringify([...this.entries.entries()])
    await chrome.storage.session.set({ [STORAGE_KEY]: serialized })
  }
}
