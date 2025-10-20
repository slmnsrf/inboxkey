/**
 * JSONL Exporter - Day 5
 * Exports labeled email data for algorithm analysis
 */

import { db } from '../storage/schema'

export async function exportLabelsToJSONL(): Promise<void> {
  const messages = await db.messages.toArray()
  const preTags = await db.preTags.toArray()
  const labels = await db.labels.toArray()

  // Create maps for quick lookup
  const preTagMap = new Map(preTags.map(pt => [pt.msgIdHash, pt]))
  const labelMap = new Map(labels.map(l => [l.msgIdHash, l]))

  // Build JSONL lines
  const lines: string[] = []

  for (const msg of messages) {
    const preTag = preTagMap.get(msg.msgIdHash)
    const label = labelMap.get(msg.msgIdHash)

    // Default to TRUE if no label (user didn't touch it)
    const finalLabel = label?.label || 'TRUE'

    const jsonObj = {
      msgIdHash: msg.msgIdHash,
      provider: msg.provider,
      senderETLD: msg.senderETLD,
      receivedAt: msg.receivedAt,
      subject: msg.subject,
      preTag: preTag?.preTag || 'NONE',
      candidates: preTag?.candidates || [],
      label: finalLabel,
      falseReason: label?.falseReason,
      correctValue: label?.correctValue,
      reasons: label?.reasons || [],
      note: label?.note || '',
    }

    lines.push(JSON.stringify(jsonObj))
  }

  // Create JSONL blob
  const jsonlContent = lines.join('\n')
  const blob = new Blob([jsonlContent], { type: 'application/jsonl' })

  // Download via chrome.downloads API
  const url = URL.createObjectURL(blob)
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
  const filename = `inboxkey-labels-${timestamp}.jsonl`

  chrome.downloads.download({
    url,
    filename,
    saveAs: true,
  }, (downloadId) => {
    console.log(`Export started: ${filename} (ID: ${downloadId})`)
    URL.revokeObjectURL(url)
  })
}
