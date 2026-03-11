/**
 * Unit tests for Autofill module
 * Tests autofill logic, validation, and visual feedback
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Window } from 'happy-dom'

// Mock dependencies before importing module under test
vi.mock('../../src/lib/utils/domain', () => ({
  extractDomain: vi.fn(() => 'example.com'),
  isDomainEnabled: vi.fn(() => Promise.resolve(true)),
}))

vi.mock('../../src/contents/submit-button-finder', () => ({
  findSubmitButton: vi.fn(() => Promise.resolve(null)),
}))

vi.mock('../../src/lib/storage/telemetry', () => ({
  logAutoSubmitFailure: vi.fn(() => Promise.resolve()),
  logBetaFeatureUsage: vi.fn(() => Promise.resolve()),
}))

vi.mock('../../src/lib/detection/split-input-detector', () => ({
  detectSplitInputGroup: vi.fn(() => null),
}))

import {
  autofillCode,
  isFieldFilledByInboxKey,
  getFieldFillTimestamp,
  clearAutofillTracking,
  findAndClickSubmitButton,
} from '../../src/contents/autofill'
import { findSubmitButton } from '../../src/contents/submit-button-finder'

describe('Autofill', () => {
  let window: Window
  let document: Document
  let boundingRectSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    window = new Window()
    document = window.document
    global.document = document as any
    global.window = window as any

    // Mock getBoundingClientRect to return non-zero dimensions
    // happy-dom returns {width:0, height:0} by default which causes autofill to bail
    boundingRectSpy = vi.spyOn(HTMLInputElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 200, height: 30, top: 100, left: 50, bottom: 130, right: 250, x: 50, y: 100,
      toJSON: () => ({})
    } as DOMRect)

    // Mock setTimeout
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe('autofillCode()', () => {
    it('should fill code into field', async () => {
      const field = document.createElement('input')
      field.type = 'text'
      document.body.appendChild(field)

      const result = await autofillCode({
        code: '123456',
        field,
        showFeedback: false,
      })

      expect(result).toBe(true)
      expect(field.value).toBe('123456')
    })

    it('should return false for empty code', async () => {
      const field = document.createElement('input')
      field.type = 'text'
      document.body.appendChild(field)

      const result = await autofillCode({
        code: '',
        field,
        showFeedback: false,
      })

      expect(result).toBe(false)
      expect(field.value).toBe('')
    })

    it('should return false if field not in DOM', async () => {
      const field = document.createElement('input')
      field.type = 'text'
      // Don't append to document

      const result = await autofillCode({
        code: '123456',
        field,
        showFeedback: false,
      })

      expect(result).toBe(false)
      expect(field.value).toBe('')
    })

    it('should return false if field is readonly', async () => {
      const field = document.createElement('input')
      field.type = 'text'
      field.readOnly = true
      document.body.appendChild(field)

      const result = await autofillCode({
        code: '123456',
        field,
        showFeedback: false,
      })

      expect(result).toBe(false)
      expect(field.value).toBe('')
    })

    it('should return false if field is disabled', async () => {
      const field = document.createElement('input')
      field.type = 'text'
      field.disabled = true
      document.body.appendChild(field)

      const result = await autofillCode({
        code: '123456',
        field,
        showFeedback: false,
      })

      expect(result).toBe(false)
      expect(field.value).toBe('')
    })

    it('should return false if field is hidden (display: none)', async () => {
      const field = document.createElement('input')
      field.type = 'text'
      field.style.display = 'none'
      document.body.appendChild(field)

      const result = await autofillCode({
        code: '123456',
        field,
        showFeedback: false,
      })

      expect(result).toBe(false)
      expect(field.value).toBe('')
    })

    it('should return false if field is hidden (visibility: hidden)', async () => {
      const field = document.createElement('input')
      field.type = 'text'
      field.style.visibility = 'hidden'
      document.body.appendChild(field)

      const result = await autofillCode({
        code: '123456',
        field,
        showFeedback: false,
      })

      expect(result).toBe(false)
      expect(field.value).toBe('')
    })

    it('should focus the field before filling', async () => {
      const field = document.createElement('input')
      field.type = 'text'
      document.body.appendChild(field)

      const focusSpy = vi.spyOn(field, 'focus')

      await autofillCode({
        code: '123456',
        field,
        showFeedback: false,
      })

      expect(focusSpy).toHaveBeenCalled()
    })

    it('should dispatch input event', async () => {
      const field = document.createElement('input')
      field.type = 'text'
      document.body.appendChild(field)

      const inputListener = vi.fn()
      field.addEventListener('input', inputListener)

      await autofillCode({
        code: '123456',
        field,
        showFeedback: false,
      })

      expect(inputListener).toHaveBeenCalled()
    })

    it('should dispatch change event', async () => {
      const field = document.createElement('input')
      field.type = 'text'
      document.body.appendChild(field)

      const changeListener = vi.fn()
      field.addEventListener('change', changeListener)

      await autofillCode({
        code: '123456',
        field,
        showFeedback: false,
      })

      expect(changeListener).toHaveBeenCalled()
    })

    it('should dispatch keydown and keyup events', async () => {
      const field = document.createElement('input')
      field.type = 'text'
      document.body.appendChild(field)

      const keydownListener = vi.fn()
      const keyupListener = vi.fn()
      field.addEventListener('keydown', keydownListener)
      field.addEventListener('keyup', keyupListener)

      await autofillCode({
        code: '123456',
        field,
        showFeedback: false,
      })

      expect(keydownListener).toHaveBeenCalled()
      expect(keyupListener).toHaveBeenCalled()
    })

    it('should mark field with data-inboxkey-filled attribute', async () => {
      const field = document.createElement('input')
      field.type = 'text'
      document.body.appendChild(field)

      await autofillCode({
        code: '123456',
        field,
        showFeedback: false,
      })

      expect(field.getAttribute('data-inboxkey-filled')).toBe('true')
    })

    it('should set data-inboxkey-timestamp attribute', async () => {
      const field = document.createElement('input')
      field.type = 'text'
      document.body.appendChild(field)

      const beforeTime = Date.now()

      await autofillCode({
        code: '123456',
        field,
        showFeedback: false,
      })

      const afterTime = Date.now()
      const timestamp = parseInt(field.getAttribute('data-inboxkey-timestamp') || '0', 10)

      expect(timestamp).toBeGreaterThanOrEqual(beforeTime)
      expect(timestamp).toBeLessThanOrEqual(afterTime)
    })

    it('should apply visual feedback when showFeedback=true', async () => {
      const field = document.createElement('input')
      field.type = 'text'
      document.body.appendChild(field)

      await autofillCode({
        code: '123456',
        field,
        showFeedback: true,
      })

      // Check that styles were applied
      expect(field.style.backgroundColor).toBeTruthy()
      expect(field.style.border).toBeTruthy()
    })

    it('should not apply visual feedback when showFeedback=false', async () => {
      const field = document.createElement('input')
      field.type = 'text'
      document.body.appendChild(field)

      const originalBackground = field.style.backgroundColor
      const originalBorder = field.style.border

      await autofillCode({
        code: '123456',
        field,
        showFeedback: false,
      })

      expect(field.style.backgroundColor).toBe(originalBackground)
      expect(field.style.border).toBe(originalBorder)
    })

    it('should revert visual feedback after 2 seconds', async () => {
      const field = document.createElement('input')
      field.type = 'text'
      document.body.appendChild(field)

      const originalBackground = field.style.backgroundColor
      const originalBorder = field.style.border

      await autofillCode({
        code: '123456',
        field,
        showFeedback: true,
      })

      // Styles should be applied
      expect(field.style.backgroundColor).not.toBe(originalBackground)

      // Fast-forward 2 seconds
      vi.advanceTimersByTime(2000)

      // Styles should be reverted
      expect(field.style.backgroundColor).toBe(originalBackground)
      expect(field.style.border).toBe(originalBorder)
    })

    it('should handle numeric codes', async () => {
      const field = document.createElement('input')
      field.type = 'text'
      document.body.appendChild(field)

      await autofillCode({
        code: '999999',
        field,
        showFeedback: false,
      })

      expect(field.value).toBe('999999')
    })

    it('should handle alphanumeric codes', async () => {
      const field = document.createElement('input')
      field.type = 'text'
      document.body.appendChild(field)

      await autofillCode({
        code: 'ABC123',
        field,
        showFeedback: false,
      })

      expect(field.value).toBe('ABC123')
    })

    it('should handle codes with special characters', async () => {
      const field = document.createElement('input')
      field.type = 'text'
      document.body.appendChild(field)

      await autofillCode({
        code: '12-34-56',
        field,
        showFeedback: false,
      })

      expect(field.value).toBe('12-34-56')
    })

    it('should replace existing value', async () => {
      const field = document.createElement('input')
      field.type = 'text'
      field.value = 'old-value'
      document.body.appendChild(field)

      await autofillCode({
        code: '123456',
        field,
        showFeedback: false,
      })

      expect(field.value).toBe('123456')
    })
  })

  describe('isFieldFilledByInboxKey()', () => {
    it('should return false for unfilled field', () => {
      const field = document.createElement('input')

      expect(isFieldFilledByInboxKey(field)).toBe(false)
    })

    it('should return true for filled field', async () => {
      const field = document.createElement('input')
      field.type = 'text'
      document.body.appendChild(field)

      await autofillCode({
        code: '123456',
        field,
        showFeedback: false,
      })

      expect(isFieldFilledByInboxKey(field)).toBe(true)
    })

    it('should return false after clearing tracking', async () => {
      const field = document.createElement('input')
      field.type = 'text'
      document.body.appendChild(field)

      await autofillCode({
        code: '123456',
        field,
        showFeedback: false,
      })

      clearAutofillTracking(field)

      expect(isFieldFilledByInboxKey(field)).toBe(false)
    })
  })

  describe('getFieldFillTimestamp()', () => {
    it('should return null for unfilled field', () => {
      const field = document.createElement('input')

      expect(getFieldFillTimestamp(field)).toBeNull()
    })

    it('should return timestamp for filled field', async () => {
      const field = document.createElement('input')
      field.type = 'text'
      document.body.appendChild(field)

      const beforeTime = Date.now()

      await autofillCode({
        code: '123456',
        field,
        showFeedback: false,
      })

      const afterTime = Date.now()
      const timestamp = getFieldFillTimestamp(field)

      expect(timestamp).not.toBeNull()
      expect(timestamp).toBeGreaterThanOrEqual(beforeTime)
      expect(timestamp).toBeLessThanOrEqual(afterTime)
    })

    it('should return null after clearing tracking', async () => {
      const field = document.createElement('input')
      field.type = 'text'
      document.body.appendChild(field)

      await autofillCode({
        code: '123456',
        field,
        showFeedback: false,
      })

      clearAutofillTracking(field)

      expect(getFieldFillTimestamp(field)).toBeNull()
    })
  })

  describe('clearAutofillTracking()', () => {
    it('should remove data-inboxkey-filled attribute', async () => {
      const field = document.createElement('input')
      field.type = 'text'
      document.body.appendChild(field)

      await autofillCode({
        code: '123456',
        field,
        showFeedback: false,
      })

      expect(field.hasAttribute('data-inboxkey-filled')).toBe(true)

      clearAutofillTracking(field)

      expect(field.hasAttribute('data-inboxkey-filled')).toBe(false)
    })

    it('should remove data-inboxkey-timestamp attribute', async () => {
      const field = document.createElement('input')
      field.type = 'text'
      document.body.appendChild(field)

      await autofillCode({
        code: '123456',
        field,
        showFeedback: false,
      })

      expect(field.hasAttribute('data-inboxkey-timestamp')).toBe(true)

      clearAutofillTracking(field)

      expect(field.hasAttribute('data-inboxkey-timestamp')).toBe(false)
    })

    it('should not throw on unfilled field', () => {
      const field = document.createElement('input')

      expect(() => clearAutofillTracking(field)).not.toThrow()
    })

    it('should not affect field value', async () => {
      const field = document.createElement('input')
      field.type = 'text'
      document.body.appendChild(field)

      await autofillCode({
        code: '123456',
        field,
        showFeedback: false,
      })

      clearAutofillTracking(field)

      expect(field.value).toBe('123456')
    })
  })

  describe('Form submission', () => {
    it('should not auto-submit by default', async () => {
      const form = document.createElement('form')
      const field = document.createElement('input')
      field.type = 'text'
      form.appendChild(field)
      document.body.appendChild(form)

      const submitSpy = vi.spyOn(form, 'submit')

      await autofillCode({
        code: '123456',
        field,
        showFeedback: false,
      })

      expect(submitSpy).not.toHaveBeenCalled()
    })
  })

  describe('Edge cases', () => {
    it('should handle field with zero size gracefully', async () => {
      const field = document.createElement('input')
      field.type = 'text'
      field.style.width = '0'
      field.style.height = '0'
      document.body.appendChild(field)

      // Override mock to return zero dimensions for this specific field
      vi.spyOn(field, 'getBoundingClientRect').mockReturnValue({
        width: 0, height: 0, top: 0, left: 0, bottom: 0, right: 0, x: 0, y: 0,
        toJSON: () => ({})
      } as DOMRect)

      const result = await autofillCode({
        code: '123456',
        field,
        showFeedback: false,
      })

      expect(result).toBe(false)
    })

    it('should handle very long codes', async () => {
      const field = document.createElement('input')
      field.type = 'text'
      document.body.appendChild(field)

      const longCode = '1'.repeat(100)

      await autofillCode({
        code: longCode,
        field,
        showFeedback: false,
      })

      expect(field.value).toBe(longCode)
    })

    it('should handle codes with whitespace', async () => {
      const field = document.createElement('input')
      field.type = 'text'
      document.body.appendChild(field)

      await autofillCode({
        code: '123 456',
        field,
        showFeedback: false,
      })

      expect(field.value).toBe('123 456')
    })

    it('should handle unicode characters', async () => {
      const field = document.createElement('input')
      field.type = 'text'
      document.body.appendChild(field)

      await autofillCode({
        code: '测试123',
        field,
        showFeedback: false,
      })

      expect(field.value).toBe('测试123')
    })
  })

  describe('findAndClickSubmitButton()', () => {
    it('should find and click submit button when finder returns a button', async () => {
      const form = document.createElement('form')
      const field = document.createElement('input')
      field.type = 'text'
      const button = document.createElement('button')
      button.type = 'submit'
      button.textContent = 'Verify'

      form.appendChild(field)
      form.appendChild(button)
      document.body.appendChild(form)

      // Mock findSubmitButton to return the button
      vi.mocked(findSubmitButton).mockResolvedValue(button)
      const clickSpy = vi.spyOn(button, 'click')

      const result = await findAndClickSubmitButton(field)

      expect(result).toBe(true)
      expect(clickSpy).toHaveBeenCalled()
    })

    it('should return false when no safe button found', async () => {
      const form = document.createElement('form')
      const field = document.createElement('input')
      field.type = 'text'

      form.appendChild(field)
      document.body.appendChild(form)

      // findSubmitButton returns null by default mock
      vi.mocked(findSubmitButton).mockResolvedValue(null)

      const result = await findAndClickSubmitButton(field)

      expect(result).toBe(false)
    })

    it('should handle button click errors gracefully', async () => {
      const form = document.createElement('form')
      const field = document.createElement('input')
      field.type = 'text'
      const button = document.createElement('button')
      button.textContent = 'Submit'

      form.appendChild(field)
      form.appendChild(button)
      document.body.appendChild(form)

      // Mock findSubmitButton to return the button
      vi.mocked(findSubmitButton).mockResolvedValue(button)

      // Mock click to throw error
      vi.spyOn(button, 'click').mockImplementation(() => {
        throw new Error('Click failed')
      })

      const result = await findAndClickSubmitButton(field)

      expect(result).toBe(false)
    })

    it('should not click dangerous buttons (finder returns null)', async () => {
      const form = document.createElement('form')
      const field = document.createElement('input')
      field.type = 'text'
      const logoutButton = document.createElement('button')
      logoutButton.textContent = 'Logout'

      form.appendChild(field)
      form.appendChild(logoutButton)
      document.body.appendChild(form)

      // findSubmitButton correctly rejects dangerous buttons
      vi.mocked(findSubmitButton).mockResolvedValue(null)

      const logoutSpy = vi.spyOn(logoutButton, 'click')

      const result = await findAndClickSubmitButton(field)

      expect(result).toBe(false)
      expect(logoutSpy).not.toHaveBeenCalled()
    })
  })
})
