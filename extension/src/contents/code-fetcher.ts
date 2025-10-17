/**
 * Code Fetcher Module
 * Handles code retrieval and matching from background worker
 */

import type { StoredCode } from '@/lib/storage/schema'
import { findBestMatchingCode } from '@/lib/matching/code-matcher'

/**
 * Fetch codes from background worker
 */
export async function fetchCodesFromBackground(
  url: string,
  pollNumber: number
): Promise<StoredCode[]> {
  const requestTime = Date.now()

  console.log(`[CodeFetcher] Fetching codes for poll #${pollNumber}`)
  console.log(`[CodeFetcher] URL: ${url}`)
  console.log(`[CodeFetcher] Request timestamp: ${requestTime}`)

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'FETCH_CODE',
      url: url,
      timestamp: requestTime,
      pollNumber: pollNumber,
    })

    const responseTime = Date.now()
    const latency = responseTime - requestTime

    console.log(`[CodeFetcher] Response received for poll #${pollNumber}`)
    console.log(`[CodeFetcher] Latency: ${latency}ms`)

    if (response.error) {
      console.error(`[CodeFetcher] Error from background:`, response.error)
      return []
    }

    if (!response.codes || !Array.isArray(response.codes)) {
      console.log(`[CodeFetcher] No codes available`)
      return []
    }

    console.log(`[CodeFetcher] Retrieved ${response.codes.length} codes`)
    return response.codes
  } catch (error) {
    console.error(`[CodeFetcher] Failed to fetch codes:`, error)
    throw error
  }
}

export async function fetchBestCode(
  url: string,
  pollNumber: number
): Promise<string | null> {
  const codes = await fetchCodesFromBackground(url, pollNumber)

  if (codes.length === 0) {
    return null
  }

  const bestCode = findBestMatchingCode(codes, url, Date.now())
  if (!bestCode) {
    console.log('[CodeFetcher] No code meets minimum score threshold')
    return null
  }

  console.log('[CodeFetcher] Best match selected from recent codes')
  return bestCode.code
}
