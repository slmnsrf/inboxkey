/**
 * BlacklistSearchFilter Component
 *
 * Compact search input for filtering blacklist entries.
 * Designed to fit inline with count and action buttons.
 * Features:
 * - Real-time filtering with case-insensitive substring matching
 * - Clear button (×) for quick reset
 * - ESC key support to clear search
 * - Accessible with ARIA labels
 */

import React from 'react'
import { X } from 'lucide-react'
import './BlacklistSearchFilter.css'

interface BlacklistSearchFilterProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function BlacklistSearchFilter({
  value,
  onChange,
  placeholder = 'Search...',
}: BlacklistSearchFilterProps) {
  const handleClear = () => {
    onChange('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClear()
    }
  }

  return (
    <div className="blacklist-search-input-wrapper">
      <input
        type="search"
        className="blacklist-search-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label="Search entries"
      />
      {value && (
        <button
          type="button"
          className="blacklist-search-clear"
          onClick={handleClear}
          aria-label="Clear search"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}
