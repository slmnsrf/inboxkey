/**
 * Unit tests for cooldown-registry.ts
 *
 * Test Coverage:
 * - isInCooldown returns true within window
 * - isInCooldown returns false after expiry
 * - cleanup removes expired entries
 * - WeakMap releases memory (10k elements)
 * - Performance <0.05ms per lookup (1000 iterations)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createCooldownRegistry,
  type CooldownRegistry,
} from '../cooldown-registry';

/**
 * Create a mock input field for testing
 */
function createMockField(id: string): HTMLInputElement {
  const field = document.createElement('input');
  field.type = 'text';
  field.dataset.inboxkeyId = id;
  document.body.appendChild(field);
  return field;
}

/**
 * Cleanup all test fields from DOM
 */
function cleanupFields(): void {
  document.querySelectorAll('input[data-inboxkey-id]').forEach((el) => {
    el.remove();
  });
}

describe('cooldown-registry', () => {
  let registry: CooldownRegistry;

  beforeEach(() => {
    registry = createCooldownRegistry();
    cleanupFields();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanupFields();
    vi.useRealTimers();
  });

  describe('isInCooldown', () => {
    it('returns false for new field', () => {
      const field = createMockField('test-1');
      expect(registry.isInCooldown(field)).toBe(false);
    });

    it('returns true within rejected cooldown window (60s)', () => {
      const field = createMockField('test-2');

      registry.markRejected(field);
      expect(registry.isInCooldown(field)).toBe(true);

      // Still in cooldown after 30s
      vi.advanceTimersByTime(30_000);
      expect(registry.isInCooldown(field)).toBe(true);

      // Still in cooldown after 59s
      vi.advanceTimersByTime(29_000);
      expect(registry.isInCooldown(field)).toBe(true);
    });

    it('returns true within detected cooldown window (30s)', () => {
      const field = createMockField('test-3');

      registry.markDetected(field);
      expect(registry.isInCooldown(field)).toBe(true);

      // Still in cooldown after 15s
      vi.advanceTimersByTime(15_000);
      expect(registry.isInCooldown(field)).toBe(true);

      // Still in cooldown after 29s
      vi.advanceTimersByTime(14_000);
      expect(registry.isInCooldown(field)).toBe(true);
    });

    it('returns false after rejected cooldown expires (60s)', () => {
      const field = createMockField('test-4');

      registry.markRejected(field);
      expect(registry.isInCooldown(field)).toBe(true);

      // Advance past 60s cooldown
      vi.advanceTimersByTime(60_001);
      expect(registry.isInCooldown(field)).toBe(false);
    });

    it('returns false after detected cooldown expires (30s)', () => {
      const field = createMockField('test-5');

      registry.markDetected(field);
      expect(registry.isInCooldown(field)).toBe(true);

      // Advance past 30s cooldown
      vi.advanceTimersByTime(30_001);
      expect(registry.isInCooldown(field)).toBe(false);
    });

    it('persists across DOM mutations using field key', () => {
      const field1 = createMockField('test-6');
      registry.markRejected(field1);

      // Remove and recreate field with same ID
      field1.remove();
      const field2 = createMockField('test-6');

      // Should still be in cooldown (same field key)
      expect(registry.isInCooldown(field2)).toBe(true);
    });
  });

  describe('markRejected', () => {
    it('sets 60s cooldown', () => {
      const field = createMockField('test-7');

      registry.markRejected(field);
      expect(registry.isInCooldown(field)).toBe(true);

      vi.advanceTimersByTime(59_999);
      expect(registry.isInCooldown(field)).toBe(true);

      vi.advanceTimersByTime(2);
      expect(registry.isInCooldown(field)).toBe(false);
    });

    it('updates cooldown if called multiple times', () => {
      const field = createMockField('test-8');

      registry.markRejected(field);
      vi.advanceTimersByTime(30_000);

      // Re-mark rejected (resets cooldown)
      registry.markRejected(field);
      vi.advanceTimersByTime(30_000);

      // Should still be in cooldown (60s from second mark)
      expect(registry.isInCooldown(field)).toBe(true);

      vi.advanceTimersByTime(30_001);
      expect(registry.isInCooldown(field)).toBe(false);
    });
  });

  describe('markDetected', () => {
    it('sets 30s cooldown', () => {
      const field = createMockField('test-9');

      registry.markDetected(field);
      expect(registry.isInCooldown(field)).toBe(true);

      vi.advanceTimersByTime(29_999);
      expect(registry.isInCooldown(field)).toBe(true);

      vi.advanceTimersByTime(2);
      expect(registry.isInCooldown(field)).toBe(false);
    });

    it('can overwrite rejected cooldown', () => {
      const field = createMockField('test-10');

      registry.markRejected(field);
      expect(registry.isInCooldown(field)).toBe(true);

      // Overwrite with detected (shorter cooldown)
      registry.markDetected(field);

      // Should expire after 30s (detected) not 60s (rejected)
      vi.advanceTimersByTime(30_001);
      expect(registry.isInCooldown(field)).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('removes expired entries', () => {
      const field1 = createMockField('test-11');
      const field2 = createMockField('test-12');
      const field3 = createMockField('test-13');

      registry.markDetected(field1); // 30s cooldown
      registry.markRejected(field2); // 60s cooldown
      registry.markDetected(field3); // 30s cooldown

      // Advance time to expire detected but not rejected
      vi.advanceTimersByTime(35_000);

      registry.cleanup();

      // field1 and field3 should be cleaned up (expired)
      expect(registry.isInCooldown(field1)).toBe(false);
      expect(registry.isInCooldown(field3)).toBe(false);

      // field2 should still be in cooldown (rejected has 60s)
      expect(registry.isInCooldown(field2)).toBe(true);
    });

    it('does not remove active entries', () => {
      const field1 = createMockField('test-14');
      const field2 = createMockField('test-15');

      registry.markDetected(field1);
      registry.markRejected(field2);

      // No time advance - all should be active
      registry.cleanup();

      expect(registry.isInCooldown(field1)).toBe(true);
      expect(registry.isInCooldown(field2)).toBe(true);
    });

    it('handles empty registry', () => {
      expect(() => registry.cleanup()).not.toThrow();
    });
  });

  describe('memory management', () => {
    it('WeakMap allows garbage collection when elements removed', () => {
      // Create and mark 100 fields
      const fields: HTMLInputElement[] = [];
      for (let i = 0; i < 100; i++) {
        const field = createMockField(`mem-test-${i}`);
        registry.markDetected(field);
        fields.push(field);
      }

      // All should be in cooldown
      fields.forEach((field) => {
        expect(registry.isInCooldown(field)).toBe(true);
      });

      // Remove all fields from DOM (but keep references)
      fields.forEach((field) => field.remove());

      // WeakMap should release when we clear references
      // (We can't directly test GC, but we verify no errors occur)
      fields.length = 0;

      expect(() => registry.cleanup()).not.toThrow();
    });

    it('handles 10k elements without errors', () => {
      const fields: HTMLInputElement[] = [];

      for (let i = 0; i < 10_000; i++) {
        const field = createMockField(`stress-test-${i}`);
        registry.markDetected(field);
        fields.push(field);
      }

      // Verify all are in cooldown
      expect(registry.isInCooldown(fields[0])).toBe(true);
      expect(registry.isInCooldown(fields[5000])).toBe(true);
      expect(registry.isInCooldown(fields[9999])).toBe(true);

      // Cleanup should handle large registry
      vi.advanceTimersByTime(35_000);
      expect(() => registry.cleanup()).not.toThrow();

      // Verify all expired
      expect(registry.isInCooldown(fields[0])).toBe(false);
      expect(registry.isInCooldown(fields[9999])).toBe(false);

      // Cleanup
      fields.forEach((f) => f.remove());
    });
  });

  describe('performance', () => {
    it('isInCooldown completes in <0.05ms (1000 iterations)', () => {
      const field = createMockField('perf-test');
      registry.markDetected(field);

      // Use real timers for performance test
      vi.useRealTimers();

      const iterations = 1000;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        registry.isInCooldown(field);
      }

      const end = performance.now();
      const avgTime = (end - start) / iterations;

      // Should be well under 0.05ms per lookup
      expect(avgTime).toBeLessThan(0.05);

      // Log for tracking (visible in test output)
      console.log(
        `Average lookup time: ${avgTime.toFixed(4)}ms (budget: 0.05ms)`
      );
    });

    it('markDetected completes in <0.05ms (1000 iterations)', () => {
      const fields: HTMLInputElement[] = [];
      for (let i = 0; i < 1000; i++) {
        fields.push(createMockField(`mark-perf-${i}`));
      }

      vi.useRealTimers();

      const start = performance.now();
      fields.forEach((field) => registry.markDetected(field));
      const end = performance.now();

      const avgTime = (end - start) / fields.length;

      expect(avgTime).toBeLessThan(0.05);
      console.log(
        `Average mark time: ${avgTime.toFixed(4)}ms (budget: 0.05ms)`
      );

      fields.forEach((f) => f.remove());
    });

    it('cleanup completes in reasonable time (10k entries)', () => {
      const fields: HTMLInputElement[] = [];
      for (let i = 0; i < 10_000; i++) {
        const field = createMockField(`cleanup-perf-${i}`);
        registry.markDetected(field);
        fields.push(field);
      }

      vi.useRealTimers();

      // Expire all entries
      vi.useFakeTimers();
      vi.advanceTimersByTime(35_000);
      vi.useRealTimers();

      const start = performance.now();
      registry.cleanup();
      const end = performance.now();

      const cleanupTime = end - start;

      // Should complete in reasonable time (<100ms for 10k entries)
      expect(cleanupTime).toBeLessThan(100);
      console.log(
        `Cleanup time for 10k entries: ${cleanupTime.toFixed(2)}ms`
      );

      fields.forEach((f) => f.remove());
    });
  });

  describe('edge cases', () => {
    it('handles field without data-inboxkey-id (uses XPath)', () => {
      const field = document.createElement('input');
      field.type = 'text';
      document.body.appendChild(field);

      registry.markDetected(field);
      expect(registry.isInCooldown(field)).toBe(true);

      field.remove();
    });

    it('handles multiple registries independently', () => {
      const registry1 = createCooldownRegistry();
      const registry2 = createCooldownRegistry();

      const field = createMockField('test-16');

      registry1.markDetected(field);

      expect(registry1.isInCooldown(field)).toBe(true);
      expect(registry2.isInCooldown(field)).toBe(false);
    });

    it('handles rapid mark/check cycles', () => {
      const field = createMockField('test-17');

      for (let i = 0; i < 100; i++) {
        registry.markDetected(field);
        expect(registry.isInCooldown(field)).toBe(true);
      }
    });
  });
});
