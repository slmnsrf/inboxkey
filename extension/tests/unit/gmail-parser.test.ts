/**
 * Unit Tests for Gmail Parser
 *
 * Tests Gmail API message parsing into EmailMessage format with
 * focus on senderETLD extraction and various sender formats.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { GmailParser } from '../../src/lib/providers/gmail/gmail-parser'
import type { GmailMessage } from '../../src/lib/providers/gmail/gmail-api'

describe('GmailParser', () => {
  let parser: GmailParser

  beforeEach(() => {
    parser = new GmailParser()
  })

  describe('parseMessage() - Basic message parsing', () => {
    it('should parse complete Gmail message to EmailMessage format', () => {
      const gmailMsg: GmailMessage = {
        id: 'msg-123',
        threadId: 'thread-456',
        labelIds: ['INBOX'],
        snippet: 'Your verification code is 123456',
        internalDate: '1234567890000',
        payload: {
          partId: '',
          mimeType: 'text/plain',
          filename: '',
          headers: [
            { name: 'From', value: 'GitHub <noreply@github.com>' },
            { name: 'Subject', value: 'Verification Code' }
          ],
          body: {
            size: 30,
            data: 'VGVzdCBtZXNzYWdlIGJvZHk' // "Test message body" in base64url
          }
        },
        sizeEstimate: 1000
      }

      const result = parser.parseMessage(gmailMsg)

      expect(result.id).toBe('msg-123')
      expect(result.from.email).toBe('noreply@github.com')
      expect(result.from.name).toBe('GitHub')
      expect(result.senderETLD).toBe('github.com')
      expect(result.subject).toBe('Verification Code')
      expect(result.snippet).toBe('Your verification code is 123456')
      expect(result.date).toBeInstanceOf(Date)
      expect(result.date.getTime()).toBe(1234567890000)
    })

    it('should handle missing subject', () => {
      const gmailMsg: GmailMessage = {
        id: 'msg-no-subject',
        threadId: 'thread-1',
        labelIds: [],
        snippet: '',
        internalDate: '1234567890000',
        payload: {
          partId: '',
          mimeType: 'text/plain',
          filename: '',
          headers: [{ name: 'From', value: 'test@example.com' }],
          body: { size: 0, data: '' }
        },
        sizeEstimate: 100
      }

      const result = parser.parseMessage(gmailMsg)

      expect(result.subject).toBe('(No subject)')
    })
  })

  describe('extractSenderETLD() - eTLD+1 extraction', () => {
    it('should extract eTLD+1 from email with name and angle brackets', () => {
      const gmailMsg: GmailMessage = {
        id: 'msg-1',
        threadId: 'thread-1',
        labelIds: [],
        snippet: '',
        internalDate: '1234567890000',
        payload: {
          partId: '',
          mimeType: 'text/plain',
          filename: '',
          headers: [
            { name: 'From', value: 'GitHub Security <noreply@github.com>' }
          ],
          body: { size: 0, data: '' }
        },
        sizeEstimate: 100
      }

      const result = parser.parseMessage(gmailMsg)

      expect(result.senderETLD).toBe('github.com')
      expect(result.from.email).toBe('noreply@github.com')
      expect(result.from.name).toBe('GitHub Security')
    })

    it('should extract eTLD+1 from email-only format (no name)', () => {
      const gmailMsg: GmailMessage = {
        id: 'msg-2',
        threadId: 'thread-2',
        labelIds: [],
        snippet: '',
        internalDate: '1234567890000',
        payload: {
          partId: '',
          mimeType: 'text/plain',
          filename: '',
          headers: [{ name: 'From', value: 'support@example.com' }],
          body: { size: 0, data: '' }
        },
        sizeEstimate: 100
      }

      const result = parser.parseMessage(gmailMsg)

      expect(result.senderETLD).toBe('example.com')
      expect(result.from.email).toBe('support@example.com')
      expect(result.from.name).toBeUndefined()
    })

    it('should extract eTLD+1 from subdomain email addresses', () => {
      const gmailMsg: GmailMessage = {
        id: 'msg-3',
        threadId: 'thread-3',
        labelIds: [],
        snippet: '',
        internalDate: '1234567890000',
        payload: {
          partId: '',
          mimeType: 'text/plain',
          filename: '',
          headers: [
            { name: 'From', value: 'user@mail.google.com' }
          ],
          body: { size: 0, data: '' }
        },
        sizeEstimate: 100
      }

      const result = parser.parseMessage(gmailMsg)

      // mail.google.com → google.com (eTLD+1)
      expect(result.senderETLD).toBe('google.com')
      expect(result.from.email).toBe('user@mail.google.com')
    })

    it('should handle deep subdomain email addresses', () => {
      const gmailMsg: GmailMessage = {
        id: 'msg-4',
        threadId: 'thread-4',
        labelIds: [],
        snippet: '',
        internalDate: '1234567890000',
        payload: {
          partId: '',
          mimeType: 'text/plain',
          filename: '',
          headers: [
            { name: 'From', value: 'noreply@notifications.mail.dropbox.com' }
          ],
          body: { size: 0, data: '' }
        },
        sizeEstimate: 100
      }

      const result = parser.parseMessage(gmailMsg)

      // notifications.mail.dropbox.com → dropbox.com (eTLD+1)
      expect(result.senderETLD).toBe('dropbox.com')
    })

    it('should return empty string for invalid email format', () => {
      const gmailMsg: GmailMessage = {
        id: 'msg-invalid',
        threadId: 'thread-invalid',
        labelIds: [],
        snippet: '',
        internalDate: '1234567890000',
        payload: {
          partId: '',
          mimeType: 'text/plain',
          filename: '',
          headers: [{ name: 'From', value: 'not-an-email' }],
          body: { size: 0, data: '' }
        },
        sizeEstimate: 100
      }

      const result = parser.parseMessage(gmailMsg)

      expect(result.senderETLD).toBe('')
    })
  })

  describe('Sender format variations', () => {
    it('should handle quoted name with angle brackets', () => {
      const gmailMsg: GmailMessage = {
        id: 'msg-quoted',
        threadId: 'thread-quoted',
        labelIds: [],
        snippet: '',
        internalDate: '1234567890000',
        payload: {
          partId: '',
          mimeType: 'text/plain',
          filename: '',
          headers: [
            { name: 'From', value: '"John Doe" <john@example.com>' }
          ],
          body: { size: 0, data: '' }
        },
        sizeEstimate: 100
      }

      const result = parser.parseMessage(gmailMsg)

      expect(result.from.email).toBe('john@example.com')
      expect(result.from.name).toBe('John Doe') // Quotes removed
      expect(result.senderETLD).toBe('example.com')
    })

    it('should handle name with special characters', () => {
      const gmailMsg: GmailMessage = {
        id: 'msg-special',
        threadId: 'thread-special',
        labelIds: [],
        snippet: '',
        internalDate: '1234567890000',
        payload: {
          partId: '',
          mimeType: 'text/plain',
          filename: '',
          headers: [
            { name: 'From', value: 'Müller & Co. <info@mueller-co.de>' }
          ],
          body: { size: 0, data: '' }
        },
        sizeEstimate: 100
      }

      const result = parser.parseMessage(gmailMsg)

      expect(result.from.email).toBe('info@mueller-co.de')
      expect(result.from.name).toBe('Müller & Co.')
      expect(result.senderETLD).toBe('mueller-co.de')
    })

    it('should handle empty From header', () => {
      const gmailMsg: GmailMessage = {
        id: 'msg-empty-from',
        threadId: 'thread-empty',
        labelIds: [],
        snippet: '',
        internalDate: '1234567890000',
        payload: {
          partId: '',
          mimeType: 'text/plain',
          filename: '',
          headers: [{ name: 'From', value: '' }],
          body: { size: 0, data: '' }
        },
        sizeEstimate: 100
      }

      const result = parser.parseMessage(gmailMsg)

      expect(result.from.email).toBe('')
      expect(result.from.name).toBeUndefined()
      expect(result.senderETLD).toBe('')
    })

    it('should handle missing From header', () => {
      const gmailMsg: GmailMessage = {
        id: 'msg-no-from',
        threadId: 'thread-no-from',
        labelIds: [],
        snippet: '',
        internalDate: '1234567890000',
        payload: {
          partId: '',
          mimeType: 'text/plain',
          filename: '',
          headers: [],
          body: { size: 0, data: '' }
        },
        sizeEstimate: 100
      }

      const result = parser.parseMessage(gmailMsg)

      expect(result.from.email).toBe('')
      expect(result.from.name).toBeUndefined()
      expect(result.senderETLD).toBe('')
    })
  })

  describe('Date parsing (receivedAt)', () => {
    it('should parse internalDate as Unix timestamp', () => {
      const timestamp = 1672531200000 // 2023-01-01 00:00:00 UTC
      const gmailMsg: GmailMessage = {
        id: 'msg-date',
        threadId: 'thread-date',
        labelIds: [],
        snippet: '',
        internalDate: timestamp.toString(),
        payload: {
          partId: '',
          mimeType: 'text/plain',
          filename: '',
          headers: [{ name: 'From', value: 'test@example.com' }],
          body: { size: 0, data: '' }
        },
        sizeEstimate: 100
      }

      const result = parser.parseMessage(gmailMsg)

      expect(result.date).toBeInstanceOf(Date)
      expect(result.date.getTime()).toBe(timestamp)
    })

    it('should handle various timestamp values', () => {
      const timestamps = [
        0, // Unix epoch
        1000000000000, // Sat Sep 08 2001
        Date.now() // Current time
      ]

      for (const timestamp of timestamps) {
        const gmailMsg: GmailMessage = {
          id: `msg-${timestamp}`,
          threadId: 'thread-1',
          labelIds: [],
          snippet: '',
          internalDate: timestamp.toString(),
          payload: {
            partId: '',
            mimeType: 'text/plain',
            filename: '',
            headers: [{ name: 'From', value: 'test@example.com' }],
            body: { size: 0, data: '' }
          },
          sizeEstimate: 100
        }

        const result = parser.parseMessage(gmailMsg)

        expect(result.date.getTime()).toBe(timestamp)
      }
    })
  })

  describe('Body extraction', () => {
    it('should decode base64url text body', () => {
      // "Hello World" in base64url format
      const encoded = 'SGVsbG8gV29ybGQ'

      const gmailMsg: GmailMessage = {
        id: 'msg-body',
        threadId: 'thread-body',
        labelIds: [],
        snippet: '',
        internalDate: '1234567890000',
        payload: {
          partId: '',
          mimeType: 'text/plain',
          filename: '',
          headers: [{ name: 'From', value: 'test@example.com' }],
          body: {
            size: encoded.length,
            data: encoded
          }
        },
        sizeEstimate: 100
      }

      const result = parser.parseMessage(gmailMsg)

      expect(result.bodyText).toBe('Hello World')
    })

    it('should handle multipart messages', () => {
      const gmailMsg: GmailMessage = {
        id: 'msg-multipart',
        threadId: 'thread-multipart',
        labelIds: [],
        snippet: '',
        internalDate: '1234567890000',
        payload: {
          partId: '',
          mimeType: 'multipart/alternative',
          filename: '',
          headers: [{ name: 'From', value: 'test@example.com' }],
          body: { size: 0, data: '' },
          parts: [
            {
              partId: '0',
              mimeType: 'text/plain',
              filename: '',
              headers: [],
              body: {
                size: 9,
                data: 'UGxhaW4gdGV4dA' // "Plain text"
              }
            },
            {
              partId: '1',
              mimeType: 'text/html',
              filename: '',
              headers: [],
              body: {
                size: 17,
                data: 'PGI-SFRNTDwvYj4' // "<b>HTML</b>"
              }
            }
          ]
        },
        sizeEstimate: 200
      }

      const result = parser.parseMessage(gmailMsg)

      expect(result.bodyText).toBeDefined()
      expect(result.bodyHtml).toBeDefined()
    })
  })

  describe('Edge cases and error handling', () => {
    it('should handle malformed base64url data gracefully', () => {
      const gmailMsg: GmailMessage = {
        id: 'msg-malformed',
        threadId: 'thread-malformed',
        labelIds: [],
        snippet: '',
        internalDate: '1234567890000',
        payload: {
          partId: '',
          mimeType: 'text/plain',
          filename: '',
          headers: [{ name: 'From', value: 'test@example.com' }],
          body: {
            size: 10,
            data: '!!!invalid!!!'
          }
        },
        sizeEstimate: 100
      }

      const result = parser.parseMessage(gmailMsg)

      // Should not throw, returns empty string
      expect(result.bodyText).toBe('')
    })

    it('should handle empty payload body', () => {
      const gmailMsg: GmailMessage = {
        id: 'msg-empty-body',
        threadId: 'thread-empty-body',
        labelIds: [],
        snippet: 'Snippet text',
        internalDate: '1234567890000',
        payload: {
          partId: '',
          mimeType: 'text/plain',
          filename: '',
          headers: [{ name: 'From', value: 'test@example.com' }],
          body: { size: 0, data: '' }
        },
        sizeEstimate: 50
      }

      const result = parser.parseMessage(gmailMsg)

      expect(result.snippet).toBe('Snippet text')
      expect(result.bodyText).toBeUndefined()
    })
  })
})
