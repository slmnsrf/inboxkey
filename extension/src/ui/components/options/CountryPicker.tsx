/**
 * CountryPicker Component
 *
 * A country code selector with auto-detection from navigator.language.
 * Uses styled country code BADGES instead of flag emojis (Windows
 * does not render flag emojis as colored flags).
 *
 * Features:
 * - Auto-detect country from browser locale on mount
 * - ~20 common countries (production should use country-telephone-data)
 * - Badge trigger: [US] +1 with chevron
 * - Scrollable dropdown with outside-click dismissal
 * - Keyboard accessible (Enter/Space to toggle, Escape to close)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronDown } from 'lucide-react'

export interface CountryEntry {
  code: string
  dial: string
  name: string
}

export interface CountryPickerProps {
  value: { code: string; dial: string }
  onChange: (country: CountryEntry) => void
}

const COUNTRIES: CountryEntry[] = [
  { code: 'US', dial: '+1', name: 'United States' },
  { code: 'GB', dial: '+44', name: 'United Kingdom' },
  { code: 'DE', dial: '+49', name: 'Germany' },
  { code: 'FR', dial: '+33', name: 'France' },
  { code: 'TR', dial: '+90', name: 'Turkey' },
  { code: 'NL', dial: '+31', name: 'Netherlands' },
  { code: 'ES', dial: '+34', name: 'Spain' },
  { code: 'IT', dial: '+39', name: 'Italy' },
  { code: 'JP', dial: '+81', name: 'Japan' },
  { code: 'KR', dial: '+82', name: 'South Korea' },
  { code: 'AU', dial: '+61', name: 'Australia' },
  { code: 'CA', dial: '+1', name: 'Canada' },
  { code: 'BR', dial: '+55', name: 'Brazil' },
  { code: 'IN', dial: '+91', name: 'India' },
  { code: 'MX', dial: '+52', name: 'Mexico' },
  { code: 'SE', dial: '+46', name: 'Sweden' },
  { code: 'CH', dial: '+41', name: 'Switzerland' },
  { code: 'AT', dial: '+43', name: 'Austria' },
  { code: 'PL', dial: '+48', name: 'Poland' },
  { code: 'PT', dial: '+351', name: 'Portugal' },
]

/** Detect country from navigator.language (e.g. "en-US" -> "US"). */
export function detectCountryFromLocale(): CountryEntry {
  try {
    const locale = navigator.language || 'en-US'
    const parts = locale.split('-')
    const region = parts.length > 1 ? parts[parts.length - 1].toUpperCase() : 'US'
    return COUNTRIES.find((c) => c.code === region) || COUNTRIES[0]
  } catch {
    return COUNTRIES[0]
  }
}

export function CountryPicker({ value, onChange }: CountryPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  // Close dropdown on outside click
  const handleOutsideClick = useCallback(
    (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    },
    [],
  )

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('click', handleOutsideClick, true)
    }
    return () => {
      document.removeEventListener('click', handleOutsideClick, true)
    }
  }, [isOpen, handleOutsideClick])

  // Scroll the active option into view when the menu opens
  useEffect(() => {
    if (isOpen && menuRef.current) {
      const active = menuRef.current.querySelector(
        '.phone-field__country-option--active',
      ) as HTMLElement | null
      if (active) {
        active.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [isOpen])

  const handleSelect = (country: CountryEntry) => {
    onChange(country)
    setIsOpen(false)
    triggerRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false)
      triggerRef.current?.focus()
    }
  }

  return (
    <div className="phone-field__country-wrap" ref={wrapRef} onKeyDown={handleKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        className="phone-field__country-trigger"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={`Country: ${value.code} ${value.dial}`}
      >
        <span className="phone-field__country-badge">{value.code}</span>
        <span className="phone-field__country-code">{value.dial}</span>
        <span className="phone-field__country-chev">
          <ChevronDown size={12} />
        </span>
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          className="phone-field__country-menu"
          role="listbox"
          aria-label="Select country"
        >
          {COUNTRIES.map((country) => (
            <button
              key={country.code}
              type="button"
              role="option"
              aria-selected={country.code === value.code}
              className={`phone-field__country-option${
                country.code === value.code ? ' phone-field__country-option--active' : ''
              }`}
              onClick={() => handleSelect(country)}
            >
              <span className="phone-field__country-option-badge">{country.code}</span>
              <span className="phone-field__country-option-name">{country.name}</span>
              <span className="phone-field__country-option-dial">{country.dial}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
