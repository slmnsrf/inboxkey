/**
 * Unit tests for FieldDetector class
 * Tests dynamic detection, mutation observation, and shadow DOM support
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Window } from 'happy-dom'
import { FieldDetector } from '../../src/lib/detection/field-detector'
import type { DetectionResult } from '../../src/lib/types'

describe('FieldDetector', () => {
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

  describe('detectExisting', () => {
    it('should detect field with autocomplete="one-time-code"', () => {
      document.body.innerHTML = `
        <input type="text" id="otp" autocomplete="one-time-code" data-testid="verification-field">
      `

      const results = detector.detectExisting({ strictVisibility: false })

      expect(results).toHaveLength(1)
      expect(results[0].field.id).toBe('otp')
      expect(results[0].confidence).toBe(100)
      expect(results[0].tier).toBe(1)
    })

    it('should detect field with name="verificationCode"', () => {
      document.body.innerHTML = `
        <input type="text" name="verificationCode" data-testid="verification-field">
      `

      const results = detector.detectExisting({ strictVisibility: false })

      expect(results).toHaveLength(1)
      expect(results[0].field.name).toBe('verificationCode')
      expect(results[0].confidence).toBeGreaterThanOrEqual(90)
      expect(results[0].tier).toBe(1)
    })

    it('should detect field with inputmode="numeric" + maxlength', () => {
      document.body.innerHTML = `
        <input type="text" inputmode="numeric" maxlength="6" data-testid="verification-field">
      `

      const results = detector.detectExisting({ strictVisibility: false })

      expect(results).toHaveLength(1)
      expect(results[0].confidence).toBeGreaterThanOrEqual(85)
      expect(results[0].tier).toBe(1)
    })

    it('should detect field with label containing "verification code"', () => {
      document.body.innerHTML = `
        <label for="code">Enter verification code</label>
        <input type="text" id="code" data-testid="verification-field">
      `

      const results = detector.detectExisting({ strictVisibility: false })

      expect(results).toHaveLength(1)
      expect(results[0].field.id).toBe('code')
      expect(results[0].tier).toBe(1)  // Tier 1 detects id="code" via exact match
    })

    it('should return empty array when no fields found', () => {
      document.body.innerHTML = `
        <input type="email" id="email">
        <input type="password" id="password">
      `

      const results = detector.detectExisting({ strictVisibility: false })

      expect(results).toHaveLength(0)
    })

    // happy-dom doesn't compute CSS display/visibility properties,
    // so inline style="display:none" / "visibility:hidden" is invisible to the detector.
    // This behavior is correctly enforced in real browsers via Playwright E2E tests.
    it.skip('should not detect hidden fields (happy-dom lacks CSS computation)', () => {
      document.body.innerHTML = `
        <input type="text" name="otp" style="display: none;" data-testid="verification-field">
        <input type="text" name="code" style="visibility: hidden;" data-testid="verification-field">
      `

      const results = detector.detectExisting({ strictVisibility: false })

      expect(results).toHaveLength(0)
    })

    it('should not detect disabled fields', () => {
      document.body.innerHTML = `
        <input type="text" name="otp" disabled data-testid="verification-field">
      `

      const results = detector.detectExisting({ strictVisibility: false })

      expect(results).toHaveLength(0)
    })

    it('should exclude CVV and zip code fields', () => {
      document.body.innerHTML = `
        <input type="text" name="cvv" maxlength="3">
        <input type="text" name="zipCode" maxlength="5">
        <input type="text" name="postal-code" maxlength="5">
      `

      const results = detector.detectExisting({ strictVisibility: false })

      expect(results).toHaveLength(0)
    })

    it('should detect email_code field (tarkov.com pattern)', () => {
      // Regression test: fields with "email" prefix but containing "code"
      // should be detected, not excluded
      document.body.innerHTML = `
        <input
          type="text"
          id="email_code"
          name="email_code"
          placeholder="Enter verification code"
          autocomplete="off"
          data-testid="verification-field"
        >
      `

      const results = detector.detectExisting({ strictVisibility: false })

      expect(results).toHaveLength(1)
      expect(results[0].field.name).toBe('email_code')
      expect(results[0].confidence).toBeGreaterThanOrEqual(90)
      expect(results[0].signals).toContain('name/id="email_code" (contains match)')
    })

    it('should run Tier 2 on unmatched inputs even when Tier 1 found results', () => {
      // First field: obvious Tier 1 match
      // Second field: only detectable by Tier 2 (split-input pattern)
      document.body.innerHTML = `
        <input type="text" id="otp" autocomplete="one-time-code">
        <div>
          <input type="text" maxlength="1" class="code-digit">
          <input type="text" maxlength="1" class="code-digit">
          <input type="text" maxlength="1" class="code-digit">
          <input type="text" maxlength="1" class="code-digit">
          <input type="text" maxlength="1" class="code-digit">
          <input type="text" maxlength="1" class="code-digit">
        </div>
      `

      const results = detector.detectExisting({ strictVisibility: false })

      // Should find BOTH: the autocomplete field AND the split-input group
      expect(results.length).toBeGreaterThanOrEqual(2)

      // Verify we have both Tier 1 and Tier 2 results
      const hasTier1 = results.some(r => r.tier === 1)
      const hasTier2 = results.some(r => r.tier === 2)
      expect(hasTier1).toBe(true)
      expect(hasTier2).toBe(true)
    })

    it('should track detected fields to avoid duplicates', () => {
      document.body.innerHTML = `
        <input type="text" name="otp" autocomplete="one-time-code" data-testid="verification-field">
      `

      const results1 = detector.detectExisting({ strictVisibility: false })
      const results2 = detector.detectExisting({ strictVisibility: false })

      expect(results1).toHaveLength(1)
      expect(results2).toHaveLength(1)
      expect(results1[0].field).toBe(results2[0].field)
    })

    it('should provide execution time in result', () => {
      document.body.innerHTML = `
        <input type="text" autocomplete="one-time-code" data-testid="verification-field">
      `

      const results = detector.detectExisting({ strictVisibility: false })

      expect(results).toHaveLength(1)
      expect(results[0].executionTime).toBeGreaterThan(0)
      expect(results[0].executionTime).toBeLessThan(100) // Should be fast
    })

    it('should provide meaningful signals', () => {
      document.body.innerHTML = `
        <input type="text" autocomplete="one-time-code" data-testid="verification-field">
      `

      const results = detector.detectExisting({ strictVisibility: false })

      expect(results).toHaveLength(1)
      expect(results[0].signals).toBeInstanceOf(Array)
      expect(results[0].signals.length).toBeGreaterThan(0)
      expect(results[0].signals[0]).toContain('autocomplete')
    })
  })

  describe('startObserving / stopObserving', () => {
    it('should start observing for mutations', () => {
      const callback = vi.fn()

      detector.startObserving(callback)

      expect(detector.isObserving()).toBe(true)
    })

    it('should stop observing when stopObserving is called', () => {
      const callback = vi.fn()

      detector.startObserving(callback)
      detector.stopObserving()

      expect(detector.isObserving()).toBe(false)
    })

    it('should detect dynamically added fields', async () => {
      const callback = vi.fn()

      detector.startObserving(callback)

      // Add field dynamically
      const input = document.createElement('input')
      input.type = 'text'
      input.setAttribute('autocomplete', 'one-time-code')
      input.setAttribute('data-testid', 'verification-field')
      document.body.appendChild(input)

      // Wait for debounce (100ms)
      await new Promise((resolve) => setTimeout(resolve, 150))

      expect(callback).toHaveBeenCalledWith(input, expect.objectContaining({ tier: 1 }))
    })

    it('should detect fields revealed by attribute changes after insertion', async () => {
      const callback = vi.fn()

      detector.startObserving(callback)

      const input = document.createElement('input')
      input.type = 'text'
      document.body.appendChild(input)

      await new Promise((resolve) => setTimeout(resolve, 150))
      expect(callback).not.toHaveBeenCalled()

      input.setAttribute('autocomplete', 'section-login one-time-code')

      await new Promise((resolve) => setTimeout(resolve, 150))

      expect(callback).toHaveBeenCalledWith(input, expect.objectContaining({ tier: 1 }))
    })

    it('should detect dynamically added inputs inside open shadow DOM', async () => {
      const callback = vi.fn()

      detector.startObserving(callback)

      const host = document.createElement('div')
      const shadow = host.attachShadow({ mode: 'open' })
      const input = document.createElement('input')
      input.type = 'text'
      input.setAttribute('autocomplete', 'one-time-code')
      shadow.appendChild(input)
      document.body.appendChild(host)

      await new Promise((resolve) => setTimeout(resolve, 150))

      expect(callback).toHaveBeenCalledWith(input, expect.objectContaining({ tier: 1 }))
    })

    it('should rescan when a background tab regains focus', async () => {
      const callback = vi.fn()
      const hasFocus = vi.fn().mockReturnValue(false)
      Object.defineProperty(document, 'readyState', {
        value: 'complete',
        configurable: true,
      })
      Object.defineProperty(document, 'hasFocus', {
        value: hasFocus,
        configurable: true,
      })

      detector.startObserving(callback)

      const input = document.createElement('input')
      input.type = 'text'
      input.setAttribute('autocomplete', 'one-time-code')
      document.body.appendChild(input)

      await new Promise((resolve) => setTimeout(resolve, 150))
      expect(callback).not.toHaveBeenCalled()

      hasFocus.mockReturnValue(true)
      window.dispatchEvent(new window.Event('focus'))

      await new Promise((resolve) => setTimeout(resolve, 150))

      expect(callback).toHaveBeenCalledWith(input, expect.objectContaining({ tier: 1 }))
    })

    it('should debounce mutations within 100ms window', async () => {
      const callback = vi.fn()

      detector.startObserving(callback)

      // Add multiple fields rapidly
      for (let i = 0; i < 5; i++) {
        const input = document.createElement('input')
        input.type = 'text'
        input.setAttribute('autocomplete', 'one-time-code')
        input.setAttribute('data-testid', 'verification-field')
        document.body.appendChild(input)
        await new Promise((resolve) => setTimeout(resolve, 10))
      }

      // Wait for debounce
      await new Promise((resolve) => setTimeout(resolve, 150))

      // Should have detected at least one field (may batch some)
      expect(callback).toHaveBeenCalled()
    })

    it('should not detect same field twice', async () => {
      const callback = vi.fn()

      // Add field before observing
      const input = document.createElement('input')
      input.type = 'text'
      input.setAttribute('autocomplete', 'one-time-code')
      input.setAttribute('data-testid', 'verification-field')
      document.body.appendChild(input)

      // Detect it first
      detector.detectExisting({ strictVisibility: false })

      // Now start observing
      detector.startObserving(callback)

      // Remove and re-add the same input
      document.body.removeChild(input)
      document.body.appendChild(input)

      // Wait for debounce
      await new Promise((resolve) => setTimeout(resolve, 150))

      // Should not call callback since field was already detected
      expect(callback).not.toHaveBeenCalled()
    })

    it('should warn when starting observer while already observing', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const callback = vi.fn()

      detector.startObserving(callback)
      detector.startObserving(callback) // Start again

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Already observing')
      )

      consoleWarnSpy.mockRestore()
    })

    it('should not detect fields in containers that are added', async () => {
      const callback = vi.fn()

      detector.startObserving(callback)

      // Add container with nested input
      const container = document.createElement('div')
      const input = document.createElement('input')
      input.type = 'text'
      input.setAttribute('autocomplete', 'one-time-code')
      input.setAttribute('data-testid', 'verification-field')
      container.appendChild(input)
      document.body.appendChild(container)

      // Wait for debounce
      await new Promise((resolve) => setTimeout(resolve, 150))

      // Should detect the nested input
      expect(callback).toHaveBeenCalledWith(input, expect.objectContaining({ tier: 1 }))
    })

    it('should filter out hidden and disabled fields', async () => {
      const callback = vi.fn()

      detector.startObserving(callback)

      // Add hidden field
      const hiddenInput = document.createElement('input')
      hiddenInput.type = 'text'
      hiddenInput.setAttribute('autocomplete', 'one-time-code')
      hiddenInput.style.display = 'none'
      document.body.appendChild(hiddenInput)

      // Add disabled field
      const disabledInput = document.createElement('input')
      disabledInput.type = 'text'
      disabledInput.setAttribute('autocomplete', 'one-time-code')
      disabledInput.disabled = true
      document.body.appendChild(disabledInput)

      // Wait for debounce
      await new Promise((resolve) => setTimeout(resolve, 150))

      // Should not call callback
      expect(callback).not.toHaveBeenCalled()
    })
  })

  describe('dynamic detection callback signature', () => {
    it('should pass DetectionResult alongside field in callback', async () => {
      let receivedResult: DetectionResult | null = null
      detector.startObserving((field, result) => {
        receivedResult = result
      })

      // Trigger mutation
      const input = document.createElement('input')
      input.type = 'text'
      input.setAttribute('autocomplete', 'one-time-code')
      input.id = 'dynamic-otp'
      document.body.appendChild(input)

      // Wait for debounce + processing
      await new Promise(r => setTimeout(r, 200))

      expect(receivedResult).not.toBeNull()
      expect(receivedResult!.tier).toBe(1)
      expect(receivedResult!.confidence).toBe(100)
    })
  })

  describe('processPendingMutations overflow', () => {
    it('should process all pending mutations, not just first 10', async () => {
      const detectedFields: HTMLInputElement[] = []
      detector.startObserving((field) => {
        detectedFields.push(field)
      })

      // Inject 15 inputs at once (simulating SPA route change)
      const container = document.createElement('div')
      for (let i = 0; i < 15; i++) {
        const input = document.createElement('input')
        input.type = 'text'
        input.id = `dynamic-${i}`
        input.setAttribute('autocomplete', 'one-time-code')
        container.appendChild(input)
      }
      document.body.appendChild(container)

      // Wait for debounce (100ms) + processing
      await new Promise(r => setTimeout(r, 200))

      // All 15 inputs should be processed, not capped at 10
      expect(detectedFields.length).toBe(15)
    })
  })

  describe('isObserving', () => {
    it('should return false initially', () => {
      expect(detector.isObserving()).toBe(false)
    })

    it('should return true after startObserving', () => {
      detector.startObserving(() => {})
      expect(detector.isObserving()).toBe(true)
    })

    it('should return false after stopObserving', () => {
      detector.startObserving(() => {})
      detector.stopObserving()
      expect(detector.isObserving()).toBe(false)
    })
  })

  describe('Shadow DOM support', () => {
    it('should detect fields inside shadow DOM', () => {
      // Create host element
      const host = document.createElement('div')
      document.body.appendChild(host)

      // Attach shadow root
      const shadow = host.attachShadow({ mode: 'open' })

      // Add input to shadow DOM
      const input = document.createElement('input')
      input.type = 'text'
      input.setAttribute('autocomplete', 'one-time-code')
      input.setAttribute('data-testid', 'verification-field')
      shadow.appendChild(input)

      const results = detector.detectExisting({ strictVisibility: false })

      expect(results).toHaveLength(1)
      expect(results[0].field).toBe(input)
    })

    it('should detect fields in nested shadow DOM', () => {
      // Create outer shadow DOM
      const outerHost = document.createElement('div')
      document.body.appendChild(outerHost)
      const outerShadow = outerHost.attachShadow({ mode: 'open' })

      // Create inner shadow DOM
      const innerHost = document.createElement('div')
      outerShadow.appendChild(innerHost)
      const innerShadow = innerHost.attachShadow({ mode: 'open' })

      // Add input to inner shadow DOM
      const input = document.createElement('input')
      input.type = 'text'
      input.setAttribute('autocomplete', 'one-time-code')
      input.setAttribute('data-testid', 'verification-field')
      innerShadow.appendChild(input)

      const results = detector.detectExisting({ strictVisibility: false })

      expect(results).toHaveLength(1)
      expect(results[0].field).toBe(input)
    })
  })

  describe('evaluateField', () => {
    it('should evaluate a single field through Tier 1 -> Tier 2', () => {
      document.body.innerHTML = `
        <input type="text" autocomplete="one-time-code" id="otp">
        <input type="text" name="unrelated">
      `
      const field = document.getElementById('otp') as HTMLInputElement

      const result = detector.evaluateField(field, { strictVisibility: false })
      expect(result).not.toBeNull()
      expect(result!.field).toBe(field)
      expect(result!.tier).toBe(1)
    })

    it('should return null for non-OTP field', () => {
      document.body.innerHTML = `
        <input type="text" name="username" id="user">
      `
      const field = document.getElementById('user') as HTMLInputElement

      const result = detector.evaluateField(field, { strictVisibility: false })
      expect(result).toBeNull()
    })
  })

  describe('forgetField (resend / retry support)', () => {
    it('clears the cooldown so the same field can be evaluated again', () => {
      document.body.innerHTML = `
        <input type="text" autocomplete="one-time-code" id="otp">
      `
      const field = document.getElementById('otp') as HTMLInputElement

      // First evaluation marks the field as detected; cooldown is set.
      const first = detector.evaluateField(field, { strictVisibility: false })
      expect(first).not.toBeNull()
      expect(first!.tier).toBe(1)

      // Without forgetField, Tier 1 short-circuits on cooldown and
      // returns a "Field in cooldown period" result with detected=false.
      const blocked = detector.evaluateField(field, { strictVisibility: false })
      expect(blocked).toBeNull()

      // forgetField drops both the WeakSet entry and the cooldown
      // entry, so the next evaluation re-runs Tier 1 from scratch.
      detector.forgetField(field)

      const reevaluated = detector.evaluateField(field, { strictVisibility: false })
      expect(reevaluated).not.toBeNull()
      expect(reevaluated!.tier).toBe(1)
    })
  })

  describe('result priority ordering', () => {
    it('should rank stronger Tier 2 results above weaker Tier 1 results', () => {
      // Set up page with both a Tier 1 field and a Tier 2 split-input field
      document.body.innerHTML = `
        <input type="text" inputmode="numeric" maxlength="6" id="otp-single">
        <div>
          <label>Enter code</label>
          <input type="text" maxlength="1" id="split-0">
          <input type="text" maxlength="1" id="split-1">
          <input type="text" maxlength="1" id="split-2">
          <input type="text" maxlength="1" id="split-3">
          <input type="text" maxlength="1" id="split-4">
          <input type="text" maxlength="1" id="split-5">
        </div>
      `

      const results = detector.detectExisting({ strictVisibility: false })

      // Must detect at least 2 results (both tiers)
      expect(results.length).toBeGreaterThanOrEqual(2)

      const tier1Results = results.filter(r => r.tier === 1)
      const tier2Results = results.filter(r => r.tier === 2)

      // Both tiers must be present for this test to be meaningful
      expect(tier1Results.length).toBeGreaterThan(0)
      expect(tier2Results.length).toBeGreaterThan(0)

      // Confidence wins before tier so page load picks the strongest field.
      const firstTier1Index = results.indexOf(tier1Results[0])
      const firstTier2Index = results.indexOf(tier2Results[0])
      expect(firstTier2Index).toBeLessThan(firstTier1Index)
    })
  })

  describe('Performance', () => {
    it('should meet Tier 1 performance target (<1ms)', () => {
      document.body.innerHTML = `
        <input type="text" autocomplete="one-time-code" data-testid="verification-field">
      `

      const results = detector.detectExisting({ strictVisibility: false })

      expect(results).toHaveLength(1)
      expect(results[0].tier).toBe(1)
      expect(results[0].executionTime).toBeLessThan(1)
    })

    it('should meet Tier 1 performance target (<1ms)', () => {
      document.body.innerHTML = `
        <label for="code">Enter your verification code</label>
        <input type="text" id="code" data-testid="verification-field">
      `

      const results = detector.detectExisting({ strictVisibility: false })

      expect(results).toHaveLength(1)
      expect(results[0].tier).toBe(1)  // Tier 1 detects id="code" via exact match
      expect(results[0].executionTime).toBeLessThan(1)
    })
  })
})
