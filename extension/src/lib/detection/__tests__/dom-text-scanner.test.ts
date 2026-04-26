import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getFilteredText } from '../dom-text-scanner'

describe('dom-text-scanner', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  describe('getFilteredText', () => {
    it('extracts text from a simple container', () => {
      document.body.innerHTML = `
        <main>
          <p>Hello</p>
          <span>World</span>
        </main>
      `
      const container = document.querySelector('main') as HTMLElement
      const text = getFilteredText(container)
      expect(text).toBe('Hello World')
    })

    it('excludes content from HEADER tag', () => {
      document.body.innerHTML = `
        <main>
          <p>Main content</p>
          <header>
            <p>Header content</p>
          </header>
        </main>
      `
      const container = document.querySelector('main') as HTMLElement
      const text = getFilteredText(container)
      expect(text).toContain('Main content')
      expect(text).not.toContain('Header content')
    })

    it('excludes content from FOOTER tag', () => {
      document.body.innerHTML = `
        <main>
          <p>Main content</p>
          <footer>
            <p>Footer content with support@example.com</p>
          </footer>
        </main>
      `
      const container = document.querySelector('main') as HTMLElement
      const text = getFilteredText(container)
      expect(text).toContain('Main content')
      expect(text).not.toContain('Footer content')
      expect(text).not.toContain('support@example.com')
    })

    it('excludes content from NAV tag', () => {
      document.body.innerHTML = `
        <main>
          <p>Main content</p>
          <nav>
            <a href="mailto:help@example.com">help@example.com</a>
          </nav>
        </main>
      `
      const container = document.querySelector('main') as HTMLElement
      const text = getFilteredText(container)
      expect(text).toContain('Main content')
      expect(text).not.toContain('help@example.com')
    })

    it('excludes content from role="navigation"', () => {
      document.body.innerHTML = `
        <main>
          <p>Main content</p>
          <div role="navigation">
            <p>Navigation content</p>
          </div>
        </main>
      `
      const container = document.querySelector('main') as HTMLElement
      const text = getFilteredText(container)
      expect(text).toContain('Main content')
      expect(text).not.toContain('Navigation content')
    })

    it('excludes content from role="banner"', () => {
      document.body.innerHTML = `
        <main>
          <p>Main content</p>
          <div role="banner">
            <p>Banner content</p>
          </div>
        </main>
      `
      const container = document.querySelector('main') as HTMLElement
      const text = getFilteredText(container)
      expect(text).toContain('Main content')
      expect(text).not.toContain('Banner content')
    })

    it('excludes content from role="contentinfo"', () => {
      document.body.innerHTML = `
        <main>
          <p>Main content</p>
          <div role="contentinfo">
            <p>Contentinfo content</p>
          </div>
        </main>
      `
      const container = document.querySelector('main') as HTMLElement
      const text = getFilteredText(container)
      expect(text).toContain('Main content')
      expect(text).not.toContain('Contentinfo content')
    })

    it('concatenates multiple text nodes with spaces', () => {
      document.body.innerHTML = `
        <main>
          <p>First</p>
          <p>Second</p>
          <p>Third</p>
        </main>
      `
      const container = document.querySelector('main') as HTMLElement
      const text = getFilteredText(container)
      expect(text).toBe('First Second Third')
    })

    it('trims whitespace from individual text nodes', () => {
      document.body.innerHTML = `
        <main>
          <p>  Spaced text  </p>
          <p>  Another  </p>
        </main>
      `
      const container = document.querySelector('main') as HTMLElement
      const text = getFilteredText(container)
      expect(text).toBe('Spaced text Another')
    })

    it('handles deeply nested structures', () => {
      document.body.innerHTML = `
        <main>
          <div>
            <div>
              <span>
                <p>Deep content</p>
              </span>
            </div>
          </div>
        </main>
      `
      const container = document.querySelector('main') as HTMLElement
      const text = getFilteredText(container)
      expect(text).toBe('Deep content')
    })
  })
})
