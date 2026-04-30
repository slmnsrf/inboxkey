/**
 * Tests for getVisibleRelevantInputFields()
 *
 * Verifies that the helper correctly exports visible, relevant text-entry
 * input fields from getAllInputFields(), used by passwordless page detection.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getVisibleRelevantInputFields, resetCooldownRegistry } from '../field-detector'

describe('getVisibleRelevantInputFields', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    resetCooldownRegistry()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    resetCooldownRegistry()
  })

  describe('returns visible relevant text inputs', () => {
    it('returns visible text inputs', () => {
      document.body.innerHTML = `
        <form>
          <input type="text" id="field1" />
          <input type="text" id="field2" />
        </form>
      `
      const fields = getVisibleRelevantInputFields(false)
      expect(fields).toHaveLength(2)
      expect(fields[0].id).toBe('field1')
      expect(fields[1].id).toBe('field2')
    })

    it('returns tel and number inputs', () => {
      document.body.innerHTML = `
        <form>
          <input type="text" id="text-field" />
          <input type="tel" id="tel-field" />
          <input type="number" id="num-field" />
        </form>
      `
      const fields = getVisibleRelevantInputFields(false)
      expect(fields).toHaveLength(3)
      const ids = fields.map(f => f.id)
      expect(ids).toContain('text-field')
      expect(ids).toContain('tel-field')
      expect(ids).toContain('num-field')
    })
  })

  describe('excludes hidden and disabled inputs', () => {
    it('excludes disabled inputs', () => {
      document.body.innerHTML = `
        <form>
          <input type="text" id="enabled" />
          <input type="text" id="disabled" disabled />
        </form>
      `
      const fields = getVisibleRelevantInputFields(false)
      expect(fields).toHaveLength(1)
      expect(fields[0].id).toBe('enabled')
    })

    it('excludes inputs with hidden attribute', () => {
      document.body.innerHTML = `
        <form>
          <input type="text" id="visible" />
          <input type="text" id="hidden" hidden />
        </form>
      `
      const fields = getVisibleRelevantInputFields(false)
      expect(fields).toHaveLength(1)
      expect(fields[0].id).toBe('visible')
    })

    it('excludes read-only inputs', () => {
      document.body.innerHTML = `
        <form>
          <input type="text" id="editable" />
          <input type="text" id="readonly" readonly />
        </form>
      `
      const fields = getVisibleRelevantInputFields(false)
      expect(fields).toHaveLength(1)
      expect(fields[0].id).toBe('editable')
    })

    it('excludes type="hidden" inputs', () => {
      document.body.innerHTML = `
        <form>
          <input type="text" id="visible" />
          <input type="hidden" id="hidden" />
        </form>
      `
      const fields = getVisibleRelevantInputFields(false)
      expect(fields).toHaveLength(1)
      expect(fields[0].id).toBe('visible')
    })

    it('includes inputs with display:none when strictVisibility=false', () => {
      document.body.innerHTML = `
        <form>
          <input type="text" id="visible" />
          <input type="text" id="hidden" style="display: none" />
        </form>
      `
      // In test mode, display:none is NOT excluded (inline styles only checked when strictVisibility=true)
      const fields = getVisibleRelevantInputFields(false)
      expect(fields).toHaveLength(2)
    })

    it('includes inputs with visibility:hidden when strictVisibility=false', () => {
      document.body.innerHTML = `
        <form>
          <input type="text" id="visible" />
          <input type="text" id="hidden" style="visibility: hidden" />
        </form>
      `
      // In test mode, visibility:hidden is NOT excluded
      const fields = getVisibleRelevantInputFields(false)
      expect(fields).toHaveLength(2)
    })
  })

  describe('excludes non-text-entry types', () => {
    it('excludes radio buttons', () => {
      document.body.innerHTML = `
        <form>
          <input type="text" id="text" />
          <input type="radio" id="radio" name="group" />
        </form>
      `
      const fields = getVisibleRelevantInputFields(false)
      expect(fields).toHaveLength(1)
      expect(fields[0].id).toBe('text')
    })

    it('excludes checkboxes', () => {
      document.body.innerHTML = `
        <form>
          <input type="text" id="text" />
          <input type="checkbox" id="checkbox" />
        </form>
      `
      const fields = getVisibleRelevantInputFields(false)
      expect(fields).toHaveLength(1)
      expect(fields[0].id).toBe('text')
    })

    it('excludes button inputs', () => {
      document.body.innerHTML = `
        <form>
          <input type="text" id="text" />
          <input type="button" id="button" value="Click me" />
        </form>
      `
      const fields = getVisibleRelevantInputFields(false)
      expect(fields).toHaveLength(1)
      expect(fields[0].id).toBe('text')
    })

    it('excludes submit, reset, file, color, date, etc', () => {
      document.body.innerHTML = `
        <form>
          <input type="text" id="text" />
          <input type="submit" id="submit" />
          <input type="reset" id="reset" />
          <input type="file" id="file" />
          <input type="color" id="color" />
          <input type="date" id="date" />
          <input type="time" id="time" />
          <input type="range" id="range" />
          <input type="email" id="email" />
          <input type="url" id="url" />
          <input type="search" id="search" />
          <input type="password" id="password" />
        </form>
      `
      const fields = getVisibleRelevantInputFields(false)
      expect(fields).toHaveLength(1)
      expect(fields[0].id).toBe('text')
    })
  })

  describe('supports shadow DOM', () => {
    it('finds inputs inside shadow DOM', () => {
      document.body.innerHTML = `
        <div id="host"></div>
      `
      const host = document.getElementById('host')!
      const shadowRoot = host.attachShadow({ mode: 'open' })
      const shadowInput = document.createElement('input')
      shadowInput.type = 'text'
      shadowInput.id = 'shadow-field'
      shadowRoot.appendChild(shadowInput)

      // Also add a light DOM input for comparison
      const lightInput = document.createElement('input')
      lightInput.type = 'text'
      lightInput.id = 'light-field'
      document.body.appendChild(lightInput)

      const fields = getVisibleRelevantInputFields(false)
      expect(fields).toHaveLength(2)
      const ids = fields.map(f => f.id)
      expect(ids).toContain('light-field')
      expect(ids).toContain('shadow-field')
    })

    it('excludes hidden inputs in shadow DOM', () => {
      document.body.innerHTML = `
        <div id="host"></div>
      `
      const host = document.getElementById('host')!
      const shadowRoot = host.attachShadow({ mode: 'open' })

      // Hidden input in shadow DOM
      const hiddenInput = document.createElement('input')
      hiddenInput.type = 'text'
      hiddenInput.id = 'shadow-hidden'
      hiddenInput.hidden = true
      shadowRoot.appendChild(hiddenInput)

      // Visible input in shadow DOM
      const visibleInput = document.createElement('input')
      visibleInput.type = 'text'
      visibleInput.id = 'shadow-visible'
      shadowRoot.appendChild(visibleInput)

      const fields = getVisibleRelevantInputFields(false)
      expect(fields).toHaveLength(1)
      expect(fields[0].id).toBe('shadow-visible')
    })

    it('excludes non-text-entry types in shadow DOM', () => {
      document.body.innerHTML = `
        <div id="host"></div>
      `
      const host = document.getElementById('host')!
      const shadowRoot = host.attachShadow({ mode: 'open' })

      // Checkbox in shadow DOM
      const checkbox = document.createElement('input')
      checkbox.type = 'checkbox'
      checkbox.id = 'shadow-checkbox'
      shadowRoot.appendChild(checkbox)

      // Text input in shadow DOM
      const textInput = document.createElement('input')
      textInput.type = 'text'
      textInput.id = 'shadow-text'
      shadowRoot.appendChild(textInput)

      const fields = getVisibleRelevantInputFields(false)
      expect(fields).toHaveLength(1)
      expect(fields[0].id).toBe('shadow-text')
    })
  })

  describe('returns empty array when no relevant fields', () => {
    it('returns empty array for page with no inputs', () => {
      document.body.innerHTML = `
        <p>No inputs here</p>
      `
      const fields = getVisibleRelevantInputFields(false)
      expect(fields).toEqual([])
    })

    it('returns empty array for page with only non-text inputs', () => {
      document.body.innerHTML = `
        <form>
          <input type="radio" name="choice" value="a" />
          <input type="checkbox" />
          <input type="button" value="Submit" />
        </form>
      `
      const fields = getVisibleRelevantInputFields(false)
      expect(fields).toEqual([])
    })

    it('returns empty array for page with only hidden/disabled text inputs', () => {
      document.body.innerHTML = `
        <form>
          <input type="text" disabled />
          <input type="text" hidden />
          <input type="text" readonly />
        </form>
      `
      // strictVisibility=false skips visibility checks, but disabled/hidden/readonly are always checked
      const fields = getVisibleRelevantInputFields(false)
      expect(fields).toEqual([])
    })

    it('returns fields with only inline display styles when strictVisibility=false', () => {
      document.body.innerHTML = `
        <form>
          <input type="text" style="display: none" />
        </form>
      `
      // In test mode (strictVisibility=false), inline styles are not checked
      // So display:none fields are still returned
      const fields = getVisibleRelevantInputFields(false)
      expect(fields).toHaveLength(1)
    })
  })
})
