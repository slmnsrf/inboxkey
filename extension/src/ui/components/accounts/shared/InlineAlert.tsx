import React, { useState, useEffect } from 'react';

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
    success: '✓',
    error: '✗',
    warning: '⚠',
    info: 'ℹ',
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
      {displayIcon && <span aria-hidden="true">{displayIcon} </span>}
      {message}
      {dismissible && (
        <button
          type="button"
          onClick={handleDismiss}
          className="inline-alert__dismiss"
          aria-label="Dismiss alert"
        >
          ×
        </button>
      )}
    </div>
  );
}
