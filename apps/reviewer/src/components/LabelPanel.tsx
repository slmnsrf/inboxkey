import React, { useState, useEffect } from 'react'
import { db, PreTag, Label } from '../lib/storage/schema'

interface Props {
  msgId: string | null
  preTag?: PreTag
  onLabeled: () => void
}

const REASON_CHIPS = [
  'BACKUP_CODES_LIST',
  'NEWSLETTER',
  'PASSWORD_RESET',
  'ORDER_ID',
  'PHONE_NUMBER',
  'DATE_TIME',
  'IMAGE_ONLY',
  'LANGUAGE_MISMATCH',
  'URL_PARAM',
  'GROUPED_DIGITS',
  'ALNUM_FORMAT',
  'MULTIPLE_CANDIDATES',
  'OTHER',
]

export default function LabelPanel({ msgId, preTag, onLabeled }: Props) {
  const [selectedCandidateIndex, setSelectedCandidateIndex] = useState(0)
  const [falseReason, setFalseReason] = useState<'NOT_OTP' | 'WRONG_VALUE'>('NOT_OTP')
  const [correctValue, setCorrectValue] = useState('')
  const [selectedReasons, setSelectedReasons] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [showFalseOptions, setShowFalseOptions] = useState(false)
  const [showMissedInput, setShowMissedInput] = useState(false)

  useEffect(() => {
    // Load existing label if any
    if (msgId) {
      db.labels.get(msgId).then(label => {
        if (label) {
          setSelectedReasons(label.reasons)
          setNote(label.note || '')
          if (label.falseReason) setFalseReason(label.falseReason)
          if (label.correctValue) setCorrectValue(label.correctValue)
        } else {
          // Reset for new message
          setSelectedReasons([])
          setNote('')
          setCorrectValue('')
        }
      })
    }
    setShowFalseOptions(false)
    setShowMissedInput(false)
  }, [msgId])

  if (!msgId) {
    return <div className="label-panel empty">Select an email to label</div>
  }

  const handleLabel = async (labelType: 'TRUE' | 'FALSE' | 'MISSED') => {
    const label: Label = {
      msgIdHash: msgId,
      label: labelType,
      selectedCandidateIndex,
      reasons: selectedReasons,
      note,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    if (labelType === 'FALSE') {
      label.falseReason = falseReason
      if (falseReason === 'WRONG_VALUE') {
        label.correctValue = correctValue
      }
    }

    if (labelType === 'MISSED') {
      label.correctValue = correctValue
    }

    await db.labels.put(label)
    onLabeled()
  }

  const toggleReason = (reason: string) => {
    setSelectedReasons(prev =>
      prev.includes(reason) ? prev.filter(r => r !== reason) : [...prev, reason]
    )
  }

  return (
    <div className="label-panel">
      <h3>Label This Email</h3>

      {preTag?.candidates && preTag.candidates.length > 1 && (
        <div className="candidate-picker">
          <strong>Select candidate:</strong>
          {preTag.candidates.map((cand, idx) => (
            <label key={idx}>
              <input
                type="radio"
                checked={selectedCandidateIndex === idx}
                onChange={() => setSelectedCandidateIndex(idx)}
              />
              {cand.type}: {cand.value} ({(cand.score * 100).toFixed(0)}%)
            </label>
          ))}
        </div>
      )}

      <div className="label-buttons">
        <button className="btn btn-true" onClick={() => handleLabel('TRUE')}>
          ✓ TRUE (Accept)
        </button>
        <button
          className="btn btn-false"
          onClick={() => {
            setShowFalseOptions(!showFalseOptions)
            setShowMissedInput(false)
          }}
        >
          ✗ FALSE (Wrong)
        </button>
        <button
          className="btn btn-missed"
          onClick={() => {
            setShowMissedInput(!showMissedInput)
            setShowFalseOptions(false)
          }}
        >
          ⚠ MISSED (Not Tagged)
        </button>
      </div>

      {showFalseOptions && (
        <div className="false-options">
          <select value={falseReason} onChange={(e) => setFalseReason(e.target.value as any)}>
            <option value="NOT_OTP">False Positive (Not OTP/Magic)</option>
            <option value="WRONG_VALUE">OTP/Magic wrong value</option>
          </select>
          {falseReason === 'WRONG_VALUE' && (
            <input
              type="text"
              placeholder="Enter correct code or link"
              value={correctValue}
              onChange={(e) => setCorrectValue(e.target.value)}
            />
          )}
          <button onClick={() => handleLabel('FALSE')}>Submit FALSE</button>
        </div>
      )}

      {showMissedInput && (
        <div className="missed-input">
          <input
            type="text"
            placeholder="Enter correct code or link that was missed"
            value={correctValue}
            onChange={(e) => setCorrectValue(e.target.value)}
          />
          <button onClick={() => handleLabel('MISSED')}>Submit MISSED</button>
        </div>
      )}

      <div className="reason-chips">
        <strong>Reasons (optional):</strong>
        <div className="chips">
          {REASON_CHIPS.map(reason => (
            <button
              key={reason}
              className={`chip ${selectedReasons.includes(reason) ? 'selected' : ''}`}
              onClick={() => toggleReason(reason)}
            >
              {reason}
            </button>
          ))}
        </div>
      </div>

      <div className="note-input">
        <label><strong>Note (optional):</strong></label>
        <input
          type="text"
          placeholder="e.g., Ticket ID looked like a code"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
    </div>
  )
}
