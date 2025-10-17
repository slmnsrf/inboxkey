/**
 * PasswordInput Component
 *
 * Reusable password input field with show/hide toggle.
 * Supports all standard input props with accessibility features.
 */

import React, { useState } from 'react'

/**
 * Props for PasswordInput component
 */
export interface PasswordInputProps {
  /** Current password value */
  value: string
  /** Change handler */
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  /** Input placeholder text */
  placeholder?: string
  /** Label text for the input */
  label?: string
  /** Error message to display */
  error?: string
  /** Auto-focus on mount */
  autoFocus?: boolean
  /** Disabled state */
  disabled?: boolean
  /** Optional CSS class name */
  className?: string
  /** Optional input name attribute */
  name?: string
  /** Optional input ID (auto-generated if not provided) */
  id?: string
  /** Optional max length */
  maxLength?: number
  /** Optional input mode for soft keyboard hints */
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']
  /** Optional pattern for validation hints */
  pattern?: string
  /** Optional autocomplete override */
  autoComplete?: string
}

/**
 * PasswordInput Component
 *
 * Password input with show/hide toggle for improved UX.
 * Includes proper accessibility attributes and error handling.
 *
 * @example
 * ```tsx
 * <PasswordInput
 *   value={password}
 *   onChange={handleChange}
 *   label="Master Password"
 *   error={errorMessage}
 *   autoFocus
 * />
 * ```
 */
export function PasswordInput({
  value,
  onChange,
  placeholder = 'Enter password',
  label,
  error,
  autoFocus = false,
  disabled = false,
  className = '',
  name = 'password',
  id,
  maxLength,
  inputMode,
  pattern,
  autoComplete = 'current-password',
}: PasswordInputProps): JSX.Element {
  const [isVisible, setIsVisible] = useState(false)

  // Generate unique ID if not provided
  const inputId = id || `password-input-${Math.random().toString(36).substring(2, 9)}`
  const errorId = `${inputId}-error`

  const toggleVisibility = () => {
    setIsVisible((prev) => !prev)
  }

  return (
    <div className={`password-input ${className}`}>
      {/* Label */}
      {label && (
        <label htmlFor={inputId} className="password-input__label">
          {label}
        </label>
      )}

      {/* Input container */}
      <div className="password-input__container">
        <input
          id={inputId}
          name={name}
          type={isVisible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoFocus={autoFocus}
          disabled={disabled}
          maxLength={maxLength}
          inputMode={inputMode}
          pattern={pattern}
          className={`password-input__field ${error ? 'password-input__field--error' : ''}`}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          autoComplete={autoComplete}
        />

        {/* Show/hide toggle button */}
        <button
          type="button"
          onClick={toggleVisibility}
          disabled={disabled}
          className="password-input__toggle"
          aria-label={isVisible ? 'Hide password' : 'Show password'}
          tabIndex={-1}
        >
          {isVisible ? (
            // Eye-slash icon (password visible)
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          ) : (
            // Eye icon (password hidden)
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div id={errorId} className="password-input__error" role="alert">
          {error}
        </div>
      )}
    </div>
  )
}
