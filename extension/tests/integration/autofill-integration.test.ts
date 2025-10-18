/**
 * Integration test for autofill system
 * Tests the complete flow: detection → polling → matching → autofill
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Window } from 'happy-dom'
import { FieldDetector } from '../../src/lib/detection/field-detector'
import { startWatch, stopActiveWatch, getActiveWatch } from '../../src/contents/watch-session'
import { autofillCode, isFieldFilledByInboxKey } from '../../src/contents/autofill'
import { findBestMatchingCode } from '../../src/lib/matching/code-matcher'
import type { StoredCode } from '../../src/lib/storage/schema'

describe('Autofill Integration', () => {
  let window: Window
  let document: Document

  beforeEach(() => {
    window = new Window()
    document = window.document
    global.document = document as any
    global.window = window as any
    global.performance = window.performance as any

    // Mock chrome.runtime
    global.chrome = {
      runtime: {
        sendMessage: vi.fn(),
      },
    } as any

    // Use fake timers
    vi.useFakeTimers()
  })

  afterEach(() => {
    stopActiveWatch()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe('Complete autofill flow', () => {
    it('should detect field, poll, and autofill code', async () => {
      // Setup: Create a verification field
      document.body.innerHTML = `
        <form>
          <label for="otp">Enter verification code</label>
          <input type="text" id="otp" autocomplete="one-time-code">
        </form>
      `

      // Step 1: Detect the field
      const detector = new FieldDetector()
      const results = detector.detectExisting({ strictVisibility: false })

      expect(results).toHaveLength(1)
      const detectionResult = results[0]
      const field = detectionResult.field

      // Step 2: Setup mock codes
      const now = Date.now()
      const mockCodes: StoredCode[] = [
        {
          code: '123456',
          timestamp: now - 1000,
          source: 'test@example.com',
          siteMatch: 'example.com',
          used: false,
        },
      ]

      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
        codes: mockCodes,
      })

      // Step 3: Start watch session
      const onComplete = vi.fn(async (code: string) => {
        await autofillCode({
          code,
          field,
          showFeedback: false,
        })
      })

      startWatch(
        field,
        detectionResult,
        async (_pollNumber: number) => {
          // Simulate code fetcher
          const codes: StoredCode[] = mockCodes
          const bestCode = findBestMatchingCode(codes, 'https://example.com', Date.now())
          return bestCode ? bestCode.code : null
        },
        onComplete
      )

      // Step 4: Advance timers to trigger first poll
      await vi.advanceTimersByTimeAsync(0)

      // Step 5: Verify autofill happened
      expect(onComplete).toHaveBeenCalledWith('123456')
      expect(field.value).toBe('123456')
      expect(isFieldFilledByInboxKey(field)).toBe(true)
    })

    it('should handle multiple polls before finding code', async () => {
      document.body.innerHTML = `
        <input type="text" name="verificationCode" autocomplete="one-time-code">
      `

      const detector = new FieldDetector()
      const results = detector.detectExisting({ strictVisibility: false })
      const detectionResult = results[0]
      const field = detectionResult.field

      const now = Date.now()
      let pollCount = 0

      const onComplete = vi.fn(async (code: string) => {
        await autofillCode({
          code,
          field,
          showFeedback: false,
        })
      })

      startWatch(
        field,
        detectionResult,
        async (_pollNumber: number) => {
          pollCount++

          // Return code only on 2nd poll
          if (pollNumber === 2) {
            const mockCodes: StoredCode[] = [
              {
                code: '789012',
                timestamp: now - 500,
                source: 'test@example.com',
                siteMatch: 'example.com',
                used: false,
              },
            ]
            const bestCode = findBestMatchingCode(mockCodes, 'https://example.com', Date.now())
            return bestCode ? bestCode.code : null
          }

          return null
        },
        onComplete
      )

      // First poll (t=0s) - no code
      await vi.advanceTimersByTimeAsync(0)
      expect(pollCount).toBe(1)
      expect(onComplete).not.toHaveBeenCalled()

      // Second poll (t=5s) - code arrives
      await vi.advanceTimersByTimeAsync(5000)
      expect(pollCount).toBe(2)
      expect(onComplete).toHaveBeenCalledWith('789012')
      expect(field.value).toBe('789012')
    })

    it('should stop polling after field is removed from DOM', async () => {
      document.body.innerHTML = `
        <div id="container">
          <input type="text" name="otp" autocomplete="one-time-code">
        </div>
      `

      const detector = new FieldDetector()
      const results = detector.detectExisting({ strictVisibility: false })
      const detectionResult = results[0]
      const field = detectionResult.field

      const onPoll = vi.fn().mockResolvedValue(null)
      const onComplete = vi.fn()

      startWatch(field, detectionResult, onPoll, onComplete)

      // First poll
      await vi.advanceTimersByTimeAsync(0)
      expect(onPoll).toHaveBeenCalledTimes(1)

      // Remove field from DOM
      const container = document.getElementById('container')!
      container.remove()

      // Second poll should detect removal and stop
      await vi.advanceTimersByTimeAsync(5000)
      expect(onPoll).toHaveBeenCalledTimes(2)

      // Third poll should not happen
      await vi.advanceTimersByTimeAsync(5000)
      expect(onPoll).toHaveBeenCalledTimes(2) // Still only 2
    })

    it('should not start watch for same field twice', async () => {
      document.body.innerHTML = `
        <input type="text" name="otp" autocomplete="one-time-code">
      `

      const detector = new FieldDetector()
      const results = detector.detectExisting({ strictVisibility: false })
      const detectionResult = results[0]
      const field = detectionResult.field

      const onPoll1 = vi.fn().mockResolvedValue(null)
      const onComplete1 = vi.fn()

      const session1 = startWatch(field, detectionResult, onPoll1, onComplete1)

      const onPoll2 = vi.fn().mockResolvedValue(null)
      const onComplete2 = vi.fn()

      const session2 = startWatch(field, detectionResult, onPoll2, onComplete2)

      // First session should be stopped
      expect(session1.isActive()).toBe(false)
      expect(session2.isActive()).toBe(true)

      // Only second session should poll
      await vi.advanceTimersByTimeAsync(0)
      expect(onPoll1).not.toHaveBeenCalled()
      expect(onPoll2).toHaveBeenCalled()
    })
  })

  describe('Dynamic field detection and autofill', () => {
    it('should detect dynamically injected field and autofill', async () => {
      // Start with empty page
      document.body.innerHTML = '<div id="app"></div>'

      const detector = new FieldDetector()
      const detectedFields: HTMLInputElement[] = []

      // Start observing
      detector.startObserving((field) => {
        detectedFields.push(field)
      })

      // Inject field dynamically
      const app = document.getElementById('app')!
      const input = document.createElement('input')
      input.type = 'text'
      input.setAttribute('autocomplete', 'one-time-code')
      app.appendChild(input)

      // Wait for observer debounce
      await vi.advanceTimersByTimeAsync(150)

      // Should have detected the field
      expect(detectedFields).toHaveLength(1)
      expect(detectedFields[0]).toBe(input)

      // Cleanup
      detector.stopObserving()
    })

    it('should handle multiple rapid field injections', async () => {
      document.body.innerHTML = '<div id="app"></div>'

      const detector = new FieldDetector()
      const detectedFields: HTMLInputElement[] = []

      detector.startObserving((field) => {
        detectedFields.push(field)
      })

      const app = document.getElementById('app')!

      // Rapidly inject multiple fields
      for (let i = 0; i < 5; i++) {
        const input = document.createElement('input')
        input.type = 'text'
        input.setAttribute('autocomplete', 'one-time-code')
        input.id = `otp-${i}`
        app.appendChild(input)
      }

      // Wait for debounce
      await vi.advanceTimersByTimeAsync(150)

      // Should detect at least one field (may batch some due to debouncing)
      expect(detectedFields.length).toBeGreaterThan(0)

      detector.stopObserving()
    })
  })

  describe('Code matching scenarios', () => {
    it('should select correct code for current domain', async () => {
      const now = Date.now()
      const mockCodes: StoredCode[] = [
        {
          code: '111111',
          timestamp: now - 1000,
          source: 'test@example.com',
          siteMatch: 'github.com',
          used: false,
        },
        {
          code: '222222',
          timestamp: now - 1000,
          source: 'test@example.com',
          siteMatch: 'example.com',
          used: false,
        },
      ]

      const bestCode = findBestMatchingCode(mockCodes, 'https://example.com', now)

      expect(bestCode).not.toBeNull()
      expect(bestCode?.code).toBe('222222')
    })

    it('should ignore used codes', async () => {
      const now = Date.now()
      const mockCodes: StoredCode[] = [
        {
          code: '111111',
          timestamp: now - 1000,
          source: 'test@example.com',
          siteMatch: 'example.com',
          used: true, // Already used
        },
        {
          code: '222222',
          timestamp: now - 2000,
          source: 'test@example.com',
          siteMatch: 'example.com',
          used: false,
        },
      ]

      const bestCode = findBestMatchingCode(mockCodes, 'https://example.com', now)

      expect(bestCode).not.toBeNull()
      expect(bestCode?.code).toBe('222222')
    })

    it('should reject expired codes', async () => {
      const now = Date.now()
      const mockCodes: StoredCode[] = [
        {
          code: '123456',
          timestamp: now - 6 * 60 * 1000, // 6 minutes ago
          source: 'test@example.com',
          siteMatch: 'example.com',
          used: false,
        },
      ]

      const bestCode = findBestMatchingCode(mockCodes, 'https://example.com', now)

      expect(bestCode).toBeNull()
    })
  })

  describe('Edge cases', () => {
    it('should handle field becoming readonly after detection', async () => {
      document.body.innerHTML = `
        <input type="text" name="otp" autocomplete="one-time-code">
      `

      const detector = new FieldDetector()
      const results = detector.detectExisting({ strictVisibility: false })
      const detectionResult = results[0]
      const field = detectionResult.field

      // Make field readonly after detection
      field.readOnly = true

      const result = await autofillCode({
        code: '123456',
        field,
        showFeedback: false,
      })

      expect(result).toBe(false)
      expect(field.value).toBe('')
    })

    it('should handle field becoming disabled after detection', async () => {
      document.body.innerHTML = `
        <input type="text" name="otp" autocomplete="one-time-code">
      `

      const detector = new FieldDetector()
      const results = detector.detectExisting({ strictVisibility: false })
      const detectionResult = results[0]
      const field = detectionResult.field

      // Make field disabled after detection
      field.disabled = true

      const result = await autofillCode({
        code: '123456',
        field,
        showFeedback: false,
      })

      expect(result).toBe(false)
      expect(field.value).toBe('')
    })

    it('should handle field becoming hidden after detection', async () => {
      document.body.innerHTML = `
        <input type="text" name="otp" autocomplete="one-time-code">
      `

      const detector = new FieldDetector()
      const results = detector.detectExisting({ strictVisibility: false })
      const detectionResult = results[0]
      const field = detectionResult.field

      // Hide field after detection
      field.style.display = 'none'

      const result = await autofillCode({
        code: '123456',
        field,
        showFeedback: false,
      })

      expect(result).toBe(false)
      expect(field.value).toBe('')
    })

    it('should handle empty codes array from backend', async () => {
      document.body.innerHTML = `
        <input type="text" name="otp" autocomplete="one-time-code">
      `

      const detector = new FieldDetector()
      const results = detector.detectExisting({ strictVisibility: false })
      const detectionResult = results[0]
      const field = detectionResult.field

      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({
        codes: [],
      })

      const onComplete = vi.fn()
      const onPoll = vi.fn(async () => {
        return null
      })

      startWatch(field, detectionResult, onPoll, onComplete)

      // Advance through all polls
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(5000)
      await vi.advanceTimersByTimeAsync(5000)

      // Should have polled 3 times but never completed
      expect(onPoll).toHaveBeenCalledTimes(3)
      expect(onComplete).not.toHaveBeenCalled()
    })
  })

  describe('Performance', () => {
    it('should detect and start watching quickly', () => {
      document.body.innerHTML = `
        <input type="text" autocomplete="one-time-code">
      `

      const startTime = performance.now()

      const detector = new FieldDetector()
      const results = detector.detectExisting({ strictVisibility: false })

      expect(results).toHaveLength(1)

      const detectionResult = results[0]
      const field = detectionResult.field

      startWatch(
        field,
        detectionResult,
        async () => null,
        () => {}
      )

      const endTime = performance.now()
      const duration = endTime - startTime

      // Should be very fast
      expect(duration).toBeLessThan(10) // Less than 10ms
    })

    it('should handle multiple simultaneous detection requests efficiently', () => {
      document.body.innerHTML = `
        <input type="text" autocomplete="one-time-code">
        <input type="text" name="otp">
        <input type="email" name="email">
      `

      const detector = new FieldDetector()

      const startTime = performance.now()

      // Multiple detection calls
      for (let i = 0; i < 10; i++) {
        detector.detectExisting({ strictVisibility: false })
      }

      const endTime = performance.now()
      const duration = endTime - startTime

      // Should handle multiple calls efficiently
      expect(duration).toBeLessThan(50) // Less than 50ms total
    })
  })

  describe('Multi-field scenarios', () => {
    it('should detect multiple verification fields and use highest confidence', () => {
      document.body.innerHTML = `
        <input type="text" name="otp" maxlength="6" inputmode="numeric">
        <input type="text" autocomplete="one-time-code">
        <input type="text" name="code">
      `

      const detector = new FieldDetector()
      const results = detector.detectExisting({ strictVisibility: false })

      // Should find multiple candidates
      expect(results.length).toBeGreaterThan(0)

      // First result should be highest confidence (autocomplete)
      expect(results[0].confidence).toBe(100)
      expect(results[0].field.getAttribute('autocomplete')).toBe('one-time-code')
    })

    it('should not watch multiple fields simultaneously', () => {
      document.body.innerHTML = `
        <input type="text" id="field1" autocomplete="one-time-code">
        <input type="text" id="field2" autocomplete="one-time-code">
      `

      const detector = new FieldDetector()
      const results = detector.detectExisting({ strictVisibility: false })

      expect(results.length).toBeGreaterThanOrEqual(1)

      const field1 = results[0].field
      const field2 = results[1]?.field

      startWatch(
        field1,
        results[0],
        async () => null,
        () => {}
      )

      const activeWatch1 = getActiveWatch()

      if (field2) {
        startWatch(
          field2,
          results[1],
          async () => null,
          () => {}
        )

        const activeWatch2 = getActiveWatch()

        // Should have stopped first watch
        expect(activeWatch1?.isActive()).toBe(false)
        expect(activeWatch2?.isActive()).toBe(true)
      }
    })
  })
})
