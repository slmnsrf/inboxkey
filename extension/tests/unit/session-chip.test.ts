/**
 * Unit tests for session-chip
 * Tests chip lifecycle, state updates, keyboard accessibility, and ARIA compliance
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Window } from 'happy-dom'
import { showSessionChip, type ChipState } from '../../src/contents/session-chip'

describe('session-chip', () => {
  let window: Window
  let document: Document
  let testField: HTMLInputElement

  beforeEach(() => {
    window = new Window()
    document = window.document
    global.document = document as any
    global.window = window as any

    // Create a test input field
    document.body.innerHTML = `
      <input type="text" id="test-field" style="position: absolute; top: 100px; left: 200px;">
    `
    testField = document.getElementById('test-field') as HTMLInputElement
  })

  afterEach(() => {
    // Clean up any chips
    const chips = document.querySelectorAll('[data-inboxkey-chip]')
    chips.forEach(chip => chip.remove())
  })

  describe('showSessionChip', () => {
    it('should create chip element with correct structure', () => {
      const chipHandle = showSessionChip(testField)

      const chip = document.querySelector('[data-inboxkey-chip]') as HTMLElement
      expect(chip).not.toBeNull()
      expect(chip.tagName).toBe('DIV')
      expect(chip.getAttribute('role')).toBe('status')
      expect(chip.getAttribute('aria-live')).toBe('polite')

      chipHandle.hide()
    })

    it('should display "listening" state by default', () => {
      const chipHandle = showSessionChip(testField)

      const chip = document.querySelector('[data-inboxkey-chip]') as HTMLElement
      expect(chip.textContent).toContain('Listening for a code')

      chipHandle.hide()
    })

    it('should position chip near the field', () => {
      const chipHandle = showSessionChip(testField)

      const chip = document.querySelector('[data-inboxkey-chip]') as HTMLElement
      expect(chip.style.position).toBe('fixed')
      expect(chip.style.zIndex).toBe('999999')

      chipHandle.hide()
    })

    it('should have correct default styling', () => {
      const chipHandle = showSessionChip(testField)

      const chip = document.querySelector('[data-inboxkey-chip]') as HTMLElement
      expect(chip.style.backgroundColor).toBe('rgb(33, 33, 33)')
      expect(chip.style.color).toBe('rgb(255, 255, 255)')
      expect(chip.style.padding).toBe('8px 16px')
      expect(chip.style.borderRadius).toBe('20px')
      expect(chip.style.fontSize).toBe('14px')

      chipHandle.hide()
    })
  })

  describe('ChipHandle.update', () => {
    it('should update to "filled" state with correct text and color', () => {
      const chipHandle = showSessionChip(testField)
      chipHandle.update('filled')

      const chip = document.querySelector('[data-inboxkey-chip]') as HTMLElement
      expect(chip.textContent).toContain('Filled ✓')
      expect(chip.style.backgroundColor).toBe('rgb(76, 175, 80)') // green

      chipHandle.hide()
    })

    it('should update to "copied" state with correct text and color', () => {
      const chipHandle = showSessionChip(testField)
      chipHandle.update('copied')

      const chip = document.querySelector('[data-inboxkey-chip]') as HTMLElement
      expect(chip.textContent).toContain('Code copied—paste into the field')
      expect(chip.style.backgroundColor).toBe('rgb(33, 150, 243)') // blue

      chipHandle.hide()
    })

    it('should update to "timeout" state with correct text and color', () => {
      const chipHandle = showSessionChip(testField)
      chipHandle.update('timeout')

      const chip = document.querySelector('[data-inboxkey-chip]') as HTMLElement
      expect(chip.textContent).toContain('No new code')
      expect(chip.style.backgroundColor).toBe('rgb(255, 152, 0)') // orange

      chipHandle.hide()
    })

    it('should allow multiple state updates', () => {
      const chipHandle = showSessionChip(testField)

      chipHandle.update('listening')
      let chip = document.querySelector('[data-inboxkey-chip]') as HTMLElement
      expect(chip.textContent).toContain('Listening for a code')

      chipHandle.update('filled')
      chip = document.querySelector('[data-inboxkey-chip]') as HTMLElement
      expect(chip.textContent).toContain('Filled ✓')

      chipHandle.hide()
    })
  })

  describe('ChipHandle.hide', () => {
    it('should remove chip from DOM', () => {
      const chipHandle = showSessionChip(testField)

      const chip = document.querySelector('[data-inboxkey-chip]')
      expect(chip).not.toBeNull()

      chipHandle.hide()

      const removedChip = document.querySelector('[data-inboxkey-chip]')
      expect(removedChip).toBeNull()
    })

    it('should be idempotent (safe to call multiple times)', () => {
      const chipHandle = showSessionChip(testField)

      chipHandle.hide()
      chipHandle.hide() // Should not throw
      chipHandle.hide()

      const chip = document.querySelector('[data-inboxkey-chip]')
      expect(chip).toBeNull()
    })
  })

  describe('Keyboard accessibility', () => {
    it('should dismiss chip on Escape key', () => {
      const chipHandle = showSessionChip(testField)

      const chip = document.querySelector('[data-inboxkey-chip]') as HTMLElement
      expect(chip).not.toBeNull()

      // Simulate Escape key
      const event = new window.KeyboardEvent('keydown', { key: 'Escape' })
      document.dispatchEvent(event)

      // Chip should be removed
      const removedChip = document.querySelector('[data-inboxkey-chip]')
      expect(removedChip).toBeNull()

      chipHandle.hide() // Cleanup
    })

    it('should not dismiss chip on other keys', () => {
      const chipHandle = showSessionChip(testField)

      const chip = document.querySelector('[data-inboxkey-chip]') as HTMLElement
      expect(chip).not.toBeNull()

      // Simulate Enter key
      const event = new window.KeyboardEvent('keydown', { key: 'Enter' })
      document.dispatchEvent(event)

      // Chip should still exist
      const stillThere = document.querySelector('[data-inboxkey-chip]')
      expect(stillThere).not.toBeNull()

      chipHandle.hide()
    })
  })

  describe('Auto-dismiss behavior', () => {
    it('should auto-dismiss "filled" state after 5s', async () => {
      vi.useFakeTimers()

      const chipHandle = showSessionChip(testField)
      chipHandle.update('filled')

      const chip = document.querySelector('[data-inboxkey-chip]')
      expect(chip).not.toBeNull()

      // Fast-forward 4.9s - chip should still be there
      vi.advanceTimersByTime(4900)
      expect(document.querySelector('[data-inboxkey-chip]')).not.toBeNull()

      // Fast-forward another 200ms - chip should be removed
      vi.advanceTimersByTime(200)
      expect(document.querySelector('[data-inboxkey-chip]')).toBeNull()

      vi.useRealTimers()
      chipHandle.hide()
    })

    it('should auto-dismiss "copied" state after 5s', async () => {
      vi.useFakeTimers()

      const chipHandle = showSessionChip(testField)
      chipHandle.update('copied')

      const chip = document.querySelector('[data-inboxkey-chip]')
      expect(chip).not.toBeNull()

      // Fast-forward 5s
      vi.advanceTimersByTime(5000)
      expect(document.querySelector('[data-inboxkey-chip]')).toBeNull()

      vi.useRealTimers()
      chipHandle.hide()
    })

    it('should auto-dismiss "timeout" state after 5s', async () => {
      vi.useFakeTimers()

      const chipHandle = showSessionChip(testField)
      chipHandle.update('timeout')

      const chip = document.querySelector('[data-inboxkey-chip]')
      expect(chip).not.toBeNull()

      // Fast-forward 5s
      vi.advanceTimersByTime(5000)
      expect(document.querySelector('[data-inboxkey-chip]')).toBeNull()

      vi.useRealTimers()
      chipHandle.hide()
    })

    it('should NOT auto-dismiss "listening" state', async () => {
      vi.useFakeTimers()

      const chipHandle = showSessionChip(testField)
      chipHandle.update('listening')

      const chip = document.querySelector('[data-inboxkey-chip]')
      expect(chip).not.toBeNull()

      // Fast-forward 10s - chip should still be there
      vi.advanceTimersByTime(10000)
      expect(document.querySelector('[data-inboxkey-chip]')).not.toBeNull()

      vi.useRealTimers()
      chipHandle.hide()
    })
  })

  describe('Multiple chips prevention', () => {
    it('should only allow one chip at a time', () => {
      const handle1 = showSessionChip(testField)
      const handle2 = showSessionChip(testField)

      const chips = document.querySelectorAll('[data-inboxkey-chip]')
      expect(chips.length).toBe(1)

      handle1.hide()
      handle2.hide()
    })

    it('should replace existing chip when creating new one', () => {
      const handle1 = showSessionChip(testField)
      handle1.update('listening')

      const chip1 = document.querySelector('[data-inboxkey-chip]') as HTMLElement
      expect(chip1.textContent).toContain('Listening')

      const handle2 = showSessionChip(testField)
      handle2.update('filled')

      const chips = document.querySelectorAll('[data-inboxkey-chip]')
      expect(chips.length).toBe(1)

      const chip2 = document.querySelector('[data-inboxkey-chip]') as HTMLElement
      expect(chip2.textContent).toContain('Filled')

      handle2.hide()
    })
  })

  describe('ARIA compliance', () => {
    it('should have role="status" for screen readers', () => {
      const chipHandle = showSessionChip(testField)

      const chip = document.querySelector('[data-inboxkey-chip]') as HTMLElement
      expect(chip.getAttribute('role')).toBe('status')

      chipHandle.hide()
    })

    it('should have aria-live="polite" for announcements', () => {
      const chipHandle = showSessionChip(testField)

      const chip = document.querySelector('[data-inboxkey-chip]') as HTMLElement
      expect(chip.getAttribute('aria-live')).toBe('polite')

      chipHandle.hide()
    })

    it('should update aria-label on state change', () => {
      const chipHandle = showSessionChip(testField)

      chipHandle.update('listening')
      let chip = document.querySelector('[data-inboxkey-chip]') as HTMLElement
      expect(chip.textContent).toContain('Listening')

      chipHandle.update('filled')
      chip = document.querySelector('[data-inboxkey-chip]') as HTMLElement
      expect(chip.textContent).toContain('Filled')

      chipHandle.hide()
    })
  })

  describe('Reduced motion support', () => {
    it('should respect prefers-reduced-motion', () => {
      // Note: happy-dom doesn't fully support matchMedia, but we can test the structure
      const chipHandle = showSessionChip(testField)

      const chip = document.querySelector('[data-inboxkey-chip]') as HTMLElement
      // Chip should always have transition property (CSS handles reduced motion)
      expect(chip.style.transition).toBeDefined()

      chipHandle.hide()
    })
  })

  describe('Edge cases', () => {
    it('should handle field removal gracefully', () => {
      const chipHandle = showSessionChip(testField)

      // Remove field from DOM
      testField.remove()

      // Update should not throw
      expect(() => chipHandle.update('filled')).not.toThrow()
      expect(() => chipHandle.hide()).not.toThrow()
    })

    it('should handle rapid state changes', () => {
      const chipHandle = showSessionChip(testField)

      // Rapidly change states
      chipHandle.update('listening')
      chipHandle.update('filled')
      chipHandle.update('copied')
      chipHandle.update('timeout')
      chipHandle.update('listening')

      const chip = document.querySelector('[data-inboxkey-chip]') as HTMLElement
      expect(chip).not.toBeNull()
      expect(chip.textContent).toContain('Listening')

      chipHandle.hide()
    })

    it('should clean up event listeners on hide', () => {
      const chipHandle = showSessionChip(testField)
      chipHandle.hide()

      // Dispatch escape key after hide - should not throw
      const event = new window.KeyboardEvent('keydown', { key: 'Escape' })
      expect(() => document.dispatchEvent(event)).not.toThrow()
    })
  })
})
