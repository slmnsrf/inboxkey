/**
 * LiveRegion Component
 *
 * ARIA live region for screen reader announcements.
 * Announces dynamic content changes to screen reader users.
 *
 * Implements WCAG 2.1 Success Criterion 4.1.3: Status Messages (Level AA)
 *
 * @example
 * const [message, setMessage] = useState('')
 *
 * const handleCopy = () => {
 *   copyToClipboard(code)
 *   setMessage('Code copied to clipboard')
 * }
 *
 * return (
 *   <>
 *     <button onClick={handleCopy}>Copy</button>
 *     <LiveRegion message={message} />
 *   </>
 * )
 */

import React from 'react'

interface LiveRegionProps {
  /** Message to announce to screen readers */
  message: string

  /** Politeness level for announcements */
  politeness?: 'polite' | 'assertive'

  /** Whether to clear the message after announcing */
  atomic?: boolean

  /** Whether the entire region should be announced when updated */
  relevant?: 'additions' | 'removals' | 'text' | 'all'
}

/**
 * LiveRegion - ARIA live region for screen reader announcements
 */
export function LiveRegion({
  message,
  politeness = 'polite',
  atomic = true,
  relevant = 'additions',
}: LiveRegionProps) {
  // Use role="status" for polite, role="alert" for assertive
  const role = politeness === 'assertive' ? 'alert' : 'status'

  return (
    <div
      role={role}
      aria-live={politeness}
      aria-atomic={atomic}
      aria-relevant={relevant}
      className="sr-only"
    >
      {message}
    </div>
  )
}

/**
 * useAnnounce Hook
 *
 * Hook for announcing messages to screen readers.
 * Returns a function to announce messages.
 *
 * @example
 * function CodeCard() {
 *   const announce = useAnnounce()
 *
 *   const handleCopy = () => {
 *     copyToClipboard(code)
 *     announce('Code copied to clipboard')
 *   }
 *
 *   return <button onClick={handleCopy}>Copy</button>
 * }
 */
export function useAnnounce() {
  const [message, setMessage] = React.useState('')

  const announce = React.useCallback((text: string) => {
    setMessage(text)

    // Clear message after 1 second so the same message can be announced again
    setTimeout(() => setMessage(''), 1000)
  }, [])

  return { announce, LiveRegion: () => <LiveRegion message={message} /> }
}
