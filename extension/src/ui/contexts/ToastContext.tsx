import React, { createContext, useContext, useState, useCallback } from 'react'

export type ToastVariant = 'success' | 'error' | 'info'

export interface Toast {
  id: string
  message: string
  variant: ToastVariant
  duration?: number // milliseconds, default 3000
}

interface ToastContextValue {
  toasts: Toast[]
  showToast: (message: string, variant?: ToastVariant, duration?: number) => void
  dismissToast: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback(
    (message: string, variant: ToastVariant = 'info', duration = 3000) => {
      const id = `toast-${Date.now()}-${Math.random()}`
      const toast: Toast = { id, message, variant, duration }

      setToasts(prev => [...prev, toast])

      // Auto-dismiss after duration
      if (duration > 0) {
        setTimeout(() => {
          setToasts(prev => prev.filter(t => t.id !== id))
        }, duration)
      }
    },
    []
  )

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toasts, showToast, dismissToast }}>
      {children}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return context
}
