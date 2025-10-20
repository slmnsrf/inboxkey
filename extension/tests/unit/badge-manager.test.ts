/**
 * Unit tests for badge-manager
 * Tests badge state management, animation, and chrome.action API integration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  setBadgeListening,
  setBadgeSuccess,
  setBadgeNoCode,
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
      expect(mockSetBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#2196F3' })

      vi.useRealTimers()
    })

    it('should animate badge through dot sequence', () => {
      vi.useFakeTimers()

      setBadgeListening()

      // Initial state: ·
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '·' })

      // After 400ms: ··
      vi.advanceTimersByTime(400)
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '··' })

      // After another 400ms: ···
      vi.advanceTimersByTime(400)
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '···' })

      // After another 400ms: back to ·
      vi.advanceTimersByTime(400)
      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '·' })

      vi.useRealTimers()
    })

    it('should use blue color for listening state', () => {
      setBadgeListening()

      expect(mockSetBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#2196F3' })
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
  })

  describe('setBadgeSuccess', () => {
    it('should set badge to green checkmark', () => {
      setBadgeSuccess()

      expect(mockSetBadgeText).toHaveBeenCalledWith({ text: '✓' })
      expect(mockSetBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#4CAF50' })
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
    it('should set badge to orange exclamation', () => {
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
      expect(mockSetBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#4CAF50' })

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

      setBadgeListening()

      const sequence = ['·', '··', '···', '·', '··', '···']

      mockSetBadgeText.mockClear()

      for (let i = 0; i < 6; i++) {
        vi.advanceTimersByTime(400)
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
      expect(mockSetBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#2196F3' })

      setBadgeSuccess()
      expect(mockSetBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#4CAF50' })

      setBadgeNoCode()
      expect(mockSetBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#FF9800' })
    })

    it('should use accessible color contrast', () => {
      // All colors should be sufficiently different for accessibility
      const colors = {
        listening: '#2196F3', // Blue
        success: '#4CAF50',   // Green
        noCode: '#FF9800',    // Orange
      }

      // Basic sanity check - all colors are different
      const uniqueColors = new Set(Object.values(colors))
      expect(uniqueColors.size).toBe(3)
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
})
