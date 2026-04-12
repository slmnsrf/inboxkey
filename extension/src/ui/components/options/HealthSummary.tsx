import React from 'react'
import { CheckCircle, AlertTriangle, XCircle } from 'lucide-react'

type HealthMode =
  | { type: 'quiet-ok'; text: string }
  | { type: 'quiet-attention'; text: string }
  | { type: 'full-error'; title: string; detail: string }
  | { type: 'hidden' }

interface HealthSummaryProps {
  mode: HealthMode
}

export function HealthSummary({ mode }: HealthSummaryProps) {
  if (mode.type === 'hidden') return null

  if (mode.type === 'quiet-ok') {
    return (
      <div className="health-quiet" role="status">
        <span className="health-quiet__icon"><CheckCircle size={14} /></span>
        <span>{mode.text}</span>
      </div>
    )
  }

  if (mode.type === 'quiet-attention') {
    return (
      <div className="health-quiet health-quiet--attention" role="status">
        <span className="health-quiet__icon"><AlertTriangle size={14} /></span>
        <span>{mode.text}</span>
      </div>
    )
  }

  // full-error
  return (
    <div className="health health--error" role="status">
      <span className="health__icon"><XCircle size={20} /></span>
      <div className="health__body">
        <p className="health__title">{mode.title}</p>
        <p className="health__detail">{mode.detail}</p>
      </div>
    </div>
  )
}

export type { HealthMode }
