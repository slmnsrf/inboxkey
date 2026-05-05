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

  it('walks up to role="dialog" container in deeply nested modal (Google recovery email pattern)', () => {
    document.body.innerHTML = `
      <div role="dialog" aria-modal="true">
        <h2>Verify your recovery email</h2>
        <p>Enter the 6-digit code sent to user@gmail.com</p>
        <div>
          <div>
            <div>
              <div>
                <div>
                  <div>
                    <span>
                      <span>
                        <input id="c1" type="text" inputmode="numeric" maxlength="6" autocomplete="off" />
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `
    const field = document.getElementById('c1') as HTMLInputElement
    expect(hasEmailContext(field)).toBe(true)
  })

  it('walks up to <dialog> element in deeply nested modal', () => {
    document.body.innerHTML = `
      <dialog open>
        <p>Code sent to user@example.com</p>
        <div><div><div><div><div><div>
          <input id="c2" type="text" />
        </div></div></div></div></div></div>
      </dialog>
    `
    const field = document.getElementById('c2') as HTMLInputElement
    expect(hasEmailContext(field)).toBe(true)
  })

  it('walks up to aria-modal="true" container without role attribute', () => {
    document.body.innerHTML = `
      <div aria-modal="true">
        <p>Verification code sent to user@example.com</p>
        <div><div><div><div><div><div>
          <input id="c3" type="text" />
        </div></div></div></div></div></div>
      </div>
    `
    const field = document.getElementById('c3') as HTMLInputElement
    expect(hasEmailContext(field)).toBe(true)
  })

  it('ignores @ inside <script> JSDoc (Amazon CVF shape)', () => {
    document.body.innerHTML = `
      <form id="verification-code-form">
        <div>
          <div>
            <input id="input-box-otp" type="tel" maxlength="6" name="otpCode" />
          </div>
          <script>
            /**
             * Validate digit input.
             * @type {RegExp}
             */
            var INVALID_DIGIT_REGEX = /\\D/g;
          </script>
        </div>
      </form>
    `
    const field = document.getElementById('input-box-otp') as HTMLInputElement
    expect(hasEmailContext(field)).toBe(false)
  })

  it('ignores @ inside <style> at-rules (e.g. @media, @font-face)', () => {
    document.body.innerHTML = `
      <form>
        <style>
          @media (max-width: 600px) { .otp { width: 100%; } }
          @font-face { font-family: 'X'; src: url('x.woff'); }
        </style>
        <input id="code" type="text" />
      </form>
    `
    const field = document.getElementById('code') as HTMLInputElement
    expect(hasEmailContext(field)).toBe(false)
  })

  it('ignores bare "@type" / "@param" JSDoc tags in code blocks', () => {
    document.body.innerHTML = `
      <form>
        <input id="code" type="text" />
        <script>
          // @type comment
          // @param x
          // @Component decorator
          var x = 1;
        </script>
      </form>
    `
    const field = document.getElementById('code') as HTMLInputElement
    expect(hasEmailContext(field)).toBe(false)
  })

  it('still detects masked email addresses (a***@example.com)', () => {
    document.body.innerHTML = `
      <main>
        <p>We sent a code to a***@gmail.com</p>
        <input id="code" type="text" />
      </main>
    `
    const field = document.getElementById('code') as HTMLInputElement
    expect(hasEmailContext(field)).toBe(true)
  })

  it('still detects an email rendered as visible link text', () => {
    document.body.innerHTML = `
      <section>
        <p>Reply to <a href="mailto:user@example.com">user@example.com</a> if you didn't request this.</p>
        <input id="code" type="text" />
      </section>
    `
    const field = document.getElementById('code') as HTMLInputElement
    expect(hasEmailContext(field)).toBe(true)
  })
})
