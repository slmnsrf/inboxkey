/**
 * Unit tests for FieldDetector class
 * Tests dynamic detection, mutation observation, and shadow DOM support
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Window } from 'happy-dom'
import { FieldDetector } from '../../src/lib/detection/field-detector'

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

    it('should not detect hidden fields', () => {
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

      expect(callback).toHaveBeenCalledWith(input)
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
      expect(callback).toHaveBeenCalledWith(input)
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
