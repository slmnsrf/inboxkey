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
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('autofillCode()', () => {
    it('should fill code into field', async () => {
      const field = document.createElement('input')
      field.type = 'text'
      document.body.appendChild(field)

      const result = await autofillCode({
        code: '123456',
        field,
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
      })

      const afterTime = Date.now()
      const timestamp = parseInt(field.getAttribute('data-inboxkey-timestamp') || '0', 10)

      expect(timestamp).toBeGreaterThanOrEqual(beforeTime)
      expect(timestamp).toBeLessThanOrEqual(afterTime)
    })

    it('should handle numeric codes', async () => {
      const field = document.createElement('input')
      field.type = 'text'
      document.body.appendChild(field)

      await autofillCode({
        code: '999999',
        field,
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
      })

      expect(field.value).toBe('测试123')
    })
  })

  describe('split autofill edge cases', () => {
    it('should reject when code is shorter than fillable inputs (shape mismatch)', async () => {
      const container = document.createElement('div')
      const inputs: HTMLInputElement[] = []
      for (let i = 0; i < 6; i++) {
        const input = document.createElement('input')
        input.type = 'text'
        input.maxLength = 1
        input.value = '9' // Pre-existing value
        container.appendChild(input)
        inputs.push(input)
      }
      document.body.appendChild(container)

      // Mock detectSplitInputGroup to return our inputs as a group
      const { detectSplitInputGroup } = await import('../../src/lib/detection/split-input-detector')
      vi.mocked(detectSplitInputGroup).mockReturnValue({
        inputs,
        representative: inputs[0],
        pattern: 'maxlength-1',
      })

      const result = await autofillCode({
        code: '1234',
        field: inputs[0],
      })

      // Strict shape contract: 4 chars != 6 inputs -> reject entirely
      expect(result).toBe(false)
      // No inputs should be modified (bail before filling)
      expect(inputs[0].value).toBe('9')
      expect(inputs[1].value).toBe('9')
      expect(inputs[2].value).toBe('9')
      expect(inputs[3].value).toBe('9')
      expect(inputs[4].value).toBe('9')
      expect(inputs[5].value).toBe('9')
    })

    it('should skip readOnly and disabled inputs and match fillable count', async () => {
      const container = document.createElement('div')
      const inputs: HTMLInputElement[] = []
      for (let i = 0; i < 5; i++) {
        const input = document.createElement('input')
        input.type = 'text'
        input.maxLength = 1
        container.appendChild(input)
        inputs.push(input)
      }
      inputs[1].readOnly = true
      inputs[3].disabled = true
      document.body.appendChild(container)

      const { detectSplitInputGroup } = await import('../../src/lib/detection/split-input-detector')
      vi.mocked(detectSplitInputGroup).mockReturnValue({
        inputs,
        representative: inputs[0],
        pattern: 'maxlength-1',
      })

      // 3 fillable inputs (indices 0, 2, 4), so send exactly 3 chars
      const result = await autofillCode({
        code: '123',
        field: inputs[0],
      })

      expect(result).toBe(true)
      expect(inputs[0].value).toBe('1')
      expect(inputs[1].value).toBe('')  // readOnly - skipped
      expect(inputs[2].value).toBe('2')
      expect(inputs[3].value).toBe('')  // disabled - skipped
      expect(inputs[4].value).toBe('3')
    })

    it('should return false when code is longer than fillable inputs (no partial fill)', async () => {
      const container = document.createElement('div')
      const inputs: HTMLInputElement[] = []
      for (let i = 0; i < 3; i++) {
        const input = document.createElement('input')
        input.type = 'text'
        input.maxLength = 1
        container.appendChild(input)
        inputs.push(input)
      }
      document.body.appendChild(container)

      const { detectSplitInputGroup } = await import('../../src/lib/detection/split-input-detector')
      vi.mocked(detectSplitInputGroup).mockReturnValue({
        inputs,
        representative: inputs[0],
        pattern: 'maxlength-1',
      })

      const result = await autofillCode({
        code: '123456',
        field: inputs[0],
      })

      // Strict shape contract: 6 chars != 3 inputs -> reject entirely
      expect(result).toBe(false)
      // No inputs should be modified (bail before filling)
      expect(inputs[0].value).toBe('')
      expect(inputs[1].value).toBe('')
      expect(inputs[2].value).toBe('')
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
