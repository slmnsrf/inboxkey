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
export { DOMAIN_ALIASES, WATCH_SESSION_SCORING } from '../matching/scoring-config'

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
 * Numeric codes: 4–8 digits, not embedded in longer digit sequences.
 * Uses lookarounds to avoid capturing digits adjacent to other digits.
 */
const RX_NUMERIC: RegExp = /(?<!\d)(\d{4,8})(?!\d)/gu

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
    ar: [
      'رمز',
      'رمز التحقق',
      'رمز الأمان',
      'رمز لمرة واحدة',
      'كلمة مرور لمرة واحدة',
      'otp',
      'رمز تسجيل الدخول',
      'رمز المصادقة',
    ],
    he: [
      'קוד',
      'קוד אימות',
      'קוד אבטחה',
      'קוד חד פעמי',
      'סיסמה חד פעמית',
      'otp',
      'קוד כניסה',
      'קוד אימות זהות',
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
    'magic link',
    'login link',
    'sign-in link',
    'sign in link',
    'email login link',
    'one-click login',
    'verify email',
    'verify your email',
    'continue login',
  ],
  es: [
    'enlace mágico',
    'enlace de acceso',
    'iniciar sesión',
    'inicia sesión desde el correo',
    'verificar correo',
    'verifica tu correo',
  ],
  fr: [
    'lien magique',
    'lien de connexion',
    'connexion par e-mail',
    'se connecter',
    'vérifier votre e-mail',
  ],
  de: [
    'magic link',
    'login-link',
    'anmeldelink',
    'per e-mail anmelden',
    'e-mail-anmeldung',
    'e-mail bestätigen',
  ],
  it: ['link magico', 'link di accesso', 'accedi', 'accedi via email', 'verifica email'],
  pt: [
    'link mágico',
    'link de login',
    'entrar',
    'entrar por e-mail',
    'verificar e-mail',
  ],
  nl: ['magische link', 'inloglink', 'via e-mail inloggen', 'e-mail bevestigen'],
  sv: ['magisk länk', 'inloggningslänk', 'logga in via e‑post', 'bekräfta e‑post'],
  fi: ['taikalinkki', 'kirjautumislinkki', 'sähköposti-kirjautuminen', 'vahvista sähköposti'],
  da: ['magisk link', 'loginlink', 'log ind via e‑mail', 'bekræft e‑mail'],
  no: ['magisk lenke', 'innloggingslenke', 'logg inn via e‑post', 'bekreft e‑post'],
  pl: ['magiczny link', 'link logowania', 'zaloguj przez e‑mail', 'potwierdź e‑mail'],
  cs: ['magický odkaz', 'přihlašovací odkaz', 'přihlásit e‑mailem', 'ověřit e‑mail'],
  tr: ['sihirli bağlantı', 'giriş bağlantısı', 'e‑postayla giriş', 'e‑posta doğrulama'],
  ru: ['магическая ссылка', 'ссылка для входа', 'вход по e‑mail', 'подтвердите e‑mail'],
  uk: ['магічне посилання', 'посилання для входу', 'вхід по e‑mail', 'підтвердьте e‑mail'],
  ar: ['رابط سحري', 'رابط تسجيل الدخول', 'تسجيل الدخول عبر البريد', 'تأكيد البريد الإلكتروني'],
  he: ['קישור קסם', 'קישור כניסה', 'כניסה דרך אימייל', 'אימות אימייל'],
  ja: ['マジックリンク', 'ログインリンク', 'メールでログイン', 'メール確認', 'メールアドレスを確認'],
  ko: ['매직 링크', '로그인 링크', '이메일로 로그인', '이메일 확인'],
  zh: ['魔法链接', '登录链接', '通过邮件登录', '验证邮箱', '用邮箱登录'],
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
  /** Poll recent emails within the last 10 minutes for matches */
  recentWindowMinutes: 10,
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
