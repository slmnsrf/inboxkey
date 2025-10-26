import React, { useState, useEffect, useCallback } from 'react';

type ButtonState = 'idle' | 'loading' | 'success' | 'error';
type ButtonVariant = 'primary' | 'secondary' | 'danger';

interface StatefulButtonProps {
  state?: ButtonState;
  onClick: () => void | Promise<void>;
  idleText: string;
  loadingText?: string;
  successText?: string;
  errorText?: string;
  variant?: ButtonVariant;
  disabled?: boolean;
  autoResetDelay?: number;
  className?: string;
  'aria-label'?: string;
}

export function StatefulButton(props: StatefulButtonProps) {
  const {
    state: externalState,
    onClick,
    idleText,
    loadingText = 'Loading...',
    successText = 'Success',
    errorText = 'Error',
    variant = 'primary',
    disabled = false,
    autoResetDelay,
    className = '',
  } = props;
  const [internalState, setInternalState] = useState<ButtonState>('idle');
  const state = externalState ?? internalState;

  const isControlled = externalState !== undefined;

  useEffect(() => {
    if (!isControlled && (state === 'success' || state === 'error')) {
      const delay = autoResetDelay ?? (state === 'success' ? 2000 : 4000);
      const timer = setTimeout(() => {
        setInternalState('idle');
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [state, isControlled, autoResetDelay]);

  const handleClick = useCallback(async () => {
    if (disabled || state === 'loading') return;

    if (!isControlled) {
      setInternalState('loading');
    }

    try {
      await onClick();
      if (!isControlled) {
        setInternalState('idle'); // Return to idle immediately (no success state)
      }
    } catch (error) {
      if (!isControlled) {
        setInternalState('idle'); // Return to idle immediately (no error state)
      }
      console.error('StatefulButton onClick error:', error);
    }
  }, [onClick, disabled, state, isControlled]);

  const getButtonText = () => {
    switch (state) {
      case 'loading':
        return loadingText;
      case 'success':
        return successText;
      case 'error':
        return errorText;
      default:
        return idleText;
    }
  };

  const getStateIcon = () => {
    if (state === 'success') return '✓';
    if (state === 'error') return '✗';
    return null;
  };

  const getVariantClass = () => {
    if (state === 'success') return 'btn--success';
    if (state === 'error') return 'btn--error';
    return `btn--${variant}`;
  };

  const isDisabled = disabled || state === 'loading';
  const icon = getStateIcon();

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isDisabled}
      className={`btn ${getVariantClass()} ${state === 'loading' ? 'btn--loading' : ''} ${className}`.trim()}
      aria-busy={state === 'loading'}
      aria-live="polite"
      aria-label={props['aria-label']}
    >
      {icon && <span aria-hidden="true">{icon} </span>}
      {getButtonText()}
    </button>
  );
}
