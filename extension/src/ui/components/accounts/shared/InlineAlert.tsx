import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { t } from '@/lib/i18n';
import { CheckIcon, XIcon, WarningIcon, InfoIcon } from '@/ui/components/icons/StatusIcons';

type AlertVariant = 'success' | 'error' | 'warning' | 'info';

interface InlineAlertProps {
  variant: AlertVariant;
  message: string;
  onDismiss?: () => void;
  dismissible?: boolean;
  icon?: React.ReactNode;
  autoDismiss?: boolean;
  dismissDelay?: number;
}

export function InlineAlert({
  variant,
  message,
  onDismiss,
  dismissible = false,
  icon,
  autoDismiss = true,
  dismissDelay = 6500,
}: InlineAlertProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (autoDismiss) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        if (onDismiss) {
          setTimeout(onDismiss, 300); // Wait for fade out animation
        }
      }, dismissDelay);
      return () => clearTimeout(timer);
    }
  }, [autoDismiss, dismissDelay, onDismiss]);

  const handleDismiss = () => {
    setIsVisible(false);
    if (onDismiss) {
      setTimeout(onDismiss, 300);
    }
  };

  const defaultIcons = {
    success: <CheckIcon />,
    error: <XIcon />,
    warning: <WarningIcon />,
    info: <InfoIcon />,
  };

  const displayIcon = icon ?? defaultIcons[variant];

  if (!isVisible) return null;

  return (
    <div
      className={`inline-alert inline-alert--${variant}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={!isVisible ? { opacity: 0 } : undefined}
    >
      {displayIcon && <span className="inline-alert__icon">{displayIcon}</span>}
      {message}
      {dismissible && (
        <button
          type="button"
          onClick={handleDismiss}
          className="inline-alert__dismiss"
          aria-label={t('aria_dismiss_alert')}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
