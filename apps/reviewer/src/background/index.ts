/**
 * Background Service Worker for InboxKey Reviewer
 * Day 3: Pre-tagging batch processing
 */

import { preTagBatch, getPreTagStats } from './pre-tagger'

console.log('InboxKey Reviewer background worker initialized')

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Reviewer extension installed')
    // Open settings page on install (ACCOUNTS tab)
    chrome.tabs.create({ url: chrome.runtime.getURL('options.html#accounts') })
  } else if (details.reason === 'update') {
    console.log('Reviewer extension updated')
  }
})

// Handle extension icon click - open ACCOUNTS tab
chrome.action.onClicked.addListener(() => {
  console.log('Extension icon clicked - opening ACCOUNTS tab')
  chrome.tabs.create({ url: chrome.runtime.getURL('options.html#accounts') })
})

// Message handler for batch processing
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message.action)

  if (message.action === 'PRE_TAG_BATCH') {
    // Run pre-tagging in background
    preTagBatch(message.batchId, (progress) => {
      // Send progress updates if needed
      console.log('Pre-tag progress:', progress)
    })
      .then(() => {
        sendResponse({ success: true })
      })
      .catch((error) => {
        console.error('Pre-tag batch error:', error)
        sendResponse({ success: false, error: error.message })
      })

    // Return true to indicate async response
    return true
  }

  if (message.action === 'GET_PRETAG_STATS') {
    getPreTagStats()
      .then((stats) => {
        sendResponse({ success: true, stats })
      })
      .catch((error) => {
        console.error('Get stats error:', error)
        sendResponse({ success: false, error: error.message })
      })

    return true
  }

  // Unknown action
  sendResponse({ success: false, error: 'Unknown action' })
  return false
})
