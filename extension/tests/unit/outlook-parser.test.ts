/**
 * Unit Tests for OutlookParser
 *
 * Tests parsing Microsoft Graph API messages to EmailMessage format
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { OutlookParser } from '../../src/lib/providers/outlook/outlook-parser'
import type { GraphMessage } from '../../src/lib/providers/outlook/outlook-api'

describe('OutlookParser', () => {
  let parser: OutlookParser

  beforeEach(() => {
    parser = new OutlookParser()
  })

  // Test 1: Parse complete message with HTML body
  it('should parse complete message with HTML body', () => {
    const graphMessage: GraphMessage = {
      id: 'AAMkAGI2TG93AAA=',
      subject: 'Your verification code',
      from: {
        emailAddress: {
          name: 'GitHub',
          address: 'noreply@github.com',
        },
      },
      receivedDateTime: '2024-01-15T10:30:00Z',
      body: {
        contentType: 'html',
        content: '<html><body><p>Your code is: <strong>123456</strong></p></body></html>',
      },
      bodyPreview: 'Your code is: 123456',
      isRead: false,
      hasAttachments: false,
    }

    const result = parser.parseMessage(graphMessage)

    expect(result.id).toBe('AAMkAGI2TG93AAA=')
    expect(result.subject).toBe('Your verification code')
    expect(result.from.email).toBe('noreply@github.com')
    expect(result.from.name).toBe('GitHub')
    expect(result.date).toEqual(new Date('2024-01-15T10:30:00Z'))
    expect(result.bodyHtml).toBe('<html><body><p>Your code is: <strong>123456</strong></p></body></html>')
    expect(result.bodyText).toBe('Your code is: 123456')
    expect(result.snippet).toBe('Your code is: 123456')
  })

  // Test 2: Parse complete message with text body
  it('should parse complete message with text body', () => {
    const graphMessage: GraphMessage = {
      id: 'AAMkAGI2TG93BBB=',
      subject: 'AWS Password Reset',
      from: {
        emailAddress: {
          name: 'Amazon Web Services',
          address: 'no-reply@amazon.com',
        },
      },
      receivedDateTime: '2024-01-15T14:45:30Z',
      body: {
        contentType: 'text',
        content: 'Your password reset code is: 789012\n\nThis code expires in 15 minutes.',
      },
      bodyPreview: 'Your password reset code is: 789012',
      isRead: false,
      hasAttachments: false,
    }

    const result = parser.parseMessage(graphMessage)

    expect(result.id).toBe('AAMkAGI2TG93BBB=')
    expect(result.subject).toBe('AWS Password Reset')
    expect(result.from.email).toBe('no-reply@amazon.com')
    expect(result.from.name).toBe('Amazon Web Services')
    expect(result.date).toEqual(new Date('2024-01-15T14:45:30Z'))
    expect(result.bodyText).toBe('Your password reset code is: 789012\n\nThis code expires in 15 minutes.')
    expect(result.bodyHtml).toBeUndefined()
    expect(result.snippet).toBe('Your password reset code is: 789012')
  })

  // Test 3: Parse message with missing optional fields
  it('should parse message with missing optional fields', () => {
    const graphMessage: GraphMessage = {
      id: 'AAMkAGI2TG93CCC=',
      subject: 'Test',
      from: {
        emailAddress: {
          name: '',
          address: 'test@example.com',
        },
      },
      receivedDateTime: '2024-01-15T12:00:00Z',
      body: {
        contentType: 'text',
        content: '',
      },
      bodyPreview: '',
      isRead: true,
      hasAttachments: false,
    }

    const result = parser.parseMessage(graphMessage)

    expect(result.id).toBe('AAMkAGI2TG93CCC=')
    expect(result.subject).toBe('Test')
    expect(result.from.email).toBe('test@example.com')
    expect(result.from.name).toBeUndefined()
    expect(result.bodyText).toBeUndefined()
    expect(result.bodyHtml).toBeUndefined()
    expect(result.snippet).toBeUndefined()
  })

  // Test 4: Handle missing subject
  it('should use default subject when subject is missing', () => {
    const graphMessage: GraphMessage = {
      id: 'AAMkAGI2TG93DDD=',
      subject: '',
      from: {
        emailAddress: {
          name: 'Sender',
          address: 'sender@example.com',
        },
      },
      receivedDateTime: '2024-01-15T12:00:00Z',
      body: {
        contentType: 'text',
        content: 'Message body',
      },
      bodyPreview: 'Message body',
      isRead: false,
      hasAttachments: false,
    }

    const result = parser.parseMessage(graphMessage)

    expect(result.subject).toBe('(No Subject)')
  })

  // Test 5: Handle missing sender name
  it('should handle missing sender name', () => {
    const graphMessage: GraphMessage = {
      id: 'AAMkAGI2TG93EEE=',
      subject: 'Test',
      from: {
        emailAddress: {
          name: '',
          address: 'noreply@service.com',
        },
      },
      receivedDateTime: '2024-01-15T12:00:00Z',
      body: {
        contentType: 'text',
        content: 'Body',
      },
      bodyPreview: 'Body',
      isRead: false,
      hasAttachments: false,
    }

    const result = parser.parseMessage(graphMessage)

    expect(result.from.email).toBe('noreply@service.com')
    expect(result.from.name).toBeUndefined()
  })

  // Test 6: Parse ISO 8601 date correctly
  it('should parse ISO 8601 date to Date object', () => {
    const graphMessage: GraphMessage = {
      id: 'AAMkAGI2TG93FFF=',
      subject: 'Date Test',
      from: {
        emailAddress: {
          name: 'Test',
          address: 'test@example.com',
        },
      },
      receivedDateTime: '2024-03-20T08:15:42.123Z',
      body: {
        contentType: 'text',
        content: 'Body',
      },
      bodyPreview: 'Body',
      isRead: false,
      hasAttachments: false,
    }

    const result = parser.parseMessage(graphMessage)

    expect(result.date).toBeInstanceOf(Date)
    expect(result.date.toISOString()).toBe('2024-03-20T08:15:42.123Z')
    expect(result.date.getFullYear()).toBe(2024)
    expect(result.date.getMonth()).toBe(2) // 0-indexed (March = 2)
    expect(result.date.getDate()).toBe(20)
  })

  // Test 7: Extract HTML body correctly
  it('should extract HTML body when contentType is html', () => {
    const graphMessage: GraphMessage = {
      id: 'AAMkAGI2TG93GGG=',
      subject: 'HTML Test',
      from: {
        emailAddress: {
          name: 'Sender',
          address: 'sender@example.com',
        },
      },
      receivedDateTime: '2024-01-15T12:00:00Z',
      body: {
        contentType: 'html',
        content: '<div>HTML content with <b>bold</b> text</div>',
      },
      bodyPreview: 'HTML content with bold text',
      isRead: false,
      hasAttachments: false,
    }

    const result = parser.parseMessage(graphMessage)

    expect(result.bodyHtml).toBe('<div>HTML content with <b>bold</b> text</div>')
    expect(result.bodyText).toBe('HTML content with bold text')
  })

  // Test 8: Extract text body correctly
  it('should extract text body when contentType is text', () => {
    const graphMessage: GraphMessage = {
      id: 'AAMkAGI2TG93HHH=',
      subject: 'Text Test',
      from: {
        emailAddress: {
          name: 'Sender',
          address: 'sender@example.com',
        },
      },
      receivedDateTime: '2024-01-15T12:00:00Z',
      body: {
        contentType: 'text',
        content: 'Plain text body\nMultiple lines\nNo HTML',
      },
      bodyPreview: 'Plain text body',
      isRead: false,
      hasAttachments: false,
    }

    const result = parser.parseMessage(graphMessage)

    expect(result.bodyText).toBe('Plain text body\nMultiple lines\nNo HTML')
    expect(result.bodyHtml).toBeUndefined()
  })

  // Test 9: Use bodyPreview as text fallback for HTML-only
  it('should use bodyPreview as text fallback for HTML-only emails', () => {
    const graphMessage: GraphMessage = {
      id: 'AAMkAGI2TG93III=',
      subject: 'HTML Only',
      from: {
        emailAddress: {
          name: 'Sender',
          address: 'sender@example.com',
        },
      },
      receivedDateTime: '2024-01-15T12:00:00Z',
      body: {
        contentType: 'html',
        content: '<html><body>Complex HTML email</body></html>',
      },
      bodyPreview: 'Complex HTML email',
      isRead: false,
      hasAttachments: false,
    }

    const result = parser.parseMessage(graphMessage)

    expect(result.bodyHtml).toBe('<html><body>Complex HTML email</body></html>')
    expect(result.bodyText).toBe('Complex HTML email')
    expect(result.snippet).toBe('Complex HTML email')
  })

  // Test 10: Handle empty body gracefully
  it('should handle empty body gracefully', () => {
    const graphMessage: GraphMessage = {
      id: 'AAMkAGI2TG93JJJ=',
      subject: 'Empty Body',
      from: {
        emailAddress: {
          name: 'Sender',
          address: 'sender@example.com',
        },
      },
      receivedDateTime: '2024-01-15T12:00:00Z',
      body: {
        contentType: 'text',
        content: '',
      },
      bodyPreview: '',
      isRead: false,
      hasAttachments: false,
    }

    const result = parser.parseMessage(graphMessage)

    expect(result.bodyText).toBeUndefined()
    expect(result.bodyHtml).toBeUndefined()
    expect(result.snippet).toBeUndefined()
  })

  // Test 11: Preserve snippet field
  it('should preserve snippet field from bodyPreview', () => {
    const graphMessage: GraphMessage = {
      id: 'AAMkAGI2TG93KKK=',
      subject: 'Snippet Test',
      from: {
        emailAddress: {
          name: 'Sender',
          address: 'sender@example.com',
        },
      },
      receivedDateTime: '2024-01-15T12:00:00Z',
      body: {
        contentType: 'html',
        content: '<p>Long email content that goes beyond 255 characters...</p>',
      },
      bodyPreview: 'Long email content that goes beyond 255 characters...',
      isRead: false,
      hasAttachments: false,
    }

    const result = parser.parseMessage(graphMessage)

    expect(result.snippet).toBe('Long email content that goes beyond 255 characters...')
  })

  // Test 12: Handle special characters in subject
  it('should handle special characters in subject', () => {
    const graphMessage: GraphMessage = {
      id: 'AAMkAGI2TG93LLL=',
      subject: 'Re: [URGENT] Password Reset 🔒 – Action Required!',
      from: {
        emailAddress: {
          name: 'Security Team',
          address: 'security@example.com',
        },
      },
      receivedDateTime: '2024-01-15T12:00:00Z',
      body: {
        contentType: 'text',
        content: 'Reset your password',
      },
      bodyPreview: 'Reset your password',
      isRead: false,
      hasAttachments: false,
    }

    const result = parser.parseMessage(graphMessage)

    expect(result.subject).toBe('Re: [URGENT] Password Reset 🔒 – Action Required!')
  })

  // Test 13: Handle special characters in body
  it('should handle special characters in body', () => {
    const graphMessage: GraphMessage = {
      id: 'AAMkAGI2TG93MMM=',
      subject: 'Unicode Test',
      from: {
        emailAddress: {
          name: '测试用户',
          address: 'test@example.com',
        },
      },
      receivedDateTime: '2024-01-15T12:00:00Z',
      body: {
        contentType: 'text',
        content: 'Código de verificación: 123456\nВаш код: 654321\n验证码：999888',
      },
      bodyPreview: 'Código de verificación: 123456',
      isRead: false,
      hasAttachments: false,
    }

    const result = parser.parseMessage(graphMessage)

    expect(result.from.name).toBe('测试用户')
    expect(result.bodyText).toBe('Código de verificación: 123456\nВаш код: 654321\n验证码：999888')
  })

  // Test 14: GitHub verification email pattern
  it('should parse GitHub verification email', () => {
    const graphMessage: GraphMessage = {
      id: 'AAMkAGI2TG93NNN=',
      subject: '[GitHub] Please verify your device',
      from: {
        emailAddress: {
          name: 'GitHub',
          address: 'noreply@github.com',
        },
      },
      receivedDateTime: '2024-01-15T10:30:00Z',
      body: {
        contentType: 'html',
        content: `<html>
<body>
<p>Hey there,</p>
<p>Enter this code to verify your device:</p>
<h2>987-654</h2>
<p>This code expires in 15 minutes.</p>
</body>
</html>`,
      },
      bodyPreview: 'Hey there, Enter this code to verify your device: 987-654',
      isRead: false,
      hasAttachments: false,
    }

    const result = parser.parseMessage(graphMessage)

    expect(result.subject).toBe('[GitHub] Please verify your device')
    expect(result.from.email).toBe('noreply@github.com')
    expect(result.bodyHtml).toContain('987-654')
    expect(result.bodyText).toContain('987-654')
  })

  // Test 15: AWS password reset pattern
  it('should parse AWS password reset email', () => {
    const graphMessage: GraphMessage = {
      id: 'AAMkAGI2TG93OOO=',
      subject: 'Password Reset Request for AWS Account',
      from: {
        emailAddress: {
          name: 'Amazon Web Services',
          address: 'no-reply@amazon.com',
        },
      },
      receivedDateTime: '2024-01-15T14:45:30Z',
      body: {
        contentType: 'text',
        content: `We received a request to reset your AWS account password.

Your password reset code is: 456789

This code will expire in 60 minutes.

If you did not request this reset, please ignore this email.`,
      },
      bodyPreview: 'We received a request to reset your AWS account password.',
      isRead: false,
      hasAttachments: false,
    }

    const result = parser.parseMessage(graphMessage)

    expect(result.subject).toBe('Password Reset Request for AWS Account')
    expect(result.from.email).toBe('no-reply@amazon.com')
    expect(result.bodyText).toContain('456789')
    expect(result.bodyHtml).toBeUndefined()
  })

  // Test 16: Microsoft verification email pattern
  it('should parse Microsoft verification email', () => {
    const graphMessage: GraphMessage = {
      id: 'AAMkAGI2TG93PPP=',
      subject: 'Microsoft account security code',
      from: {
        emailAddress: {
          name: 'Microsoft account team',
          address: 'account-security-noreply@accountprotection.microsoft.com',
        },
      },
      receivedDateTime: '2024-01-15T16:20:15Z',
      body: {
        contentType: 'html',
        content: `<html>
<body>
<h2>Security code</h2>
<p>Please use the following security code for the Microsoft account:</p>
<div style="font-size: 24px; font-weight: bold;">1234567</div>
<p>If you didn't request this code, you can safely ignore this email.</p>
</body>
</html>`,
      },
      bodyPreview: 'Security code Please use the following security code for the Microsoft account: 1234567',
      isRead: false,
      hasAttachments: false,
    }

    const result = parser.parseMessage(graphMessage)

    expect(result.subject).toBe('Microsoft account security code')
    expect(result.from.email).toBe('account-security-noreply@accountprotection.microsoft.com')
    expect(result.bodyHtml).toContain('1234567')
    expect(result.bodyText).toContain('1234567')
  })

  // Test 17: Google verification email pattern
  it('should parse Google verification email', () => {
    const graphMessage: GraphMessage = {
      id: 'AAMkAGI2TG93QQQ=',
      subject: 'Your Google verification code',
      from: {
        emailAddress: {
          name: 'Google',
          address: 'no-reply@accounts.google.com',
        },
      },
      receivedDateTime: '2024-01-15T11:10:05Z',
      body: {
        contentType: 'html',
        content: `<html>
<body>
<p>G-567890 is your Google verification code.</p>
<p>This code will expire in 10 minutes.</p>
</body>
</html>`,
      },
      bodyPreview: 'G-567890 is your Google verification code.',
      isRead: false,
      hasAttachments: false,
    }

    const result = parser.parseMessage(graphMessage)

    expect(result.subject).toBe('Your Google verification code')
    expect(result.from.email).toBe('no-reply@accounts.google.com')
    expect(result.bodyHtml).toContain('G-567890')
    expect(result.bodyText).toContain('G-567890')
  })

  // Test 18: Edge case - all optional fields missing
  it('should handle edge case with all optional fields missing', () => {
    const graphMessage: GraphMessage = {
      id: 'AAMkAGI2TG93RRR=',
      subject: '',
      from: {
        emailAddress: {
          name: '',
          address: 'unknown@example.com',
        },
      },
      receivedDateTime: '2024-01-15T12:00:00Z',
      body: {
        contentType: 'text',
        content: '',
      },
      bodyPreview: '',
      isRead: false,
      hasAttachments: false,
    }

    const result = parser.parseMessage(graphMessage)

    expect(result.id).toBe('AAMkAGI2TG93RRR=')
    expect(result.subject).toBe('(No Subject)')
    expect(result.from.email).toBe('unknown@example.com')
    expect(result.from.name).toBeUndefined()
    expect(result.bodyText).toBeUndefined()
    expect(result.bodyHtml).toBeUndefined()
    expect(result.snippet).toBeUndefined()
    expect(result.date).toBeInstanceOf(Date)
  })

  // Test 19: Handle whitespace-only content
  it('should treat whitespace-only content as empty', () => {
    const graphMessage: GraphMessage = {
      id: 'AAMkAGI2TG93SSS=',
      subject: '   ',
      from: {
        emailAddress: {
          name: '   ',
          address: 'sender@example.com',
        },
      },
      receivedDateTime: '2024-01-15T12:00:00Z',
      body: {
        contentType: 'text',
        content: '   \n\t  ',
      },
      bodyPreview: '   ',
      isRead: false,
      hasAttachments: false,
    }

    const result = parser.parseMessage(graphMessage)

    expect(result.subject).toBe('(No Subject)')
    expect(result.from.name).toBeUndefined()
    expect(result.bodyText).toBeUndefined()
    expect(result.snippet).toBeUndefined()
  })

  // Test 20: Parse message with attachments flag
  it('should preserve attachment metadata', () => {
    const graphMessage: GraphMessage = {
      id: 'AAMkAGI2TG93TTT=',
      subject: 'Document attached',
      from: {
        emailAddress: {
          name: 'Sender',
          address: 'sender@example.com',
        },
      },
      receivedDateTime: '2024-01-15T12:00:00Z',
      body: {
        contentType: 'text',
        content: 'Please find the document attached.',
      },
      bodyPreview: 'Please find the document attached.',
      isRead: false,
      hasAttachments: true,
    }

    const result = parser.parseMessage(graphMessage)

    // Note: EmailMessage interface doesn't include hasAttachments
    // Just verify the message parses correctly
    expect(result.id).toBe('AAMkAGI2TG93TTT=')
    expect(result.bodyText).toBe('Please find the document attached.')
  })

  // senderETLD extraction tests
  describe('senderETLD extraction', () => {
    it('should extract eTLD from simple email address', () => {
      const graphMessage: GraphMessage = {
        id: 'AAMkAGI2TG93UUU=',
        subject: 'Test',
        from: {
          emailAddress: {
            name: 'Test User',
            address: 'user@example.com',
          },
        },
        receivedDateTime: '2024-01-15T12:00:00Z',
        body: {
          contentType: 'text',
          content: 'Test content',
        },
        bodyPreview: 'Test content',
        isRead: false,
        hasAttachments: false,
      }

      const result = parser.parseMessage(graphMessage)

      expect(result.senderETLD).toBe('example.com')
    })

    it('should extract eTLD from email with name (Graph API already separates them)', () => {
      const graphMessage: GraphMessage = {
        id: 'AAMkAGI2TG93VVV=',
        subject: 'Test',
        from: {
          emailAddress: {
            name: 'John Doe',
            address: 'user@example.com',
          },
        },
        receivedDateTime: '2024-01-15T12:00:00Z',
        body: {
          contentType: 'text',
          content: 'Test content',
        },
        bodyPreview: 'Test content',
        isRead: false,
        hasAttachments: false,
      }

      const result = parser.parseMessage(graphMessage)

      expect(result.senderETLD).toBe('example.com')
      expect(result.from.name).toBe('John Doe')
    })

    it('should extract eTLD from subdomain email address', () => {
      const graphMessage: GraphMessage = {
        id: 'AAMkAGI2TG93WWW=',
        subject: 'Test',
        from: {
          emailAddress: {
            name: 'No Reply',
            address: 'noreply@mail.example.com',
          },
        },
        receivedDateTime: '2024-01-15T12:00:00Z',
        body: {
          contentType: 'text',
          content: 'Test content',
        },
        bodyPreview: 'Test content',
        isRead: false,
        hasAttachments: false,
      }

      const result = parser.parseMessage(graphMessage)

      expect(result.senderETLD).toBe('example.com')
    })

    it('should extract eTLD from multiple subdomains', () => {
      const graphMessage: GraphMessage = {
        id: 'AAMkAGI2TG93XXX=',
        subject: 'Test',
        from: {
          emailAddress: {
            name: 'User',
            address: 'user@a.b.c.example.com',
          },
        },
        receivedDateTime: '2024-01-15T12:00:00Z',
        body: {
          contentType: 'text',
          content: 'Test content',
        },
        bodyPreview: 'Test content',
        isRead: false,
        hasAttachments: false,
      }

      const result = parser.parseMessage(graphMessage)

      expect(result.senderETLD).toBe('example.com')
    })

    it('should handle invalid email gracefully', () => {
      const graphMessage: GraphMessage = {
        id: 'AAMkAGI2TG93YYY=',
        subject: 'Test',
        from: {
          emailAddress: {
            name: 'Invalid',
            address: 'invalid-email-without-at',
          },
        },
        receivedDateTime: '2024-01-15T12:00:00Z',
        body: {
          contentType: 'text',
          content: 'Test content',
        },
        bodyPreview: 'Test content',
        isRead: false,
        hasAttachments: false,
      }

      const result = parser.parseMessage(graphMessage)

      expect(result.senderETLD).toBe('')
    })
  })
})
