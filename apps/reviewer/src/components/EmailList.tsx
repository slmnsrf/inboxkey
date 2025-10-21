import React from 'react'
import { Message, PreTag, Label } from '../lib/storage/schema'

interface Props {
  messages: Message[]
  preTags: Map<string, PreTag>
  labels: Map<string, Label>
  selectedId: string | null
  onSelect: (id: string) => void
}

export default function EmailList({ messages, preTags, labels, selectedId, onSelect }: Props) {
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
            >
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
