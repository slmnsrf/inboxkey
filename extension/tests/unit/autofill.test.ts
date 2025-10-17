/**
 * Unit tests for Autofill module
 * Tests autofill logic, validation, and visual feedback
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Window } from 'happy-dom'
import {
  autofillCode,
  isFieldFilledByInboxKey,
  getFieldFillTimestamp,
  clearAutofillTracking,
} from '../../src/contents/autofill'

describe('Autofill', () => {
  let window: Window
  let document: Document

  beforeEach(() => {
    window = new Window()
    document = window.document
    global.document = document as any
    global.window = window as any

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
})
