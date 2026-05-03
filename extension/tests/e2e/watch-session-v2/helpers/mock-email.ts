/**
 * Mock Email Generation Helpers for Watch Session V2 E2E Tests
 *
 * Provides utilities for creating realistic mock emails with verification codes
 * and injecting them into the extension's storage to simulate email arrival.
 */

import type { Page } from '@playwright/test'

export interface MockEmail {
  from: string
  fromDomain: string
  subject: string
  body: string
  code?: string
  link?: string
  receivedAt: number
  provider: 'imap-bridge' | 'outlook'
}

export interface MockEmailOptions {
  from: string
  subject: string
  code?: string
  link?: string
  receivedAt?: number
  provider?: 'imap-bridge' | 'outlook'
}

/**
 * Create a mock email with verification code
 */
export function createMockEmail(options: MockEmailOptions): MockEmail {
  const fromDomain = options.from.includes('@')
    ? options.from.split('@')[1]
    : options.from

  return {
    from: options.from,
    fromDomain,
    subject: options.subject,
    body: options.code
      ? `Your verification code is: ${options.code}`
      : `Click here to verify: ${options.link}`,
    code: options.code,
    link: options.link,
    receivedAt: options.receivedAt ?? Date.now(),
    provider: options.provider ?? 'imap-bridge',
  }
}

/**
 * Extract eTLD+1 from domain (simple implementation)
 */
function extractETLD(domain: string): string {
  if (!domain) return ''
  const normalized = domain.toLowerCase().trim()
  const parts = normalized.split('.')
  if (parts.length <= 1) return normalized
  if (parts.length === 2) return normalized
  return parts.slice(-2).join('.')
}

/**
 * Inject a mock email into the extension's storage
 */
export async function injectMockEmail(
  backgroundPage: Page,
  email: MockEmail
): Promise<void> {
  await backgroundPage.evaluate(
    async ({ email }) => {
      // Extract senderETLD from email domain
      function extractETLD(domain: string): string {
        if (!domain) return ''
        const normalized = domain.toLowerCase().trim()
        const parts = normalized.split('.')
        if (parts.length <= 1) return normalized
        if (parts.length === 2) return normalized
        return parts.slice(-2).join('.')
      }

      const senderETLD = extractETLD(email.fromDomain)

      // Create StoredCode object
      const storedCode: any = {
        code: email.code || `magic-link:${email.link}`,
        timestamp: email.receivedAt,
        receivedAt: email.receivedAt,
        source: `${email.from} - ${email.subject}`,
        used: false,
        siteMatch: email.link ? email.fromDomain : undefined,
        mailboxId: 'test-mailbox-id',
        senderETLD: senderETLD,
      }

      return new Promise<void>((resolve) => {
        chrome.storage.local.get(['recent_codes_plain'], (result) => {
          const codes = result.recent_codes_plain || []
          codes.unshift(storedCode)
          chrome.storage.local.set({ recent_codes_plain: codes }, () => resolve())
        })
      })
    },
    { email }
  )
}

/**
 * Inject multiple mock emails in sequence
 */
export async function injectMockEmailBatch(
  backgroundPage: Page,
  emails: MockEmail[],
  delayMs = 100
): Promise<void> {
  for (const email of emails) {
    await injectMockEmail(backgroundPage, email)
    if (delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }
}

/**
 * Create a mock email with exact domain match
 */
export function createExactDomainEmail(
  siteDomain: string,
  code: string,
  subject = 'Verification code'
): MockEmail {
  return createMockEmail({
    from: `noreply@${siteDomain}`,
    subject,
    code,
  })
}

/**
 * Create a mock email with alias domain match
 */
export function createAliasDomainEmail(
  siteDomain: string,
  code: string,
  subject = 'Verification code'
): MockEmail {
  // Map common domain aliases
  const aliases: Record<string, string> = {
    'dropbox.com': 'dropboxmail.com',
    'github.com': 'github.github.io',
    'facebook.com': 'facebookmail.com',
    'linkedin.com': 'linkedinmail.com',
  }

  const aliasDomain = aliases[siteDomain] || `mail.${siteDomain}`

  return createMockEmail({
    from: `noreply@${aliasDomain}`,
    subject,
    code,
  })
}

/**
 * Create a mock email with token overlap match
 */
export function createTokenOverlapEmail(
  siteDomain: string,
  code: string,
  tokenKeyword?: string
): MockEmail {
  // Extract site name for token matching
  const siteName = siteDomain.split('.')[0]
  const keyword = tokenKeyword || siteName

  return createMockEmail({
    from: 'noreply@notifications.com',
    subject: `${keyword.charAt(0).toUpperCase() + keyword.slice(1)} verification code`,
    code,
  })
}

/**
 * Create a mock email with no domain match
 */
export function createNoMatchEmail(
  code: string,
  subject = 'Verification code'
): MockEmail {
  return createMockEmail({
    from: 'noreply@unrelated-service.com',
    subject,
    code,
  })
}

/**
 * Clear all mock emails from storage
 */
export async function clearMockEmails(backgroundPage: Page): Promise<void> {
  await backgroundPage.evaluate(async () => {
    return new Promise<void>((resolve) => {
      chrome.storage.local.set({ recent_codes_plain: [] }, () => resolve())
    })
  })
}

/**
 * Get all stored codes from storage
 */
export async function getStoredCodes(backgroundPage: Page): Promise<any[]> {
  return await backgroundPage.evaluate(async () => {
    return new Promise<any[]>((resolve) => {
      chrome.storage.local.get(['recent_codes_plain'], (result) => {
        resolve(result.recent_codes_plain || [])
      })
    })
  })
}

/**
 * Domain alias mappings for testing
 */
export const DOMAIN_ALIASES: Record<string, string[]> = {
  'dropbox.com': ['dropboxmail.com'],
  'github.com': ['github.github.io', 'githubusercontent.com'],
  'facebook.com': ['facebookmail.com'],
  'twitter.com': ['twitter.github.io'],
  'linkedin.com': ['linkedinmail.com'],
  'paypal.com': ['paypal.com', 'e.paypal.com'],
  'amazon.com': ['amazon.com', 'amazonses.com'],
}

/**
 * Site-specific token keywords for testing token overlap
 */
export const SITE_TOKENS: Record<string, string[]> = {
  'battlestategames.com': ['tarkov', 'escape', 'eft'],
  'riotgames.com': ['valorant', 'league', 'riot'],
  'epicgames.com': ['fortnite', 'epic', 'unreal'],
  'steampowered.com': ['steam', 'valve'],
}
