import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { hasEmailContext } from '../email-context-guard'

describe('hasEmailContext', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('returns true when "email" keyword is near the field', () => {
    document.body.innerHTML = `
      <main>
        <p>Enter the code sent to your email</p>
        <input id="code" type="text" />
      </main>
    `
    const field = document.getElementById('code') as HTMLInputElement
    expect(hasEmailContext(field)).toBe(true)
  })

  it('returns true when @ is present near the field', () => {
    document.body.innerHTML = `
      <section>
        <p>We sent a code to user@gmail.com</p>
        <input id="code" type="text" />
      </section>
    `
    const field = document.getElementById('code') as HTMLInputElement
    expect(hasEmailContext(field)).toBe(true)
  })

  it('returns true when email input exists in same container', () => {
    document.body.innerHTML = `
      <form>
        <input type="email" name="email" />
        <input id="code" type="text" />
      </form>
    `
    const field = document.getElementById('code') as HTMLInputElement
    expect(hasEmailContext(field)).toBe(true)
  })

  it('returns false on promo code page with no email context', () => {
    document.body.innerHTML = `
      <main>
        <h2>Enter your promo code</h2>
        <input id="promo" type="text" name="promo_code" />
      </main>
    `
    const field = document.getElementById('promo') as HTMLInputElement
    expect(hasEmailContext(field)).toBe(false)
  })

  it('ignores @ in footer (excluded zone)', () => {
    document.body.innerHTML = `
      <main>
        <h2>Enter code</h2>
        <input id="code" type="text" />
      </main>
      <footer>
        <p>Contact: support@company.com</p>
      </footer>
    `
    const field = document.getElementById('code') as HTMLInputElement
    expect(hasEmailContext(field)).toBe(false)
  })

  it('ignores @ in nav (excluded zone)', () => {
    document.body.innerHTML = `
      <main>
        <h2>Enter code</h2>
        <input id="code" type="text" />
      </main>
      <nav>
        <a href="mailto:help@site.com">help@site.com</a>
      </nav>
    `
    const field = document.getElementById('code') as HTMLInputElement
    expect(hasEmailContext(field)).toBe(false)
  })

  it('returns true for German email keyword "E-Mail"', () => {
    document.body.innerHTML = `
      <main>
        <p>Code an Ihre E-Mail gesendet</p>
        <input id="code" type="text" />
      </main>
    `
    const field = document.getElementById('code') as HTMLInputElement
    expect(hasEmailContext(field)).toBe(true)
  })

  it('returns true for Turkish email keyword "e-posta"', () => {
    document.body.innerHTML = `
      <main>
        <p>Kod e-posta adresinize gonderildi</p>
        <input id="code" type="text" />
      </main>
    `
    const field = document.getElementById('code') as HTMLInputElement
    expect(hasEmailContext(field)).toBe(true)
  })

  it('falls back to 5 levels up when no semantic container', () => {
    document.body.innerHTML = `
      <div>
        <div>
          <div>
            <p>Check your email for the code</p>
            <div>
              <input id="code" type="text" />
            </div>
          </div>
        </div>
      </div>
    `
    const field = document.getElementById('code') as HTMLInputElement
    expect(hasEmailContext(field)).toBe(true)
  })

  it('returns true (failure-open) if field is detached', () => {
    const field = document.createElement('input')
    expect(hasEmailContext(field)).toBe(true)
  })
})
