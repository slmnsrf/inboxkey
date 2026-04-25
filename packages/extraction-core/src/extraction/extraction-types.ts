/**
 * extraction-types.ts — Centralized patterns, keywords, and tunables for InboxKey's
 * OTP & magic-link extraction pipeline.
 *
 * ✅ Backward compatible exports:
 *   - COMMON_OTP_PATTERNS: RegExp[]
 *   - CODE_KEYWORDS: string[]
 *   - MAGIC_LINK_KEYWORDS: string[]
 *
 * ➕ New, richer exports (non-breaking additions):
 *   - OTPPattern, OTP_PATTERNS (metadata + normalizers)
 *   - CODE_KEYWORDS_BY_LANG, MAGIC_LINK_KEYWORDS_BY_LANG
 *   - CODE_KEYWORDS_REGEX, MAGIC_LINK_KEYWORDS_REGEX
 *   - NEGATIVE_CONTEXT_KEYWORDS_TOTP, NEGATIVE_CONTEXT_REGEX
 *   - DANGEROUS_LINK_KEYWORDS, MAGIC_LINK_URL_HINTS
 *   - EXCLUSION_NUMERIC_PATTERNS (phone-like, long IDs)
 *   - SCORE_WEIGHTS, THRESHOLDS, EXTRACTION_DEFAULTS types & values
 *
 * Notes:
 * - Unicode-aware regex (`u`) and case-insensitive (`i`) for global search (`g`).
 * - Keep patterns tight to prevent false positives (e.g., phone numbers, long IDs).
 * - This file should remain dependency-free.
 */

// ------------------------------
// Re-exports for backward compatibility
// ------------------------------

/**
 * Re-export DOMAIN_ALIASES and WATCH_SESSION_SCORING from scoring-config.
 * These are now centralized in the matching module but re-exported here
 * for backward compatibility with existing code that imports from extraction-types.
 */
export { DOMAIN_ALIASES, WATCH_SESSION_SCORING } from '../matching/scoring-config.js'

/**
 * Extractor behavior version. Bump on any change that could affect
 * extraction outcomes - keyword expansion, gate logic, scoring, filter
 * additions, threshold tweaks. Callers stamp this into their
 * deduplication keys (e.g. seen-message store) so a tightened or
 * loosened extractor takes effect on the next poll instead of being
 * shadowed by cached "no-candidate" entries from the previous version.
 *
 * Version history:
 *   '1' - initial constant (no behavior change vs. pre-versioning)
 *   '2' - PR 1 magic-link extraction overhaul:
 *           - MAGIC_LINK_KEYWORDS_BY_LANG expanded with SSO /
 *             passwordless wording across 21 languages
 *           - extractMagicLinks intent gate accepts URL hints (not
 *             just body keywords)
 *           - RESET_LINK_PATH_PATTERNS rejects /reset, /forgot,
 *             /recover paths
 *           - the OTP extractor false-positive overhaul also lives
 *             behind this stamp (Codex's PR #51 work)
 */
export const EXTRACTOR_VERSION = '2' as const

// ------------------------------
// Types
// ------------------------------

export type Charset = 'digits' | 'alnum'
export type OTPFormat = 'numeric' | 'grouped' | 'alphanumeric'

/** Describes a concrete OTP pattern with normalization and constraints. */
export interface OTPPattern {
  /** Human-readble identifier of the pattern family. */
  name: OTPFormat
  /** Global regex used to enumerate raw matches. Must include `g` flag. */
  regex: RegExp
  /**
   * Normalization step run after a raw match is found.
   * Example: collapse separators in grouped numerics ("123-456" -> "123456").
   */
  normalize: (raw: string) => string
  /** Character-sets the pattern can produce. */
  accepts: ReadonlyArray<Charset>
  /** Minimum/maximum length of the normalized code. */
  minLength: number
  maxLength: number
}

