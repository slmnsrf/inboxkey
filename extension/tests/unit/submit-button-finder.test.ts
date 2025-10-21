/**
 * Unit tests for Submit Button Finder
 * Tests multi-language detection, safety-first scoring, and SPA support
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Window } from 'happy-dom'
import { findSubmitButton } from '../../src/contents/submit-button-finder'

describe('Submit Button Finder', () => {
  let window: Window
  let document: Document

  beforeEach(() => {
    window = new Window()
    document = window.document
    global.document = document as any
    global.window = window as any
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Form-based detection', () => {
    it('should find button[type="submit"] inside form', async () => {
      const form = document.createElement('form')
      const field = document.createElement('input')
      field.type = 'text'
      const button = document.createElement('button')
      button.type = 'submit'
      button.textContent = 'Verify'

      form.appendChild(field)
      form.appendChild(button)
      document.body.appendChild(form)

      const result = await findSubmitButton({ field })

      expect(result).toBe(button)
    })

    it('should find input[type="submit"] inside form', async () => {
      const form = document.createElement('form')
      const field = document.createElement('input')
      field.type = 'text'
      const submitInput = document.createElement('input')
      submitInput.type = 'submit'
      submitInput.value = 'Submit'

      form.appendChild(field)
      form.appendChild(submitInput)
      document.body.appendChild(form)

      const result = await findSubmitButton({ field })

      expect(result).toBe(submitInput)
    })

    it('should prefer safe pattern match over type=submit alone', async () => {
      const form = document.createElement('form')
      const field = document.createElement('input')
      field.type = 'text'

      const button1 = document.createElement('button')
      button1.type = 'submit'
      button1.textContent = '' // Empty text, lower score

      const button2 = document.createElement('button')
      button2.textContent = 'Continue' // Safe pattern

      form.appendChild(field)
      form.appendChild(button1)
      form.appendChild(button2)
      document.body.appendChild(form)

      const result = await findSubmitButton({ field })

      expect(result).toBe(button2)
    })
  })

  describe('SPA detection (form-less)', () => {
    it('should find button outside form in same container', async () => {
      const div = document.createElement('div')
      const field = document.createElement('input')
      field.type = 'text'
      const button = document.createElement('button')
      button.textContent = 'Verify'

      div.appendChild(field)
      div.appendChild(button)
      document.body.appendChild(div)

      const result = await findSubmitButton({ field })

      expect(result).toBe(button)
    })

    it('should find button via aria-label', async () => {
      const div = document.createElement('div')
      const field = document.createElement('input')
      field.type = 'text'
      const button = document.createElement('button')
      button.setAttribute('aria-label', 'Submit verification code')

      div.appendChild(field)
      div.appendChild(button)
      document.body.appendChild(div)

      const result = await findSubmitButton({ field })

      expect(result).toBe(button)
    })

    it('should find button in section element', async () => {
      const section = document.createElement('section')
      const field = document.createElement('input')
      field.type = 'text'
      const button = document.createElement('button')
      button.textContent = 'Continue'

      section.appendChild(field)
      section.appendChild(button)
      document.body.appendChild(section)

      const result = await findSubmitButton({ field })

      expect(result).toBe(button)
    })
  })

  describe('Multi-language matching', () => {
    it('should match English patterns', async () => {
      const patterns = ['verify', 'submit', 'continue', 'confirm', 'next']

      for (const pattern of patterns) {
        const div = document.createElement('div')
        const field = document.createElement('input')
        field.type = 'text'
        const button = document.createElement('button')
        button.textContent = pattern.charAt(0).toUpperCase() + pattern.slice(1)

        div.appendChild(field)
        div.appendChild(button)
        document.body.appendChild(div)

        const result = await findSubmitButton({ field })

        expect(result).toBe(button)

        // Clean up
        document.body.removeChild(div)
      }
    })

    it('should match Spanish patterns', async () => {
      const div = document.createElement('div')
      const field = document.createElement('input')
      field.type = 'text'
      const button = document.createElement('button')
      button.textContent = 'Verificar'

      div.appendChild(field)
      div.appendChild(button)
      document.body.appendChild(div)

      const result = await findSubmitButton({ field })

      expect(result).toBe(button)
    })

    it('should match Chinese patterns', async () => {
      const div = document.createElement('div')
      const field = document.createElement('input')
      field.type = 'text'
      const button = document.createElement('button')
      button.textContent = '验证'

      div.appendChild(field)
      div.appendChild(button)
      document.body.appendChild(div)

      const result = await findSubmitButton({ field })

      expect(result).toBe(button)
    })

    it('should match Arabic patterns', async () => {
      const div = document.createElement('div')
      const field = document.createElement('input')
      field.type = 'text'
      const button = document.createElement('button')
      button.textContent = 'تحقق'

      div.appendChild(field)
      div.appendChild(button)
      document.body.appendChild(div)

      const result = await findSubmitButton({ field })

      expect(result).toBe(button)
    })

    it('should match Russian patterns', async () => {
      const div = document.createElement('div')
      const field = document.createElement('input')
      field.type = 'text'
      const button = document.createElement('button')
      button.textContent = 'Подтвердить'

      div.appendChild(field)
      div.appendChild(button)
      document.body.appendChild(div)

      const result = await findSubmitButton({ field })

      expect(result).toBe(button)
    })
  })

  describe('Empty-text rejection', () => {
    it('should reject button with empty text', async () => {
      const form = document.createElement('form')
      const field = document.createElement('input')
      field.type = 'text'
      const button = document.createElement('button')
      button.type = 'submit'
      button.textContent = ''

      form.appendChild(field)
      form.appendChild(button)
      document.body.appendChild(form)

      const result = await findSubmitButton({ field })

      expect(result).toBeNull()
    })

    it('should reject button with whitespace-only text', async () => {
      const form = document.createElement('form')
      const field = document.createElement('input')
      field.type = 'text'
      const button = document.createElement('button')
      button.type = 'submit'
      button.textContent = '   '

      form.appendChild(field)
      form.appendChild(button)
      document.body.appendChild(form)

      const result = await findSubmitButton({ field })

      expect(result).toBeNull()
    })
  })

  describe('Dangerous pattern blocking', () => {
    it('should block "delete" button', async () => {
      const form = document.createElement('form')
      const field = document.createElement('input')
      field.type = 'text'
      const button = document.createElement('button')
      button.textContent = 'Delete'

      form.appendChild(field)
      form.appendChild(button)
      document.body.appendChild(form)

      const result = await findSubmitButton({ field })

      expect(result).toBeNull()
    })

    it('should block "logout" button', async () => {
      const form = document.createElement('form')
      const field = document.createElement('input')
      field.type = 'text'
      const button = document.createElement('button')
      button.textContent = 'Log Out'

      form.appendChild(field)
      form.appendChild(button)
      document.body.appendChild(form)

      const result = await findSubmitButton({ field })

      expect(result).toBeNull()
    })

    it('should block "cancel" button', async () => {
      const form = document.createElement('form')
      const field = document.createElement('input')
      field.type = 'text'
      const button = document.createElement('button')
      button.textContent = 'Cancel'

      form.appendChild(field)
      form.appendChild(button)
      document.body.appendChild(form)

      const result = await findSubmitButton({ field })

      expect(result).toBeNull()
    })

    it('should block multi-language dangerous patterns (Spanish)', async () => {
      const form = document.createElement('form')
      const field = document.createElement('input')
      field.type = 'text'
      const button = document.createElement('button')
      button.textContent = 'Eliminar' // Spanish for "delete"

      form.appendChild(field)
      form.appendChild(button)
      document.body.appendChild(form)

      const result = await findSubmitButton({ field })

      expect(result).toBeNull()
    })

    it('should block multi-language dangerous patterns (Chinese)', async () => {
      const form = document.createElement('form')
      const field = document.createElement('input')
      field.type = 'text'
      const button = document.createElement('button')
      button.textContent = '删除' // Chinese for "delete"

      form.appendChild(field)
      form.appendChild(button)
      document.body.appendChild(form)

      const result = await findSubmitButton({ field })

      expect(result).toBeNull()
    })
  })

  describe('Scoring algorithm', () => {
    it('should score type=submit + safe text highly', async () => {
      const form = document.createElement('form')
      const field = document.createElement('input')
      field.type = 'text'
      const button1 = document.createElement('button')
      button1.type = 'submit'
      button1.textContent = 'Verify' // type=submit (30) + safe pattern (50) = 80

      const button2 = document.createElement('button')
      button2.textContent = 'Some text' // No safe pattern = low score

      form.appendChild(field)
      form.appendChild(button1)
      form.appendChild(button2)
      document.body.appendChild(form)

      const result = await findSubmitButton({ field })

      expect(result).toBe(button1)
    })

    it('should score safe text only as medium', async () => {
      const form = document.createElement('form')
      const field = document.createElement('input')
      field.type = 'text'
      const button = document.createElement('button')
      button.textContent = 'Continue' // safe pattern (50) - meets threshold

      form.appendChild(field)
      form.appendChild(button)
      document.body.appendChild(form)

      const result = await findSubmitButton({ field })

      expect(result).toBe(button)
    })

    it('should return null when all buttons score below threshold', async () => {
      const form = document.createElement('form')
      const field = document.createElement('input')
      field.type = 'text'
      const button = document.createElement('button')
      button.textContent = 'Random text' // No safe pattern, no type=submit

      form.appendChild(field)
      form.appendChild(button)
      document.body.appendChild(form)

      const result = await findSubmitButton({ field })

      expect(result).toBeNull()
    })
  })

  describe('Visibility checks', () => {
    it('should reject hidden button (display:none)', async () => {
      const form = document.createElement('form')
      const field = document.createElement('input')
      field.type = 'text'
      const button = document.createElement('button')
      button.type = 'submit'
      button.textContent = 'Verify'
      button.style.display = 'none'

      form.appendChild(field)
      form.appendChild(button)
      document.body.appendChild(form)

      const result = await findSubmitButton({ field })

      expect(result).toBeNull()
    })

    it('should reject disabled button', async () => {
      const form = document.createElement('form')
      const field = document.createElement('input')
      field.type = 'text'
      const button = document.createElement('button')
      button.type = 'submit'
      button.textContent = 'Verify'
      button.disabled = true

      form.appendChild(field)
      form.appendChild(button)
      document.body.appendChild(form)

      const result = await findSubmitButton({ field })

      expect(result).toBeNull()
    })
  })

  describe('Skip-on-uncertain', () => {
    it('should return null when no buttons found', async () => {
      const form = document.createElement('form')
      const field = document.createElement('input')
      field.type = 'text'

      form.appendChild(field)
      document.body.appendChild(form)

      const result = await findSubmitButton({ field })

      expect(result).toBeNull()
    })

    it('should return null when all buttons are dangerous', async () => {
      const form = document.createElement('form')
      const field = document.createElement('input')
      field.type = 'text'
      const button1 = document.createElement('button')
      button1.textContent = 'Delete'
      const button2 = document.createElement('button')
      button2.textContent = 'Cancel'

      form.appendChild(field)
      form.appendChild(button1)
      form.appendChild(button2)
      document.body.appendChild(form)

      const result = await findSubmitButton({ field })

      expect(result).toBeNull()
    })

    it('should return null when buttons have no safe indicators', async () => {
      const form = document.createElement('form')
      const field = document.createElement('input')
      field.type = 'text'
      const button = document.createElement('button')
      button.textContent = 'Some random text'

      form.appendChild(field)
      form.appendChild(button)
      document.body.appendChild(form)

      const result = await findSubmitButton({ field })

      expect(result).toBeNull()
    })
  })

  describe('Edge cases', () => {
    it('should handle button with title attribute', async () => {
      const form = document.createElement('form')
      const field = document.createElement('input')
      field.type = 'text'
      const button = document.createElement('button')
      button.setAttribute('title', 'Submit form')

      form.appendChild(field)
      form.appendChild(button)
      document.body.appendChild(form)

      const result = await findSubmitButton({ field })

      expect(result).toBe(button)
    })

    it('should handle multiple safe buttons and choose highest score', async () => {
      const form = document.createElement('form')
      const field = document.createElement('input')
      field.type = 'text'

      const button1 = document.createElement('button')
      button1.textContent = 'Continue'

      const button2 = document.createElement('button')
      button2.type = 'submit'
      button2.textContent = 'Verify' // Higher score: type=submit + safe pattern

      form.appendChild(field)
      form.appendChild(button1)
      form.appendChild(button2)
      document.body.appendChild(form)

      const result = await findSubmitButton({ field })

      expect(result).toBe(button2)
    })

    it('should handle case-insensitive pattern matching', async () => {
      const form = document.createElement('form')
      const field = document.createElement('input')
      field.type = 'text'
      const button = document.createElement('button')
      button.textContent = 'VERIFY' // Uppercase

      form.appendChild(field)
      form.appendChild(button)
      document.body.appendChild(form)

      const result = await findSubmitButton({ field })

      expect(result).toBe(button)
    })
  })

  describe('Extended button detection (BETA)', () => {

    describe('Feature flag behavior', () => {
      it('should find <a> without href when extended detection enabled', async () => {
        const container = document.createElement('div')
        container.innerHTML = `
          <form>
            <input type="text" id="code" />
            <a class="form-button">Submit</a>
          </form>
        `
        document.body.appendChild(container)

        const field = container.querySelector('#code') as HTMLInputElement
        const button = await findSubmitButton({
          field,
          extendedDetection: true
        })

        expect(button).not.toBeNull()
        expect(button?.tagName).toBe('A')

        document.body.removeChild(container)
      })

      it('should NOT find <a> when extended detection disabled', async () => {
        const container = document.createElement('div')
        container.innerHTML = `
          <form>
            <input type="text" id="code" />
            <a class="form-button">Submit</a>
          </form>
        `
        document.body.appendChild(container)

        const field = container.querySelector('#code') as HTMLInputElement
        const button = await findSubmitButton({
          field,
          extendedDetection: false
        })

        expect(button).toBeNull()

        document.body.removeChild(container)
      })

      it('should prefer semantic button over pseudo-button', async () => {
        const container = document.createElement('div')
        container.innerHTML = `
          <form>
            <input type="text" id="code" />
            <button type="submit">Semantic Submit</button>
            <a>Pseudo Submit</a>
          </form>
        `
        document.body.appendChild(container)

        const field = container.querySelector('#code') as HTMLInputElement
        const button = await findSubmitButton({
          field,
          extendedDetection: true
        })

        expect(button?.tagName).toBe('BUTTON')
        expect(button?.textContent).toContain('Semantic')

        document.body.removeChild(container)
      })
    })

    describe('Pseudo-button selectors', () => {
      it('should detect <a> without href', async () => {
        const container = document.createElement('div')
        container.innerHTML = `
          <form>
            <input type="text" id="code" />
            <a class="btn">Continue</a>
          </form>
        `
        document.body.appendChild(container)

        const field = container.querySelector('#code') as HTMLInputElement
        const button = await findSubmitButton({ field, extendedDetection: true })

        expect(button).not.toBeNull()

        document.body.removeChild(container)
      })

      it('should detect <a href="#">', async () => {
        const container = document.createElement('div')
        container.innerHTML = `
          <form>
            <input type="text" id="code" />
            <a href="#">Verify</a>
          </form>
        `
        document.body.appendChild(container)

        const field = container.querySelector('#code') as HTMLInputElement
        const button = await findSubmitButton({ field, extendedDetection: true })

        expect(button).not.toBeNull()

        document.body.removeChild(container)
      })

      it('should detect [role="button"]', async () => {
        const container = document.createElement('div')
        container.innerHTML = `
          <form>
            <input type="text" id="code" />
            <div role="button">Submit</div>
          </form>
        `
        document.body.appendChild(container)

        const field = container.querySelector('#code') as HTMLInputElement
        const button = await findSubmitButton({ field, extendedDetection: true })

        expect(button).not.toBeNull()

        document.body.removeChild(container)
      })
    })

    describe('Exclusion zones (SAFEGUARD)', () => {
      it('should reject pseudo-buttons in <nav>', async () => {
        const container = document.createElement('div')
        container.innerHTML = `
          <nav>
            <a>Continue</a>
          </nav>
          <form>
            <input type="text" id="code" />
          </form>
        `
        document.body.appendChild(container)

        const field = container.querySelector('#code') as HTMLInputElement
        const button = await findSubmitButton({ field, extendedDetection: true })

        expect(button).toBeNull()

        document.body.removeChild(container)
      })

      it('should reject pseudo-buttons in <header>', async () => {
        const container = document.createElement('div')
        container.innerHTML = `
          <form>
            <input type="text" id="code" />
            <header>
              <a>Submit</a>
            </header>
          </form>
        `
        document.body.appendChild(container)

        const field = container.querySelector('#code') as HTMLInputElement
        const button = await findSubmitButton({ field, extendedDetection: true })

        expect(button).toBeNull()

        document.body.removeChild(container)
      })

      it('should reject pseudo-buttons with class*="nav"', async () => {
        const container = document.createElement('div')
        container.innerHTML = `
          <form>
            <input type="text" id="code" />
            <div class="navbar">
              <a>Continue</a>
            </div>
          </form>
        `
        document.body.appendChild(container)

        const field = container.querySelector('#code') as HTMLInputElement
        const button = await findSubmitButton({ field, extendedDetection: true })

        expect(button).toBeNull()

        document.body.removeChild(container)
      })
    })

    describe('DOM position validation (SAFEGUARD)', () => {
      it('should reject pseudo-buttons before field in DOM', async () => {
        const container = document.createElement('div')
        container.innerHTML = `
          <form>
            <a>Submit</a>
            <input type="text" id="code" />
          </form>
        `
        document.body.appendChild(container)

        const field = container.querySelector('#code') as HTMLInputElement
        const button = await findSubmitButton({ field, extendedDetection: true })

        expect(button).toBeNull()

        document.body.removeChild(container)
      })

      it('should accept pseudo-buttons after field in DOM', async () => {
        const container = document.createElement('div')
        container.innerHTML = `
          <form>
            <input type="text" id="code" />
            <a>Submit</a>
          </form>
        `
        document.body.appendChild(container)

        const field = container.querySelector('#code') as HTMLInputElement
        const button = await findSubmitButton({ field, extendedDetection: true })

        expect(button).not.toBeNull()

        document.body.removeChild(container)
      })
    })

    describe('Mandatory safe pattern (SAFEGUARD)', () => {
      it('should reject pseudo-button without safe pattern match', async () => {
        const container = document.createElement('div')
        container.innerHTML = `
          <form>
            <input type="text" id="code" />
            <a>Random Text</a>
          </form>
        `
        document.body.appendChild(container)

        const field = container.querySelector('#code') as HTMLInputElement
        const button = await findSubmitButton({ field, extendedDetection: true })

        expect(button).toBeNull()

        document.body.removeChild(container)
      })

      it('should accept pseudo-button with safe pattern', async () => {
        const container = document.createElement('div')
        container.innerHTML = `
          <form>
            <input type="text" id="code" />
            <a>Verify Code</a>
          </form>
        `
        document.body.appendChild(container)

        const field = container.querySelector('#code') as HTMLInputElement
        const button = await findSubmitButton({ field, extendedDetection: true })

        expect(button).not.toBeNull()

        document.body.removeChild(container)
      })
    })

    describe('Container requirement (SAFEGUARD)', () => {
      it('should reject pseudo-buttons when no container found', async () => {
        // Create field without any container
        const field = document.createElement('input')
        field.type = 'text'
        field.id = 'orphan-field'
        document.body.appendChild(field)

        const link = document.createElement('a')
        link.textContent = 'Submit'
        document.body.appendChild(link)

        const button = await findSubmitButton({
          field,
          extendedDetection: true
        })

        expect(button).toBeNull()

        document.body.removeChild(field)
        document.body.removeChild(link)
      })
    })

    describe('Battlestate Games case', () => {
      it('should find Battlestate-style button with extended detection', async () => {
        const container = document.createElement('div')
        container.innerHTML = `
          <form class="bsg-ac-form-2fa base-form">
            <div class="bsg-ac-form-2fa__title">Two-Factor Authorization confirmation</div>
            <div class="bsg-ac-form-input">
              <input id="email_code" name="email_code" type="text" placeholder="Enter verification code" />
            </div>
            <div class="bsg-ac-form-button bsg-ac-form-button--large">
              <div class="bsg-ac-form-button__shadow"></div>
              <a class="bsg-ac-form-button__link">
                <div class="bsg-ac-form-button__inner bsg-ac-form-button__inner--large">
                  <div class="bsg-ac-form-button__name">Submit</div>
                </div>
              </a>
            </div>
          </form>
        `
        document.body.appendChild(container)

        const field = container.querySelector('#email_code') as HTMLInputElement
        const button = await findSubmitButton({
          field,
          extendedDetection: true
        })

        expect(button).not.toBeNull()
        expect(button?.tagName).toBe('A')
        expect(button?.textContent).toContain('Submit')

        document.body.removeChild(container)
      })

      it('should NOT find Battlestate button when extended detection disabled', async () => {
        const container = document.createElement('div')
        container.innerHTML = `
          <form class="bsg-ac-form-2fa">
            <input id="email_code" type="text" />
            <a class="bsg-ac-form-button__link">
              <div>Submit</div>
            </a>
          </form>
        `
        document.body.appendChild(container)

        const field = container.querySelector('#email_code') as HTMLInputElement
        const button = await findSubmitButton({
          field,
          extendedDetection: false
        })

        expect(button).toBeNull()

        document.body.removeChild(container)
      })
    })
  })
})
