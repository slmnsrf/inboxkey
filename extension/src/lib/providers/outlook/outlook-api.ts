/**
 * Microsoft Graph API Client for Outlook
 *
 * Handles Microsoft Graph API requests for listing and fetching messages.
 * Reference: specifications.md section 4.2 (Outlook)
 */

import { OUTLOOK_API_BASE } from './config'

/**
 * Microsoft Graph Message Body
 */
export interface OutlookMessageBody {
  contentType: 'text' | 'html'
  content: string
}

/**
 * Microsoft Graph Email Address
 */
export interface OutlookEmailAddress {
  name: string
  address: string
}

/**
 * Microsoft Graph Message Sender/Recipient
 */
export interface OutlookRecipient {
  emailAddress: OutlookEmailAddress
}

/**
 * Microsoft Graph Message
 * Reference: https://learn.microsoft.com/en-us/graph/api/resources/message
 */
export interface GraphMessage {
  id: string
  subject: string
  from: OutlookRecipient
  receivedDateTime: string // ISO 8601 format
  body: OutlookMessageBody
  bodyPreview: string // First 255 chars
  isRead: boolean
  hasAttachments: boolean
}

/**
 * Microsoft Graph Message List Response
 */
export interface GraphMessageList {
  '@odata.context': string
  value: GraphMessage[]
  '@odata.nextLink'?: string // For pagination
}

/**
 * Microsoft Graph API Error Response
 */
export interface GraphError {
  error: {
    code: string
    message: string
    innerError?: {
      'request-id': string
      date: string
    }
  }
}

/**
 * Outlook API Client using Microsoft Graph API
 *
 * Provides methods to list and fetch email messages from Outlook/Microsoft 365.
 * Follows the same pattern as GmailAPIClient for consistency.
 */
export class OutlookAPIClient {
  private baseUrl: string

  constructor(baseUrl = OUTLOOK_API_BASE) {
    this.baseUrl = baseUrl
  }

  /**
   * List messages from inbox
   *
   * Similar to GmailAPIClient.listMessages(), but uses Microsoft Graph API query parameters.
   * Reference: https://learn.microsoft.com/en-us/graph/api/user-list-messages
   *
   * @param accessToken - OAuth2 access token
   * @param options - Query options
   * @returns Array of message IDs (minimal format for consistency with Gmail)
   */
  async listMessages(
    accessToken: string,
    options: {
      maxResults?: number
      query?: string
      unreadOnly?: boolean
      newerThan?: Date
    } = {}
  ): Promise<Array<{ id: string }>> {
    // Build query parameters
    const params = new URLSearchParams({
      $select: 'id,subject,from,receivedDateTime,bodyPreview',
      $top: String(options.maxResults || 10),
      $orderby: 'receivedDateTime desc',
    })

    // Build filter expression
    const filters: string[] = []

    if (options.unreadOnly) {
      filters.push('isRead eq false')
    }

    if (options.newerThan) {
      // Microsoft Graph uses ISO 8601 format for date filtering
      const isoDate = options.newerThan.toISOString()
      filters.push(`receivedDateTime ge ${isoDate}`)
    }

    if (filters.length > 0) {
      params.append('$filter', filters.join(' and '))
    }

    // Microsoft Graph supports $search for full-text search
    // Note: $search requires 'ConsistencyLevel: eventual' header
    if (options.query) {
      params.append('$search', `"${options.query}"`)
    }

    const headers: HeadersInit = {
      Authorization: `Bearer ${accessToken}`,
    }

    // Add ConsistencyLevel header if using $search
    if (options.query) {
      headers['ConsistencyLevel'] = 'eventual'
    }

    const response = await fetch(
      `${this.baseUrl}/me/messages?${params.toString()}`,
      { headers }
    )

    if (!response.ok) {
      await this.handleError(response)
    }

    const data: GraphMessageList = await response.json()

    // Return minimal format (id only) for consistency with Gmail API
    return (data.value || []).map((msg) => ({ id: msg.id }))
  }

  /**
   * Get single message by ID
   *
   * @param accessToken - OAuth2 access token
   * @param messageId - Message ID
   * @returns Full GraphMessage object
   */
  async getMessage(
    accessToken: string,
    messageId: string
  ): Promise<GraphMessage> {
    // Select relevant fields to minimize payload size
    const params = new URLSearchParams({
      $select:
        'id,subject,from,receivedDateTime,body,bodyPreview,isRead,hasAttachments',
    })

    const response = await fetch(
      `${this.baseUrl}/me/messages/${messageId}?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )

    if (!response.ok) {
      await this.handleError(response)
    }

    return await response.json()
  }

  /**
   * Get full message details for multiple message IDs
   *
   * Similar to GmailAPIClient.getMessages().
   * Uses Promise.allSettled for partial-success tolerance (in production, consider batch API).
   *
   * Note: Microsoft Graph supports batch requests via POST /$batch endpoint
   * for up to 20 requests. This is a future optimization opportunity.
   *
   * @param accessToken - OAuth2 access token
   * @param messageIds - Array of message IDs
   * @returns Array of GraphMessage objects
   */
  async getMessages(
    accessToken: string,
    messageIds: string[]
  ): Promise<GraphMessage[]> {
    if (messageIds.length === 0) {
      return []
    }

    const results = await Promise.allSettled(
      messageIds.map((id) => this.getMessage(accessToken, id))
    )

    const messages: GraphMessage[] = []
    for (let i = 0; i < results.length; i++) {
      const r = results[i]
      if (r.status === 'fulfilled') {
        messages.push(r.value)
      } else {
        console.warn(`[OutlookApi] Failed to fetch message ${messageIds[i]}:`, r.reason)
      }
    }
    return messages
  }

  /**
   * Handle Microsoft Graph API errors
   *
   * Throws descriptive errors for common API error codes:
   * - 401 Unauthorized (token expired)
   * - 403 Forbidden (insufficient permissions)
   * - 404 Not Found
   * - 429 Too Many Requests (rate limiting)
   * - 500+ Server errors
   *
   * @param response - Fetch Response object
   * @throws Error with descriptive message
   */
  private async handleError(response: Response): Promise<never> {
    let errorMessage = `Microsoft Graph API error (${response.status})`

    try {
      const errorData: GraphError = await response.json()
      if (errorData.error) {
        errorMessage = `${errorMessage}: ${errorData.error.code} - ${errorData.error.message}`
      }
    } catch {
      // If JSON parsing fails, use response text
      const errorText = await response.text()
      errorMessage = `${errorMessage}: ${errorText}`
    }

    // Add specific guidance for common error codes
    switch (response.status) {
      case 401:
        errorMessage += ' (Access token expired or invalid)'
        break
      case 403:
        errorMessage += ' (Insufficient permissions - check Mail.Read scope)'
        break
      case 404:
        errorMessage += ' (Message not found)'
        break
      case 429:
        errorMessage += ' (Rate limit exceeded - retry after delay)'
        break
      case 500:
      case 502:
      case 503:
      case 504:
        errorMessage += ' (Microsoft Graph service error - retry later)'
        break
    }

    throw new Error(errorMessage)
  }
}