/** Weighting of the scoring dimensions used by the matcher. */
export interface ScoreWeights {
  nearKeyword: number
  senderBrand: number
  temporal: number
  expectedShape: number
  brandHint: number
}

/** Confidence thresholds used by the decision engine. */
export interface Thresholds {
  /** >= autoAccept → auto-fill/open */
  autoAccept: number
  /** [promptMin, autoAccept) → show prompt list */
  promptMin: number
  /** < rejectMax → ignore */
  rejectMax: number
}

/** Tunable defaults used across extraction. */
export interface ExtractionDefaults {
  /** +/- window around keywords when scanning (characters) */
  windowChars: number
  /** Look-back time window for fetching emails (minutes) */
  recentWindowMinutes: number
  /** Sanity constraints for numeric codes */
  codeMin: number
  codeMax: number
  /** Sanity constraints for alphanumeric codes */
  alnumMin: number
  alnumMax: number
}

// ------------------------------
// OTP Patterns
// ------------------------------

/**
 * Numeric codes: 4–8 digits, not embedded in longer alphanumeric tokens.
 * This avoids extracting numeric runs from URL/query IDs such as abc1234def.
 */
const RX_NUMERIC: RegExp = /(?<![A-Za-z0-9])(\d{4,8})(?![A-Za-z0-9])/gu

/**
 * Grouped numerics: common 3-3 / 4-4 splits with space or hyphen separator.
 * Normalizes by stripping separators.
 */
const RX_GROUPED_NUMERIC: RegExp = /\b(\d{3,4}[-\s]\d{3,4})\b/gu

/**
 * Alphanumeric blocks: 4–10 letters (upper or lowercase) + digits.
 * Intentionally broad — downstream filters reject all-letter tokens, etc.
 */
const RX_ALNUM: RegExp = /\b([A-Za-z0-9]{4,10})\b/gu

/** Normalizers (small and inline to avoid allocations). */
const normalizeSame = (s: string) => s
const normalizeCollapseSeparators = (s: string) => s.replace(/[-\s]/g, '')

/** Rich pattern table (preferred by new code). */
export const OTP_PATTERNS: ReadonlyArray<OTPPattern> = Object.freeze([
  {
    name: 'numeric',
    regex: RX_NUMERIC,
    normalize: normalizeSame,
    accepts: ['digits', 'alnum'],
    minLength: 4,
    maxLength: 8,
  },
  {
    name: 'grouped',
    regex: RX_GROUPED_NUMERIC,
    normalize: normalizeCollapseSeparators,
    accepts: ['digits', 'alnum'],
    minLength: 6,
    maxLength: 8,
  },
  {
    name: 'alphanumeric',
    regex: RX_ALNUM,
    normalize: normalizeSame,
    accepts: ['alnum'],
    minLength: 4,
    maxLength: 10,
  },
] as const)

/**
 * Legacy export: bare regex list for backward compatibility.
 * New code should prefer `OTP_PATTERNS` for access to metadata/normalizers.
 */
export const COMMON_OTP_PATTERNS: ReadonlyArray<RegExp> = Object.freeze(
  OTP_PATTERNS.map((p) => p.regex)
)

// ------------------------------
/* Keyword Tables (multi-lingual) */
// ------------------------------

/**
 * Build a permissive keyword matcher from a string list.
 * Escapes regex metacharacters and joins with `|`, with `i`+`u` flags.
 */
function buildKeywordRegex(words: ReadonlyArray<string>): RegExp {
  const uniq = Array.from(new Set(words.map((w) => w.trim()).filter(Boolean)))
  const escaped = uniq.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return new RegExp(`(?:${escaped.join('|')})`, 'iu')
}

