import React, { useEffect, useState } from 'react'
import { useToast } from '../contexts/ToastContext'
import { LiveRegion } from './LiveRegion'
import { t } from '@/lib/i18n'
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
        // Minimalistic icons: no emojis, simple characters
        const icon = toast.variant === 'success' ? '✓' :
                     toast.variant === 'error' ? '✕' : 'i'
        const politeness = toast.variant === 'error' ? 'assertive' : 'polite'

        return (
          <React.Fragment key={toast.id}>
            <LiveRegion message={toast.message} politeness={politeness} />
            <div
              className={`toast toast--${toast.variant}${visibleToasts.has(toast.id) ? ' show' : ''}`}
              role="status"
              aria-live={politeness}
              data-testid="toast"
            >
              <span className="toast__icon" aria-hidden="true">{icon}</span>
              <span className="toast__message" data-testid="toast-message">{toast.message}</span>
              <button
                className="toast__close"
                onClick={() => dismissToast(toast.id)}
                aria-label={t('button_close_notification')}
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
