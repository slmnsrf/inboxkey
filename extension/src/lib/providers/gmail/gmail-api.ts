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
   * Uses Promise.allSettled so one failed message doesn't kill the entire batch.
   */
  async getMessages(
    accessToken: string,
    messageIds: string[]
  ): Promise<GmailMessage[]> {
    if (messageIds.length === 0) {
      return []
    }

    const results = await Promise.allSettled(
      messageIds.map((id) => this.getMessage(accessToken, id))
    )

    const messages: GmailMessage[] = []
    for (let i = 0; i < results.length; i++) {
      const r = results[i]
      if (r.status === 'fulfilled') {
        messages.push(r.value)
      } else {
        console.warn(`[GmailApi] Failed to fetch message ${messageIds[i]}:`, r.reason)
      }
    }

    // If every fetch failed, surface the error so the sync layer can detect the failure
    if (messages.length === 0 && messageIds.length > 0) {
      const first = results.find(r => r.status === 'rejected') as PromiseRejectedResult
      throw first?.reason ?? new Error('All message fetches failed')
    }

    return messages
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
