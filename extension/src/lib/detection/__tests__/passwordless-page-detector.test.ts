import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { detectPasswordlessPage } from '../passwordless-page-detector'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Inject body HTML and return document for the call. */
function setBody(html: string): Document {
  document.body.innerHTML = html
  return document
}

/** A minimal passwordless waiting screen (EN). */
const EN_WAITING_COPY = `
  <main>
    <h1>Check your email</h1>
    <p>We sent you a sign-in link. Click the link in your email to continue.</p>
  </main>
`

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('detectPasswordlessPage', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  // =========================================================================
  // Positive cases — all four gates pass
  // =========================================================================

  describe('positive cases (should return true)', () => {
    it('EN magic-link waiting page at /login', () => {
      const doc = setBody(EN_WAITING_COPY)
      expect(detectPasswordlessPage('https://app.example.com/login', doc)).toBe(true)
    })

    it('TR magic-link waiting page at /login', () => {
      const doc = setBody(`
        <main>
          <h1>E-postanızı kontrol edin</h1>
          <p>Size bir giriş bağlantısı gönderdik.</p>
        </main>
      `)
      expect(detectPasswordlessPage('https://app.example.com/login', doc)).toBe(true)
    })

    it('DE magic-link waiting page at /signin', () => {
      const doc = setBody(`
        <main>
          <h1>Prüfen Sie Ihre E-Mail</h1>
          <p>Wir haben Ihnen einen Anmeldelink geschickt.</p>
        </main>
      `)
      expect(detectPasswordlessPage('https://app.example.com/signin', doc)).toBe(true)
    })

    it('JA magic-link waiting page at /auth', () => {
      const doc = setBody(`
        <main>
          <h1>メールを確認してください</h1>
          <p>サインインリンクをメールに送りました。</p>
        </main>
      `)
      expect(detectPasswordlessPage('https://app.example.com/auth', doc)).toBe(true)
    })

    it('AR magic-link waiting page at /auth', () => {
      const doc = setBody(`
        <main>
          <h1>تحقق من بريدك الإلكتروني</h1>
          <p>أرسلنا لك رابط تسجيل الدخول.</p>
        </main>
      `)
      expect(detectPasswordlessPage('https://app.example.com/auth', doc)).toBe(true)
    })

    it('/sign-in/passwordless nested path', () => {
      const doc = setBody(EN_WAITING_COPY)
      expect(
        detectPasswordlessPage('https://app.example.com/sign-in/passwordless', doc)
      ).toBe(true)
    })

    it('/auth/magic-link nested path', () => {
      const doc = setBody(EN_WAITING_COPY)
      expect(
        detectPasswordlessPage('https://app.example.com/auth/magic-link', doc)
      ).toBe(true)
    })

    it('/sso route with EN copy', () => {
      const doc = setBody(EN_WAITING_COPY)
      expect(detectPasswordlessPage('https://app.example.com/sso', doc)).toBe(true)
    })

    it('/verify-email route with EN copy', () => {
      const doc = setBody(EN_WAITING_COPY)
      expect(
        detectPasswordlessPage('https://app.example.com/verify-email', doc)
      ).toBe(true)
    })
  })

  // =========================================================================
  // Gate 1: URL does not match sign-in route
  // =========================================================================

  describe('Gate 1 negatives — URL does not match sign-in route', () => {
    it('copy present but /support URL → false', () => {
      const doc = setBody(EN_WAITING_COPY)
      expect(detectPasswordlessPage('https://app.example.com/support', doc)).toBe(false)
    })

    it('copy present but /account/profile URL → false', () => {
      const doc = setBody(EN_WAITING_COPY)
      expect(
        detectPasswordlessPage('https://app.example.com/account/profile', doc)
      ).toBe(false)
    })

    it('no copy + no matching URL → false', () => {
      const doc = setBody('<main><p>Welcome to the dashboard</p></main>')
      expect(detectPasswordlessPage('https://app.example.com/login', doc)).toBe(false)
    })

    it('/loginpage should NOT match (boundary check)', () => {
      const doc = setBody(EN_WAITING_COPY)
      expect(
        detectPasswordlessPage('https://app.example.com/loginpage', doc)
      ).toBe(false)
    })

    it('/myauth should NOT match (boundary check)', () => {
      const doc = setBody(EN_WAITING_COPY)
      expect(
        detectPasswordlessPage('https://app.example.com/myauth', doc)
      ).toBe(false)
    })
  })

  // =========================================================================
  // Gate 2: Negative URL gate (defense-in-depth)
  // =========================================================================

  describe('Gate 2 negatives — dangerous URL patterns', () => {
    it('/login/reset → false (RESET pattern)', () => {
      const doc = setBody(EN_WAITING_COPY)
      expect(
        detectPasswordlessPage('https://app.example.com/login/reset', doc)
      ).toBe(false)
    })

    it('/account/delete → false (DESTRUCTIVE pattern)', () => {
      const doc = setBody(EN_WAITING_COPY)
      expect(
        detectPasswordlessPage('https://app.example.com/account/delete', doc)
      ).toBe(false)
    })

    it('/auth/delete-account → false (DESTRUCTIVE pattern)', () => {
      const doc = setBody(EN_WAITING_COPY)
      expect(
        detectPasswordlessPage('https://app.example.com/auth/delete-account', doc)
      ).toBe(false)
    })

    it('/password/reset → false (RESET pattern)', () => {
      // /password/reset doesn't match Gate 1 anyway, but tests Gate 2 defence
      const doc = setBody(EN_WAITING_COPY)
      expect(
        detectPasswordlessPage('https://app.example.com/password/reset', doc)
      ).toBe(false)
    })

    it('/auth/forgot → false (RESET pattern inside sign-in URL space)', () => {
      const doc = setBody(EN_WAITING_COPY)
      expect(
        detectPasswordlessPage('https://app.example.com/auth/forgot', doc)
      ).toBe(false)
    })
  })

  // =========================================================================
  // Gate 3: Field gate — visible input present → false
  // =========================================================================

  describe('Gate 3 negatives — visible input field present', () => {
    it('sign-in URL + passwordless copy but email input present → false', () => {
      const doc = setBody(`
        <main>
          <h1>Check your email</h1>
          <p>We sent you a sign-in link. Click the link in your email to continue.</p>
          <form>
            <input type="email" name="email" placeholder="Enter your email" />
          </form>
        </main>
      `)
      expect(detectPasswordlessPage('https://app.example.com/login', doc)).toBe(false)
    })

    it('sign-in URL + passwordless copy but text input present → false', () => {
      const doc = setBody(`
        <main>
          <h1>Check your inbox</h1>
          <p>We emailed you a link. Click the link in your email to sign in.</p>
          <input type="text" name="code" />
        </main>
      `)
      expect(detectPasswordlessPage('https://app.example.com/signin', doc)).toBe(false)
    })
  })

  // =========================================================================
  // Gate 4: Copy gate — copy absent → false
  // =========================================================================

  describe('Gate 4 negatives — no passwordless copy', () => {
    it('sign-in URL + no copy → false', () => {
      const doc = setBody('<main><p>Please wait…</p></main>')
      expect(detectPasswordlessPage('https://app.example.com/login', doc)).toBe(false)
    })

    it('sign-in URL + unrelated copy → false', () => {
      const doc = setBody('<main><p>Welcome back! Enter your credentials.</p></main>')
      expect(
        detectPasswordlessPage('https://app.example.com/auth', doc)
      ).toBe(false)
    })

    it('copy in footer only (filtered out) → false', () => {
      const doc = setBody(`
        <main><p>Please wait…</p></main>
        <footer><p>Check your email for our newsletter.</p></footer>
      `)
      // "check your email" in footer is excluded by getFilteredText
      expect(detectPasswordlessPage('https://app.example.com/login', doc)).toBe(false)
    })

    it('copy in nav only (filtered out) → false', () => {
      const doc = setBody(`
        <main><p>Please wait…</p></main>
        <nav><p>Check your inbox to manage subscriptions.</p></nav>
      `)
      expect(detectPasswordlessPage('https://app.example.com/login', doc)).toBe(false)
    })
  })

  // =========================================================================
  // Failure cases — strict mode (must return false, NOT throw)
  // =========================================================================

  describe('failure cases — strict mode (never throws)', () => {
    it('malformed URL → false', () => {
      const doc = setBody(EN_WAITING_COPY)
      expect(detectPasswordlessPage('not a url at all !!', doc)).toBe(false)
    })

    it('empty URL string → false', () => {
      const doc = setBody(EN_WAITING_COPY)
      expect(detectPasswordlessPage('', doc)).toBe(false)
    })

    it('document with empty body → false', () => {
      document.body.innerHTML = ''
      expect(
        detectPasswordlessPage('https://app.example.com/login', document)
      ).toBe(false)
    })
  })
})
