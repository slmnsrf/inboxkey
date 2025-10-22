import React, { useEffect, useState } from 'react'
import { useToast } from '../contexts/ToastContext'
import { LiveRegion } from './LiveRegion'
import './ToastContainer.css'

export function ToastContainer() {
  const { toasts, dismissToast } = useToast()
  const [visibleToasts, setVisibleToasts] = useState<Set<string>>(new Set())

  useEffect(() => {
    // Add 'show' class after a brief delay to trigger animation
    toasts.forEach(toast => {
      if (!visibleToasts.has(toast.id)) {
        requestAnimationFrame(() => {
          setVisibleToasts(prev => new Set(prev).add(toast.id))
        })
      }
    })
  }, [toasts, visibleToasts])

  if (toasts.length === 0) return null

  return (
    <div className="toast-container" data-testid="toast-container">
      {toasts.map(toast => {
        const icon = toast.variant === 'success' ? '✓' :
                     toast.variant === 'error' ? '❌' : 'ℹ️'
        const politeness = toast.variant === 'error' ? 'assertive' : 'polite'

        return (
          <React.Fragment key={toast.id}>
            <LiveRegion message={toast.message} politeness={politeness} />
            <div
              className={`toast toast--${toast.variant}${visibleToasts.has(toast.id) ? ' show' : ''}`}
              data-testid="toast"
            >
              <span className="toast__icon" aria-hidden="true">{icon}</span>
              <span className="toast__message" data-testid="toast-message">{toast.message}</span>
              <button
                className="toast__close"
                onClick={() => dismissToast(toast.id)}
                aria-label="Close notification"
                data-testid="toast-close"
              >
                ✕
              </button>
            </div>
          </React.Fragment>
        )
      })}
    </div>
  )
}
