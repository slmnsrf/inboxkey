/**
 * Testing Tab - Batch Fetching and Pre-Tagging
 * Day 3 Implementation
 */

import React, { useState, useEffect } from 'react'
import { BatchFetcher } from '../lib/batch/fetcher'
import { db, Message, PreTag } from '../lib/storage/schema'
import { exportLabelsToJSONL } from '../lib/export/jsonl'
import { getAllAccounts } from '../lib/providers/token-storage'
import EmailList from './EmailList'
import Preview from './Preview'
import LabelPanel from './LabelPanel'

export default function TestingTab() {
  // Filter state
  const [from, setFrom] = useState('')
  const [contains, setContains] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [batchSize, setBatchSize] = useState(50)
  const [provider, setProvider] = useState<'gmail' | 'outlook'>('gmail')

  // Status state
  const [status, setStatus] = useState('Ready')
  const [messageCount, setMessageCount] = useState(0)
  const [preTaggedCount, setPreTaggedCount] = useState(0)
  const [loading, setLoading] = useState(false)

  // Statistics
  const [stats, setStats] = useState<{
    OTP: number
    MAGIC_LINK: number
    NONE: number
  }>({
    OTP: 0,
    MAGIC_LINK: 0,
    NONE: 0,
  })

  // Review state
  const [selectedMsgId, setSelectedMsgId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [preTags, setPreTags] = useState<Map<string, PreTag>>(new Map())
  const [labels, setLabels] = useState<Map<string, any>>(new Map())

  /**
   * Load counts and stats from database
   */
  const loadStats = async () => {
    try {
      const msgCount = await db.messages.count()
      const preTagCount = await db.preTags.count()

      setMessageCount(msgCount)
      setPreTaggedCount(preTagCount)

      // Get breakdown by type
      const preTagsArray = await db.preTags.toArray()
      const breakdown = {
        OTP: preTagsArray.filter(pt => pt.preTag === 'OTP').length,
        MAGIC_LINK: preTagsArray.filter(pt => pt.preTag === 'MAGIC_LINK').length,
        NONE: preTagsArray.filter(pt => pt.preTag === 'NONE').length,
      }

      setStats(breakdown)
    } catch (error) {
      console.error('Error loading stats:', error)
    }
  }

  /**
   * Load messages for review area
   */
  const loadMessages = async () => {
    try {
      const msgs = await db.messages.toArray()
      const tags = await db.preTags.toArray()
      const lbls = await db.labels.toArray()
      setMessages(msgs)
      setPreTags(new Map(tags.map(t => [t.msgIdHash, t])))
      setLabels(new Map(lbls.map(l => [l.msgIdHash, l])))
    } catch (error) {
      console.error('Error loading messages:', error)
    }
  }

  /**
   * Prepare batch - fetch messages from provider
   */
  const handlePrepareBatch = async () => {
    setLoading(true)
    setStatus('Clearing previous batch...')

    try {
      // Clear database before fetching new batch
      await db.messages.clear()
      await db.labels.clear()
      await db.preTags.clear()

      setStatus('Fetching messages...')

      // Get all accounts from storage
      const accounts = await getAllAccounts()

      const account = accounts.find((acc) => acc.provider === provider)

      if (!account || !account.tokens.access_token) {
        setStatus(`Error: No ${provider} account connected. Please connect in ACCOUNTS tab.`)
        setLoading(false)
        return
      }

      // Prepare filters
      const filters = {
        provider,
        from: from || undefined,
        contains: contains || undefined,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        maxResults: batchSize,
      }

      // Fetch messages
      const fetcher = new BatchFetcher()

      let messages
      if (provider === 'gmail') {
        messages = await fetcher.fetchGmail(account.tokens.access_token, filters)
      } else {
        messages = await fetcher.fetchOutlook(account.tokens.access_token, filters)
      }

      const count = await db.messages.count()
      setMessageCount(count)
      setStatus(`Prepared ${messages.length} messages (${count} total in database)`)

      await loadStats()
      await loadMessages()

    } catch (error: any) {
      console.error('Prepare batch error:', error)
      setStatus(`Error: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  /**
   * Run pre-tagging on fetched messages
   */
  const handlePreTag = async () => {
    setLoading(true)
    setStatus('Pre-tagging messages...')

    try {
      // Send message to background script
      const response = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        chrome.runtime.sendMessage({ action: 'PRE_TAG_BATCH' }, resolve)
      })

      if (response.success) {
        setStatus('Pre-tagging complete')
        await loadStats()
        await loadMessages()
      } else {
        setStatus(`Error: ${response.error || 'Unknown error'}`)
      }

    } catch (error: any) {
      console.error('Pre-tag error:', error)
      setStatus(`Error: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  /**
   * Export JSONL
   */
  const handleExport = async () => {
    setStatus('Exporting JSONL...')
    try {
      await exportLabelsToJSONL()
      setStatus('Export complete! Check your Downloads folder.')
    } catch (error: any) {
      console.error('Export failed:', error)
      setStatus(`Export failed: ${error.message}`)
    }
  }

  /**
   * Clear database
   */
  const handleClearData = async () => {
    if (!confirm('Clear all messages, labels, and pre-tags? This cannot be undone.')) {
      return
    }

    setLoading(true)
    setStatus('Clearing data...')

    try {
      await db.messages.clear()
      await db.labels.clear()
      await db.preTags.clear()

      setMessageCount(0)
      setPreTaggedCount(0)
      setStats({ OTP: 0, MAGIC_LINK: 0, NONE: 0 })
      setMessages([])
      setPreTags(new Map())
      setSelectedMsgId(null)
      setStatus('Data cleared')

    } catch (error: any) {
      console.error('Clear data error:', error)
      setStatus(`Error: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  // Load stats and messages on mount
  useEffect(() => {
    loadStats()
    loadMessages()
  }, [])

  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Testing & Batch Processing</h1>

      {/* Filters Section */}
      <section style={{ marginBottom: '30px', border: '1px solid #ddd', padding: '15px', borderRadius: '8px' }}>
        <h2 style={{ marginTop: 0 }}>Filters</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div>
            <label style={{ display: 'inline-block', width: '150px', fontWeight: 'bold' }}>
              Provider:
            </label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as 'gmail' | 'outlook')}
              style={{ padding: '5px', width: '200px' }}
            >
              <option value="gmail">Gmail</option>
              <option value="outlook">Outlook</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'inline-block', width: '150px', fontWeight: 'bold' }}>
              From (domain/email):
            </label>
            <input
              type="text"
              placeholder="e.g., google.com or noreply@example.com"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              style={{ padding: '5px', width: '300px' }}
            />
          </div>

          <div>
            <label style={{ display: 'inline-block', width: '150px', fontWeight: 'bold' }}>
              Subject/Body contains:
            </label>
            <input
              type="text"
              placeholder="e.g., verification code"
              value={contains}
              onChange={(e) => setContains(e.target.value)}
              style={{ padding: '5px', width: '300px' }}
            />
          </div>

          <div>
            <label style={{ display: 'inline-block', width: '150px', fontWeight: 'bold' }}>
              Start Date:
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ padding: '5px', width: '200px' }}
            />
          </div>

          <div>
            <label style={{ display: 'inline-block', width: '150px', fontWeight: 'bold' }}>
              End Date:
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{ padding: '5px', width: '200px' }}
            />
          </div>

          <div>
            <label style={{ display: 'inline-block', width: '150px', fontWeight: 'bold' }}>
              Batch Size:
            </label>
            <select
              value={batchSize}
              onChange={(e) => setBatchSize(Number(e.target.value))}
              style={{ padding: '5px', width: '200px' }}
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value={300}>300</option>
              <option value={500}>500</option>
            </select>
          </div>
        </div>
      </section>

      {/* Controls Section */}
      <section style={{ marginBottom: '30px', border: '1px solid #ddd', padding: '15px', borderRadius: '8px' }}>
        <h2 style={{ marginTop: 0 }}>Controls</h2>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={handlePrepareBatch}
            disabled={loading}
            style={{
              padding: '10px 20px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            Prepare Batch
          </button>

          <button
            onClick={handlePreTag}
            disabled={messageCount === 0 || loading}
            style={{
              padding: '10px 20px',
              backgroundColor: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: (messageCount === 0 || loading) ? 'not-allowed' : 'pointer',
              opacity: (messageCount === 0 || loading) ? 0.6 : 1,
            }}
          >
            Run Pre-Tag
          </button>

          <button
            onClick={handleExport}
            disabled={preTaggedCount === 0 || loading}
            style={{
              padding: '10px 20px',
              backgroundColor: '#17a2b8',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: (preTaggedCount === 0 || loading) ? 'not-allowed' : 'pointer',
              opacity: (preTaggedCount === 0 || loading) ? 0.6 : 1,
            }}
          >
            Export JSONL
          </button>

          <button
            onClick={handleClearData}
            disabled={loading}
            style={{
              padding: '10px 20px',
              backgroundColor: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            Clear Data
          </button>
        </div>
      </section>

      {/* Status Section */}
      <section style={{ marginBottom: '30px', border: '1px solid #ddd', padding: '15px', borderRadius: '8px', backgroundColor: '#f8f9fa' }}>
        <h2 style={{ marginTop: 0 }}>Status</h2>

        <p style={{ fontSize: '16px', marginBottom: '10px' }}>
          <strong>Current Status:</strong> {status}
        </p>

        <p style={{ fontSize: '16px', marginBottom: '10px' }}>
          <strong>Messages in Database:</strong> {messageCount}
        </p>

        <p style={{ fontSize: '16px', marginBottom: '10px' }}>
          <strong>Pre-tagged:</strong> {preTaggedCount} / {messageCount}
          {messageCount > 0 && ` (${Math.round((preTaggedCount / messageCount) * 100)}%)`}
        </p>

        {preTaggedCount > 0 && (
          <div style={{ marginTop: '15px' }}>
            <strong>Pre-tag Breakdown:</strong>
            <ul style={{ marginTop: '5px' }}>
              <li>OTP: {stats.OTP}</li>
              <li>Magic Link: {stats.MAGIC_LINK}</li>
              <li>None: {stats.NONE}</li>
            </ul>
          </div>
        )}
      </section>

      {/* Review Area Section */}
      {messages.length > 0 && (
        <section className="review-area">
          <EmailList
            messages={messages}
            preTags={preTags}
            labels={labels}
            selectedId={selectedMsgId}
            onSelect={setSelectedMsgId}
          />
          <div className="preview-and-label">
            <Preview
              msgId={selectedMsgId}
              message={messages.find(m => m.msgIdHash === selectedMsgId)}
              preTag={preTags.get(selectedMsgId || '')}
            />
            <LabelPanel
              msgId={selectedMsgId}
              preTag={preTags.get(selectedMsgId || '')}
              onLabeled={async () => {
                // Reload labels to show the new one
                await loadMessages()

                // Auto-advance to next message
                const currentIndex = messages.findIndex(m => m.msgIdHash === selectedMsgId)
                if (currentIndex < messages.length - 1) {
                  setSelectedMsgId(messages[currentIndex + 1].msgIdHash)
                }
              }}
            />
          </div>
        </section>
      )}

      <style>{`
        .review-area { display: grid; grid-template-columns: 320px 1fr; gap: 16px; margin-top: 20px; }
        .email-list { border: 1px solid #ccc; border-radius: 8px; padding: 12px; max-height: 600px; overflow-y: auto; }
        .email-item { padding: 10px; border-bottom: 1px solid #eee; cursor: pointer; }
        .email-item:hover { background: #f5f5f5; }
        .email-item.selected { background: #e3f2fd; border-left: 3px solid #1976d2; }
        .subject { font-weight: 600; margin-bottom: 4px; }
        .meta { font-size: 12px; color: #666; display: flex; gap: 12px; }
        .tags { display: flex; gap: 8px; margin-top: 6px; }
        .tag { padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
        .tag-otp { background: #e1f5fe; color: #01579b; }
        .tag-magic_link { background: #e8f5e9; color: #1b5e20; }
        .tag-none { background: #f5f5f5; color: #666; }
        .tag-label-true { background: #4caf50; color: white; }
        .tag-label-false { background: #f44336; color: white; }
        .tag-label-missed { background: #ff9800; color: white; }
        .score { font-family: monospace; font-size: 12px; color: #666; }
        .preview-and-label { display: flex; flex-direction: column; gap: 16px; }

        .preview-panel { border: 1px solid #ccc; border-radius: 8px; padding: 16px; }
        .preview-panel.empty { padding: 40px; text-align: center; color: #999; }
        .preview-header { margin-bottom: 12px; font-size: 14px; }
        .preview-header > div { margin-bottom: 4px; }
        .preview-stats { display: flex; gap: 16px; font-size: 13px; margin-bottom: 12px; padding: 8px; background: #f5f5f5; border-radius: 4px; }
        .preview-body { border: 1px solid #eee; padding: 12px; border-radius: 4px; max-height: 300px; overflow-y: auto; font-size: 14px; line-height: 1.6; white-space: pre-wrap; }
        .preview-body mark { background: #ffeb3b; padding: 2px 4px; border-radius: 2px; font-weight: 600; }
        .preview-body pre { white-space: pre-wrap; word-break: break-word; font-size: 12px; }
        .candidates-list { margin-top: 12px; padding: 12px; background: #f9f9f9; border-radius: 4px; }
        .candidate-item { display: flex; gap: 12px; padding: 6px; border-bottom: 1px solid #eee; }
        .cand-type { font-weight: 600; color: #1976d2; }
        .cand-value { font-family: monospace; flex: 1; }
        .cand-score { color: #666; font-size: 13px; }

        .label-panel { border: 1px solid #ccc; border-radius: 8px; padding: 16px; }
        .label-panel.empty { padding: 40px; text-align: center; color: #999; }
        .candidate-picker { margin-bottom: 16px; padding: 12px; background: #f9f9f9; border-radius: 4px; }
        .candidate-picker label { display: block; margin-top: 8px; cursor: pointer; }
        .label-buttons { display: flex; gap: 12px; margin: 16px 0; }
        .btn { padding: 12px 20px; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 14px; }
        .btn-true { background: #4caf50; color: white; }
        .btn-false { background: #f44336; color: white; }
        .btn-missed { background: #ff9800; color: white; }
        .btn:hover { opacity: 0.9; }
        .false-options, .missed-input { margin: 12px 0; padding: 12px; background: #fff3e0; border-radius: 4px; }
        .false-options select, .false-options input, .missed-input input { width: 100%; padding: 8px; margin-bottom: 8px; }
        .false-options button, .missed-input button { padding: 8px 16px; background: #1976d2; color: white; border: none; border-radius: 4px; cursor: pointer; }
        .reason-chips { margin: 16px 0; }
        .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
        .chip { padding: 6px 12px; border: 1px solid #ccc; border-radius: 16px; background: white; cursor: pointer; font-size: 12px; }
        .chip.selected { background: #1976d2; color: white; border-color: #1976d2; }
        .note-input { margin-top: 16px; }
        .note-input input { width: 100%; padding: 8px; margin-top: 4px; }
      `}</style>
    </div>
  )
}