/** OTP / "code" terms by language (not exhaustive but high-coverage). */
export const CODE_KEYWORDS_BY_LANG: Readonly<Record<string, ReadonlyArray<string>>> =
  Object.freeze({
    en: [
      'code',
      'verification code',
      'one-time code',
      'one time code',
      'otp',
      'security code',
      'login code',
      'auth code',
      'two-step code',
      '2-step code',
      'two-factor code',
      'confirmation code',
      'confirm code',
      'your code',
      'passcode',
      'pass code',
    ],
    es: [
      'código',
      'código de verificación',
      'código de seguridad',
      'código de acceso',
      'código único',
      'contraseña de un solo uso',
      'otp',
    ],
    fr: [
      'code',
      'code de vérification',
      'code de sécurité',
      'mot de passe à usage unique',
      'otp',
      'code de connexion',
      "code d’authentification",
      "code d'authentification",
    ],
    de: [
      'code',
      'bestätigungscode',
      'sicherheitscode',
      'einmalcode',
      'einmalpasswort',
      'otp',
      'anmeldecode',
      'authentifizierungscode',
    ],
    it: [
      'codice',
      'codice di verifica',
      'codice di sicurezza',
      'password monouso',
      'otp',
      "codice d'accesso",
      'codice di accesso',
      'codice di autenticazione',
    ],
    pt: [
      'código',
      'código de verificação',
      'código de segurança',
      'senha de uso único',
      'senha única',
      'otp',
      'código de login',
      'código de autenticação',
    ],
    nl: [
      'code',
      'verificatiecode',
      'beveiligingscode',
      'eenmalige code',
      'eenmalig wachtwoord',
      'otp',
      'aanmeldcode',
      'authenticatiecode',
    ],
    sv: [
      'kod',
      'verifieringskod',
      'säkerhetskod',
      'engångskod',
      'engångslösenord',
      'otp',
      'inloggningskod',
      'autentiseringskod',
    ],
    fi: [
      'koodi',
      'vahvistuskoodi',
      'turvakoodi',
      'kertakäyttökoodi',
      'kertakäyttösalasana',
      'otp',
      'kirjautumiskoodi',
      'todennuskoodi',
    ],
    da: [
      'kode',
      'bekræftelseskode',
      'sikkerhedskode',
      'engangskode',
      'engangsadgangskode',
      'otp',
      'login-kode',
      'godkendelseskode',
    ],
    no: [
      'kode',
      'bekreftelseskode',
      'sikkerhetskode',
      'engangskode',
      'engangspassord',
      'otp',
      'innloggingskode',
      'autentiseringskode',
    ],
    pl: [
      'kod',
      'kod weryfikacyjny',
      'kod bezpieczeństwa',
      'kod jednorazowy',
      'hasło jednorazowe',
      'otp',
      'kod logowania',
      'kod uwierzytelniający',
    ],
    cs: [
      'kód',
      'ověřovací kód',
      'bezpečnostní kód',
      'jednorázový kód',
      'jednorázové heslo',
      'otp',
      'přihlašovací kód',
      'autentizační kód',
    ],
    tr: [
      'kod',
      'doğrulama kodu',
      'güvenlik kodu',
      'tek kullanımlık kod',
      'tek kullanımlık şifre',
      'otp',
      'giriş kodu',
      'kimlik doğrulama kodu',
    ],
    ru: [
      'код',
      'код подтверждения',
      'код безопасности',
      'одноразовый код',
      'одноразовый пароль',
      'otp',
      'код входа',
      'код аутентификации',
    ],
    uk: [
      'код',
      'код підтвердження',
      'код безпеки',
      'одноразовий код',
      'одноразовий пароль',
      'otp',
      'код входу',
      'код автентифікації',
    ],
    hi: [
      'कोड',
      'पासवर्ड',
      'ओटीपी',
      'सत्यापन कोड',
      'सुरक्षा कोड',
      'एकबारगी कोड',
      'एकबारगी पासवर्ड',
      'otp',
      'लॉगिन कोड',
      'प्रमाणीकरण कोड',
    ],
    ar: [
      'رمز',
      'الرمز',
      'رمز التحقق',
      'رمز الأمان',
      'رمز لمرة واحدة',
      'كلمة مرور لمرة واحدة',
      'otp',
      'رمز تسجيل الدخول',
      'رمز المصادقة',
    ],
    ja: [
      'コード',
      '認証コード',
      '確認コード',
      'セキュリティコード',
      'ワンタイムコード',
      'ワンタイムパスワード',
      'otp',
      'ログインコード',
      '認証用コード',
    ],
    ko: [
      '코드',
      '인증 코드',
      '보안 코드',
      '일회용 코드',
      '일회용 비밀번호',
      'otp',
      '로그인 코드',
    ],
    zh: [
      '验证码',
      '安全码',
      '一次性验证码',
      '一次性密码',
      '登录码',
      '认证码',
      'otp',
    ],
  })

