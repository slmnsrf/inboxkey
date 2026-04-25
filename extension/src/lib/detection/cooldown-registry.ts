/**
 * Cooldown Registry
 *
 * Layer 1 of 4-layer defense-in-depth for field detection.
 * Prevents duplicate detection on the same field within a time window.
 *
 * Performance Budget: <0.05ms per lookup
 *
 * Architecture:
 * - WeakMap for fast lookup (auto-cleanup when DOM element removed)
 * - Map for persistence across DOM mutations (keyed by stable XPath)
 * - Dual cooldown durations:
 *   - Rejected: 60s (never retry password fields)
 *   - Detected: 30s (allow re-detection after session)
 */

/**
 * Cooldown entry tracking when a field was marked and when it expires
 */
interface CooldownEntry {
  /** Stable identifier for the field (XPath or data attribute) */
  fieldKey: string;
  /** Epoch timestamp (ms) when cooldown expires */
  expiresAt: number;
  /** Reason for cooldown */
  reason: 'rejected' | 'detected';
}

/**
 * Cooldown duration constants (milliseconds)
 */
const COOLDOWN_DURATIONS = {
  /** Password fields should never be retried (60 seconds) */
  rejected: 60_000,
  /** Detected fields can be re-checked after session ends (30 seconds) */
  detected: 30_000,
} as const;

/**
 * Public API for cooldown registry
 */
export interface CooldownRegistry {
  /**
   * Check if a field is currently in cooldown period
   * @param field - Input field to check
   * @returns true if field should be skipped (in cooldown)
   */
  isInCooldown(field: HTMLInputElement): boolean;

  /**
   * Mark a field as rejected (e.g., password field)
   * Sets 60s cooldown to prevent re-checking
   * @param field - Input field to mark as rejected
   */
  markRejected(field: HTMLInputElement): void;

  /**
   * Mark a field as detected (verification code found)
   * Sets 30s cooldown to prevent duplicate detections
   * @param field - Input field to mark as detected
   */
  markDetected(field: HTMLInputElement): void;

  /**
   * Remove expired cooldown entries
   * Should be called periodically to prevent memory growth
   */
  cleanup(): void;

  /**
   * Drop the cooldown entry for a single field. Used by session
   * cleanup so a resend / retry on the same DOM input can be
   * re-detected without waiting for the natural cooldown TTL.
   * @param field - Input field to forget
   */
  forget(field: HTMLInputElement): void;
}

/**
 * Generate stable key for a field that persists across DOM mutations
 * Uses XPath to uniquely identify the field's position in the DOM tree
 *
 * @param field - Input field to generate key for
 * @returns Stable string identifier
 */
function generateFieldKey(field: HTMLInputElement): string {
  // Try data attribute first (most stable if present)
  if (field.dataset.inboxkeyId) {
    return `data:${field.dataset.inboxkeyId}`;
  }

  // Fall back to XPath (stable across most DOM mutations)
  const parts: string[] = [];
  let node: Node | null = field;

  while (node && node !== document.body) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      let index = 1;
      let sibling = element.previousSibling;

      // Count preceding siblings of same type
      while (sibling) {
        if (
          sibling.nodeType === Node.ELEMENT_NODE &&
          sibling.nodeName === element.nodeName
        ) {
          index++;
        }
        sibling = sibling.previousSibling;
      }

      parts.unshift(`${element.nodeName.toLowerCase()}[${index}]`);
    }
    node = node.parentNode;
  }

  return `xpath:/${parts.join('/')}`;
}

/**
 * Create a new cooldown registry instance
 *
 * Implementation uses dual storage:
 * - WeakMap: Fast lookup, auto-cleanup when elements removed from DOM
 * - Map: Persistence across DOM mutations, requires manual cleanup
 *
 * @returns CooldownRegistry instance
 */
export function createCooldownRegistry(): CooldownRegistry {
  // Fast lookup by element reference (auto-cleanup)
  const weakCache = new WeakMap<HTMLInputElement, CooldownEntry>();

  // Persistent storage by field key (manual cleanup required)
  const persistentCache = new Map<string, CooldownEntry>();

  /**
   * Get current time (extracted for testability)
   */
  const now = () => Date.now();

  /**
   * Check if entry is still valid (not expired)
   */
  const isValid = (entry: CooldownEntry): boolean => {
    return entry.expiresAt > now();
  };

  /**
   * Store entry in both caches
   */
  const storeEntry = (
    field: HTMLInputElement,
    entry: CooldownEntry
  ): void => {
    weakCache.set(field, entry);
    persistentCache.set(entry.fieldKey, entry);
  };

  return {
    isInCooldown(field: HTMLInputElement): boolean {
      // Fast path: check WeakMap first
      const weakEntry = weakCache.get(field);
      if (weakEntry && isValid(weakEntry)) {
        return true;
      }

      // Slow path: check persistent storage (handles DOM mutations)
      const fieldKey = generateFieldKey(field);
      const persistentEntry = persistentCache.get(fieldKey);

      if (!persistentEntry) {
        return false;
      }

      // Check if still valid
      if (isValid(persistentEntry)) {
        // Restore to WeakMap for future fast lookups
        weakCache.set(field, persistentEntry);
        return true;
      }

      // Expired - clean up
      persistentCache.delete(fieldKey);
      return false;
    },

    markRejected(field: HTMLInputElement): void {
      const fieldKey = generateFieldKey(field);
      const entry: CooldownEntry = {
        fieldKey,
        expiresAt: now() + COOLDOWN_DURATIONS.rejected,
        reason: 'rejected',
      };
      storeEntry(field, entry);
    },

    markDetected(field: HTMLInputElement): void {
      const fieldKey = generateFieldKey(field);
      const entry: CooldownEntry = {
        fieldKey,
        expiresAt: now() + COOLDOWN_DURATIONS.detected,
        reason: 'detected',
      };
      storeEntry(field, entry);
    },

    cleanup(): void {
      const currentTime = now();
      const toDelete: string[] = [];

      // Find expired entries
      persistentCache.forEach((entry, key) => {
        if (entry.expiresAt <= currentTime) {
          toDelete.push(key);
        }
      });

      // Remove expired entries
      toDelete.forEach((key) => {
        persistentCache.delete(key);
      });
    },

    forget(field: HTMLInputElement): void {
      // Both caches must drop the entry. WeakMap delete is the fast
      // path; persistentCache requires the field key.
      weakCache.delete(field);
      const fieldKey = generateFieldKey(field);
      persistentCache.delete(fieldKey);
    },
  };
}
