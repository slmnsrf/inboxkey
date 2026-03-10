/**
 * Modal Component
 *
 * Reusable modal dialog with focus trap, ESC key support, and click-outside closing.
 * Follows accessibility best practices (WCAG 2.1 Level AA).
 *
 * Features:
 * - Focus trap (keyboard navigation contained within modal)
 * - ESC key closes modal
 * - Click outside overlay closes modal
 * - Focus restored on close
 * - Prevents body scroll when open
 * - ARIA attributes for screen readers
 *
 * @example
 * <Modal
 *   isOpen={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   title="Modal Title"
 *   size="medium"
 * >
 *   <p>Modal content here...</p>
 * </Modal>
 */

import React, { useEffect } from 'react'
import { X } from 'lucide-react'
import { useFocusTrap, useEscapeKey } from '@/ui/hooks/useFocusTrap'
import './Modal.css'

export type ModalSize = 'small' | 'medium' | 'large'

export interface ModalProps {
  /** Whether the modal is open */
  isOpen: boolean
  /** Callback when modal should close */
  onClose: () => void
  /** Modal title (displayed in header) */
  title: string
  /** Modal size variant */
  size?: ModalSize
  /** Modal content */
  children: React.ReactNode
  /** Optional footer content (buttons, actions) */
  footer?: React.ReactNode
  /** Optional className for custom styling */
  className?: string
  /** Prevent closing on overlay click */
  preventCloseOnOverlayClick?: boolean
  /** Prevent closing on ESC key */
  preventCloseOnEscape?: boolean
}

export function Modal({
  isOpen,
  onClose,
  title,
  size = 'medium',
  children,
  footer,
  className = '',
  preventCloseOnOverlayClick = false,
  preventCloseOnEscape = false,
}: ModalProps) {
  const modalRef = useFocusTrap(isOpen)

  // ESC key handler
  useEscapeKey(() => {
    if (!preventCloseOnEscape) {
      onClose()
    }
  }, isOpen)

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }

    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  // Don't render if not open
  if (!isOpen) return null

  const handleOverlayClick = () => {
    if (!preventCloseOnOverlayClick) {
      onClose()
    }
  }

  const handleContentClick = (e: React.MouseEvent) => {
    // Prevent click from bubbling to overlay
    e.stopPropagation()
  }

  return (
    <div
      className="modal-overlay"
      onClick={handleOverlayClick}
      role="presentation"
      data-testid="modal-overlay"
    >
      <div
        ref={modalRef as React.RefObject<HTMLDivElement>}
        className={`modal-content modal-content--${size} ${className}`}
        onClick={handleContentClick}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        data-testid="modal-content"
      >
        <div className="modal-header">
          <h2 id="modal-title" className="modal-title">
            {title}
          </h2>
          {!preventCloseOnEscape && (
            <button
              type="button"
              className="modal-close"
              onClick={onClose}
              aria-label={`Close ${title} dialog`}
              data-testid="modal-close"
            >
              <X size={18} />
            </button>
          )}
        </div>

        <div className="modal-body">{children}</div>

        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}
