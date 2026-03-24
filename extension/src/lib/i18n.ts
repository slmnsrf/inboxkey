/**
 * i18n Utility
 *
 * Wrapper around chrome.i18n API for localization.
 * Uses native Chrome extension i18n (zero dependencies).
 *
 * Reference: https://developer.chrome.com/docs/extensions/reference/i18n/
 *
 * @example
 * import { t, plural, timeAgo } from '@/lib/i18n'
 *
 * function Header() {
 *   return <h1>{t('popup_title')}</h1>
 * }
 */

/**
 * Get localized message from chrome.i18n
 *
 * @param key - Message key from messages.json
 * @param substitutions - Substitution values for placeholders
 * @returns Localized string, or key if translation missing
 *
 * @example
 * t('popup_title') // "InboxKey"
 * t('popup_mailbox', '1') // "1 mailbox"
 * t('aria_copy_code', ['123456', 'user@gmail.com']) // "Copy code 123456 from user@gmail.com"
 */
export function t(key: string, substitutions?: string | string[]): string {
  try {
    const message = chrome.i18n.getMessage(key, substitutions)

    // If no message found, return key for debugging
    if (!message) {
      console.warn(`[i18n] Missing translation for key: ${key}`)
      return key
    }

    return message
  } catch (error) {
    console.error(`[i18n] Error getting message for key: ${key}`, error)
    return key
  }
}

/**
 * Get plural form based on count
 *
 * @param singularKey - Key for singular form
 * @param pluralKey - Key for plural form
 * @param count - Count to determine singular/plural
 * @returns Localized string with count
 *
 * @example
 * plural('popup_mailbox', 'popup_mailboxes', 1) // "1 mailbox"
 * plural('popup_mailbox', 'popup_mailboxes', 2) // "2 mailboxes"
 */
export function plural(
  singularKey: string,
  pluralKey: string,
  count: number
): string {
  const key = count === 1 ? singularKey : pluralKey
  return t(key, String(count))
}

/**
 * Format time ago (localized)
 *
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Localized time string
 *
 * @example
 * timeAgo(Date.now()) // "just now"
 * timeAgo(Date.now() - 60000) // "1 minute ago"
 * timeAgo(Date.now() - 300000) // "5 minutes ago"
 */
export function timeAgo(timestamp: number): string {
  if (timestamp === 0) return t('time_never')

  const seconds = Math.floor((Date.now() - timestamp) / 1000)

  // Less than 60 seconds
  if (seconds < 60) return t('time_just_now')

  const minutes = Math.floor(seconds / 60)

  // 1 minute
  if (minutes === 1) return t('time_minute_ago')

  // Less than 60 minutes
  if (minutes < 60) return t('time_minutes_ago', String(minutes))

  const hours = Math.floor(minutes / 60)

  // 1 hour
  if (hours === 1) return t('time_hour_ago')

  // Multiple hours
  return t('time_hours_ago', String(hours))
}

/**
 * Format time ago in compact form (e.g., "2m ago").
 */
export function timeAgoShort(timestamp: number): string {
  if (timestamp === 0) return t('time_never')

  const seconds = Math.floor((Date.now() - timestamp) / 1000)

  if (seconds < 60) return t('time_just_now_short')

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return t('time_minutes_short', String(minutes))

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('time_hours_short', String(hours))

  const days = Math.floor(hours / 24)
  return t('time_days_short', String(days))
}

/**
 * Get current UI language
 *
 * @returns Language code (e.g., 'en', 'es', 'fr')
 *
 * @example
 * getLanguage() // "en"
 */
export function getLanguage(): string {
  return chrome.i18n.getUILanguage()
}

/**
 * Get accept languages (user's language preferences)
 *
 * @returns Promise resolving to array of language codes
 *
 * @example
 * const languages = await getAcceptLanguages()
 * // ['en-US', 'en', 'es']
 */
export async function getAcceptLanguages(): Promise<string[]> {
  return new Promise((resolve) => {
    chrome.i18n.getAcceptLanguages((languages) => {
      resolve(languages)
    })
  })
}

/**
 * Check if a message key exists
 *
 * @param key - Message key to check
 * @returns True if key exists, false otherwise
 *
 * @example
 * hasMessage('popup_title') // true
 * hasMessage('missing_key') // false
 */
export function hasMessage(key: string): boolean {
  const message = chrome.i18n.getMessage(key)
  return message !== ''
}

/**
 * Format provider name (Gmail, IMAP)
 *
 * @param providerId - Provider ID
 * @returns Formatted provider name
 *
 * @example
 * formatProvider('gmail') // "Gmail"
 */
export function formatProvider(providerId: string): string {
  const providers: Record<string, string> = {
    gmail: 'Gmail',
    imap: 'IMAP',
    'google-messages': 'Google Messages',
  }

  return providers[providerId] || providerId
}

/**
 * Format source (email address)
 *
 * @param source - Email address or identifier
 * @returns Formatted source string
 *
 * @example
 * formatSource('user@gmail.com') // "user@gmail.com"
 * formatSource('noreply@github.com') // "github.com"
 */
export function formatSource(source: string): string {
  if (!source) return ''

  // Extract domain from email for common no-reply addresses
  if (source.includes('noreply@') || source.includes('no-reply@')) {
    const domain = source.split('@')[1]
    return domain || source
  }

  return source
}

/**
 * Format link type (magic, reset, verify, etc.)
 *
 * @param type - Link type
 * @returns Formatted type string
 *
 * @example
 * formatLinkType('magic') // "Magic link"
 * formatLinkType('password_reset') // "Password reset"
 */
export function formatLinkType(type: string): string {
  const types: Record<string, string> = {
    magic: 'Magic link',
    password_reset: 'Password reset',
    verify: 'Verification link',
    confirm: 'Confirmation link',
    unsubscribe: 'Unsubscribe link',
  }

  return types[type] || type
}

/**
 * Detect if current locale is RTL (Right-to-Left)
 *
 * @returns True if RTL, false otherwise
 *
 * @example
 * isRTL() // false (for English)
 * // true for Arabic, Hebrew, etc.
 */
export function isRTL(): boolean {
  const rtlLanguages = ['ar', 'he', 'fa', 'ur']
  const language = getLanguage().split('-')[0]
  return rtlLanguages.includes(language)
}

/**
 * Get localized direction (ltr or rtl)
 *
 * @returns 'ltr' or 'rtl'
 *
 * @example
 * getDirection() // "ltr"
 */
export function getDirection(): 'ltr' | 'rtl' {
  return isRTL() ? 'rtl' : 'ltr'
}
