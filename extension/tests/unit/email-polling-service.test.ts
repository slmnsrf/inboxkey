/**
 * Unit tests for EmailPollingService
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EmailPollingService } from '@/lib/services/email-polling-service'
import { EncryptedStorage } from '@/lib/storage/encrypted-storage'
import { GmailProvider } from '@/lib/providers/gmail/gmail-provider'
import { OutlookProvider } from '@/lib/providers/outlook/outlook-provider'
import { EmailExtractor } from '@/lib/extraction/extractor'
import type { Mailbox } from '@/lib/storage/schema'
import type { EmailMessage, OAuthTokens } from '@/lib/providers/provider-interface'
import type { ExtractionResult } from '@/lib/extraction/extraction-types'

// Mock dependencies
vi.mock('@/lib/storage/encrypted-storage')
vi.mock('@/lib/providers/gmail/gmail-provider')
vi.mock('@/lib/providers/outlook/outlook-provider')
vi.mock('@/lib/extraction/extractor')

describe('EmailPollingService', () => {
  let service: EmailPollingService
  let mockStorage: any
  let mockGmailProvider: any
  let mockOutlookProvider: any
  let mockExtractor: any

  const mockGmailConfig = {
    clientId: 'test-client-id',
    redirectUri: 'https://test.chromiumapp.org/oauth2',
    scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
  }

  const createMockMailbox = (overrides?: Partial<Mailbox>): Mailbox => ({
    id: 'mailbox-123',
    providerId: 'gmail',
    email: 'test@example.com',
    accessToken: 'access-token-123',
    refreshToken: 'refresh-token-123',
    tokenExpiresAt: Date.now() + 3600 * 1000, // 1 hour from now
    addedAt: Date.now() - 86400 * 1000, // 1 day ago
    lastSyncedAt: Date.now() - 600 * 1000, // 10 minutes ago
    ...overrides,
  })

  const createMockEmail = (overrides?: Partial<EmailMessage>): EmailMessage => ({
    id: 'email-123',
    from: {
      email: 'noreply@example.com',
      name: 'Example Service',
    },
    subject: 'Your verification code',
    date: new Date(),
    bodyText: 'Your verification code is 123456',
    snippet: 'Your verification code is 123456',
    ...overrides,
  })

  const createMockExtractionResult = (
    overrides?: Partial<ExtractionResult>
  ): ExtractionResult => ({
    otpCandidates: [
      {
        code: '123456',
        confidence: 95,
        location: 'body',
        pattern: 'six-digit-code',
      },
    ],
    magicLinks: [],
    metadata: {
      from: 'noreply@example.com',
      subject: 'Your verification code',
      timestamp: Date.now(),
      hasHtml: false,
    },
    ...overrides,
  })

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks()

    // Create mock instances
    mockStorage = {
      getMailboxes: vi.fn(),
      updateMailbox: vi.fn(),
      getRecentCodes: vi.fn(),
      addCode: vi.fn(),
    }

    mockGmailProvider = {
      fetchEmails: vi.fn(),
      refreshTokens: vi.fn(),
    }

    mockOutlookProvider = {
      fetchEmails: vi.fn(),
      refreshTokens: vi.fn(),
    }

    mockExtractor = {
      extract: vi.fn(),
    }

    // Setup mock constructors
    vi.mocked(EncryptedStorage).mockImplementation(() => mockStorage)
    vi.mocked(GmailProvider).mockImplementation(() => mockGmailProvider)
    vi.mocked(OutlookProvider).mockImplementation(() => mockOutlookProvider)
    vi.mocked(EmailExtractor).mockImplementation(() => mockExtractor)

    // Create service
    service = new EmailPollingService(mockStorage, mockGmailConfig)

    // Replace extractor instance
    ;(service as any).extractor = mockExtractor
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('pollAllMailboxes', () => {
    it('should return empty result when no mailboxes are configured', async () => {
      mockStorage.getMailboxes.mockResolvedValue([])

      const result = await service.pollAllMailboxes()

      expect(result.newCodesCount).toBe(0)
      expect(result.mailboxesPolled).toBe(0)
      expect(result.errors).toHaveLength(0)
    })

    it('should poll single mailbox and return codes found', async () => {
      const mailbox = createMockMailbox()
      const email = createMockEmail()
      const extractionResult = createMockExtractionResult()

      mockStorage.getMailboxes.mockResolvedValue([mailbox])
      mockGmailProvider.fetchEmails.mockResolvedValue([email])
      mockExtractor.extract.mockReturnValue(extractionResult)
      mockStorage.getRecentCodes.mockResolvedValue([]) // No duplicates

      const result = await service.pollAllMailboxes()

      expect(result.newCodesCount).toBe(1)
      expect(result.mailboxesPolled).toBe(1)
      expect(result.errors).toHaveLength(0)
      expect(mockStorage.addCode).toHaveBeenCalledTimes(1)
      expect(mockStorage.updateMailbox).toHaveBeenCalledWith(mailbox.id, {
        lastSyncedAt: expect.any(Number),
      })
    })

    it('should poll multiple mailboxes concurrently', async () => {
      const mailbox1 = createMockMailbox({ id: 'mailbox-1', email: 'user1@example.com' })
      const mailbox2 = createMockMailbox({ id: 'mailbox-2', email: 'user2@example.com' })
      const email = createMockEmail()
      const extractionResult = createMockExtractionResult()

      mockStorage.getMailboxes.mockResolvedValue([mailbox1, mailbox2])
      mockGmailProvider.fetchEmails.mockResolvedValue([email])
      mockExtractor.extract.mockReturnValue(extractionResult)
      mockStorage.getRecentCodes.mockResolvedValue([])

      const result = await service.pollAllMailboxes()

      expect(result.newCodesCount).toBe(2) // 1 code from each mailbox
      expect(result.mailboxesPolled).toBe(2)
      expect(result.errors).toHaveLength(0)
      expect(mockStorage.addCode).toHaveBeenCalledTimes(2)
    })

    it('should handle errors from individual mailboxes', async () => {
      const mailbox1 = createMockMailbox({ id: 'mailbox-1' })
      const mailbox2 = createMockMailbox({ id: 'mailbox-2' })

      mockStorage.getMailboxes.mockResolvedValue([mailbox1, mailbox2])
      mockGmailProvider.fetchEmails
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce([])

      const result = await service.pollAllMailboxes()

      expect(result.mailboxesPolled).toBe(1) // Only one succeeded
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].mailboxId).toBe('mailbox-1')
      expect(result.errors[0].error).toContain('Network error')
    })

    it('should handle storage error when retrieving mailboxes', async () => {
      mockStorage.getMailboxes.mockRejectedValue(new Error('Storage error'))

      const result = await service.pollAllMailboxes()

      expect(result.newCodesCount).toBe(0)
      expect(result.mailboxesPolled).toBe(0)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].mailboxId).toBe('all')
    })
  })

  describe('Token Refresh', () => {
    it('should refresh token when expired', async () => {
      const mailbox = createMockMailbox({
        tokenExpiresAt: Date.now() - 1000, // Expired 1 second ago
      })
      const email = createMockEmail()
      const extractionResult = createMockExtractionResult()
      const newTokens: OAuthTokens = {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expiresIn: 3600,
        tokenType: 'Bearer',
      }

      mockStorage.getMailboxes.mockResolvedValue([mailbox])
      mockGmailProvider.refreshTokens.mockResolvedValue(newTokens)
      mockGmailProvider.fetchEmails.mockResolvedValue([email])
      mockExtractor.extract.mockReturnValue(extractionResult)
      mockStorage.getRecentCodes.mockResolvedValue([])

      const result = await service.pollAllMailboxes()

      expect(mockGmailProvider.refreshTokens).toHaveBeenCalledWith(mailbox.refreshToken)
      expect(mockStorage.updateMailbox).toHaveBeenCalledWith(
        mailbox.id,
        expect.objectContaining({
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
          tokenExpiresAt: expect.any(Number),
        })
      )
      expect(result.newCodesCount).toBe(1)
    })

    it('should handle token refresh failure', async () => {
      const mailbox = createMockMailbox({
        tokenExpiresAt: Date.now() - 1000,
      })

      mockStorage.getMailboxes.mockResolvedValue([mailbox])
      mockGmailProvider.refreshTokens.mockRejectedValue(new Error('Invalid refresh token'))

      const result = await service.pollAllMailboxes()

      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].error).toContain('Token refresh failed')
    })
  })

  describe('Code Extraction and Storage', () => {
    it('should extract multiple codes from single email', async () => {
      const mailbox = createMockMailbox()
      const email = createMockEmail()
      const extractionResult: ExtractionResult = {
        otpCandidates: [
          {
            code: '123456',
            confidence: 95,
            location: 'body',
            pattern: 'six-digit-code',
          },
          {
            code: '789012',
            confidence: 85,
            location: 'subject',
            pattern: 'six-digit-code',
          },
        ],
        magicLinks: [],
        metadata: {
          from: 'noreply@example.com',
          subject: 'Your verification code',
          timestamp: Date.now(),
          hasHtml: false,
        },
      }

      mockStorage.getMailboxes.mockResolvedValue([mailbox])
      mockGmailProvider.fetchEmails.mockResolvedValue([email])
      mockExtractor.extract.mockReturnValue(extractionResult)
      mockStorage.getRecentCodes.mockResolvedValue([])

      const result = await service.pollAllMailboxes()

      expect(result.newCodesCount).toBe(2)
      expect(mockStorage.addCode).toHaveBeenCalledTimes(2)
      expect(mockStorage.addCode).toHaveBeenCalledWith(
        expect.objectContaining({
          code: '123456',
          used: false,
          siteMatch: undefined,
        })
      )
      expect(mockStorage.addCode).toHaveBeenCalledWith(
        expect.objectContaining({
          code: '789012',
          used: false,
          siteMatch: undefined,
        })
      )
    })

    it('should store magic links with prefix and domain', async () => {
      const mailbox = createMockMailbox()
      const email = createMockEmail()
      const extractionResult: ExtractionResult = {
        otpCandidates: [],
        magicLinks: [
          {
            url: 'https://example.com/verify?token=abc123',
            confidence: 90,
            type: 'verify',
            domain: 'example.com',
          },
        ],
        metadata: {
          from: 'noreply@example.com',
          subject: 'Verify your email',
          timestamp: Date.now(),
          hasHtml: true,
        },
      }

      mockStorage.getMailboxes.mockResolvedValue([mailbox])
      mockGmailProvider.fetchEmails.mockResolvedValue([email])
      mockExtractor.extract.mockReturnValue(extractionResult)
      mockStorage.getRecentCodes.mockResolvedValue([])

      const result = await service.pollAllMailboxes()

      expect(result.newCodesCount).toBe(1)
      expect(mockStorage.addCode).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'magic-link:https://example.com/verify?token=abc123',
          siteMatch: 'example.com',
        })
      )
    })

    it('should deduplicate codes already in storage', async () => {
      const mailbox = createMockMailbox()
      const email = createMockEmail()
      const extractionResult = createMockExtractionResult({
        otpCandidates: [
          {
            code: '123456',
            confidence: 95,
            location: 'body',
            pattern: 'six-digit-code',
          },
        ],
      })

      mockStorage.getMailboxes.mockResolvedValue([mailbox])
      mockGmailProvider.fetchEmails.mockResolvedValue([email])
      mockExtractor.extract.mockReturnValue(extractionResult)
      mockStorage.getRecentCodes.mockResolvedValue([
        {
          code: '123456',
          timestamp: Date.now(),
          source: 'test@example.com - Previous email',
          used: false,
        },
      ])

      const result = await service.pollAllMailboxes()

      expect(result.newCodesCount).toBe(0) // Duplicate not stored
      expect(mockStorage.addCode).not.toHaveBeenCalled()
    })

    it('should handle empty inbox gracefully', async () => {
      const mailbox = createMockMailbox()

      mockStorage.getMailboxes.mockResolvedValue([mailbox])
      mockGmailProvider.fetchEmails.mockResolvedValue([])

      const result = await service.pollAllMailboxes()

      expect(result.newCodesCount).toBe(0)
      expect(result.mailboxesPolled).toBe(1)
      expect(mockStorage.updateMailbox).toHaveBeenCalledWith(mailbox.id, {
        lastSyncedAt: expect.any(Number),
      })
    })

    it('should handle extraction with no codes found', async () => {
      const mailbox = createMockMailbox()
      const email = createMockEmail()
      const extractionResult: ExtractionResult = {
        otpCandidates: [],
        magicLinks: [],
        metadata: {
          from: 'noreply@example.com',
          subject: 'Newsletter',
          timestamp: Date.now(),
          hasHtml: true,
        },
      }

      mockStorage.getMailboxes.mockResolvedValue([mailbox])
      mockGmailProvider.fetchEmails.mockResolvedValue([email])
      mockExtractor.extract.mockReturnValue(extractionResult)

      const result = await service.pollAllMailboxes()

      expect(result.newCodesCount).toBe(0)
      expect(mockStorage.addCode).not.toHaveBeenCalled()
    })
  })

  describe('Error Handling', () => {
    it('should handle network errors during email fetch', async () => {
      const mailbox = createMockMailbox()

      mockStorage.getMailboxes.mockResolvedValue([mailbox])
      mockGmailProvider.fetchEmails.mockRejectedValue(new Error('Network timeout'))

      const result = await service.pollAllMailboxes()

      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].error).toContain('email fetch failed')
    })

    it('should continue polling other mailboxes if one fails', async () => {
      const mailbox1 = createMockMailbox({ id: 'mailbox-1' })
      const mailbox2 = createMockMailbox({ id: 'mailbox-2' })
      const email = createMockEmail()
      const extractionResult = createMockExtractionResult()

      mockStorage.getMailboxes.mockResolvedValue([mailbox1, mailbox2])
      mockGmailProvider.fetchEmails
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce([email])
      mockExtractor.extract.mockReturnValue(extractionResult)
      mockStorage.getRecentCodes.mockResolvedValue([])

      const result = await service.pollAllMailboxes()

      expect(result.mailboxesPolled).toBe(1)
      expect(result.newCodesCount).toBe(1)
      expect(result.errors).toHaveLength(1)
    })

    it('should handle duplicate check failure gracefully', async () => {
      const mailbox = createMockMailbox()
      const email = createMockEmail()
      const extractionResult = createMockExtractionResult()

      mockStorage.getMailboxes.mockResolvedValue([mailbox])
      mockGmailProvider.fetchEmails.mockResolvedValue([email])
      mockExtractor.extract.mockReturnValue(extractionResult)
      mockStorage.getRecentCodes.mockRejectedValue(new Error('Storage error'))

      const result = await service.pollAllMailboxes()

      // Should still try to add code despite duplicate check failure
      expect(result.newCodesCount).toBe(1)
      expect(mockStorage.addCode).toHaveBeenCalled()
    })
  })

  describe('Source Formatting', () => {
    it('should format source with sender and subject', async () => {
      const mailbox = createMockMailbox()
      const email = createMockEmail({
        from: { email: 'auth@github.com', name: 'GitHub' },
        subject: 'Your GitHub verification code',
      })
      const extractionResult = createMockExtractionResult({
        metadata: {
          from: 'auth@github.com',
          subject: 'Your GitHub verification code',
          timestamp: Date.now(),
          hasHtml: false,
        },
      })

      mockStorage.getMailboxes.mockResolvedValue([mailbox])
      mockGmailProvider.fetchEmails.mockResolvedValue([email])
      mockExtractor.extract.mockReturnValue(extractionResult)
      mockStorage.getRecentCodes.mockResolvedValue([])

      await service.pollAllMailboxes()

      expect(mockStorage.addCode).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'auth@github.com - Your GitHub verification code',
        })
      )
    })
  })

  describe('Time Window', () => {
    it('should fetch emails from last 5 minutes', async () => {
      const mailbox = createMockMailbox()
      const now = Date.now()

      mockStorage.getMailboxes.mockResolvedValue([mailbox])
      mockGmailProvider.fetchEmails.mockResolvedValue([])

      await service.pollAllMailboxes()

      expect(mockGmailProvider.fetchEmails).toHaveBeenCalledWith(
        mailbox.accessToken,
        expect.objectContaining({
          newerThan: expect.any(Date),
          maxResults: 10,
        })
      )

      const callArgs = mockGmailProvider.fetchEmails.mock.calls[0][1]
      const newerThanTime = callArgs.newerThan.getTime()
      const expectedTime = now - 5 * 60 * 1000

      // Allow 100ms tolerance for test execution time
      expect(Math.abs(newerThanTime - expectedTime)).toBeLessThan(100)
    })
  })

  describe('Multi-Provider Support', () => {
    it('should create Gmail provider for gmail mailbox', async () => {
      const mailbox = createMockMailbox({ providerId: 'gmail' })
      const email = createMockEmail()
      const extractionResult = createMockExtractionResult()

      mockStorage.getMailboxes.mockResolvedValue([mailbox])
      mockGmailProvider.fetchEmails.mockResolvedValue([email])
      mockExtractor.extract.mockReturnValue(extractionResult)
      mockStorage.getRecentCodes.mockResolvedValue([])

      await service.pollAllMailboxes()

      expect(mockGmailProvider.fetchEmails).toHaveBeenCalled()
      expect(mockOutlookProvider.fetchEmails).not.toHaveBeenCalled()
    })

    it('should create Outlook provider for outlook mailbox', async () => {
      const mailbox = createMockMailbox({ providerId: 'outlook' })
      const email = createMockEmail()
      const extractionResult = createMockExtractionResult()

      mockStorage.getMailboxes.mockResolvedValue([mailbox])
      mockOutlookProvider.fetchEmails.mockResolvedValue([email])
      mockExtractor.extract.mockReturnValue(extractionResult)
      mockStorage.getRecentCodes.mockResolvedValue([])

      await service.pollAllMailboxes()

      expect(mockOutlookProvider.fetchEmails).toHaveBeenCalled()
      expect(mockGmailProvider.fetchEmails).not.toHaveBeenCalled()
    })

    it('should poll mixed mailboxes (Gmail + Outlook)', async () => {
      const gmailMailbox = createMockMailbox({ id: 'gmail-1', providerId: 'gmail' })
      const outlookMailbox = createMockMailbox({ id: 'outlook-1', providerId: 'outlook' })
      const email = createMockEmail()
      const extractionResult = createMockExtractionResult()

      mockStorage.getMailboxes.mockResolvedValue([gmailMailbox, outlookMailbox])
      mockGmailProvider.fetchEmails.mockResolvedValue([email])
      mockOutlookProvider.fetchEmails.mockResolvedValue([email])
      mockExtractor.extract.mockReturnValue(extractionResult)
      mockStorage.getRecentCodes.mockResolvedValue([])

      const result = await service.pollAllMailboxes()

      expect(result.mailboxesPolled).toBe(2)
      expect(result.newCodesCount).toBe(2)
      expect(mockGmailProvider.fetchEmails).toHaveBeenCalled()
      expect(mockOutlookProvider.fetchEmails).toHaveBeenCalled()
    })

    it('should handle Gmail token refresh', async () => {
      const mailbox = createMockMailbox({
        providerId: 'gmail',
        tokenExpiresAt: Date.now() - 1000,
      })
      const newTokens: OAuthTokens = {
        accessToken: 'new-gmail-token',
        refreshToken: 'new-gmail-refresh',
        expiresIn: 3600,
        tokenType: 'Bearer',
      }

      mockStorage.getMailboxes.mockResolvedValue([mailbox])
      mockGmailProvider.refreshTokens.mockResolvedValue(newTokens)
      mockGmailProvider.fetchEmails.mockResolvedValue([])

      await service.pollAllMailboxes()

      expect(mockGmailProvider.refreshTokens).toHaveBeenCalledWith(mailbox.refreshToken)
      expect(mockStorage.updateMailbox).toHaveBeenCalledWith(
        mailbox.id,
        expect.objectContaining({
          accessToken: 'new-gmail-token',
          refreshToken: 'new-gmail-refresh',
        })
      )
    })

    it('should handle Outlook token refresh', async () => {
      const mailbox = createMockMailbox({
        providerId: 'outlook',
        tokenExpiresAt: Date.now() - 1000,
      })
      const newTokens: OAuthTokens = {
        accessToken: 'new-outlook-token',
        refreshToken: 'new-outlook-refresh',
        expiresIn: 3600,
        tokenType: 'Bearer',
      }

      mockStorage.getMailboxes.mockResolvedValue([mailbox])
      mockOutlookProvider.refreshTokens.mockResolvedValue(newTokens)
      mockOutlookProvider.fetchEmails.mockResolvedValue([])

      await service.pollAllMailboxes()

      expect(mockOutlookProvider.refreshTokens).toHaveBeenCalledWith(mailbox.refreshToken)
      expect(mockStorage.updateMailbox).toHaveBeenCalledWith(
        mailbox.id,
        expect.objectContaining({
          accessToken: 'new-outlook-token',
          refreshToken: 'new-outlook-refresh',
        })
      )
    })

    it('should handle mixed provider errors independently', async () => {
      const gmailMailbox = createMockMailbox({ id: 'gmail-1', providerId: 'gmail' })
      const outlookMailbox = createMockMailbox({ id: 'outlook-1', providerId: 'outlook' })
      const email = createMockEmail()
      const extractionResult = createMockExtractionResult()

      mockStorage.getMailboxes.mockResolvedValue([gmailMailbox, outlookMailbox])
      mockGmailProvider.fetchEmails.mockRejectedValue(new Error('Gmail error'))
      mockOutlookProvider.fetchEmails.mockResolvedValue([email])
      mockExtractor.extract.mockReturnValue(extractionResult)
      mockStorage.getRecentCodes.mockResolvedValue([])

      const result = await service.pollAllMailboxes()

      expect(result.mailboxesPolled).toBe(1) // Only Outlook succeeded
      expect(result.newCodesCount).toBe(1)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].mailboxId).toBe('gmail-1')
      expect(result.errors[0].error).toContain('gmail email fetch failed')
    })

    it('should include provider ID in error messages', async () => {
      const outlookMailbox = createMockMailbox({ providerId: 'outlook' })

      mockStorage.getMailboxes.mockResolvedValue([outlookMailbox])
      mockOutlookProvider.fetchEmails.mockRejectedValue(new Error('Network timeout'))

      const result = await service.pollAllMailboxes()

      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].error).toContain('outlook email fetch failed')
    })
  })
})
