import React from 'react'
import { WifiOff, Info, AlertOctagon, X } from 'lucide-react'

type BannerVariant = 'offline' | 'info' | 'required'

interface PageBannerProps {
  variant: BannerVariant
  children: React.ReactNode
  action?: { label: string; onClick: () => void }
  dismissable?: boolean
  onDismiss?: () => void
}

const ICONS: Record<BannerVariant, React.ReactNode> = {
  offline: <WifiOff size={18} />,
  info: <Info size={18} />,
  required: <AlertOctagon size={18} />,
}

export function PageBanner({ variant, children, action, dismissable, onDismiss }: PageBannerProps) {
  return (
    <div className={`page-banner page-banner--${variant}`} role="alert">
      <span className="page-banner__icon">{ICONS[variant]}</span>
      <span className="page-banner__text">{children}</span>
      {action && (
        <span className="page-banner__action">
          <button className="row-btn" onClick={action.onClick}>{action.label}</button>
        </span>
      )}
      {dismissable && (
        <button className="page-banner__close" aria-label="Dismiss" onClick={onDismiss}>
          <X size={14} />
        </button>
      )}
    </div>
  )
}