/** Magic-link terms by language. */
export const MAGIC_LINK_KEYWORDS_BY_LANG: Readonly<
  Record<string, ReadonlyArray<string>>
> = Object.freeze({
  en: [
    // Original tight phrases
    'magic link',
    'login link',
    'sign-in link',
    'sign in link',
    'email login link',
    'one-click login',
    'verify email',
    'verify your email',
    'continue login',
    // SSO / passwordless terminology
    'passwordless',
    'sso',
    'single sign-on',
    'single sign on',
    // "Click the link" patterns (real fixture wording: "Click the
    // link below to sign in" - all 19 magic-link fixtures use this)
    'click the link below to sign in',
    'click the link below to log in',
    'click below to sign in',
    'click below to log in',
    'click here to sign in',
    'click here to log in',
    'use this link to sign in',
    'use this link to log in',
    // Authentication / token wording
    'authentication link',
    'authenticate via email',
    'your sign-in link',
    'your login link',
    'sign-in token',
    'login token',
  ],
  es: [
    'enlace mágico',
    'enlace de acceso',
    'iniciar sesión',
    'inicia sesión desde el correo',
    'verificar correo',
    'verifica tu correo',
    // SSO / passwordless
    'sin contraseña',
    'inicio de sesión único',
    // Click patterns
    'haz clic en el enlace para iniciar sesión',
    'pulsa el enlace para iniciar sesión',
    'usa este enlace para iniciar sesión',
    // Token / link references
    'enlace de inicio de sesión',
    'tu enlace de acceso',
    'enlace de autenticación',
  ],
  fr: [
    'lien magique',
    'lien de connexion',
    'connexion par e-mail',
    'se connecter',
    'vérifier votre e-mail',
    // SSO / passwordless
    'sans mot de passe',
    'authentification unique',
    // Click patterns
    'cliquez sur le lien pour vous connecter',
    'cliquez ci-dessous pour vous connecter',
    'utilisez ce lien pour vous connecter',
    // Token / link references
    'lien d\'authentification',
    'votre lien de connexion',
  ],
  de: [
    'magic link',
    'login-link',
    'anmeldelink',
    'per e-mail anmelden',
    'e-mail-anmeldung',
    'e-mail bestätigen',
    // SSO / passwordless
    'passwortlos',
    'passwortlose anmeldung',
    'einmalige anmeldung',
    'single sign-on',
    // Click patterns
    'klicken sie auf den link zum anmelden',
    'klicken sie unten zum anmelden',
    'klicken sie hier zum anmelden',
    'verwenden sie diesen link zur anmeldung',
    // Token / link references
    'authentifizierungslink',
    'ihr anmeldelink',
  ],
  it: [
    'link magico',
    'link di accesso',
    'accedi',
    'accedi via email',
    'verifica email',
    // SSO / passwordless
    'senza password',
    'accesso singolo',
    // Click patterns
    'fai clic sul link per accedere',
    'clicca qui per accedere',
    'usa questo link per accedere',
    // Token / link references
    'link di autenticazione',
    'il tuo link di accesso',
  ],
  pt: [
    'link mágico',
    'link de login',
    'entrar',
    'entrar por e-mail',
    'verificar e-mail',
    // SSO / passwordless
    'sem senha',
    'login único',
    // Click patterns
    'clique no link para entrar',
    'clique abaixo para entrar',
    'use este link para entrar',
    // Token / link references
    'link de autenticação',
    'seu link de login',
  ],
  nl: [
    'magische link',
    'inloglink',
    'via e-mail inloggen',
    'e-mail bevestigen',
    // SSO / passwordless
    'wachtwoordloos',
    'eenmalige aanmelding',
    // Click patterns
    'klik op de link om in te loggen',
    'klik hieronder om in te loggen',
    'gebruik deze link om in te loggen',
    // Token / link references
    'authenticatielink',
    'jouw inloglink',
  ],
  sv: [
    'magisk länk',
    'inloggningslänk',
    'logga in via e‑post',
    'bekräfta e‑post',
    // SSO / passwordless
    'lösenordsfri',
    'enkel inloggning',
    // Click patterns
    'klicka på länken för att logga in',
    'klicka nedan för att logga in',
    'använd den här länken för att logga in',
    // Token references
    'autentiseringslänk',
    'din inloggningslänk',
  ],
  fi: [
    'taikalinkki',
    'kirjautumislinkki',
    'sähköposti-kirjautuminen',
    'vahvista sähköposti',
    // SSO / passwordless
    'salasanaton',
    'kertakirjautuminen',
    // Click patterns
    'klikkaa linkkiä kirjautuaksesi',
    'käytä tätä linkkiä kirjautuaksesi',
    // Token references
    'todennuslinkki',
    'oma kirjautumislinkkisi',
  ],
  da: [
    'magisk link',
    'loginlink',
    'log ind via e‑mail',
    'bekræft e‑mail',
    // SSO / passwordless
    'adgangskodefri',
    'fælles login',
    // Click patterns
    'klik på linket for at logge ind',
    'klik nedenfor for at logge ind',
    'brug dette link for at logge ind',
    // Token references
    'godkendelseslink',
    'dit loginlink',
  ],
  no: [
    'magisk lenke',
    'innloggingslenke',
    'logg inn via e‑post',
    'bekreft e‑post',
    // SSO / passwordless
    'passordfri',
    'felles pålogging',
    // Click patterns
    'klikk på lenken for å logge inn',
    'klikk nedenfor for å logge inn',
    'bruk denne lenken for å logge inn',
    // Token references
    'autentiseringslenke',
    'din innloggingslenke',
  ],
  pl: [
    'magiczny link',
    'link logowania',
    'zaloguj przez e‑mail',
    'potwierdź e‑mail',
    // SSO / passwordless
    'bez hasła',
    'logowanie jednokrotne',
    // Click patterns
    'kliknij link, aby się zalogować',
    'kliknij poniżej, aby się zalogować',
    'użyj tego linku, aby się zalogować',
    // Token references
    'link uwierzytelniający',
    'twój link logowania',
  ],
  cs: [
    'magický odkaz',
    'přihlašovací odkaz',
    'přihlásit e‑mailem',
    'ověřit e‑mail',
    // SSO / passwordless
    'bez hesla',
    'jednotné přihlášení',
    // Click patterns
    'klikněte na odkaz pro přihlášení',
    'klikněte níže pro přihlášení',
    'použijte tento odkaz pro přihlášení',
    // Token references
    'ověřovací odkaz',
    'váš přihlašovací odkaz',
  ],
  tr: [
    'sihirli bağlantı',
    'giriş bağlantısı',
    'e‑postayla giriş',
    'e‑posta doğrulama',
    // SSO / passwordless
    'şifresiz giriş',
    'tek oturum',
    // Click patterns
    'giriş yapmak için bağlantıya tıklayın',
    'giriş yapmak için aşağıdaki bağlantıya tıklayın',
    'giriş yapmak için bu bağlantıyı kullanın',
    // Token references
    'kimlik doğrulama bağlantısı',
    'giriş bağlantınız',
  ],
  ru: [
    'магическая ссылка',
    'ссылка для входа',
    'вход по e‑mail',
    'подтвердите e‑mail',
    // SSO / passwordless
    'без пароля',
    'единый вход',
    // Click patterns
    'нажмите на ссылку для входа',
    'нажмите ниже для входа',
    'используйте эту ссылку для входа',
    // Token references
    'ссылка для аутентификации',
    'ваша ссылка для входа',
  ],
  uk: [
    'магічне посилання',
    'посилання для входу',
    'вхід по e‑mail',
    'підтвердьте e‑mail',
    // SSO / passwordless
    'без пароля',
    'єдиний вхід',
    // Click patterns
    'натисніть на посилання для входу',
    'натисніть нижче для входу',
    'використайте це посилання для входу',
    // Token references
    'посилання для автентифікації',
    'ваше посилання для входу',
  ],
  ar: [
    'رابط سحري',
    'رابط تسجيل الدخول',
    'تسجيل الدخول عبر البريد',
    'تأكيد البريد الإلكتروني',
    // SSO / passwordless
    'بدون كلمة مرور',
    'الدخول الموحد',
    // Click patterns
    'انقر على الرابط لتسجيل الدخول',
    'انقر أدناه لتسجيل الدخول',
    'استخدم هذا الرابط لتسجيل الدخول',
    // Token references
    'رابط المصادقة',
    'رابط تسجيل الدخول الخاص بك',
  ],
  ja: [
    'マジックリンク',
    'ログインリンク',
    'メールでログイン',
    'メール確認',
    'メールアドレスを確認',
    // SSO / passwordless
    'パスワード不要',
    'パスワードなし',
    'シングルサインオン',
    // Click patterns
    'ログインするにはリンクをクリック',
    '以下のリンクをクリックしてログイン',
    'このリンクを使ってログイン',
    // Token references
    '認証リンク',
    'あなたのログインリンク',
  ],
  ko: [
    '매직 링크',
    '로그인 링크',
    '이메일로 로그인',
    '이메일 확인',
    // SSO / passwordless
    '비밀번호 없이',
    '비밀번호 없는 로그인',
    '싱글 사인온',
    // Click patterns
    '로그인하려면 링크를 클릭',
    '아래 링크를 클릭하여 로그인',
    '이 링크를 사용하여 로그인',
    // Token references
    '인증 링크',
    '로그인 링크',
  ],
  zh: [
    '魔法链接',
    '登录链接',
    '通过邮件登录',
    '验证邮箱',
    '用邮箱登录',
    // SSO / passwordless
    '免密码',
    '无密码登录',
    '单点登录',
    // Click patterns
    '点击链接登录',
    '点击下方链接登录',
    '使用此链接登录',
    // Token references
    '验证链接',
    '您的登录链接',
  ],
})

