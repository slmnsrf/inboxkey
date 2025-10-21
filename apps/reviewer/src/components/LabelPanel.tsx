import React, { useState, useEffect } from 'react'
import { db, PreTag, Label } from '../lib/storage/schema'

interface Props {
  msgId: string | null
  preTag?: PreTag
  onLabeled: () => void
}

export default function LabelPanel({ msgId, preTag, onLabeled }: Props) {
  const [selectedCandidateIndex, setSelectedCandidateIndex] = useState(0)
  const [falseReason, setFalseReason] = useState<'NOT_OTP' | 'WRONG_VALUE'>('NOT_OTP')
  const [correctValue, setCorrectValue] = useState('')
  const [note, setNote] = useState('')
  const [showFalseOptions, setShowFalseOptions] = useState(false)
  const [showMissedInput, setShowMissedInput] = useState(false)
  const [isOtherCandidate, setIsOtherCandidate] = useState(false)

  useEffect(() => {
    // Load existing label if any
    if (msgId) {
      db.labels.get(msgId).then(label => {
        if (label) {
          setNote(label.note || '')
          if (label.falseReason) setFalseReason(label.falseReason)
          if (label.correctValue) setCorrectValue(label.correctValue)
        } else {
          // Reset for new message
          setNote('')
          setCorrectValue('')
        }
      })
    }
    setShowFalseOptions(false)
    setShowMissedInput(false)
    setIsOtherCandidate(false)
  }, [msgId])

  if (!msgId) {
    return <div className="label-panel empty">Select an email to label</div>
  }

  const handleLabel = async (labelType: 'TRUE' | 'FALSE' | 'MISSED') => {
    // Validation: MISSED requires correctValue
    if (labelType === 'MISSED') {
      if (!correctValue || correctValue.trim() === '') {
        alert('MISSED label requires you to enter the correct code or link that was missed')
        return
      }
    }

    // Validation: FALSE with WRONG_VALUE requires selecting a candidate or entering correctValue
    if (labelType === 'FALSE' && falseReason === 'WRONG_VALUE') {
      if (isOtherCandidate) {
        if (!correctValue || correctValue.trim() === '') {
          alert('Please enter the correct code or link, or select a candidate from the list')
          return
        }
      } else if (!preTag?.candidates || preTag.candidates.length === 0) {
        alert('No candidates available. Please enter the correct value manually.')
        return
      }
    }

    const label: Label = {
      msgIdHash: msgId,
      label: labelType,
      selectedCandidateIndex,
      reasons: [], // Empty array since we removed reason chips
      note,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    if (labelType === 'FALSE') {
      label.falseReason = falseReason
      if (falseReason === 'WRONG_VALUE') {
        if (isOtherCandidate) {
          // User manually entered the correct value
          label.correctValue = correctValue
        } else if (preTag?.candidates && preTag.candidates[selectedCandidateIndex]) {
          // User selected a different candidate from the list
          const selectedCandidate = preTag.candidates[selectedCandidateIndex]
          label.correctValue = selectedCandidate.type === 'MAGIC_LINK'
            ? (selectedCandidate.href || selectedCandidate.value || '')
            : (selectedCandidate.value || '')
        }
      }
    }

    if (labelType === 'MISSED') {
      label.correctValue = correctValue
    }

    await db.labels.put(label)
    onLabeled()
  }

  // Determine which buttons to show based on preTag
  const isNone = preTag?.preTag === 'NONE'
  const hasDetection = preTag?.preTag === 'OTP' || preTag?.preTag === 'MAGIC_LINK'

  return (
    <div className="label-panel">
      <h3>Label This Email</h3>

      <div className="label-buttons">
        <button className="btn btn-true" onClick={() => handleLabel('TRUE')}>
          {isNone ? '✓ TRUE (No Code)' : '✓ TRUE (Correct)'}
        </button>

        {/* FALSE button: Only show for OTP/MAGIC_LINK (algorithm detected something) */}
        {hasDetection && (
          <button
            className="btn btn-false"
            onClick={() => {
              setShowFalseOptions(!showFalseOptions)
              setShowMissedInput(false)
            }}
          >
            ✗ FALSE (Wrong)
          </button>
        )}

        {/* MISSED button: Only show for NONE (algorithm detected nothing) */}
        {isNone && (
          <button
            className="btn btn-missed"
            onClick={() => {
              setShowMissedInput(!showMissedInput)
              setShowFalseOptions(false)
            }}
          >
            ⚠ MISSED (Has Code)
          </button>
        )}
      </div>

      {showFalseOptions && (
        <div className="false-options">
          <select value={falseReason} onChange={(e) => setFalseReason(e.target.value as any)}>
            <option value="NOT_OTP">False Positive (Not OTP/Magic)</option>
            <option value="WRONG_VALUE">Wrong candidate selected</option>
          </select>

          {falseReason === 'WRONG_VALUE' && preTag?.candidates && preTag.candidates.length > 0 && (
            <div className="candidate-picker" style={{ marginTop: '12px', marginBottom: '12px' }}>
              <strong>Which candidate was correct?</strong>
              {preTag.candidates.map((cand, idx) => {
                // For MAGIC_LINK, use href. For OTP, use value
                const displayValue = cand.type === 'MAGIC_LINK'
                  ? (cand.href || cand.value || '(no URL)')
                  : (cand.value || '(no value)')

                return (
                  <label key={idx} style={{ wordBreak: 'break-all', display: 'block', marginBottom: '8px' }}>
                    <input
                      type="radio"
                      checked={!isOtherCandidate && selectedCandidateIndex === idx}
                      onChange={() => {
                        setSelectedCandidateIndex(idx)
                        setIsOtherCandidate(false)
                      }}
                    />
                    {cand.type}: {displayValue} ({(cand.score * 100).toFixed(0)}%)
                  </label>
                )
              })}
              <label style={{ wordBreak: 'break-all', display: 'block', marginBottom: '8px' }}>
                <input
                  type="radio"
                  checked={isOtherCandidate}
                  onChange={() => setIsOtherCandidate(true)}
                />
                Other (enter manually)
              </label>
            </div>
          )}

          {falseReason === 'WRONG_VALUE' && isOtherCandidate && (
            <input
              type="text"
              placeholder="Enter correct code or link"
              value={correctValue}
              onChange={(e) => setCorrectValue(e.target.value)}
              style={{ marginTop: '8px' }}
            />
          )}
          <div className="note-input" style={{ marginTop: '12px' }}>
            <label><strong>Note (optional):</strong></label>
            <input
              type="text"
              placeholder="e.g., Why this is FALSE"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
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
          <div className="note-input" style={{ marginTop: '12px' }}>
            <label><strong>Note (optional):</strong></label>
            <input
              type="text"
              placeholder="e.g., Why this was MISSED"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <button onClick={() => handleLabel('MISSED')}>Submit MISSED</button>
        </div>
      )}
    </div>
  )
}
