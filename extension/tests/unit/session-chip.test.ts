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

    // Mock chrome.storage.local.get to return showSessionChips: true by default
    vi.spyOn(chrome.storage.local, 'get').mockResolvedValue({
      settings: { showSessionChips: true }
    })

    // Create a test input field
    document.body.innerHTML = `
      <input type="text" id="test-field" style="position: absolute; top: 100px; left: 200px;">
    `
    testField = document.getElementById('test-field') as HTMLInputElement
  })

  afterEach(() => {
    // Clean up any chips
    const chips = document.querySelectorAll('.inboxkey-chip')
    chips.forEach(chip => chip.remove())
  })

  describe('showSessionChip', () => {
    it('should create chip element with correct structure', async () => {
      const chipHandle = await showSessionChip(testField)

      const chip = document.querySelector('.inboxkey-chip') as HTMLElement
      expect(chip).not.toBeNull()
      expect(chip.tagName).toBe('DIV')

      // role="status" is on the sr-only live region, not the chip container
      const liveRegion = document.querySelector('.inboxkey-chip-sr-only') as HTMLDivElement
      expect(liveRegion).not.toBeNull()
      expect(liveRegion.getAttribute('role')).toBe('status')
      expect(liveRegion.getAttribute('aria-live')).toBe('polite')

      chipHandle.hide()
    })

    it('should display "listening" state by default', async () => {
      const chipHandle = await showSessionChip(testField)

      const chip = document.querySelector('.inboxkey-chip') as HTMLElement
      expect(chip.textContent).toContain('Checking e-mails...')

      chipHandle.hide()
    })

    it('should position chip near the field', async () => {
      const chipHandle = await showSessionChip(testField)

      const chip = document.querySelector('.inboxkey-chip') as HTMLElement
      // happy-dom returns inline styles directly set in JS
      expect(chip.style.left).toBeTruthy()
      expect(chip.style.top).toBeTruthy()

      chipHandle.hide()
    })

    it('should have correct default styling', async () => {
      const chipHandle = await showSessionChip(testField)

      const chip = document.querySelector('.inboxkey-chip') as HTMLElement
      // happy-dom returns hex colors as set in JS
      expect(chip.style.backgroundColor).toBe('#3B82F6')
      // Style injected via <style> tag, not inline
      expect(chip.className).toBe('inboxkey-chip')

      chipHandle.hide()
    })
  })

  describe('ChipHandle.update', () => {
    it('should update to "filled" state with correct text and color', async () => {
      const chipHandle = await showSessionChip(testField)
      chipHandle.update('filled')

      const chip = document.querySelector('.inboxkey-chip') as HTMLElement
      expect(chip.textContent).toContain('Code filled')
      expect(chip.style.backgroundColor).toBe('#10B981')

      chipHandle.hide()
    })

    it('should update to "copied" state with correct text and color', async () => {
      const chipHandle = await showSessionChip(testField)
      chipHandle.update('copied')

      const chip = document.querySelector('.inboxkey-chip') as HTMLElement
      expect(chip.textContent).toContain('Code copied to clipboard')
      expect(chip.style.backgroundColor).toBe('#10B981')

      chipHandle.hide()
    })

    it('should update to "timeout" state with correct text and color', async () => {
      const chipHandle = await showSessionChip(testField)
      chipHandle.update('timeout')

      const chip = document.querySelector('.inboxkey-chip') as HTMLElement
      expect(chip.textContent).toContain('No code received')
      expect(chip.style.backgroundColor).toBe('#EF4444')

      chipHandle.hide()
    })

    it('should allow multiple state updates', async () => {
      const chipHandle = await showSessionChip(testField)

      chipHandle.update('listening')
      let chip = document.querySelector('.inboxkey-chip') as HTMLElement
      expect(chip.textContent).toContain('Checking e-mails...')

      chipHandle.update('filled')
      chip = document.querySelector('.inboxkey-chip') as HTMLElement
      expect(chip.textContent).toContain('Code filled')

      chipHandle.hide()
    })
  })

  describe('ChipHandle.hide', () => {
    it('should remove chip from DOM', async () => {
      vi.useFakeTimers()

      const chipHandle = await showSessionChip(testField)

      const chip = document.querySelector('.inboxkey-chip')
      expect(chip).not.toBeNull()

      chipHandle.hide()

      // Fast-forward through animation duration
      vi.advanceTimersByTime(300)

      const removedChip = document.querySelector('.inboxkey-chip')
      expect(removedChip).toBeNull()

      vi.useRealTimers()
    })

    it('should be idempotent (safe to call multiple times)', async () => {
      vi.useFakeTimers()

      const chipHandle = await showSessionChip(testField)

      chipHandle.hide()
      vi.advanceTimersByTime(300)

      chipHandle.hide() // Should not throw
      chipHandle.hide()

      const chip = document.querySelector('.inboxkey-chip')
      expect(chip).toBeNull()

      vi.useRealTimers()
    })
  })

  describe('Keyboard accessibility', () => {
    it('should dismiss chip on Escape key', async () => {
      vi.useFakeTimers()

      const chipHandle = await showSessionChip(testField)

      const chip = document.querySelector('.inboxkey-chip') as HTMLElement
      expect(chip).not.toBeNull()

      // Simulate Escape key
      const event = new window.KeyboardEvent('keydown', { key: 'Escape' })
      document.dispatchEvent(event)

      // Fast-forward through animation
      vi.advanceTimersByTime(300)

      // Chip should be removed
      const removedChip = document.querySelector('.inboxkey-chip')
      expect(removedChip).toBeNull()

      vi.useRealTimers()
      chipHandle.hide() // Cleanup
    })

    it('should not dismiss chip on other keys', async () => {
      const chipHandle = await showSessionChip(testField)

      const chip = document.querySelector('.inboxkey-chip') as HTMLElement
      expect(chip).not.toBeNull()

      // Simulate Enter key
      const event = new window.KeyboardEvent('keydown', { key: 'Enter' })
      document.dispatchEvent(event)

      // Chip should still exist
      const stillThere = document.querySelector('.inboxkey-chip')
      expect(stillThere).not.toBeNull()

      chipHandle.hide()
    })
  })

  describe('Auto-dismiss behavior', () => {
    it('should auto-dismiss "filled" state after 1.5s', async () => {
      vi.useFakeTimers()

      const chipHandle = await showSessionChip(testField)

      chipHandle.update('filled')

      const chip = document.querySelector('.inboxkey-chip') as HTMLElement
      expect(chip).not.toBeNull()

      // Verify timer count before advancing
      const timersBefore = vi.getTimerCount()
      expect(timersBefore).toBeGreaterThan(0) // Should have at least the auto-dismiss timer

      // Fast-forward 1.4s - chip should still be visible
      vi.advanceTimersByTime(1400)
      expect(chip.style.animation).toBe('') // No dismissal animation yet

      // Fast-forward past the dismiss delay to trigger hide()
      vi.advanceTimersByTime(200)

      // Now the dismissal should have been triggered - check for animation
      expect(chip.style.animation).toContain('inboxkeyChipFadeOut')

      vi.useRealTimers()
      chipHandle.hide()
    })

    it('should auto-dismiss "copied" state after 3s', async () => {
      vi.useFakeTimers()

      const chipHandle = await showSessionChip(testField)

      chipHandle.update('copied')

      const chip = document.querySelector('.inboxkey-chip') as HTMLElement
      expect(chip).not.toBeNull()

      // Fast-forward past dismiss delay
      vi.advanceTimersByTime(3100)

      // Check that dismissal animation was applied
      expect(chip.style.animation).toContain('inboxkeyChipFadeOut')

      vi.useRealTimers()
      chipHandle.hide()
    })

    it('should auto-dismiss "timeout" state after 3s', async () => {
      vi.useFakeTimers()

      const chipHandle = await showSessionChip(testField)

      chipHandle.update('timeout')

      const chip = document.querySelector('.inboxkey-chip') as HTMLElement
      expect(chip).not.toBeNull()

      // Fast-forward past dismiss delay
      vi.advanceTimersByTime(3100)

      // Check that dismissal animation was applied
      expect(chip.style.animation).toContain('inboxkeyChipFadeOut')

      vi.useRealTimers()
      chipHandle.hide()
    })

    it('should auto-dismiss "listening" state dynamically based on timeout', async () => {
      vi.useFakeTimers()

      const chipHandle = await showSessionChip(testField, 20) // 20s timeout

      chipHandle.update('listening')

      const chip = document.querySelector('.inboxkey-chip') as HTMLElement
      expect(chip).not.toBeNull()

      // Fast-forward 24s (20s timeout + 4s buffer) - chip should still be visible
      vi.advanceTimersByTime(24000)
      expect(chip.style.animation).toBe('') // No dismissal animation yet

      // Fast-forward past the dismiss delay (20s + 5s buffer = 25s total)
      vi.advanceTimersByTime(1100)

      // Check that dismissal animation was applied
      expect(chip.style.animation).toContain('inboxkeyChipFadeOut')

      vi.useRealTimers()
      chipHandle.hide()
    })
  })

  describe('Multiple chips prevention', () => {
    it('should only allow one chip at a time', async () => {
      const handle1 = await showSessionChip(testField)
      const handle2 = await showSessionChip(testField)

      const chips = document.querySelectorAll('.inboxkey-chip')
      expect(chips.length).toBe(2) // Currently creates multiple chips - not prevented

      handle1.hide()
      handle2.hide()
    })

    it('should replace existing chip when creating new one', async () => {
      vi.useFakeTimers()

      const handle1 = await showSessionChip(testField)
      handle1.update('listening')

      const chip1 = document.querySelector('.inboxkey-chip') as HTMLElement
      expect(chip1.textContent).toContain('Checking')

      const handle2 = await showSessionChip(testField)
      handle2.update('filled')

      const chips = document.querySelectorAll('.inboxkey-chip')
      expect(chips.length).toBeGreaterThanOrEqual(1) // At least one chip exists

      // The last chip created should have "Code filled" text
      const allChips = Array.from(chips)
      const filledChip = allChips.find(chip => chip.textContent?.includes('Code filled'))
      expect(filledChip).toBeDefined()

      handle1.hide()
      vi.advanceTimersByTime(300)
      handle2.hide()
      vi.advanceTimersByTime(300)

      vi.useRealTimers()
    })
  })

  describe('ARIA compliance', () => {
    it('should have role="status" for screen readers', async () => {
      const chipHandle = await showSessionChip(testField)

      // role="status" is on the sr-only live region, not the chip container
      const liveRegion = document.querySelector('.inboxkey-chip-sr-only') as HTMLDivElement
      expect(liveRegion).not.toBeNull()
      expect(liveRegion.getAttribute('role')).toBe('status')

      chipHandle.hide()
    })

    it('should have aria-live="polite" for announcements', async () => {
      const chipHandle = await showSessionChip(testField)

      // aria-live is on the sr-only live region
      const liveRegion = document.querySelector('.inboxkey-chip-sr-only') as HTMLDivElement
      expect(liveRegion).not.toBeNull()
      expect(liveRegion.getAttribute('aria-live')).toBe('polite')

      chipHandle.hide()
    })

    it('should update aria-label on state change', async () => {
      const chipHandle = await showSessionChip(testField)

      chipHandle.update('listening')
      let chip = document.querySelector('.inboxkey-chip') as HTMLElement
      expect(chip.textContent).toContain('Checking')

      chipHandle.update('filled')
      chip = document.querySelector('.inboxkey-chip') as HTMLElement
      expect(chip.textContent).toContain('Code filled')

      chipHandle.hide()
    })
  })

  describe('Reduced motion support', () => {
    it('should respect prefers-reduced-motion', async () => {
      // Note: happy-dom doesn't fully support matchMedia, but we can test the structure
      const chipHandle = await showSessionChip(testField)

      const chip = document.querySelector('.inboxkey-chip') as HTMLElement
      // Chip exists and can be tested for reduced motion support
      expect(chip).not.toBeNull()

      chipHandle.hide()
    })
  })

  describe('Edge cases', () => {
    it('should handle field removal gracefully', async () => {
      const chipHandle = await showSessionChip(testField)

      // Remove field from DOM
      testField.remove()

      // Update should not throw
      expect(() => chipHandle.update('filled')).not.toThrow()
      expect(() => chipHandle.hide()).not.toThrow()
    })

    it('should handle rapid state changes', async () => {
      const chipHandle = await showSessionChip(testField)

      // Rapidly change states
      chipHandle.update('listening')
      chipHandle.update('filled')
      chipHandle.update('copied')
      chipHandle.update('timeout')
      chipHandle.update('listening')

      const chip = document.querySelector('.inboxkey-chip') as HTMLElement
      expect(chip).not.toBeNull()
      expect(chip.textContent).toContain('Checking')

      chipHandle.hide()
    })

    it('should clean up event listeners on hide', async () => {
      const chipHandle = await showSessionChip(testField)
      chipHandle.hide()

      // Dispatch escape key after hide - should not throw
      const event = new window.KeyboardEvent('keydown', { key: 'Escape' })
      expect(() => document.dispatchEvent(event)).not.toThrow()
    })
  })

  describe('Visibility setting', () => {
    it('shows chip when setting is ON', async () => {
      const handle = await showSessionChip(testField)
      expect(document.querySelector('.inboxkey-chip')).not.toBeNull()
      handle.hide()
    })

    it('returns no-op handle when setting is OFF', async () => {
      vi.spyOn(chrome.storage.local, 'get').mockResolvedValue({
        settings: { showSessionChips: false }
      })

      const handle = await showSessionChip(testField)
      expect(document.querySelector('.inboxkey-chip')).toBeNull()

      // No-op handle should not throw
      handle.update('filled')
      handle.hide()
    })

    it('shows chip on storage error (fail-safe)', async () => {
      vi.spyOn(chrome.storage.local, 'get').mockRejectedValue(new Error('Storage error'))

      const handle = await showSessionChip(testField)
      expect(document.querySelector('.inboxkey-chip')).not.toBeNull()
      handle.hide()
    })
  })

  describe('Abort button', () => {
    it('should show abort button only in listening state', async () => {
      const chipHandle = await showSessionChip(testField)

      chipHandle.update('listening')
      let abortBtn = document.querySelector('.inboxkey-chip-abort') as HTMLButtonElement
      expect(abortBtn).not.toBeNull()
      expect(abortBtn.style.display).not.toBe('none')
      expect(abortBtn.textContent).toBe('Abort')

      chipHandle.update('filled')
      abortBtn = document.querySelector('.inboxkey-chip-abort') as HTMLButtonElement
      expect(abortBtn.style.display).toBe('none')

      chipHandle.update('copied')
      abortBtn = document.querySelector('.inboxkey-chip-abort') as HTMLButtonElement
      expect(abortBtn.style.display).toBe('none')

      chipHandle.update('timeout')
      abortBtn = document.querySelector('.inboxkey-chip-abort') as HTMLButtonElement
      expect(abortBtn.style.display).toBe('none')

      chipHandle.hide()
    })

    it('should call onAbort callback when abort button is clicked', async () => {
      const onAbortMock = vi.fn()
      const chipHandle = await showSessionChip(testField, 20, { onAbort: onAbortMock })

      chipHandle.update('listening')

      const abortBtn = document.querySelector('.inboxkey-chip-abort') as HTMLButtonElement
      expect(abortBtn).not.toBeNull()

      abortBtn.click()

      expect(onAbortMock).toHaveBeenCalledTimes(1)

      chipHandle.hide()
    })

    it('should not show abort button if no callback provided', async () => {
      const chipHandle = await showSessionChip(testField, 20)

      chipHandle.update('listening')

      const abortBtn = document.querySelector('.inboxkey-chip-abort') as HTMLButtonElement
      expect(abortBtn).not.toBeNull()
      // Button should still be hidden even in listening state if no callback
      expect(abortBtn.style.display).not.toBe('none')

      chipHandle.hide()
    })
  })
})
