/**
 * CountryPicker Component
 *
 * A country code selector with auto-detection from navigator.language.
 * Uses styled country code BADGES instead of flag emojis (Windows
 * does not render flag emojis as colored flags).
 *
 * Uses country-telephone-data for complete list of 250 countries.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { ChevronDown } from 'lucide-react'
import { allCountries } from 'country-telephone-data'

export interface CountryEntry {
  code: string
  dial: string
  name: string
}

export interface CountryPickerProps {
  value: { code: string; dial: string }
  onChange: (country: CountryEntry) => void
}

/** Map country-telephone-data entries to our format, sorted by name. */
const COUNTRIES: CountryEntry[] = allCountries
  .map((c) => ({
    code: c.iso2.toUpperCase(),
    dial: `+${c.dialCode}`,
    name: c.name.replace(/\s*\(.*\)\s*$/, '').trim(),
  }))
  .sort((a, b) => a.name.localeCompare(b.name))

/** Detect country from navigator.language (e.g. "en-US" -> "US"). */
export function detectCountryFromLocale(): CountryEntry {
  try {
    const locale = navigator.language || 'en-US'
    const parts = locale.split('-')
    const region = parts.length > 1 ? parts[parts.length - 1].toUpperCase() : 'US'
    return COUNTRIES.find((c) => c.code === region) || COUNTRIES.find((c) => c.code === 'US') || COUNTRIES[0]
  } catch {
    return COUNTRIES.find((c) => c.code === 'US') || COUNTRIES[0]
  }
}

export function CountryPicker({ value, onChange }: CountryPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    if (!search) return COUNTRIES
    const q = search.toLowerCase()
    return COUNTRIES.filter(
      (c) => c.name.toLowerCase().includes(q) || c.dial.includes(q) || c.code.toLowerCase().includes(q),
    )
  }, [search])

  // Close dropdown on outside click
  const handleOutsideClick = useCallback(
    (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setSearch('')
      }
    },
    [],
  )

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('click', handleOutsideClick, true)
      requestAnimationFrame(() => searchRef.current?.focus())
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
    setSearch('')
    triggerRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false)
      setSearch('')
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
          <div className="phone-field__country-search">
            <input
              ref={searchRef}
              type="text"
              className="phone-field__country-search-input"
              placeholder="Search countries..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search countries"
            />
          </div>
          <div className="phone-field__country-list">
            {filtered.map((country) => (
              <button
                key={`${country.code}-${country.dial}`}
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
            {filtered.length === 0 && (
              <div className="phone-field__country-empty">No results</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
