/**
 * PopupErrorBoundary
 *
 * Catches unhandled React errors and shows a recovery UI instead of a white screen.
 * Uses inline styles because ThemeProvider/CSS may be what crashed.
 */

import React from 'react'

interface State {
  hasError: boolean
}

export class PopupErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[PopupErrorBoundary] Caught render error:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      // Detect theme without relying on ThemeProvider (which may have crashed)
      const isDark = typeof window !== 'undefined'
        && window.matchMedia?.('(prefers-color-scheme: dark)').matches

      const bg = isDark ? '#1a1a2e' : '#f5f5f7'
      const text = isDark ? '#e5e7eb' : '#1f2937'
      const muted = isDark ? '#9ca3af' : '#6b7280'

      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            minHeight: 200,
            padding: 24,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            textAlign: 'center',
            color: text,
            background: bg,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
            Something went wrong
          </div>
          <div style={{ fontSize: 12, color: muted, marginBottom: 16 }}>
            An unexpected error occurred in InboxKey.
          </div>
          <button
            type="button"
            onClick={() => window.close()}
            style={{
              padding: '6px 16px',
              fontSize: 12,
              fontWeight: 600,
              color: '#fff',
              background: '#3b82f6',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Close &amp; Reopen
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
