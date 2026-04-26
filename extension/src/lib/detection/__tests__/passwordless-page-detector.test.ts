import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { detectPasswordlessPage } from '../passwordless-page-detector'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Inject body HTML into the global document. */
function setBody(html: string): void {
  document.body.innerHTML = html
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
      setBody(EN_WAITING_COPY)
      expect(detectPasswordlessPage('https://app.example.com/login')).toBe(true)
    })

    it('TR magic-link waiting page at /login', () => {
      setBody(`
        <main>
          <h1>E-postanızı kontrol edin</h1>
          <p>Size bir giriş bağlantısı gönderdik.</p>
        </main>
      `)
      expect(detectPasswordlessPage('https://app.example.com/login')).toBe(true)
    })

    it('DE magic-link waiting page at /signin', () => {
      setBody(`
        <main>
          <h1>Prüfen Sie Ihre E-Mail</h1>
          <p>Wir haben Ihnen einen Anmeldelink geschickt.</p>
        </main>
      `)
      expect(detectPasswordlessPage('https://app.example.com/signin')).toBe(true)
    })

    it('JA magic-link waiting page at /auth', () => {
      setBody(`
        <main>
          <h1>メールを確認してください</h1>
          <p>サインインリンクをメールに送りました。</p>
        </main>
      `)
      expect(detectPasswordlessPage('https://app.example.com/auth')).toBe(true)
    })

    it('AR magic-link waiting page at /auth', () => {
      setBody(`
        <main>
          <h1>تحقق من بريدك الإلكتروني</h1>
          <p>أرسلنا لك رابط تسجيل الدخول.</p>
        </main>
      `)
      expect(detectPasswordlessPage('https://app.example.com/auth')).toBe(true)
    })

    it('/sign-in/passwordless nested path', () => {
      setBody(EN_WAITING_COPY)
      expect(
        detectPasswordlessPage('https://app.example.com/sign-in/passwordless')
      ).toBe(true)
    })

    it('/auth/magic-link nested path', () => {
      setBody(EN_WAITING_COPY)
      expect(
        detectPasswordlessPage('https://app.example.com/auth/magic-link')
      ).toBe(true)
    })

    it('/sso route with EN copy', () => {
      setBody(EN_WAITING_COPY)
      expect(detectPasswordlessPage('https://app.example.com/sso')).toBe(true)
    })

    it('/verify-email route with EN copy', () => {
      setBody(EN_WAITING_COPY)
      expect(
        detectPasswordlessPage('https://app.example.com/verify-email')
      ).toBe(true)
    })

    it('URL with query string and fragment is parsed correctly', () => {
      // Verifies pathname extraction ignores ?query and #fragment.
      // /login passes Gate 1; no inputs → Gate 3 passes; copy → Gate 4 passes.
      setBody(EN_WAITING_COPY)
      expect(
        detectPasswordlessPage('https://app.example.com/login?next=/dashboard#top')
      ).toBe(true)
    })
  })

  // =========================================================================
  // Fix C — tightened /auth matching (regression guards + new negatives)
  // =========================================================================

  describe('Fix C — /auth pathname matching', () => {
    it('/auth (bare) → still matches Gate 1', () => {
      setBody(EN_WAITING_COPY)
      expect(detectPasswordlessPage('https://app.example.com/auth')).toBe(true)
    })

    it('/auth/login → matches Gate 1', () => {
      setBody(EN_WAITING_COPY)
      expect(detectPasswordlessPage('https://app.example.com/auth/login')).toBe(true)
    })

    it('/auth/passwordless → matches Gate 1', () => {
      setBody(EN_WAITING_COPY)
      expect(detectPasswordlessPage('https://app.example.com/auth/passwordless')).toBe(true)
    })

    it('/auth/callback → matches Gate 1', () => {
      setBody(EN_WAITING_COPY)
      expect(detectPasswordlessPage('https://app.example.com/auth/callback')).toBe(true)
    })

    it('/auth/magic-link → matches Gate 1 (regression guard)', () => {
      setBody(EN_WAITING_COPY)
      expect(detectPasswordlessPage('https://app.example.com/auth/magic-link')).toBe(true)
    })

    it('/auth/dashboard → does NOT match Gate 1 → detector returns false', () => {
      // Even with passwordless copy + no inputs, /auth/dashboard is an authenticated route.
      setBody(EN_WAITING_COPY)
      expect(detectPasswordlessPage('https://app.example.com/auth/dashboard')).toBe(false)
    })

    it('/auth/settings/email-change → does NOT match Gate 1 → detector returns false', () => {
      setBody(EN_WAITING_COPY)
      expect(detectPasswordlessPage('https://app.example.com/auth/settings/email-change')).toBe(false)
    })

    it('/auth/profile → does NOT match Gate 1 → detector returns false', () => {
      setBody(EN_WAITING_COPY)
      expect(detectPasswordlessPage('https://app.example.com/auth/profile')).toBe(false)
    })
  })

  // =========================================================================
  // Gate 1: URL does not match sign-in route
  // =========================================================================

  describe('Gate 1 negatives — URL does not match sign-in route', () => {
    it('copy present but /support URL → false', () => {
      setBody(EN_WAITING_COPY)
      expect(detectPasswordlessPage('https://app.example.com/support')).toBe(false)
    })

    it('copy present but /account/profile URL → false', () => {
      setBody(EN_WAITING_COPY)
      expect(
        detectPasswordlessPage('https://app.example.com/account/profile')
      ).toBe(false)
    })

    it('no copy + no matching URL → false', () => {
      setBody('<main><p>Welcome to the dashboard</p></main>')
      expect(detectPasswordlessPage('https://app.example.com/login')).toBe(false)
    })

    it('/loginpage should NOT match (boundary check)', () => {
      setBody(EN_WAITING_COPY)
      expect(
        detectPasswordlessPage('https://app.example.com/loginpage')
      ).toBe(false)
    })

    it('/myauth should NOT match (boundary check)', () => {
      setBody(EN_WAITING_COPY)
      expect(
        detectPasswordlessPage('https://app.example.com/myauth')
      ).toBe(false)
    })
  })

  // =========================================================================
  // Gate 2: Negative URL gate (defense-in-depth)
  // =========================================================================

  describe('Gate 2 negatives — dangerous URL patterns', () => {
    it('/login/reset → false (RESET pattern)', () => {
      setBody(EN_WAITING_COPY)
      expect(
        detectPasswordlessPage('https://app.example.com/login/reset')
      ).toBe(false)
    })

    it('/account/delete → false (DESTRUCTIVE pattern)', () => {
      setBody(EN_WAITING_COPY)
      expect(
        detectPasswordlessPage('https://app.example.com/account/delete')
      ).toBe(false)
    })

    it('/auth/delete-account → false (DESTRUCTIVE pattern)', () => {
      setBody(EN_WAITING_COPY)
      expect(
        detectPasswordlessPage('https://app.example.com/auth/delete-account')
      ).toBe(false)
    })

    it('/password/reset → false (RESET pattern)', () => {
      // /password/reset doesn't match Gate 1 anyway, but tests Gate 2 defence
      setBody(EN_WAITING_COPY)
      expect(
        detectPasswordlessPage('https://app.example.com/password/reset')
      ).toBe(false)
    })

    it('/auth/forgot → false (RESET pattern inside sign-in URL space)', () => {
      setBody(EN_WAITING_COPY)
      expect(
        detectPasswordlessPage('https://app.example.com/auth/forgot')
      ).toBe(false)
    })

    it('/auth/cancel-subscription → false (DESTRUCTIVE noun-form pattern)', () => {
      // Exercises the /cancel-subscription pattern in DESTRUCTIVE_ACTION_PATH_PATTERNS.
      // Even though the URL contains /auth (Gate 1 match), Gate 2 must veto it.
      setBody(EN_WAITING_COPY)
      expect(
        detectPasswordlessPage('https://app.example.com/auth/cancel-subscription')
      ).toBe(false)
    })
  })

  // =========================================================================
  // Gate 3: Field gate — visible input present → false
  // =========================================================================

  describe('Gate 3 negatives — visible input field present', () => {
    it('sign-in URL + passwordless copy but email input present → false', () => {
      setBody(`
        <main>
          <h1>Check your email</h1>
          <p>We sent you a sign-in link. Click the link in your email to continue.</p>
          <form>
            <input type="email" name="email" placeholder="Enter your email" />
          </form>
        </main>
      `)
      expect(detectPasswordlessPage('https://app.example.com/login')).toBe(false)
    })

    it('sign-in URL + passwordless copy but password input present → false', () => {
      // A visible <input type="password"> marks this as a sign-in form, not a
      // waiting screen. Gate 3 Part (b) must catch it.
      setBody(`
        <main>
          <h1>Check your inbox</h1>
          <p>We emailed you a link. Click the link in your email to sign in.</p>
          <form>
            <input type="password" name="password" autocomplete="current-password" />
          </form>
        </main>
      `)
      expect(detectPasswordlessPage('https://app.example.com/signin')).toBe(false)
    })

    it('sign-in URL + passwordless copy but inline-style-hidden email input → true', () => {
      // A CSS-hidden email input must NOT count as "present". Gate 3 Part (b)
      // should skip inputs with display:none in their inline style, and the
      // detector should return true (this IS a waiting screen).
      setBody(`
        <main>
          <h1>Check your email</h1>
          <p>We sent you a sign-in link. Click the link in your email to continue.</p>
          <input type="email" style="display:none" />
        </main>
      `)
      expect(detectPasswordlessPage('https://app.example.com/login')).toBe(true)
    })
  })

  // =========================================================================
  // Gate 4: Copy gate — copy absent → false
  // =========================================================================

  describe('Gate 4 negatives — no passwordless copy', () => {
    it('sign-in URL + no copy → false', () => {
      setBody('<main><p>Please wait…</p></main>')
      expect(detectPasswordlessPage('https://app.example.com/login')).toBe(false)
    })

    it('sign-in URL + unrelated copy → false', () => {
      setBody('<main><p>Welcome back! Enter your credentials.</p></main>')
      expect(
        detectPasswordlessPage('https://app.example.com/auth')
      ).toBe(false)
    })

    it('copy in footer only (filtered out) → false', () => {
      setBody(`
        <main><p>Please wait…</p></main>
        <footer><p>Check your email for our newsletter.</p></footer>
      `)
      // "check your email" in footer is excluded by getFilteredText
      expect(detectPasswordlessPage('https://app.example.com/login')).toBe(false)
    })

    it('copy in nav only (filtered out) → false', () => {
      setBody(`
        <main><p>Please wait…</p></main>
        <nav><p>Check your inbox to manage subscriptions.</p></nav>
      `)
      expect(detectPasswordlessPage('https://app.example.com/login')).toBe(false)
    })
  })

  // =========================================================================
  // Failure cases — strict mode (must return false, NOT throw)
  // =========================================================================

  describe('failure cases — strict mode (never throws)', () => {
    it('malformed URL → false', () => {
      setBody(EN_WAITING_COPY)
      expect(detectPasswordlessPage('not a url at all !!')).toBe(false)
    })

    it('empty URL string → false', () => {
      setBody(EN_WAITING_COPY)
      expect(detectPasswordlessPage('')).toBe(false)
    })

    it('document with empty body → false', () => {
      document.body.innerHTML = ''
      expect(
        detectPasswordlessPage('https://app.example.com/login')
      ).toBe(false)
    })
  })
})
