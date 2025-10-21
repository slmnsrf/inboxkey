/**
 * Code and Link Extraction Types
 *
 * Defines types for extracting verification codes and magic links from emails.
 */

export interface OTPCandidate {
  code: string
  confidence: number // 0-100
  location: 'subject' | 'body' | 'snippet'
  pattern: string // Pattern that matched
  context?: string // Surrounding text
}

export interface MagicLinkCandidate {
  url: string
  confidence: number // 0-100
  type: 'login' | 'verify' | 'reset' | 'unknown'
  domain: string
  expiresIn?: number // seconds (if detectable)
  buttonText?: string // If from HTML button
}

export interface ExtractionResult {
  otpCandidates: OTPCandidate[]
  magicLinks: MagicLinkCandidate[]
  metadata: {
    from: string
    subject: string
    timestamp: number
    hasHtml: boolean
  }
}

/**
 * OTP Extraction Patterns
 */
export interface OTPPattern {
  name: string
  regex: RegExp
  confidence: number
  charset?: 'digits' | 'alphanumeric'
  lengthRange?: [number, number]
}

/**
 * Common OTP patterns across providers
 * Ordered by specificity (longer patterns first to avoid partial matches)
 */
export const COMMON_OTP_PATTERNS: OTPPattern[] = [
  {
    name: 'eight-digit-code',
    regex: /\b(\d{8})\b/g,
    confidence: 90,
    charset: 'digits',
    lengthRange: [8, 8],
  },
  {
    name: 'alphanumeric-8',
    regex: /\b([A-Z0-9]{8})\b/gi,
    confidence: 80,
    charset: 'alphanumeric',
    lengthRange: [8, 8],
  },
  {
    name: 'six-digit-code',
    regex: /\b(\d{6})\b/g,
    confidence: 95,
    charset: 'digits',
    lengthRange: [6, 6],
  },
  {
    name: 'alphanumeric-6',
    regex: /\b([A-Z0-9]{6})\b/gi,
    confidence: 85,
    charset: 'alphanumeric',
    lengthRange: [6, 6],
  },
  {
    name: 'four-digit-code',
    regex: /\b(\d{4})\b/g,
    confidence: 85,
    charset: 'digits',
    lengthRange: [4, 4],
  },
]

/**
 * Keywords that indicate verification codes in multiple languages
 */
export const CODE_KEYWORDS = {
  en: [
    'verification code',
    'confirm code',
    'security code',
    'access code',
    'authentication code',
    'one-time code',
    'otp',
    'passcode',
    'code is',
    'your code',
  ],
  es: ['código de verificación', 'código de acceso', 'código de seguridad'],
  fr: ['code de vérification', "code d'accès", 'code de sécurité'],
  de: ['Bestätigungscode', 'Sicherheitscode', 'Zugangscode'],
  it: ['codice di verifica', 'codice di accesso'],
  pt: ['código de verificação', 'código de acesso'],
  ja: ['確認コード', '認証コード', 'セキュリティコード'],
}

/**
 * Keywords for magic link detection in multiple languages
 * Structure: MAGIC_LINK_KEYWORDS[language][category] = keywords[]
 */
export const MAGIC_LINK_KEYWORDS = {
  en: {
    login: ['sign in', 'log in', 'access your account', 'click to login', 'access account', 'login now', '/login'],
    verify: ['verify email', 'confirm email', 'activate account', 'verify your email', 'confirm your email', '/verify', '/confirm'],
    reset: ['reset password', 'change password', 'set new password', 'reset your password', 'reset-password'],
  },
  es: {
    login: ['iniciar sesión', 'inicia sesión', 'acceder a tu cuenta', 'accede a tu cuenta', 'entrar'],
    verify: ['verificar correo', 'verificar email', 'confirmar correo', 'confirmar email', 'activar cuenta'],
    reset: ['restablecer contraseña', 'cambiar contraseña', 'nueva contraseña', 'restablecer tu contraseña'],
  },
  fr: {
    login: ['se connecter', 'connexion', 'accéder à votre compte', 'accès au compte', 'connectez-vous'],
    verify: ['vérifier email', 'confirmer email', 'vérifier votre email', 'confirmer votre email', 'activer compte'],
    reset: ['réinitialiser mot de passe', 'changer mot de passe', 'nouveau mot de passe', 'réinitialiser votre mot de passe'],
  },
  de: {
    login: ['anmelden', 'einloggen', 'zugang zu ihrem konto', 'auf ihr konto zugreifen', 'jetzt anmelden'],
    verify: ['email bestätigen', 'e-mail bestätigen', 'email verifizieren', 'konto aktivieren', 'ihre email bestätigen'],
    reset: ['passwort zurücksetzen', 'passwort ändern', 'neues passwort', 'ihr passwort zurücksetzen'],
  },
  it: {
    login: ['accedi', 'accesso', 'entra', 'accedi al tuo account', 'accedi al account'],
    verify: ['verifica email', 'conferma email', 'verifica la tua email', 'conferma la tua email', 'attiva account'],
    reset: ['reimposta password', 'cambia password', 'nuova password', 'reimposta la tua password'],
  },
  pt: {
    login: ['entrar', 'fazer login', 'acessar sua conta', 'acesse sua conta', 'fazer o login'],
    verify: ['verificar email', 'confirmar email', 'verificar seu email', 'confirmar seu email', 'ativar conta'],
    reset: ['redefinir senha', 'alterar senha', 'nova senha', 'redefinir sua senha'],
  },
  ja: {
    login: ['ログイン', 'サインイン', 'ログインする', 'アカウントにアクセス', 'アカウントアクセス'],
    verify: ['メール確認', 'メール認証', 'メールを確認', 'メールを認証', 'アカウント有効化'],
    reset: ['パスワードリセット', 'パスワード変更', 'パスワード再設定', '新しいパスワード'],
  },
}

/**
 * Domains to exclude from magic link detection (common safe links)
 */
export const EXCLUDED_LINK_DOMAINS = [
  'unsubscribe',
  'privacy',
  'terms',
  'help',
  'support',
  'faq',
  'about',
  'contact',
]
