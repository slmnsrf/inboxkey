/**
 * Outlook Message Parser
 *
 * Parses Microsoft Graph API message format into EmailMessage format
 * Reference: specifications.md section 4.2 (Outlook)
 */

import type { EmailMessage } from '../provider-interface'
import type { GraphMessage } from './outlook-api'

export class OutlookParser {
  /**
   * Parse Microsoft Graph message to EmailMessage format
   *
   * Key differences from Gmail:
   * - Date format: ISO 8601 string vs Unix timestamp
   * - Body structure: Single body object vs payload.parts array
   * - No Base64 encoding: Direct string content
   *
   * @param graphMessage - Raw message from Microsoft Graph API
   * @returns Normalized EmailMessage
   */
  parseMessage(graphMessage: GraphMessage): EmailMessage {
    // Trim and normalize subject
    const subject = graphMessage.subject?.trim()

    // Trim and normalize sender name
    const senderName = graphMessage.from.emailAddress.name?.trim()

    // Trim and normalize snippet
    const snippet = graphMessage.bodyPreview?.trim()

    return {
      id: graphMessage.id,
      from: {
        email: graphMessage.from.emailAddress.address,
        name: senderName || undefined,
      },
      subject: subject || '(No Subject)',
      date: new Date(graphMessage.receivedDateTime),
      bodyText: this.extractBodyText(graphMessage),
      bodyHtml: this.extractBodyHtml(graphMessage),
      snippet: snippet || undefined,
    }
  }

  /**
   * Extract plain text body
   *
   * Microsoft Graph provides body in two formats:
   * - contentType: 'text' → plain text
   * - contentType: 'html' → HTML
   *
   * For HTML-only emails, fall back to bodyPreview (first 255 chars)
   */
  private extractBodyText(graphMessage: GraphMessage): string | undefined {
    if (graphMessage.body.contentType === 'text') {
      const text = graphMessage.body.content?.trim()
      return text || undefined
    }

    // If HTML only, use bodyPreview as fallback
    const preview = graphMessage.bodyPreview?.trim()
    return preview || undefined
  }

  /**
   * Extract HTML body
   *
   * Only available if contentType is 'html'
   */
  private extractBodyHtml(graphMessage: GraphMessage): string | undefined {
    if (graphMessage.body.contentType === 'html') {
      const html = graphMessage.body.content?.trim()
      return html || undefined
    }

    return undefined
  }
}