/** Flattened keyword lists (legacy-compatible) */
export const CODE_KEYWORDS: ReadonlyArray<string> = Object.freeze(
  Object.values(CODE_KEYWORDS_BY_LANG).flat().filter(Boolean)
)
export const MAGIC_LINK_KEYWORDS: ReadonlyArray<string> = Object.freeze(
  Object.values(MAGIC_LINK_KEYWORDS_BY_LANG).flat().filter(Boolean)
)

/** Compiled regex variants (recommended for performance). */
export const CODE_KEYWORDS_REGEX: RegExp = buildKeywordRegex(CODE_KEYWORDS)
export const MAGIC_LINK_KEYWORDS_REGEX: RegExp = buildKeywordRegex(MAGIC_LINK_KEYWORDS)

/** Terms indicating TOTP/hardware flows we must avoid. */
export const NEGATIVE_CONTEXT_KEYWORDS_TOTP: ReadonlyArray<string> = Object.freeze([
  'totp',
  'authenticator',
  'google authenticator',
  'authy',
  'hardware key',
  'security key',
  'webauthn',
  'fido',
  'yubikey',
  'passkey',
])
export const NEGATIVE_CONTEXT_REGEX: RegExp = buildKeywordRegex(
  NEGATIVE_CONTEXT_KEYWORDS_TOTP
)

