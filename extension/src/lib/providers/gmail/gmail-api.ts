/**
 * Gmail API Client
 *
 * Handles Gmail API requests for listing and fetching messages
 */

import { GMAIL_API_BASE } from './config'

export interface GmailMessage {
  id: string
  threadId: string
  labelIds: string[]
  snippet: string
  payload: {
    headers: Array<{ name: string; value: string }>
    body: { data?: string; size: number }
    parts?: Array<GmailMessagePart>
  }
  internalDate: string
}

export interface GmailMessagePart {
  mimeType: string
  body: { data?: string; size: number }
  parts?: Array<GmailMessagePart>
}

export interface GmailListResponse {
  messages?: Array<{ id: string; threadId: string }>
  nextPageToken?: string
  resultSizeEstimate?: number
}

export class GmailAPIClient {
  /**
   * List recent messages
   */
  async listMessages(
    accessToken: string,
    options: {
      maxResults?: number
      query?: string
      pageToken?: string
    } = {}
  ): Promise<Array<{ id: string; threadId: string }>> {
    const params = new URLSearchParams({
      maxResults: String(options.maxResults || 10),
    })

    if (options.query) {
      params.set('q', options.query)
    }

    if (options.pageToken) {
      params.set('pageToken', options.pageToken)
    }

    const response = await fetch(
      `${GMAIL_API_BASE}/users/me/messages?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Gmail API error (${response.status}): ${error}`)
    }

    const data: GmailListResponse = await response.json()

    // DEBUG: Log Gmail API response
    console.log('[GmailAPI] listMessages response:', {
      query: options.query,
      maxResults: options.maxResults,
      resultSizeEstimate: data.resultSizeEstimate,
      messagesReturned: data.messages?.length || 0,
      messageIds: data.messages?.map(m => m.id).slice(0, 5) || [], // First 5 IDs
      hasNextPage: !!data.nextPageToken
    })

    return data.messages || []
  }

  /**
   * Get full message details
   */
  async getMessage(
    accessToken: string,
    messageId: string
  ): Promise<GmailMessage> {
    const response = await fetch(
      `${GMAIL_API_BASE}/users/me/messages/${messageId}?format=full`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Gmail API error (${response.status}): ${error}`)
    }

    return await response.json()
  }

  /**
   * Batch get multiple messages
   * Uses Promise.all for efficiency (in production, consider Gmail's batch API)
   */
  async getMessages(
    accessToken: string,
    messageIds: string[]
  ): Promise<GmailMessage[]> {
    if (messageIds.length === 0) {
      return []
    }

    // Fetch all messages in parallel
    return await Promise.all(
      messageIds.map((id) => this.getMessage(accessToken, id))
    )
  }

  /**
   * Get user profile (for email address)
   */
  async getUserProfile(accessToken: string): Promise<{
    emailAddress: string
    messagesTotal: number
    threadsTotal: number
  }> {
    const response = await fetch(`${GMAIL_API_BASE}/users/me/profile`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Gmail API error (${response.status}): ${error}`)
    }

    return await response.json()
  }
}
