// seen-message-store.ts
// InboxKey - Persistent Duplicate Suppression with Outcome-Aware TTL
// -----------------------------------------------------------------------------
// Stores seen message IDs in chrome.storage.session with per-entry TTL.
// Survives across EmailPollingService instance lifetimes (within a browser
// session) so the same email is never re-processed even when the service
// worker restarts and creates a fresh EmailPollingService.
//
// Outcome-aware TTL (fixes the "tightened extractor doesn't take effect for
// 24h" trap):
//   - HIT_TTL_MS  (24h): a candidate (OTP or magic link) was extracted.
//                        Long TTL prevents re-shipping the same code/link
//                        to the user on every subsequent poll.
//   - MISS_TTL_MS (5min): no candidate was found. Short TTL allows fast
//                         retry if extraction heuristics change between
//                         polls (extension upgrade, version bump, etc.).
//
// Callers should also stamp the EXTRACTOR_VERSION constant into the seen
// key so a version bump invalidates cached miss entries immediately rather
// than waiting for them to age out naturally.
// -----------------------------------------------------------------------------

const STORAGE_KEY = 'inboxkey.seen_messages'

/** TTL for messages where extraction succeeded (a code or link was found). */
export const HIT_TTL_MS = 24 * 60 * 60 * 1000

/** TTL for messages where extraction returned no candidate. */
export const MISS_TTL_MS = 5 * 60 * 1000

interface SeenEntry {
  /** Epoch ms when the entry was recorded. */
  ts: number
  /** TTL applied to this entry (HIT_TTL_MS or MISS_TTL_MS). */
  ttl: number
}

/**
 * Persistent duplicate suppression for email message IDs with per-entry TTL.
 * Stores Map<messageId, SeenEntry> in chrome.storage.session.
 * Prunes expired entries on each write.
 */
export class SeenMessageStore {
  private entries: Map<string, SeenEntry> = new Map()
  private loaded = false

  /**
   * Load persisted entries from chrome.storage.session.
   * Idempotent: no-op if already loaded.
   *
   * Backward-compatible with the pre-TTL-aware storage shape, where each
   * entry was just a timestamp. Legacy entries are treated as HIT_TTL_MS
   * (the previous global TTL) so an upgrade doesn't re-show codes the
   * user already saw.
   */
  async load(): Promise<void> {
    if (this.loaded) return

    try {
      const result = await chrome.storage.session.get(STORAGE_KEY)
      const raw = result[STORAGE_KEY]
      if (typeof raw === 'string') {
        const pairs: Array<[string, number | SeenEntry]> = JSON.parse(raw)
        const now = Date.now()
        for (const [id, value] of pairs) {
          const entry: SeenEntry = typeof value === 'number'
            ? { ts: value, ttl: HIT_TTL_MS }
            : value
          if (now - entry.ts < entry.ttl) {
            this.entries.set(id, entry)
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
   * Check whether a message ID has been seen and is still within its TTL.
   * Lazy-loads from storage on first call.
   */
  async hasSeen(messageId: string): Promise<boolean> {
    await this.load()
    const entry = this.entries.get(messageId)
    if (!entry) return false
    // Enforce TTL inline (handles entries that aged out after load)
    if (Date.now() - entry.ts >= entry.ttl) {
      this.entries.delete(messageId)
      return false
    }
    return true
  }

  /**
   * Mark a single message ID as seen with the given TTL and persist
   * immediately. Callers pick HIT_TTL_MS for messages that produced a
   * candidate and MISS_TTL_MS for messages that did not.
   */
  async add(messageId: string, ttl: number): Promise<void> {
    await this.load()
    this.entries.set(messageId, { ts: Date.now(), ttl })
    await this.persist()
  }

  /**
   * Mark multiple message IDs as seen with the same TTL in a single
   * write. More efficient than calling add() in a loop.
   */
  async addBatch(messageIds: string[], ttl: number): Promise<void> {
    await this.load()
    const now = Date.now()
    for (const id of messageIds) {
      this.entries.set(id, { ts: now, ttl })
    }
    await this.persist()
  }

  /**
   * Prune expired entries and write the current set to storage.
   */
  private async persist(): Promise<void> {
    const now = Date.now()
    for (const [id, entry] of this.entries) {
      if (now - entry.ts >= entry.ttl) {
        this.entries.delete(id)
      }
    }
    const serialized = JSON.stringify([...this.entries.entries()])
    await chrome.storage.session.set({ [STORAGE_KEY]: serialized })
  }
}
