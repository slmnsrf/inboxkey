/**
 * Provider Parser Tests - senderETLD Extraction
 *
 * Comprehensive tests for Gmail and Outlook parsers to verify:
 * 1. senderETLD extraction from various email formats
 * 2. receivedAt field population from timestamp
 * 3. Handling of edge cases (invalid emails, special characters)
 *
 * Test cases cover:
 * - Name + email format (e.g., "GitHub <noreply@github.com>")
 * - Email only format (e.g., "support@dropbox.com")
 * - Subdomain handling (e.g., "no-reply@email.github.com" → "github.com")
 * - Invalid/missing sender handling
 * - Special characters in sender name
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { GmailParser } from '../../src/lib/providers/gmail/gmail-parser'
import { OutlookParser } from '../../src/lib/providers/outlook/outlook-parser'
import type { GmailMessage } from '../../src/lib/providers/gmail/gmail-api'
import type { GraphMessage } from '../../src/lib/providers/outlook/outlook-api'

describe('Provider Parser - senderETLD Extraction', () => {
  describe('Gmail Parser', () => {
    let parser: GmailParser

    beforeEach(() => {
      parser = new GmailParser()
    })

    it('extracts senderETLD from name+email format: "GitHub <noreply@github.com>" → "github.com"', () => {
      const gmailMsg: GmailMessage = {
        id: 'msg-github-001',
        threadId: 'thread-001',
        labelIds: ['UNREAD', 'INBOX'],
        snippet: 'Your verification code is 123456',
        internalDate: '1640995200000', // 2022-01-01 00:00:00 UTC
        payload: {
          headers: [
            { name: 'From', value: 'GitHub <noreply@github.com>' },
            { name: 'Subject', value: 'Your GitHub verification code' },
            { name: 'Date', value: 'Sat, 01 Jan 2022 00:00:00 +0000' },
          ],
          body: {
            data: 'WW91ciB2ZXJpZmljYXRpb24gY29kZSBpcyAxMjM0NTY',
            size: 33,
          },
        },
      }

      const result = parser.parseMessage(gmailMsg)

      expect(result.from.name).toBe('GitHub')
      expect(result.from.email).toBe('noreply@github.com')
      expect(result.senderETLD).toBe('github.com')
      expect(result.date).toEqual(new Date(1640995200000))
      expect(result.date).toBeInstanceOf(Date)
    })

    it('extracts senderETLD from email only format: "support@dropbox.com" → "dropbox.com"', () => {
      const gmailMsg: GmailMessage = {
        id: 'msg-dropbox-001',
        threadId: 'thread-002',
        labelIds: ['UNREAD', 'INBOX'],
        snippet: 'Your Dropbox security code',
        internalDate: '1641081600000', // 2022-01-02 00:00:00 UTC
        payload: {
          headers: [
            { name: 'From', value: 'support@dropbox.com' },
            { name: 'Subject', value: 'Dropbox Security Code' },
          ],
          body: { size: 0 },
        },
      }

      const result = parser.parseMessage(gmailMsg)

      expect(result.from.name).toBeUndefined()
      expect(result.from.email).toBe('support@dropbox.com')
      expect(result.senderETLD).toBe('dropbox.com')
      expect(result.date).toEqual(new Date(1641081600000))
    })

    it('extracts eTLD+1 from subdomain: "no-reply@email.github.com" → "github.com"', () => {
      const gmailMsg: GmailMessage = {
        id: 'msg-github-002',
        threadId: 'thread-003',
        labelIds: ['UNREAD'],
        snippet: 'Verify your device',
        internalDate: '1641168000000', // 2022-01-03 00:00:00 UTC
        payload: {
          headers: [
            { name: 'From', value: 'no-reply@email.github.com' },
            { name: 'Subject', value: 'Device verification' },
          ],
          body: { size: 0 },
        },
      }

      const result = parser.parseMessage(gmailMsg)

      expect(result.from.email).toBe('no-reply@email.github.com')
      expect(result.senderETLD).toBe('github.com')
      expect(result.date).toBeInstanceOf(Date)
    })

    it('handles invalid/missing sender gracefully: senderETLD = ""', () => {
      const gmailMsg: GmailMessage = {
        id: 'msg-invalid-001',
        threadId: 'thread-004',
        labelIds: [],
        snippet: '',
        internalDate: '1641254400000', // 2022-01-04 00:00:00 UTC
        payload: {
          headers: [
            { name: 'From', value: 'invalid-email-without-at-sign' },
            { name: 'Subject', value: 'Test' },
          ],
          body: { size: 0 },
        },
      }

      const result = parser.parseMessage(gmailMsg)

      expect(result.from.email).toBe('invalid-email-without-at-sign')
      expect(result.senderETLD).toBe('')
      expect(result.date).toBeInstanceOf(Date)
    })

    it('extracts senderETLD with special characters in name: "Support Team <no_reply@battlestategames.com>" → "battlestategames.com"', () => {
      const gmailMsg: GmailMessage = {
        id: 'msg-bsg-001',
        threadId: 'thread-005',
        labelIds: ['UNREAD'],
        snippet: 'Your game verification code',
        internalDate: '1641340800000', // 2022-01-05 00:00:00 UTC
        payload: {
          headers: [
            {
              name: 'From',
              value: 'Support Team <no_reply@battlestategames.com>',
            },
            { name: 'Subject', value: 'Account Verification' },
          ],
          body: { size: 0 },
        },
      }

      const result = parser.parseMessage(gmailMsg)

      expect(result.from.name).toBe('Support Team')
      expect(result.from.email).toBe('no_reply@battlestategames.com')
      expect(result.senderETLD).toBe('battlestategames.com')
      expect(result.date).toEqual(new Date(1641340800000))
    })

    it('handles empty sender: senderETLD = ""', () => {
      const gmailMsg: GmailMessage = {
        id: 'msg-empty-001',
        threadId: 'thread-006',
        labelIds: [],
        snippet: '',
        internalDate: '1641427200000', // 2022-01-06 00:00:00 UTC
        payload: {
          headers: [{ name: 'Subject', value: 'Test' }],
          body: { size: 0 },
        },
      }

      const result = parser.parseMessage(gmailMsg)

      expect(result.from.email).toBe('')
      expect(result.senderETLD).toBe('')
      expect(result.date).toBeInstanceOf(Date)
    })

    it('verifies receivedAt field is populated from internalDate timestamp', () => {
      const timestamp = 1640995200000 // 2022-01-01 00:00:00 UTC
      const gmailMsg: GmailMessage = {
        id: 'msg-timestamp-001',
        threadId: 'thread-007',
        labelIds: [],
        snippet: '',
        internalDate: String(timestamp),
        payload: {
          headers: [
            { name: 'From', value: 'test@example.com' },
            { name: 'Subject', value: 'Test' },
          ],
          body: { size: 0 },
        },
      }

      const result = parser.parseMessage(gmailMsg)

      expect(result.date).toEqual(new Date(timestamp))
      expect(result.date.getTime()).toBe(timestamp)
      expect(result.date.toISOString()).toBe('2022-01-01T00:00:00.000Z')
    })
  })

  describe('Outlook Parser', () => {
    let parser: OutlookParser

    beforeEach(() => {
      parser = new OutlookParser()
    })

    it('extracts senderETLD from name+email format: "GitHub" <noreply@github.com> → "github.com"', () => {
      const graphMsg: GraphMessage = {
        id: 'AAMkAGI2TG93AAA=',
        subject: 'Your GitHub verification code',
        from: {
          emailAddress: {
            name: 'GitHub',
            address: 'noreply@github.com',
          },
        },
        receivedDateTime: '2022-01-01T00:00:00Z',
        body: {
          contentType: 'html',
          content: '<p>Your verification code is 123456</p>',
        },
        bodyPreview: 'Your verification code is 123456',
        isRead: false,
        hasAttachments: false,
      }

      const result = parser.parseMessage(graphMsg)

      expect(result.from.name).toBe('GitHub')
      expect(result.from.email).toBe('noreply@github.com')
      expect(result.senderETLD).toBe('github.com')
      expect(result.date).toEqual(new Date('2022-01-01T00:00:00Z'))
      expect(result.date).toBeInstanceOf(Date)
    })

    it('extracts senderETLD from email only format: "support@dropbox.com" → "dropbox.com"', () => {
      const graphMsg: GraphMessage = {
        id: 'AAMkAGI2TG93BBB=',
        subject: 'Dropbox Security Code',
        from: {
          emailAddress: {
            name: '',
            address: 'support@dropbox.com',
          },
        },
        receivedDateTime: '2022-01-02T00:00:00Z',
        body: {
          contentType: 'text',
          content: 'Your Dropbox security code',
        },
        bodyPreview: 'Your Dropbox security code',
        isRead: false,
        hasAttachments: false,
      }

      const result = parser.parseMessage(graphMsg)

      expect(result.from.name).toBeUndefined()
      expect(result.from.email).toBe('support@dropbox.com')
      expect(result.senderETLD).toBe('dropbox.com')
      expect(result.date).toEqual(new Date('2022-01-02T00:00:00Z'))
    })

    it('extracts eTLD+1 from subdomain: "no-reply@email.github.com" → "github.com"', () => {
      const graphMsg: GraphMessage = {
        id: 'AAMkAGI2TG93CCC=',
        subject: 'Device verification',
        from: {
          emailAddress: {
            name: 'GitHub Notifications',
            address: 'no-reply@email.github.com',
          },
        },
        receivedDateTime: '2022-01-03T00:00:00Z',
        body: {
          contentType: 'html',
          content: '<p>Verify your device</p>',
        },
        bodyPreview: 'Verify your device',
        isRead: false,
        hasAttachments: false,
      }

      const result = parser.parseMessage(graphMsg)

      expect(result.from.email).toBe('no-reply@email.github.com')
      expect(result.senderETLD).toBe('github.com')
      expect(result.date).toBeInstanceOf(Date)
    })

    it('handles invalid/missing sender gracefully: senderETLD = ""', () => {
      const graphMsg: GraphMessage = {
        id: 'AAMkAGI2TG93DDD=',
        subject: 'Test',
        from: {
          emailAddress: {
            name: '',
            address: 'invalid-email-without-at-sign',
          },
        },
        receivedDateTime: '2022-01-04T00:00:00Z',
        body: {
          contentType: 'text',
          content: 'Test content',
        },
        bodyPreview: 'Test content',
        isRead: false,
        hasAttachments: false,
      }

      const result = parser.parseMessage(graphMsg)

      expect(result.from.email).toBe('invalid-email-without-at-sign')
      expect(result.senderETLD).toBe('')
      expect(result.date).toBeInstanceOf(Date)
    })

    it('extracts senderETLD with special characters in name: "Support Team" <no_reply@battlestategames.com> → "battlestategames.com"', () => {
      const graphMsg: GraphMessage = {
        id: 'AAMkAGI2TG93EEE=',
        subject: 'Account Verification',
        from: {
          emailAddress: {
            name: 'Support Team',
            address: 'no_reply@battlestategames.com',
          },
        },
        receivedDateTime: '2022-01-05T00:00:00Z',
        body: {
          contentType: 'html',
          content: '<p>Your game verification code</p>',
        },
        bodyPreview: 'Your game verification code',
        isRead: false,
        hasAttachments: false,
      }

      const result = parser.parseMessage(graphMsg)

      expect(result.from.name).toBe('Support Team')
      expect(result.from.email).toBe('no_reply@battlestategames.com')
      expect(result.senderETLD).toBe('battlestategames.com')
      expect(result.date).toEqual(new Date('2022-01-05T00:00:00Z'))
    })

    it('handles empty sender email: senderETLD = ""', () => {
      const graphMsg: GraphMessage = {
        id: 'AAMkAGI2TG93FFF=',
        subject: 'Test',
        from: {
          emailAddress: {
            name: 'Unknown Sender',
            address: '',
          },
        },
        receivedDateTime: '2022-01-06T00:00:00Z',
        body: {
          contentType: 'text',
          content: 'Test',
        },
        bodyPreview: 'Test',
        isRead: false,
        hasAttachments: false,
      }

      const result = parser.parseMessage(graphMsg)

      expect(result.from.email).toBe('')
      expect(result.senderETLD).toBe('')
      expect(result.date).toBeInstanceOf(Date)
    })

    it('verifies receivedAt field is populated from receivedDateTime ISO 8601 string', () => {
      const isoTimestamp = '2022-01-01T12:30:45.123Z'
      const graphMsg: GraphMessage = {
        id: 'AAMkAGI2TG93GGG=',
        subject: 'Test',
        from: {
          emailAddress: {
            name: 'Test',
            address: 'test@example.com',
          },
        },
        receivedDateTime: isoTimestamp,
        body: {
          contentType: 'text',
          content: 'Test',
        },
        bodyPreview: 'Test',
        isRead: false,
        hasAttachments: false,
      }

      const result = parser.parseMessage(graphMsg)

      expect(result.date).toEqual(new Date(isoTimestamp))
      expect(result.date.toISOString()).toBe(isoTimestamp)
      expect(result.date.getTime()).toBe(new Date(isoTimestamp).getTime())
    })
  })

  describe('Cross-Provider Consistency', () => {
    let gmailParser: GmailParser
    let outlookParser: OutlookParser

    beforeEach(() => {
      gmailParser = new GmailParser()
      outlookParser = new OutlookParser()
    })

    it('both parsers extract same eTLD for equivalent sender addresses', () => {
      // Gmail message
      const gmailMsg: GmailMessage = {
        id: 'gmail-001',
        threadId: 'thread-001',
        labelIds: [],
        snippet: '',
        internalDate: '1640995200000',
        payload: {
          headers: [
            { name: 'From', value: 'GitHub <noreply@github.com>' },
            { name: 'Subject', value: 'Test' },
          ],
          body: { size: 0 },
        },
      }

      // Outlook message (equivalent sender)
      const outlookMsg: GraphMessage = {
        id: 'outlook-001',
        subject: 'Test',
        from: {
          emailAddress: {
            name: 'GitHub',
            address: 'noreply@github.com',
          },
        },
        receivedDateTime: '2022-01-01T00:00:00Z',
        body: {
          contentType: 'text',
          content: 'Test',
        },
        bodyPreview: 'Test',
        isRead: false,
        hasAttachments: false,
      }

      const gmailResult = gmailParser.parseMessage(gmailMsg)
      const outlookResult = outlookParser.parseMessage(outlookMsg)

      // Both should extract the same eTLD
      expect(gmailResult.senderETLD).toBe('github.com')
      expect(outlookResult.senderETLD).toBe('github.com')
      expect(gmailResult.senderETLD).toBe(outlookResult.senderETLD)

      // Both should extract the same email
      expect(gmailResult.from.email).toBe('noreply@github.com')
      expect(outlookResult.from.email).toBe('noreply@github.com')
      expect(gmailResult.from.email).toBe(outlookResult.from.email)
    })

    it('both parsers handle subdomain extraction consistently', () => {
      const gmailMsg: GmailMessage = {
        id: 'gmail-002',
        threadId: 'thread-002',
        labelIds: [],
        snippet: '',
        internalDate: '1640995200000',
        payload: {
          headers: [
            { name: 'From', value: 'no-reply@mail.service.example.com' },
            { name: 'Subject', value: 'Test' },
          ],
          body: { size: 0 },
        },
      }

      const outlookMsg: GraphMessage = {
        id: 'outlook-002',
        subject: 'Test',
        from: {
          emailAddress: {
            name: '',
            address: 'no-reply@mail.service.example.com',
          },
        },
        receivedDateTime: '2022-01-01T00:00:00Z',
        body: {
          contentType: 'text',
          content: 'Test',
        },
        bodyPreview: 'Test',
        isRead: false,
        hasAttachments: false,
      }

      const gmailResult = gmailParser.parseMessage(gmailMsg)
      const outlookResult = outlookParser.parseMessage(outlookMsg)

      // Both should extract eTLD+1 (example.com)
      expect(gmailResult.senderETLD).toBe('example.com')
      expect(outlookResult.senderETLD).toBe('example.com')
      expect(gmailResult.senderETLD).toBe(outlookResult.senderETLD)
    })

    it('both parsers handle invalid emails consistently', () => {
      const gmailMsg: GmailMessage = {
        id: 'gmail-003',
        threadId: 'thread-003',
        labelIds: [],
        snippet: '',
        internalDate: '1640995200000',
        payload: {
          headers: [
            { name: 'From', value: 'not-an-email' },
            { name: 'Subject', value: 'Test' },
          ],
          body: { size: 0 },
        },
      }

      const outlookMsg: GraphMessage = {
        id: 'outlook-003',
        subject: 'Test',
        from: {
          emailAddress: {
            name: '',
            address: 'not-an-email',
          },
        },
        receivedDateTime: '2022-01-01T00:00:00Z',
        body: {
          contentType: 'text',
          content: 'Test',
        },
        bodyPreview: 'Test',
        isRead: false,
        hasAttachments: false,
      }

      const gmailResult = gmailParser.parseMessage(gmailMsg)
      const outlookResult = outlookParser.parseMessage(outlookMsg)

      // Both should return empty string for invalid emails
      expect(gmailResult.senderETLD).toBe('')
      expect(outlookResult.senderETLD).toBe('')
      expect(gmailResult.senderETLD).toBe(outlookResult.senderETLD)
    })
  })
})
