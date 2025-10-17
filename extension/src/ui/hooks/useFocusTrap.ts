/**
 * useFocusTrap Hook
 *
 * Traps keyboard focus within a container (modal, dialog, overlay).
 * Prevents Tab/Shift+Tab from escaping the container.
 * Automatically focuses the first focusable element.
 *
 * Implements WCAG 2.1 Success Criterion 2.4.3: Focus Order (Level A)
 *
 * @param active - Whether the focus trap is active
 * @returns Ref to attach to the container element
 *
 * @example
 * function Modal({ isOpen, onClose }) {
 *   const modalRef = useFocusTrap(isOpen)
 *
 *   return (
 *     <div ref={modalRef} role="dialog" aria-modal="true">
 *       <button onClick={onClose}>Close</button>
 *       <input type="text" />
 *       <button>Submit</button>
 *     </div>
 *   )
 * }
 */

import { useEffect, useRef } from 'react'

/**
 * Query selector for all focusable elements.
 * Includes buttons, links, inputs, and elements with tabindex >= 0.
 */
const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(', ')

/**
 * Get all focusable elements within a container.
 * Filters out elements with display:none or visibility:hidden.
 */
function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const elements = Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  )

  // Filter out hidden elements
  return elements.filter((el) => {
    const style = window.getComputedStyle(el)
    return style.display !== 'none' && style.visibility !== 'hidden'
  })
}

/**
 * Focus trap hook.
 */
export function useFocusTrap(active: boolean) {
  const containerRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!active || !containerRef.current) return

    const container = containerRef.current
    const focusableElements = getFocusableElements(container)

    if (focusableElements.length === 0) {
      console.warn('[useFocusTrap] No focusable elements found in container')
      return
    }

    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]

    // Store the element that had focus before the trap was activated
    const previousActiveElement = document.activeElement as HTMLElement

    // Focus the first element when trap activates
    firstElement.focus()

    /**
     * Handle Tab key to trap focus within container.
     */
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return

      // Get currently focused element
      const activeElement = document.activeElement as HTMLElement

      // Shift+Tab: Wrap from first to last
      if (e.shiftKey) {
        if (activeElement === firstElement) {
          e.preventDefault()
          lastElement.focus()
        }
      }
      // Tab: Wrap from last to first
      else {
        if (activeElement === lastElement) {
          e.preventDefault()
          firstElement.focus()
        }
      }
    }

    /**
     * Prevent focus from leaving the container via mouse click.
     * If user clicks outside, refocus the first element.
     */
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (!container.contains(target)) {
        e.preventDefault()
        firstElement.focus()
      }
    }

    // Attach event listeners
    container.addEventListener('keydown', handleTab)
    document.addEventListener('click', handleClickOutside, true)

    // Cleanup: Restore focus when trap deactivates
    return () => {
      container.removeEventListener('keydown', handleTab)
      document.removeEventListener('click', handleClickOutside, true)

      // Restore focus to the element that had focus before the trap
      if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
        previousActiveElement.focus()
      }
    }
  }, [active])

  return containerRef
}

/**
 * useFocusLock Hook (Alternative API)
 *
 * Similar to useFocusTrap but with more control over focus restoration.
 *
 * @param options - Configuration options
 * @returns Ref to attach to the container
 *
 * @example
 * const dialogRef = useFocusLock({
 *   active: isOpen,
 *   initialFocus: () => document.getElementById('first-input'),
 *   restoreFocus: true
 * })
 */
interface FocusLockOptions {
  active: boolean
  initialFocus?: () => HTMLElement | null
  restoreFocus?: boolean
  returnFocusOnDeactivate?: boolean
}

export function useFocusLock(options: FocusLockOptions) {
  const {
    active,
    initialFocus,
    restoreFocus = true,
    returnFocusOnDeactivate = true,
  } = options

  const containerRef = useRef<HTMLElement>(null)
  const previousActiveElement = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!active || !containerRef.current) return

    const container = containerRef.current

    // Store previous focus
    if (restoreFocus) {
      previousActiveElement.current = document.activeElement as HTMLElement
    }

    // Focus initial element
    if (initialFocus) {
      const el = initialFocus()
      if (el) {
        el.focus()
      }
    } else {
      const focusableElements = getFocusableElements(container)
      if (focusableElements.length > 0) {
        focusableElements[0].focus()
      }
    }

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return

      const focusableElements = getFocusableElements(container)
      if (focusableElements.length === 0) return

      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]
      const activeElement = document.activeElement as HTMLElement

      if (e.shiftKey) {
        if (activeElement === firstElement) {
          e.preventDefault()
          lastElement.focus()
        }
      } else {
        if (activeElement === lastElement) {
          e.preventDefault()
          firstElement.focus()
        }
      }
    }

    container.addEventListener('keydown', handleTab)

    return () => {
      container.removeEventListener('keydown', handleTab)

      // Restore focus on cleanup
      if (returnFocusOnDeactivate && previousActiveElement.current) {
        previousActiveElement.current.focus()
      }
    }
  }, [active, initialFocus, restoreFocus, returnFocusOnDeactivate])

  return containerRef
}

/**
 * useEscapeKey Hook
 *
 * Calls a callback when Escape key is pressed.
 * Useful for closing modals/dialogs.
 *
 * @param callback - Function to call on Escape press
 * @param active - Whether the listener is active
 *
 * @example
 * useEscapeKey(() => setIsOpen(false), isOpen)
 */
export function useEscapeKey(callback: () => void, active = true) {
  useEffect(() => {
    if (!active) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        callback()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [callback, active])
}

/**
 * useAutoFocus Hook
 *
 * Automatically focuses an element when mounted.
 * Useful for inputs in modals.
 *
 * @param options - Configuration options
 * @returns Ref to attach to the element
 *
 * @example
 * const inputRef = useAutoFocus({ delay: 100 })
 * return <input ref={inputRef} />
 */
interface AutoFocusOptions {
  delay?: number
  preventScroll?: boolean
  selectText?: boolean
}

export function useAutoFocus(options: AutoFocusOptions = {}) {
  const { delay = 0, preventScroll = false, selectText = false } = options
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!ref.current) return

    const timer = setTimeout(() => {
      if (ref.current) {
        ref.current.focus({ preventScroll })

        // Select text if it's an input/textarea
        if (selectText && 'select' in ref.current) {
          ;(ref.current as HTMLInputElement).select()
        }
      }
    }, delay)

    return () => clearTimeout(timer)
  }, [delay, preventScroll, selectText])

  return ref
}
