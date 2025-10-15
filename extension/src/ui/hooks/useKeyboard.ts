/**
 * useKeyboard Hook
 *
 * Global keyboard shortcuts for the extension.
 * Implements common shortcuts like Escape to close popup.
 *
 * @example
 * function Popup() {
 *   useKeyboard()
 *   return <div>...</div>
 * }
 */

import { useEffect, useCallback } from 'react'

interface KeyboardShortcuts {
  onEscape?: () => void
  onCmdK?: () => void
  onCmdC?: () => void
}

/**
 * useKeyboard hook for global shortcuts
 */
export function useKeyboard(shortcuts?: KeyboardShortcuts) {
  const {
    onEscape,
    onCmdK,
    onCmdC,
  } = shortcuts || {}

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      const modKey = isMac ? e.metaKey : e.ctrlKey

      // Escape: Close popup (default behavior for popup windows)
      if (e.key === 'Escape' && onEscape) {
        e.preventDefault()
        onEscape()
      }

      // Cmd/Ctrl + K: Focus search (future feature)
      if (modKey && e.key === 'k' && onCmdK) {
        e.preventDefault()
        onCmdK()
      }

      // Cmd/Ctrl + C: Copy first code (future feature)
      if (modKey && e.key === 'c' && onCmdC) {
        // Only if not in an input field
        const target = e.target as HTMLElement
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          e.preventDefault()
          onCmdC()
        }
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onEscape, onCmdK, onCmdC])
}

/**
 * usePopupKeyboard - Keyboard shortcuts specific to popup
 */
export function usePopupKeyboard() {
  const handleEscape = useCallback(() => {
    window.close()
  }, [])

  useKeyboard({ onEscape: handleEscape })
}
