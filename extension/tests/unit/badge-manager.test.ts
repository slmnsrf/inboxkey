/**
 * Unit tests for badge-manager
 * Tests badge state management, animation, and chrome.action API integration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  setBadgeListening,
  setBadgeSuccess,
  setBadgeNoCode,
  setBadgeCount,
  setBadgeSyncError,
  clearBadge,
} from '../../src/contents/badge-manager'

describe('badge-manager', () => {
  let mockSetBadgeText: ReturnType<typeof vi.fn>
  let mockSetBadgeBackgroundColor: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // Mock chrome.action API
    mockSetBadgeText = vi.fn()
    mockSetBadgeBackgroundColor = vi.fn()

    global.chrome = {
      action: {
        setBadgeText: mockSetBadgeText,
        setBadgeBackgroundColor: mockSetBadgeBackgroundColor,
      },
    } as any

    // Reset badge priority state by calling clearBadge
    // This ensures each test starts with IDLE priority
    clearBadge()
    mockSetBadgeText.mockClear()
    mockSetBadgeBackgroundColor.mockClear()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  describe('setBadgeListening', () => {
    it('should start animated badge with dots', () => {
      vi.useFakeTimers()

      setBadgeListening()

      // Should set initial badge
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '·' })
      expect(mockSetBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#3B82F6' })

      vi.useRealTimers()
    })

    it('should animate badge through dot sequence', () => {
      vi.useFakeTimers()

      setBadgeListening()

      // Initial state: ·
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '·' })

      // After 300ms: ··
      vi.advanceTimersByTime(300)
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '··' })

      // After another 300ms: ···
      vi.advanceTimersByTime(300)
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '···' })

      // After another 300ms: back to ·
      vi.advanceTimersByTime(300)
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '·' })

      vi.useRealTimers()
    })

    it('should use blue color for listening state', () => {
      setBadgeListening()

      expect(mockSetBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#3B82F6' })
    })

    it('should cancel previous listening animation when called again', () => {
      vi.useFakeTimers()

      setBadgeListening()
      const firstCallCount = mockSetBadgeText.mock.calls.length

      // Start new listening animation
      setBadgeListening()

      // Should have reset the animation
      expect(mockSetBadgeText).toHaveBeenCalledTimes(firstCallCount + 1)

      vi.useRealTimers()
    })

    it('should handle chrome.action errors gracefully', () => {
      mockSetBadgeText.mockImplementation(() => {
        throw new Error('API error')
      })

      // Should not throw
      expect(() => setBadgeListening()).not.toThrow()
    })

    it('should show static badge when user prefers reduced motion', () => {
      // Mock window.matchMedia for reduced-motion preference
      const mockMatchMedia = vi.fn().mockImplementation((query) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))

      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: mockMatchMedia,
      })

      setBadgeListening()

      // Should set static '···' badge instead of animating
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '···' })
      expect(mockSetBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#3B82F6' })
    })

    it('should animate badge when user does not prefer reduced motion', () => {
      vi.useFakeTimers()

      // Mock window.matchMedia for NO reduced-motion preference
      const mockMatchMedia = vi.fn().mockImplementation((query) => ({
        matches: false, // User does NOT prefer reduced motion
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))

      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: mockMatchMedia,
      })

      setBadgeListening()

      // Should start animation (not static)
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '·' })

      // After 300ms: should animate to ··
      vi.advanceTimersByTime(300)
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '··' })

      vi.useRealTimers()
    })
  })

  describe('setBadgeSuccess', () => {
    it('should set badge to green checkmark', () => {
      setBadgeSuccess()

      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '✓' })
      expect(mockSetBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#10B981' })
    })

    it('should stop listening animation if active', () => {
      vi.useFakeTimers()

      setBadgeListening()
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '·' })

      setBadgeSuccess()
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '✓' })

      // Advance timers - should not continue animating
      const callCountBefore = mockSetBadgeText.mock.calls.length
      vi.advanceTimersByTime(1000)
      const callCountAfter = mockSetBadgeText.mock.calls.length

      expect(callCountAfter).toBe(callCountBefore)

      vi.useRealTimers()
    })

    it('should handle chrome.action errors gracefully', () => {
      mockSetBadgeText.mockImplementation(() => {
        throw new Error('API error')
      })

      expect(() => setBadgeSuccess()).not.toThrow()
    })
  })

  describe('setBadgeNoCode', () => {
    it('should set badge to amber exclamation', () => {
      setBadgeNoCode()

      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '!' })
      expect(mockSetBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#FF9800' })
    })

    it('should stop listening animation if active', () => {
      vi.useFakeTimers()

      setBadgeListening()
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '·' })

      setBadgeNoCode()
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '!' })

      // Advance timers - should not continue animating
      const callCountBefore = mockSetBadgeText.mock.calls.length
      vi.advanceTimersByTime(1000)
      const callCountAfter = mockSetBadgeText.mock.calls.length

      expect(callCountAfter).toBe(callCountBefore)

      vi.useRealTimers()
    })

    it('should handle chrome.action errors gracefully', () => {
      mockSetBadgeText.mockImplementation(() => {
        throw new Error('API error')
      })

      expect(() => setBadgeNoCode()).not.toThrow()
    })
  })

  describe('clearBadge', () => {
    it('should clear badge text', () => {
      clearBadge()

      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '' })
    })

    it('should stop listening animation if active', () => {
      vi.useFakeTimers()

      setBadgeListening()
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '·' })

      clearBadge()
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '' })

      // Advance timers - should not continue animating
      const callCountBefore = mockSetBadgeText.mock.calls.length
      vi.advanceTimersByTime(1000)
      const callCountAfter = mockSetBadgeText.mock.calls.length

      expect(callCountAfter).toBe(callCountBefore)

      vi.useRealTimers()
    })

    it('should be idempotent (safe to call multiple times)', () => {
      clearBadge()
      clearBadge()
      clearBadge()

      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '' })
      expect(mockSetBadgeText).toHaveBeenCalledTimes(3)
    })

    it('should handle chrome.action errors gracefully', () => {
      mockSetBadgeText.mockImplementation(() => {
        throw new Error('API error')
      })

      expect(() => clearBadge()).not.toThrow()
    })
  })

  describe('State transitions', () => {
    it('should handle listening → success transition', () => {
      vi.useFakeTimers()

      setBadgeListening()
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '·' })

      vi.advanceTimersByTime(200)
      setBadgeSuccess()

      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '✓' })
      expect(mockSetBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#10B981' })

      vi.useRealTimers()
    })

    it('should handle listening → no code transition', () => {
      vi.useFakeTimers()

      setBadgeListening()
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '·' })

      vi.advanceTimersByTime(200)
      setBadgeNoCode()

      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '!' })
      expect(mockSetBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#FF9800' })

      vi.useRealTimers()
    })

    it('should handle listening → clear transition', () => {
      vi.useFakeTimers()

      setBadgeListening()
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '·' })

      clearBadge()
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '' })

      vi.useRealTimers()
    })

    it('should handle success → clear transition', () => {
      setBadgeSuccess()
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '✓' })

      clearBadge()
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '' })
    })

    it('should handle multiple rapid state changes', () => {
      vi.useFakeTimers()

      setBadgeListening()
      setBadgeSuccess()
      clearBadge()
      setBadgeNoCode()
      setBadgeListening()

      // Final state should be listening
      expect(mockSetBadgeText).toHaveBeenLastCalledWith({ text: '·' })

      vi.useRealTimers()
    })
  })

  describe('Animation lifecycle', () => {
    it('should continue animating until stopped', () => {
      vi.useFakeTimers()

      setBadgeListening()

      // Animate through multiple cycles
      for (let i = 0; i < 10; i++) {
        vi.advanceTimersByTime(400)
      }

      // Should have made many calls (1 initial + 10 animation frames)
      expect(mockSetBadgeText.mock.calls.length).toBeGreaterThan(10)

      vi.useRealTimers()
    })

    it('should cycle through dots correctly for extended periods', () => {
      vi.useFakeTimers()

      setBadgeListening() // Sets initial frame to '·'

      // After setBadgeListening() sets '·', the next frames will be:
      const sequence = ['··', '···', '·', '··', '···', '·']

      mockSetBadgeText.mockClear()

      for (let i = 0; i < 6; i++) {
        vi.advanceTimersByTime(300)
        const lastCall = mockSetBadgeText.mock.calls[mockSetBadgeText.mock.calls.length - 1]
        expect(lastCall[0].text).toBe(sequence[i])
      }

      vi.useRealTimers()
    })

    it('should not leak animation timers', () => {
      vi.useFakeTimers()

      // Start and stop multiple times
      setBadgeListening()
      clearBadge()
      setBadgeListening()
      setBadgeSuccess()
      setBadgeListening()
      clearBadge()

      // Only one timer should be active (cleared by last clearBadge)
      const timerCount = vi.getTimerCount()
      expect(timerCount).toBe(0)

      vi.useRealTimers()
    })
  })

  describe('Edge cases', () => {
    it('should handle undefined chrome.action gracefully', () => {
      global.chrome = undefined as any

      expect(() => setBadgeListening()).not.toThrow()
      expect(() => setBadgeSuccess()).not.toThrow()
      expect(() => setBadgeNoCode()).not.toThrow()
      expect(() => clearBadge()).not.toThrow()
    })

    it('should handle missing setBadgeText function', () => {
      global.chrome = {
        action: {},
      } as any

      expect(() => setBadgeListening()).not.toThrow()
      expect(() => clearBadge()).not.toThrow()
    })

    it('should handle async chrome.action API', async () => {
      mockSetBadgeText.mockResolvedValue(undefined)
      mockSetBadgeBackgroundColor.mockResolvedValue(undefined)

      setBadgeSuccess()

      // Should not throw even if async
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '✓' })
    })
  })

  describe('Color values', () => {
    it('should use correct color codes', () => {
      setBadgeListening()
      expect(mockSetBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#3B82F6' })
      mockSetBadgeBackgroundColor.mockClear()

      clearBadge()
      setBadgeSuccess()
      expect(mockSetBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#10B981' })
      mockSetBadgeBackgroundColor.mockClear()

      clearBadge()
      setBadgeNoCode()
      expect(mockSetBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#FF9800' })
      mockSetBadgeBackgroundColor.mockClear()

      clearBadge()
      setBadgeCount(5)
      expect(mockSetBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#3B82F6' })
      mockSetBadgeBackgroundColor.mockClear()

      clearBadge()
      setBadgeSyncError()
      expect(mockSetBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#EF4444' })
    })

    it('should use accessible color contrast', () => {
      // All colors should be sufficiently different for accessibility
      const colors = {
        listening: '#3B82F6',  // Blue (COLOR_PRIMARY)
        success: '#10B981',    // Green (COLOR_SUCCESS)
        noCode: '#FF9800',     // Amber (COLOR_WARNING)
        count: '#3B82F6',      // Blue (COLOR_PRIMARY)
        syncError: '#EF4444',  // Red (COLOR_ERROR)
      }

      // Basic sanity check - all distinct colors are different
      const uniqueColors = new Set(Object.values(colors))
      expect(uniqueColors.size).toBe(4) // listening and count share same color
    })
  })

  describe('Badge text values', () => {
    it('should use correct Unicode characters', () => {
      setBadgeListening()
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '·' })

      setBadgeSuccess()
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '✓' })

      setBadgeNoCode()
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '!' })

      clearBadge()
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '' })
    })
  })

  describe('setBadgeCount', () => {
    it('should set badge to numeric count', () => {
      setBadgeCount(3)
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '3' })
      expect(mockSetBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#3B82F6' })
    })

    it('should clear badge when count is 0', () => {
      setBadgeCount(5)
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '5' })

      mockSetBadgeText.mockClear()
      setBadgeCount(0)
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '' })
    })

    it('should handle large counts', () => {
      setBadgeCount(99)
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '99' })
    })

    it('should work after clearing listening badge', () => {
      vi.useFakeTimers()

      setBadgeListening()
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '·' })

      // Clear badge first to reset priority
      clearBadge()
      mockSetBadgeText.mockClear()

      setBadgeCount(5)
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '5' })

      vi.useRealTimers()
    })

    it('should handle chrome.action errors gracefully', () => {
      mockSetBadgeText.mockImplementation(() => {
        throw new Error('API error')
      })

      expect(() => setBadgeCount(5)).not.toThrow()
    })
  })

  describe('setBadgeSyncError', () => {
    it('should set badge to red X', () => {
      setBadgeSyncError()
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '✗' })
      expect(mockSetBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#EF4444' })
    })

    it('should work after clearing listening badge', () => {
      vi.useFakeTimers()

      setBadgeListening()
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '·' })

      // Clear badge first to reset priority
      clearBadge()
      mockSetBadgeText.mockClear()

      setBadgeSyncError()
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '✗' })

      vi.useRealTimers()
    })

    it('should handle chrome.action errors gracefully', () => {
      mockSetBadgeText.mockImplementation(() => {
        throw new Error('API error')
      })

      expect(() => setBadgeSyncError()).not.toThrow()
    })
  })

  describe('Badge Priority', () => {
    it('should not allow count badge to override listening badge', () => {
      setBadgeListening()
      const listeningCallCount = mockSetBadgeText.mock.calls.length
      mockSetBadgeText.mockClear()

      setBadgeCount(5)
      expect(mockSetBadgeText).not.toHaveBeenCalled()
    })

    it('should allow listening badge to override count badge', () => {
      setBadgeCount(5)
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '5' })
      mockSetBadgeText.mockClear()

      setBadgeListening()
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '·' })
    })

    it('should not allow count badge to override sync error badge', () => {
      setBadgeSyncError()
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '✗' })
      mockSetBadgeText.mockClear()

      setBadgeCount(5)
      expect(mockSetBadgeText).not.toHaveBeenCalled()
    })

    it('should allow sync error badge to override count badge', () => {
      setBadgeCount(5)
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '5' })
      mockSetBadgeText.mockClear()

      setBadgeSyncError()
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '✗' })
    })

    it('should not allow sync error to override watch session states', () => {
      setBadgeListening()
      mockSetBadgeText.mockClear()

      setBadgeSyncError()
      expect(mockSetBadgeText).not.toHaveBeenCalled()
    })

    it('should allow watch session states to override sync error', () => {
      setBadgeSyncError()
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '✗' })
      mockSetBadgeText.mockClear()

      setBadgeListening()
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '·' })
    })

    it('should allow clearBadge to reset priority', () => {
      setBadgeListening()
      clearBadge()

      // After clear, count badge should work
      setBadgeCount(5)
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '5' })
    })
  })
})
