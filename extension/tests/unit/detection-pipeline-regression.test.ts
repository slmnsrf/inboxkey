/**
 * Detection Pipeline Regression Tests
 * Covers edge cases fixed in the field-detection-improvements branch.
 *
 * Individual bug fixes have dedicated tests in their respective test files:
 * - Mutation overflow: field-detector.test.ts (Task 2)
 * - Tier 2 suppression: field-detector.test.ts (Task 3)
 * - Double evaluation: field-detector.test.ts (Task 4)
 * - Split autofill edge cases: autofill.test.ts (Task 8)
 * - Split expected-length: watch-session.test.ts (Task 9)
 *
 * This file adds integration-level regression tests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Window } from 'happy-dom'
import { FieldDetector } from '../../src/lib/detection/field-detector'

describe('Detection Pipeline Regression Tests', () => {
  let window: Window
  let document: Document
  let detector: FieldDetector

  beforeEach(() => {
    window = new Window()
    document = window.document
    global.document = document as any
    global.window = window as any
    global.performance = window.performance as any
    detector = new FieldDetector()
  })

  afterEach(() => {
    detector.stopObserving()
  })

  describe('detectExisting + Tier 2 coexistence', () => {
    it('should return both Tier 1 and Tier 2 results on same page', () => {
      document.body.innerHTML = `
        <form>
          <input type="text" autocomplete="one-time-code" id="standard-otp">
        </form>
        <div>
          <label>Enter Steam Guard code</label>
          <div>
            <input type="text" maxlength="1" class="steam">
            <input type="text" maxlength="1" class="steam">
            <input type="text" maxlength="1" class="steam">
            <input type="text" maxlength="1" class="steam">
            <input type="text" maxlength="1" class="steam">
          </div>
        </div>
      `

      const results = detector.detectExisting({ strictVisibility: false })
      const tiers = results.map(r => r.tier)

      expect(tiers).toContain(1)
      expect(tiers).toContain(2)
    })
  })

  describe('dynamic detection passes result to callback', () => {
    it('callback receives DetectionResult with correct tier and confidence', async () => {
      let receivedTier: number | null = null
      let receivedConfidence: number | null = null

      detector.startObserving((field, result) => {
        receivedTier = result.tier
        receivedConfidence = result.confidence
      })

      const input = document.createElement('input')
      input.type = 'text'
      input.autocomplete = 'one-time-code'
      document.body.appendChild(input)

      await new Promise(r => setTimeout(r, 200))

      expect(receivedTier).toBe(1)
      expect(receivedConfidence).toBe(100)
    })
  })
})
