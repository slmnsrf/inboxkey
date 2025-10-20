/**
 * Gmail Message Parser
 *
 * Parses Gmail API message format into EmailMessage format
 */

import type { EmailMessage } from '../provider-interface'
import type { GmailMessage, GmailMessagePart } from './gmail-api'
import { extractETLD } from '@/lib/matching/domain-affinity'

export class GmailParser {
  /**
   * Parse Gmail message to EmailMessage format
   */
  parseMessage(gmailMsg: GmailMessage): EmailMessage {
    const headers = this.parseHeaders(gmailMsg.payload.headers)
    const senderEmail = this.extractEmail(headers.from || '')

    return {
      id: gmailMsg.id,
      from: {
        email: senderEmail,
        name: this.extractName(headers.from || ''),
      },
      senderETLD: this.extractSenderETLD(senderEmail),
      subject: headers.subject || '(No subject)',
      date: new Date(Number.parseInt(gmailMsg.internalDate, 10)),
      bodyText: this.extractTextBody(gmailMsg.payload),
      bodyHtml: this.extractHtmlBody(gmailMsg.payload),
      snippet: gmailMsg.snippet,
    }
  }

  /**
   * Parse headers into key-value object
   */
  private parseHeaders(
    headers: Array<{ name: string; value: string }>
  ): Record<string, string> {
    const result: Record<string, string> = {}

    for (const header of headers) {
      result[header.name.toLowerCase()] = header.value
    }

    return result
  }

  /**
   * Extract email from "Name <email@domain.com>" format
   */
  private extractEmail(from: string): string {
    if (!from) return ''

    // Try to match email in angle brackets
    const angleMatch = from.match(/<([^>]+)>/)
    if (angleMatch) {
      return angleMatch[1].trim()
    }

    // If no angle brackets, check if entire string is an email
    const emailMatch = from.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
    if (emailMatch) {
      return from.trim()
    }

    // Fallback: return the string as-is
    return from.trim()
  }

  /**
   * Extract name from "Name <email@domain.com>" format
   */
  private extractName(from: string): string | undefined {
    if (!from) return undefined

    // Try to match name before angle bracket
    const match = from.match(/^(.+?)\s*</)
    if (match) {
      const name = match[1].trim()
      // Remove quotes if present
      return name.replace(/^["']|["']$/g, '')
    }

    return undefined
  }

  /**
   * Extract eTLD+1 from sender email address
   *
   * Extracts the domain from an email address and returns the effective
   * top-level domain (eTLD+1) for domain affinity matching.
   *
   * @param email - The sender's email address
   * @returns The eTLD+1 domain (e.g., "example.com")
   *
   * @example
   * extractSenderETLD("user@mail.example.com") // returns "example.com"
   * extractSenderETLD("noreply@example.com") // returns "example.com"
   * extractSenderETLD("invalid") // returns ""
   */
  private extractSenderETLD(email: string): string {
    if (!email) return ''

    // Extract domain from email (part after @)
    const atIndex = email.lastIndexOf('@')
    if (atIndex === -1) return ''

    const domain = email.slice(atIndex + 1)
    return extractETLD(domain)
  }

  /**
   * Extract text body from Gmail payload
   */
  private extractTextBody(
    payload: GmailMessage['payload']
  ): string | undefined {
    // Check main body - for simple text messages without parts
    if (payload.body.data && payload.body.size > 0) {
      // Check if this is a text/plain message
      const mimeType = this.getPayloadMimeType(payload)
      if (!mimeType || mimeType === 'text/plain') {
        // If no MIME type specified or text/plain, decode as text
        return this.decodeBase64Url(payload.body.data)
      }
    }

    // Check parts recursively
    if (payload.parts) {
      return this.extractBodyFromParts(payload.parts, 'text/plain')
    }

    return undefined
  }

  /**
   * Extract HTML body from Gmail payload
   */
  private extractHtmlBody(
    payload: GmailMessage['payload']
  ): string | undefined {
    // Check main body - for simple HTML messages without parts
    if (payload.body.data && payload.body.size > 0) {
      const mimeType = this.getPayloadMimeType(payload)
      if (mimeType === 'text/html') {
        return this.decodeBase64Url(payload.body.data)
      }
    }

    // Check parts recursively
    if (payload.parts) {
      return this.extractBodyFromParts(payload.parts, 'text/html')
    }

    return undefined
  }

  /**
   * Get MIME type from payload headers
   */
  private getPayloadMimeType(
    payload: GmailMessage['payload']
  ): string | undefined {
    const contentType = payload.headers?.find(
      (h) => h.name.toLowerCase() === 'content-type'
    )
    if (contentType) {
      // Extract MIME type (before semicolon)
      return contentType.value.split(';')[0].trim()
    }
    return undefined
  }

  /**
   * Recursively extract body from message parts
   */
  private extractBodyFromParts(
    parts: GmailMessagePart[],
    mimeType: string
  ): string | undefined {
    for (const part of parts) {
      // Check if this part matches the desired MIME type
      if (part.mimeType === mimeType && part.body.data) {
        return this.decodeBase64Url(part.body.data)
      }

      // Recursively check nested parts (for multipart/alternative, etc.)
      if (part.parts) {
        const result = this.extractBodyFromParts(part.parts, mimeType)
        if (result) {
          return result
        }
      }
    }

    return undefined
  }

  /**
   * Decode base64url encoded data (Gmail uses base64url, not standard base64)
   *
   * Base64url differs from standard base64:
   * - Uses '-' instead of '+'
   * - Uses '_' instead of '/'
   * - No padding ('=')
   */
  private decodeBase64Url(data: string): string {
    try {
      // Convert base64url to base64
      let base64 = data.replace(/-/g, '+').replace(/_/g, '/')

      // Add padding if needed
      const padding = (4 - (base64.length % 4)) % 4
      base64 += '='.repeat(padding)

      // Decode base64
      const decoded = atob(base64)

      // Convert to UTF-8
      // Handle UTF-8 encoding by converting each character to percent encoding
      // then using decodeURIComponent
      return decodeURIComponent(
        decoded
          .split('')
          .map((c) => {
            const hex = c.charCodeAt(0).toString(16).padStart(2, '0')
            return '%' + hex
          })
          .join('')
      )
    } catch (error) {
      console.error('Failed to decode base64url:', error)
      return ''
    }
  }
}
