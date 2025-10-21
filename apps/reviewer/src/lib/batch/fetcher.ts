import { db, Message } from '../storage/schema'
import { htmlToText, extractETLD, hashId } from '../utils/text'

export interface BatchFilters {
  provider: 'gmail' | 'outlook'
  from?: string
  contains?: string
  startDate?: Date
  endDate?: Date
  maxResults: number
}

export class BatchFetcher {
  /**
   * Fetch messages from Gmail API
   */
  async fetchGmail(accessToken: string, filters: BatchFilters): Promise<Message[]> {
    const messages: Message[] = []

    try {
      // Build Gmail query
      const queryParts: string[] = []

      if (filters.from) {
        queryParts.push(`from:${filters.from}`)
      }

      if (filters.contains) {
        queryParts.push(filters.contains)
      }

      if (filters.startDate) {
        const daysAgo = Math.ceil((Date.now() - filters.startDate.getTime()) / (1000 * 60 * 60 * 24))
        queryParts.push(`newer_than:${daysAgo}d`)
      }

      const query = queryParts.join(' ')

      // List messages
      const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${filters.maxResults}&q=${encodeURIComponent(query)}`

      const listResponse = await fetch(listUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      })

      if (!listResponse.ok) {
        throw new Error(`Gmail API list failed: ${listResponse.status} ${listResponse.statusText}`)
      }

      const listData = await listResponse.json()

      if (!listData.messages || listData.messages.length === 0) {
        console.log('No messages found')
        return []
      }

      // Fetch full message details
      for (const msgRef of listData.messages) {
        try {
          const msgUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgRef.id}?format=full`

          const msgResponse = await fetch(msgUrl, {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          })

          if (!msgResponse.ok) {
            console.error(`Failed to fetch message ${msgRef.id}`)
            continue
          }

          const msgData = await msgResponse.json()

          // Parse message
          const headers = msgData.payload?.headers || []
          const from = headers.find((h: any) => h.name.toLowerCase() === 'from')?.value || ''
          const subject = headers.find((h: any) => h.name.toLowerCase() === 'subject')?.value || ''
          const date = headers.find((h: any) => h.name.toLowerCase() === 'date')?.value || ''

          // Extract body
          let bodyText = ''
          let bodyHtml = ''

          // Helper to decode base64url to UTF-8 string
          const decodeBase64Url = (base64url: string): string => {
            try {
              // Convert base64url to base64
              const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
              // Decode base64 to binary string
              const binaryString = atob(base64)
              // Convert binary string to Uint8Array
              const bytes = Uint8Array.from(binaryString, char => char.charCodeAt(0))
              // Decode UTF-8 bytes to string
              return new TextDecoder('utf-8').decode(bytes)
            } catch (error) {
              console.error('Error decoding base64url:', error)
              return ''
            }
          }

          const extractBody = (part: any) => {
            if (part.mimeType === 'text/plain' && part.body?.data) {
              bodyText = decodeBase64Url(part.body.data)
            } else if (part.mimeType === 'text/html' && part.body?.data) {
              bodyHtml = decodeBase64Url(part.body.data)
            } else if (part.parts) {
              part.parts.forEach(extractBody)
            }
          }

          if (msgData.payload) {
            extractBody(msgData.payload)
          }

          // Fallback: convert HTML to text if no plain text
          if (!bodyText && bodyHtml) {
            bodyText = htmlToText(bodyHtml)
          }

          const message: Message = {
            msgIdHash: hashId('gmail', msgRef.id),
            provider: 'gmail',
            messageId: msgRef.id,
            from,
            senderETLD: extractETLD(from),
            subject,
            receivedAt: date ? new Date(date).getTime() : msgData.internalDate ? parseInt(msgData.internalDate) : Date.now(),
            bodyText,
            bodyHtml,
          }

          messages.push(message)

          // Store in database
          await db.messages.put(message)

        } catch (error) {
          console.error(`Error processing message ${msgRef.id}:`, error)
        }
      }

      console.log(`Fetched ${messages.length} Gmail messages`)
      return messages

    } catch (error) {
      console.error('Gmail fetch error:', error)
      throw error
    }
  }

  /**
   * Fetch messages from Outlook/Microsoft Graph API
   */
  async fetchOutlook(accessToken: string, filters: BatchFilters): Promise<Message[]> {
    const messages: Message[] = []

    try {
      // Build Graph API filter
      const filterParts: string[] = []

      if (filters.startDate) {
        const isoDate = filters.startDate.toISOString()
        filterParts.push(`receivedDateTime ge ${isoDate}`)
      }

      if (filters.endDate) {
        const isoDate = filters.endDate.toISOString()
        filterParts.push(`receivedDateTime le ${isoDate}`)
      }

      const filterQuery = filterParts.length > 0 ? `&$filter=${encodeURIComponent(filterParts.join(' and '))}` : ''

      // Search query
      let searchQuery = ''
      if (filters.from) {
        searchQuery = `&$search="from:${filters.from}"`
      } else if (filters.contains) {
        searchQuery = `&$search="${filters.contains}"`
      }

      // Fetch messages
      const url = `https://graph.microsoft.com/v1.0/me/messages?$top=${filters.maxResults}${filterQuery}${searchQuery}&$select=id,from,subject,receivedDateTime,body,bodyPreview`

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      })

      if (!response.ok) {
        throw new Error(`Outlook API failed: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      if (!data.value || data.value.length === 0) {
        console.log('No messages found')
        return []
      }

      // Process messages
      for (const msgData of data.value) {
        try {
          const from = msgData.from?.emailAddress?.address || ''
          const bodyText = msgData.body?.contentType === 'text'
            ? msgData.body.content
            : (msgData.bodyPreview || htmlToText(msgData.body?.content || ''))

          const bodyHtml = msgData.body?.contentType === 'html' ? msgData.body.content : ''

          const message: Message = {
            msgIdHash: hashId('outlook', msgData.id),
            provider: 'outlook',
            messageId: msgData.id,
            from,
            senderETLD: extractETLD(from),
            subject: msgData.subject || '',
            receivedAt: new Date(msgData.receivedDateTime).getTime(),
            bodyText,
            bodyHtml,
          }

          messages.push(message)

          // Store in database
          await db.messages.put(message)

        } catch (error) {
          console.error(`Error processing message ${msgData.id}:`, error)
        }
      }

      console.log(`Fetched ${messages.length} Outlook messages`)
      return messages

    } catch (error) {
      console.error('Outlook fetch error:', error)
      throw error
    }
  }
}
