import { extractFromEmail } from '@inboxkey/extraction-core'
import { db } from '../lib/storage/schema'

export interface PreTagProgress {
  current: number
  total: number
  status: string
}

export type ProgressCallback = (progress: PreTagProgress) => void

/**
 * Pre-tag batch of messages using extraction-core
 */
export async function preTagBatch(
  batchId?: string,
  onProgress?: ProgressCallback
): Promise<void> {
  try {
    // Get all messages from database
    const messages = await db.messages.toArray()

    console.log(`Starting pre-tagging for ${messages.length} messages`)

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]

      try {
        // Report progress
        if (onProgress) {
          onProgress({
            current: i + 1,
            total: messages.length,
            status: `Processing ${i + 1}/${messages.length}`,
          })
        }

        // Run extraction
        const result = extractFromEmail({
          subject: msg.subject,
          text: msg.bodyText || '',
          html: msg.bodyHtml,
        })

        // Determine preTag based on extraction results
        let preTag: 'OTP' | 'MAGIC_LINK' | 'NONE' = 'NONE'
        let candidates: any[] = []
        let topScore = 0

        // Check for OTP codes first (higher priority)
        if (result.otps && result.otps.length > 0) {
          preTag = 'OTP'
          candidates = result.otps.map((otp: any) => ({
            type: 'OTP' as const,
            value: otp.code || otp.value || '',
            score: otp.confidence !== undefined ? otp.confidence : (otp.score || 0),
            ...otp,
          }))
          topScore = candidates[0]?.score || 0
        }
        // Check for magic links
        else if (result.links && result.links.length > 0) {
          preTag = 'MAGIC_LINK'
          candidates = result.links.map((link: any) => ({
            type: 'MAGIC_LINK' as const,
            value: link.url || link.value || '',
            score: link.confidence !== undefined ? link.confidence : (link.score || 0),
            ...link,
          }))
          topScore = candidates[0]?.score || 0
        }

        // Store preTag in database
        await db.preTags.put({
          msgIdHash: msg.msgIdHash,
          preTag,
          candidates,
          topScore,
          createdAt: Date.now(),
        })

        console.log(`Pre-tagged ${msg.msgIdHash}: ${preTag} (score: ${topScore})`)

      } catch (error) {
        console.error(`Error pre-tagging message ${msg.msgIdHash}:`, error)
        // Continue with next message
      }
    }

    console.log(`Pre-tagged ${messages.length} messages`)

    if (onProgress) {
      onProgress({
        current: messages.length,
        total: messages.length,
        status: 'Complete',
      })
    }

  } catch (error) {
    console.error('Pre-tagging batch error:', error)
    throw error
  }
}

/**
 * Get pre-tagging statistics
 */
export async function getPreTagStats() {
  const totalMessages = await db.messages.count()
  const totalPreTags = await db.preTags.count()

  const preTags = await db.preTags.toArray()

  const stats = {
    total: totalMessages,
    preTagged: totalPreTags,
    byType: {
      OTP: preTags.filter(pt => pt.preTag === 'OTP').length,
      MAGIC_LINK: preTags.filter(pt => pt.preTag === 'MAGIC_LINK').length,
      NONE: preTags.filter(pt => pt.preTag === 'NONE').length,
    },
  }

  return stats
}