/** Link words to reject auto-open (handled as "danger"). */
export const DANGEROUS_LINK_KEYWORDS: ReadonlyArray<string> = Object.freeze([
  'password reset',
  'reset your password',
  'unsubscribe',
  'preferences',
  'support',
  'help center',
])

/**
 * URL path segments that indicate a password-reset / account-recovery
 * flow. These are sensitive: opening a reset link consumes the token
 * and forces the user into a re-auth flow they may not have initiated.
 * Magic-link extraction rejects URLs whose pathname matches one of
 * these patterns.
 *
 * Match is anchored at a path segment boundary (`/...` followed by
 * `/`, `?`, `#`, or end-of-string) so that legitimate paths like
 * `/resetting-quotas` or `/password-strength-meter` are not blocked.
 */
export const RESET_LINK_PATH_PATTERNS: ReadonlyArray<RegExp> = Object.freeze([
  /\/(?:reset|forgot|recover)(?:[/?#]|$)/i,
  /\/(?:reset|forgot|recover)[-_](?:password|account|access)(?:[/?#]|$)/i,
  /\/(?:password|account)[-_](?:reset|recovery)(?:[/?#]|$)/i,
])

/** URL fragments that *positively* hint at login/verify links. */
export const MAGIC_LINK_URL_HINTS: ReadonlyArray<string> = Object.freeze([
  'login',
  'signin',
  'sign-in',
  'magic',
  'token',
  'session',
  'verify',
  'continue',
])

// ------------------------------
// Tracker URL detection
// ------------------------------

/**
 * Hostnames belonging to ESP click-tracking redirectors. These wrap real
 * destinations in an opaque link that records opens/clicks before
 * 302-redirecting. They are never the actual magic link, so the
 * extractor refuses to surface them at all - opening one in a tab and
 * letting it redirect would still leak the click event and would show
 * the user a domain they didn't expect.
 *
 * Patterns match the full hostname (case-insensitive). Subdomains are
 * handled with leading wildcards expressed as `(?:^|\.)host\.tld$`.
 */
export const TRACKER_HOST_PATTERNS: ReadonlyArray<RegExp> = Object.freeze([
  // HubSpot click tracking (hubspotlinks.com, plus on-host /e3t/, /Ctc/, /CL0/ paths)
  /(?:^|\.)hubspotlinks\.com$/i,
  // Mailchimp / Mandrill
  /(?:^|\.)list-manage\.com$/i,
  /(?:^|\.)mandrillapp\.com$/i,
  // SendGrid / Twilio email
  /(?:^|\.)sendgrid\.net$/i,
  /(?:^|\.)mailgun\.org$/i,
  /(?:^|\.)sparkpostmail\.com$/i,
  /(?:^|\.)sparkpost\.com$/i,
  // Brevo / Sendinblue
  /(?:^|\.)sendinblue\.com$/i,
  /(?:^|\.)brevo\.com$/i,
  // Marketo / Pardot / Salesforce Marketing Cloud
  /(?:^|\.)mktomail\.com$/i,
  /(?:^|\.)marketo\.com$/i,
  /(?:^|\.)pardot\.com$/i,
  /(?:^|\.)exct\.net$/i,
  /(?:^|\.)exacttarget\.com$/i,
  // ConvertKit
  /(?:^|\.)convertkit-mail\d*\.com$/i,
  // Campaign Monitor
  /(?:^|\.)createsend\.com$/i,
  /(?:^|\.)cmail\d*\.com$/i,
  // Iterable / Klaviyo / Customer.io
  /(?:^|\.)iterable\.com$/i,
  /(?:^|\.)klaviyomail\.com$/i,
  /(?:^|\.)customeriomail\.com$/i,
  // AWeber
  /(?:^|\.)aweber\.com$/i,
  // ActiveCampaign
  /(?:^|\.)activehosted\.com$/i,
  // Beehiiv
  /(?:^|\.)beehiiv\.net$/i,
  // Generic click/track subdomain prefixes (conservative: leftmost label
  // must be one of these, not just contain them)
  /^click\d*\./i,
  /^clicks\./i,
  /^track\d*\./i,
  /^tracking\./i,
  /^email-track\./i,
  /^mailtrack\./i,
  /^mailtrk\./i,
])

/**
 * Path prefixes used by ESP redirector endpoints. Match against the
 * URL pathname (case-insensitive). HubSpot's per-account endpoints
 * (`/Ctc/`, `/e3t/`, `/CL0/`) are the primary case here - a tracker
 * hosted under the brand's own subdomain (e.g. `e.deepgram.com/e3t/...`)
 * isn't caught by hostname alone.
 */
export const TRACKER_PATH_PATTERNS: ReadonlyArray<RegExp> = Object.freeze([
  /^\/(?:Ctc|CL0|e3t)\//i,           // HubSpot
  /^\/wf\/(?:click|open)\b/i,         // HubSpot legacy
  /^\/ls\/click\b/i,                  // Marketo / Salesforce Marketing
  /^\/c\/[A-Za-z0-9_-]{6,}/,          // Generic /c/<token> redirectors
  /^\/r\/[A-Za-z0-9_-]{6,}/,          // Generic /r/<token> redirectors
  /^\/track\//i,
  /^\/redir(?:ect)?\b/i,
])

/**
 * Query-parameter names that carry an embedded destination URL. When
 * an HTTPS URL appears as the value of any of these params, the link
 * is a redirector by construction.
 */
export const TRACKER_URL_PARAM_NAMES: ReadonlyArray<string> = Object.freeze([
  'u',
  'url',
  'redirect',
  'redirect_url',
  'goto',
  'to',
  'r',
  'destination',
  'continue',
])

// ------------------------------
// Exclusions to reduce false positives
// ------------------------------

export const EXCLUSION_NUMERIC_PATTERNS = Object.freeze({
  /** Phone-like: variable separators and country code. */
  phoneLike: /\+?\d[\d\s().-]{8,}\d/u,
  /** Long numeric IDs (orders, tickets, etc.). */
  longId: /(?<!\d)\d{9,}(?!\d)/u,
})

// ------------------------------
// Scoring, thresholds & defaults
// ------------------------------

export const SCORE_WEIGHTS: Readonly<ScoreWeights> = Object.freeze({
  nearKeyword: 0.38,
  senderBrand: 0.22,
  temporal: 0.18,
  expectedShape: 0.14,
  brandHint: 0.08,
})

export const THRESHOLDS: Readonly<Thresholds> = Object.freeze({
  autoAccept: 0.75,
  promptMin: 0.5,
  rejectMax: 0.3,
})

export const EXTRACTION_DEFAULTS: Readonly<ExtractionDefaults> = Object.freeze({
  /** +/- 60 chars = 120 total scanning window around matched keywords */
  windowChars: 120,
  /** Poll recent emails within the last 20 minutes for matches */
  recentWindowMinutes: 20,
  /** Numeric code sanity bounds */
  codeMin: 4,
  codeMax: 8,
  /** Alphanumeric code sanity bounds */
  alnumMin: 4,
  alnumMax: 10,
})

// ------------------------------
// Helpers (exported for tests)
// ------------------------------

/**
 * Build a case-/unicode-insensitive regex that matches any keyword in the list.
 * Exported for unit tests and advanced usage in extractors.
 */
export function buildKeywordsRegex(words: ReadonlyArray<string>): RegExp {
  return buildKeywordRegex(words)
}
