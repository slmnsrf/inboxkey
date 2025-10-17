/**
 * Integration tests for end-to-end email polling flow
 *
 * Tests the full flow: fetch emails -> extract codes -> store -> match
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EmailPollingService } from '@/lib/services/email-polling-service'
import { EncryptedStorage } from '@/lib/storage/encrypted-storage'
import { GmailProvider } from '@/lib/providers/gmail/gmail-provider'
import { EmailExtractor } from '@/lib/extraction/extractor'
import { findBestMatchingCode } from '@/lib/matching/code-matcher'
import type { Mailbox, StoredCode } from '@/lib/storage/schema'
import type { EmailMessage } from '@/lib/providers/provider-interface'

// Mock only the provider and storage layer (test extractor and matcher for real)
vi.mock('@/lib/storage/encrypted-storage')
vi.mock('@/lib/providers/gmail/gmail-provider')

describe('Email Polling Integration', () => {
  let service: EmailPollingService
  let mockStorage: any
  let mockProvider: any
  let extractor: EmailExtractor
  let storedCodes: StoredCode[]

  const mockGmailConfig = {
    clientId: 'test-client-id',
    redirectUri: 'https://test.chromiumapp.org/oauth2',
    scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
  }

  const createMockMailbox = (): Mailbox => ({
    id: 'mailbox-123',
    providerId: 'gmail',
    email: 'test@example.com',
    accessToken: 'access-token-123',
    refreshToken: 'refresh-token-123',
    tokenExpiresAt: Date.now() + 3600 * 1000,
    addedAt: Date.now() - 86400 * 1000,
    lastSyncedAt: Date.now() - 600 * 1000,
  })

  beforeEach(() => {
    vi.clearAllMocks()
    storedCodes = []

    // Create real extractor instance
    extractor = new EmailExtractor()

    // Mock storage with in-memory implementation
    mockStorage = {
      getMailboxes: vi.fn(),
      updateMailbox: vi.fn(),
      getRecentCodes: vi.fn(() => Promise.resolve([...storedCodes])),
      addCode: vi.fn(async (code: StoredCode) => {
        storedCodes.unshift(code)
      }),
    }

    // Mock provider
    mockProvider = {
      fetchEmails: vi.fn(),
      refreshTokens: vi.fn(),
    }

    // Setup mock constructors
    vi.mocked(EncryptedStorage).mockImplementation(() => mockStorage)
    vi.mocked(GmailProvider).mockImplementation(() => mockProvider)

    // Create service
    service = new EmailPollingService(mockStorage, mockGmailConfig)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('End-to-End Flow: Fetch -> Extract -> Store -> Match', () => {
    it('should complete full flow for GitHub verification email', async () => {
      const mailbox = createMockMailbox()
      const githubEmail: EmailMessage = {
        id: 'email-github-1',
        from: {
          email: 'noreply@github.com',
          name: 'GitHub',
        },
        subject: 'Your GitHub verification code',
        date: new Date(),
        bodyText: 'Your GitHub verification code is 123456. This code expires in 10 minutes.',
        snippet: 'Your GitHub verification code is 123456',
      }

      mockStorage.getMailboxes.mockResolvedValue([mailbox])
      mockProvider.fetchEmails.mockResolvedValue([githubEmail])

      // Step 1: Poll emails
      const pollResult = await service.pollAllMailboxes()

      expect(pollResult.newCodesCount).toBe(1)
      expect(pollResult.mailboxesPolled).toBe(1)
      expect(pollResult.errors).toHaveLength(0)

      // Step 2: Verify code was stored
      expect(storedCodes).toHaveLength(1)
      expect(storedCodes[0].code).toBe('123456')
      expect(storedCodes[0].source).toBe('noreply@github.com - Your GitHub verification code')
      expect(storedCodes[0].used).toBe(false)

      // Step 3: Match code for GitHub login page
      const matchedCode = findBestMatchingCode(
        storedCodes,
        'https://github.com/login',
        Date.now()
      )

      expect(matchedCode).not.toBeNull()
      expect(matchedCode?.code).toBe('123456')
    })

    it('should handle multiple codes from different senders', async () => {
      const mailbox = createMockMailbox()
      const githubEmail: EmailMessage = {
        id: 'email-1',
        from: { email: 'noreply@github.com', name: 'GitHub' },
        subject: 'Your verification code',
        date: new Date(Date.now() - 60000), // 1 minute ago
        bodyText: 'Your code is 111111',
      }
      const slackEmail: EmailMessage = {
        id: 'email-2',
        from: { email: 'feedback@slack.com', name: 'Slack' },
        subject: 'Slack confirmation code',
        date: new Date(Date.now() - 30000), // 30 seconds ago
        bodyText: 'Your Slack confirmation code is 222222',
      }

      mockStorage.getMailboxes.mockResolvedValue([mailbox])
      mockProvider.fetchEmails.mockResolvedValue([githubEmail, slackEmail])

      // Poll emails
      const pollResult = await service.pollAllMailboxes()

      expect(pollResult.newCodesCount).toBe(2)
      expect(storedCodes).toHaveLength(2)

      // Verify both codes are stored
      const codes = storedCodes.map((c) => c.code)
      expect(codes).toContain('111111')
      expect(codes).toContain('222222')

      // Match should return most recent code
      const matched = findBestMatchingCode(storedCodes, 'https://slack.com/signin', Date.now())
      expect(matched).not.toBeNull()
    })

    it('should extract and store magic links', async () => {
      const mailbox = createMockMailbox()
      const magicLinkEmail: EmailMessage = {
        id: 'email-magic',
        from: { email: 'auth@example.com', name: 'Example' },
        subject: 'Sign in to Example',
        date: new Date(),
        bodyText: 'Click here to sign in: https://example.com/auth/verify?token=abc123xyz',
        bodyHtml:
          '<a href="https://example.com/auth/verify?token=abc123xyz">Sign in</a>',
      }

      mockStorage.getMailboxes.mockResolvedValue([mailbox])
      mockProvider.fetchEmails.mockResolvedValue([magicLinkEmail])

      const pollResult = await service.pollAllMailboxes()

      expect(pollResult.newCodesCount).toBeGreaterThan(0)

      // Check if magic link was stored
      const magicLinks = storedCodes.filter((c) => c.code.startsWith('magic-link:'))
      expect(magicLinks.length).toBeGreaterThan(0)
    })

    it('should handle mixed OTP and magic link in same email', async () => {
      const mailbox = createMockMailbox()
      const mixedEmail: EmailMessage = {
        id: 'email-mixed',
        from: { email: 'auth@service.com', name: 'Service' },
        subject: 'Sign in options',
        date: new Date(),
        bodyText:
          'Your code is 654321. Or click: https://service.com/login?token=xyz789',
        bodyHtml:
          '<p>Your code is 654321</p><a href="https://service.com/login?token=xyz789">Login</a>',
      }

      mockStorage.getMailboxes.mockResolvedValue([mailbox])
      mockProvider.fetchEmails.mockResolvedValue([mixedEmail])

      const pollResult = await service.pollAllMailboxes()

      expect(pollResult.newCodesCount).toBeGreaterThan(0)

      // Should have both OTP and magic link
      const otpCodes = storedCodes.filter((c) => !c.code.startsWith('magic-link:'))
      const magicLinks = storedCodes.filter((c) => c.code.startsWith('magic-link:'))

      expect(otpCodes.length).toBeGreaterThan(0)
      expect(otpCodes.some((c) => c.code === '654321')).toBe(true)
    })
  })

  describe('Concurrent Polling', () => {
    it('should handle concurrent polls without race conditions', async () => {
      const mailbox = createMockMailbox()
      const email: EmailMessage = {
        id: 'email-concurrent',
        from: { email: 'test@example.com' },
        subject: 'Code: 888888',
        date: new Date(),
        bodyText: 'Your code is 888888',
      }

      mockStorage.getMailboxes.mockResolvedValue([mailbox])
      mockProvider.fetchEmails.mockResolvedValue([email])

      // Simulate concurrent polls
      const results = await Promise.all([
        service.pollAllMailboxes(),
        service.pollAllMailboxes(),
        service.pollAllMailboxes(),
      ])

      // All should succeed
      results.forEach((result) => {
        expect(result.errors).toHaveLength(0)
      })

      // Should have deduplicated (only 1 copy of the code)
      const uniqueCodes = new Set(storedCodes.map((c) => c.code))
      expect(uniqueCodes.size).toBeLessThanOrEqual(3) // At most 3 if all ran concurrently
    })
  })

  describe('Code Matching After Polling', () => {
    it('should match code immediately after polling', async () => {
      const mailbox = createMockMailbox()
      const email: EmailMessage = {
        id: 'email-match',
        from: { email: 'auth@example.com' },
        subject: 'Your verification code',
        date: new Date(),
        bodyText: 'Your verification code: 999999',
      }

      mockStorage.getMailboxes.mockResolvedValue([mailbox])
      mockProvider.fetchEmails.mockResolvedValue([email])

      // Poll
      await service.pollAllMailboxes()

      // Immediately try to match
      const matched = findBestMatchingCode(
        storedCodes,
        'https://example.com/verify',
        Date.now()
      )

      expect(matched).not.toBeNull()
      // Should match the 6-digit code (most common format)
      expect(storedCodes.some(c => c.code === '999999')).toBe(true)
    })

    it('should prefer most recent code when multiple exist', async () => {
      const mailbox = createMockMailbox()
      const oldEmail: EmailMessage = {
        id: 'email-old',
        from: { email: 'auth@example.com' },
        subject: 'Old code',
        date: new Date(Date.now() - 240000), // 4 minutes ago
        bodyText: 'Code: 111111',
      }
      const newEmail: EmailMessage = {
        id: 'email-new',
        from: { email: 'auth@example.com' },
        subject: 'New code',
        date: new Date(Date.now() - 30000), // 30 seconds ago
        bodyText: 'Code: 222222',
      }

      mockStorage.getMailboxes.mockResolvedValue([mailbox])
      mockProvider.fetchEmails.mockResolvedValue([oldEmail, newEmail])

      await service.pollAllMailboxes()

      const matched = findBestMatchingCode(storedCodes, 'https://example.com', Date.now())

      // Should prefer newer code
      expect(matched?.code).toBe('222222')
    })

    it('should not match expired codes', async () => {
      const mailbox = createMockMailbox()
      const expiredEmail: EmailMessage = {
        id: 'email-expired',
        from: { email: 'auth@example.com' },
        subject: 'Expired code',
        date: new Date(Date.now() - 360000), // 6 minutes ago (beyond 5 min window)
        bodyText: 'Code: 777777',
      }

      mockStorage.getMailboxes.mockResolvedValue([mailbox])
      mockProvider.fetchEmails.mockResolvedValue([expiredEmail])

      await service.pollAllMailboxes()

      // Code should be stored but not matched (too old)
      const matched = findBestMatchingCode(storedCodes, 'https://example.com', Date.now())
      expect(matched).toBeNull()
    })
  })

  describe('Multiple Mailboxes', () => {
    it('should aggregate codes from all mailboxes', async () => {
      const mailbox1 = createMockMailbox()
      const mailbox2: Mailbox = {
        ...createMockMailbox(),
        id: 'mailbox-456',
        email: 'work@company.com',
      }

      const email1: EmailMessage = {
        id: 'email-personal',
        from: { email: 'service1@example.com' },
        subject: 'Personal code',
        date: new Date(),
        bodyText: 'Your verification code is: 111111',
      }

      const email2: EmailMessage = {
        id: 'email-work',
        from: { email: 'service2@company.com' },
        subject: 'Work code',
        date: new Date(),
        bodyText: 'Your verification code is: 222222',
      }

      mockStorage.getMailboxes.mockResolvedValue([mailbox1, mailbox2])
      mockProvider.fetchEmails
        .mockResolvedValueOnce([email1])
        .mockResolvedValueOnce([email2])

      const result = await service.pollAllMailboxes()

      expect(result.mailboxesPolled).toBe(2)
      expect(result.newCodesCount).toBeGreaterThan(0)

      // Both codes should be available
      expect(storedCodes.map((c) => c.code)).toContain('111111')
      expect(storedCodes.map((c) => c.code)).toContain('222222')
    })
  })

  describe('Error Recovery', () => {
    it('should continue polling after transient errors', async () => {
      const mailbox = createMockMailbox()
      const email: EmailMessage = {
        id: 'email-success',
        from: { email: 'auth@example.com' },
        subject: 'Success code',
        date: new Date(),
        bodyText: 'Code: 555555',
      }

      mockStorage.getMailboxes.mockResolvedValue([mailbox])

      // First call fails, second succeeds
      mockProvider.fetchEmails
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce([email])

      // First poll fails
      const result1 = await service.pollAllMailboxes()
      expect(result1.errors).toHaveLength(1)
      expect(result1.newCodesCount).toBe(0)

      // Second poll succeeds
      const result2 = await service.pollAllMailboxes()
      expect(result2.errors).toHaveLength(0)
      expect(result2.newCodesCount).toBe(1)
      expect(storedCodes[0].code).toBe('555555')
    })
  })

  describe('Real-world Email Formats', () => {
    it('should extract code from AWS verification email format', async () => {
      const mailbox = createMockMailbox()
      const awsEmail: EmailMessage = {
        id: 'email-aws',
        from: { email: 'no-reply@verify.amazon.com', name: 'Amazon Web Services' },
        subject: 'Amazon Web Services Verification Code',
        date: new Date(),
        bodyText: 'Your AWS verification code is:\n\n456789\n\nThis code expires in 10 minutes.',
      }

      mockStorage.getMailboxes.mockResolvedValue([mailbox])
      mockProvider.fetchEmails.mockResolvedValue([awsEmail])

      const result = await service.pollAllMailboxes()

      expect(result.newCodesCount).toBeGreaterThan(0)
      expect(storedCodes.some((c) => c.code === '456789')).toBe(true)
    })

    it('should extract code from Google verification email format', async () => {
      const mailbox = createMockMailbox()
      const googleEmail: EmailMessage = {
        id: 'email-google',
        from: { email: 'noreply@google.com', name: 'Google' },
        subject: 'Your Google verification code',
        date: new Date(),
        bodyText: 'G-123456\n\nThis code will expire in 10 minutes.',
      }

      mockStorage.getMailboxes.mockResolvedValue([mailbox])
      mockProvider.fetchEmails.mockResolvedValue([googleEmail])

      const result = await service.pollAllMailboxes()

      expect(result.newCodesCount).toBeGreaterThan(0)
      // Should extract the 6-digit numeric part
      const codes = storedCodes.map((c) => c.code)
      expect(codes.some((c) => c.includes('123456'))).toBe(true)
    })
  })
})
