import React, { useState } from 'react'
import { Message, PreTag } from '../lib/storage/schema'

interface Props {
  msgId: string | null
  message?: Message
  preTag?: PreTag
}

export default function Preview({ msgId, message, preTag }: Props) {
  const [viewHtml, setViewHtml] = useState(false)

  if (!message) {
    return <div className="preview-panel empty">Select an email to preview</div>
  }

  // Sanitize and highlight candidates
  let displayText = message.bodyText || ''
  if (preTag?.candidates) {
    preTag.candidates.forEach(cand => {
      const value = cand.value
      // Simple highlight (wrap in <mark>)
      displayText = displayText.replace(
        new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
        `<mark>${value}</mark>`
      )
    })
  }

  return (
    <div className="preview-panel">
      <div className="preview-header">
        <div>
          <strong>From:</strong> {message.from}
        </div>
        <div>
          <strong>Subject:</strong> {message.subject}
        </div>
        <div>
          <strong>Received:</strong> {new Date(message.receivedAt).toLocaleString()}
        </div>
        <label>
          <input type="checkbox" checked={viewHtml} onChange={(e) => setViewHtml(e.target.checked)} />
          View HTML source
        </label>
      </div>
      <div className="preview-stats">
        <span><strong>Pre-Tag:</strong> {preTag?.preTag || 'NONE'}</span>
        <span><strong>Top Score:</strong> {preTag?.topScore?.toFixed(2) || '—'}</span>
        <span><strong>Candidates:</strong> {preTag?.candidates?.length || 0}</span>
      </div>
      <div className="preview-body">
        {viewHtml ? (
          <pre>{message.bodyHtml || 'No HTML'}</pre>
        ) : (
          <div dangerouslySetInnerHTML={{ __html: displayText }} />
        )}
      </div>
      {preTag?.candidates && preTag.candidates.length > 0 && (
        <div className="candidates-list">
          <strong>Candidates:</strong>
          {preTag.candidates.map((cand, idx) => (
            <div key={idx} className="candidate-item">
              <span className="cand-type">{cand.type}</span>
              <span className="cand-value">{cand.value}</span>
              <span className="cand-score">{(cand.score * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
