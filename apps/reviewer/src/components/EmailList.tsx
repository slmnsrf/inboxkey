import React from 'react'
import { Message, PreTag, Label, db } from '../lib/storage/schema'

interface Props {
  messages: Message[]
  preTags: Map<string, PreTag>
  labels: Map<string, Label>
  selectedId: string | null
  onSelect: (id: string) => void
  onRemove: () => void
}

export default function EmailList({ messages, preTags, labels, selectedId, onSelect, onRemove }: Props) {
  const handleRemove = async (msgId: string, e: React.MouseEvent) => {
    e.stopPropagation() // Prevent selecting the email

    try {
      // Remove from database
      await db.messages.delete(msgId)
      await db.preTags.delete(msgId)
      await db.labels.delete(msgId)

      // Refresh the list
      onRemove()
    } catch (error) {
      console.error('Failed to remove email:', error)
    }
  }
  return (
    <div className="email-list">
      <h3>Review Queue ({messages.length} messages)</h3>
      <div className="list-items">
        {messages.map(msg => {
          const preTag = preTags.get(msg.msgIdHash)
          const label = labels.get(msg.msgIdHash)
          return (
            <div
              key={msg.msgIdHash}
              className={`email-item ${selectedId === msg.msgIdHash ? 'selected' : ''}`}
              onClick={() => onSelect(msg.msgIdHash)}
              style={{ position: 'relative' }}
            >
              <button
                className="remove-btn"
                onClick={(e) => handleRemove(msg.msgIdHash, e)}
                title="Remove this email from batch"
              >
                ✕
              </button>
              <div className="subject">{msg.subject}</div>
              <div className="meta">
                <span>{msg.from}</span>
                <span>{new Date(msg.receivedAt).toLocaleString()}</span>
              </div>
              <div className="tags">
                <span className={`tag tag-${preTag?.preTag.toLowerCase()}`}>
                  {preTag?.preTag || 'NONE'}
                </span>
                {label && (
                  <span className={`tag tag-label-${label.label.toLowerCase()}`}>
                    ✓ {label.label}
                  </span>
                )}
                <span className="score">
                  {preTag?.topScore?.toFixed(2) || '—'}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
