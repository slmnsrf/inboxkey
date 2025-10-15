/**
 * JSONL Exporter - Day 5
 * Exports labeled email data for algorithm analysis
 */

import { db } from '../storage/schema'
import { extractETLD } from '../utils/text'

async function buildExportData() {
  const messages = await db.messages.toArray()
  const preTags = await db.preTags.toArray()
  const labels = await db.labels.toArray()

  // Create maps for quick lookup
  const preTagMap = new Map(preTags.map(pt => [pt.msgIdHash, pt]))
  const labelMap = new Map(labels.map(l => [l.msgIdHash, l]))

  // Build data objects
  const data = []
  const validationIssues: string[] = []

  for (const msg of messages) {
    const preTag = preTagMap.get(msg.msgIdHash)
    const label = labelMap.get(msg.msgIdHash)

    const preTagType = preTag?.preTag || 'NONE'
    const labelType = label?.label

    // Validate: Check for semantically invalid combinations
    if ((preTagType === 'OTP' || preTagType === 'MAGIC_LINK') && labelType === 'MISSED') {
      // Invalid: Algorithm detected something but label says MISSED
      validationIssues.push(`Skipped ${msg.msgIdHash}: ${preTagType} + MISSED is invalid (contradictory)`)
      continue
    }

    if (preTagType === 'NONE' && labelType === 'FALSE') {
      // Invalid: Algorithm said NONE but label says FALSE (redundant)
      validationIssues.push(`Skipped ${msg.msgIdHash}: NONE + FALSE is invalid (redundant)`)
      continue
    }

    // Filter: Only export OTP, MAGIC_LINK, or MISSED emails
    // Skip NONE emails unless labeled as MISSED (false negative)
    if (preTagType === 'NONE' && labelType !== 'MISSED') {
      continue
    }

    // Fix senderETLD on export (clean old buggy data with trailing >)
    const cleanSenderETLD = extractETLD(msg.from || '')

    // Determine selectedCandidateIndex and correctValue
    let selectedCandidateIndex: number | null = null
    let correctValue: string | null = label?.correctValue || null

    if (label?.label === 'TRUE') {
      // TRUE: top candidate was correct
      selectedCandidateIndex = 0
    } else if (label?.label === 'FALSE' && label?.falseReason === 'WRONG_VALUE') {
      // FALSE with WRONG_VALUE: populate correctValue if missing
      if (!correctValue && typeof label.selectedCandidateIndex === 'number' && preTag?.candidates) {
        const selectedCandidate = preTag.candidates[label.selectedCandidateIndex]
        if (selectedCandidate) {
          // Extract value from selected candidate
          correctValue = selectedCandidate.type === 'MAGIC_LINK'
            ? (selectedCandidate.href || selectedCandidate.value || '')
            : (selectedCandidate.value || '')
        }
      }
      selectedCandidateIndex = label.selectedCandidateIndex
    }
    // Otherwise null: FALSE > NOT_OTP, MISSED, or unlabeled

    const jsonObj = {
      msgIdHash: msg.msgIdHash,
      provider: msg.provider,
      from: msg.from,
      senderETLD: cleanSenderETLD,  // ✅ Fixed: clean senderETLD
      subject: msg.subject,
      receivedAt: msg.receivedAt,
      bodyText: msg.bodyText || '',

      // Pre-tagging results
      preTag: preTagType,
      candidates: preTag?.candidates || [],
      topScore: preTag?.topScore || 0,

      // Human label
      label: label?.label || 'TRUE',
      explicitlyLabeled: !!label,
      selectedCandidateIndex,
      falseReason: label?.falseReason || null,
      correctValue,  // ✅ Fixed: populate from selected candidate if missing
      note: label?.note || '',
    }

    data.push(jsonObj)
  }

  return { data, validationIssues }
}

export async function exportLabelsToJSONL(): Promise<void> {
  const { data, validationIssues } = await buildExportData()

  // Log validation issues
  if (validationIssues.length > 0) {
    console.warn(`⚠️  Export validation found ${validationIssues.length} invalid record(s):`)
    validationIssues.forEach(issue => console.warn(`  - ${issue}`))
  }

  // Create JSONL (one line per record)
  const lines = data.map(obj => JSON.stringify(obj))
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
    console.log(`✅ Export started: ${filename} (ID: ${downloadId})`)
    console.log(`   Exported ${data.length} valid records`)
    if (validationIssues.length > 0) {
      console.log(`   Skipped ${validationIssues.length} invalid records (see warnings above)`)
    }
    URL.revokeObjectURL(url)
  })
}

export async function exportLabelsToPrettyJSON(): Promise<void> {
  const { data, validationIssues } = await buildExportData()

  // Log validation issues
  if (validationIssues.length > 0) {
    console.warn(`⚠️  Export validation found ${validationIssues.length} invalid record(s):`)
    validationIssues.forEach(issue => console.warn(`  - ${issue}`))
  }

  // Create pretty-printed JSON
  const jsonContent = JSON.stringify(data, null, 2)
  const blob = new Blob([jsonContent], { type: 'application/json' })

  // Download via chrome.downloads API
  const url = URL.createObjectURL(blob)
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
  const filename = `inboxkey-labels-${timestamp}.json`

  chrome.downloads.download({
    url,
    filename,
    saveAs: true,
  }, (downloadId) => {
    console.log(`✅ Export started: ${filename} (ID: ${downloadId})`)
    console.log(`   Exported ${data.length} valid records`)
    if (validationIssues.length > 0) {
      console.log(`   Skipped ${validationIssues.length} invalid records (see warnings above)`)
    }
    URL.revokeObjectURL(url)
  })
}
