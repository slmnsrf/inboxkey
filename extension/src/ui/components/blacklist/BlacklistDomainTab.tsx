/**
 * BlacklistDomainTab Component
 *
 * Tab content for managing blacklisted domains.
 * Features:
 * - Add new domains with validation
 * - Remove individual domains
 * - Clear all domains
 * - Empty state with helpful hints
 * - Error messages for invalid/duplicate entries
 */

import React, { useState, useEffect } from 'react'
import {
  getBlacklistedDomains,
  addBlacklistedDomain,
  removeBlacklistedDomain,
  clearBlacklistedDomains,
  MAX_BLACKLIST_ENTRIES,
} from '@/lib/utils/blacklist'
import { BlacklistSearchFilter } from './BlacklistSearchFilter'
import './BlacklistTab.css'

export function BlacklistDomainTab() {
  const [domains, setDomains] = useState<string[]>([])
  const [inputValue, setInputValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  // Load domains on mount
  useEffect(() => {
    loadDomains()
  }, [])

  const loadDomains = async () => {
    setIsLoading(true)
    const loadedDomains = await getBlacklistedDomains()
    setDomains(loadedDomains)
    setIsLoading(false)
  }

  const handleAdd = async () => {
    setError(null)

    if (!inputValue.trim()) {
      setError('Please enter a domain')
      return
    }

    const result = await addBlacklistedDomain(inputValue.trim())

    if (result.success) {
      setInputValue('')
      await loadDomains()
    } else {
      setError(result.errorMessage || 'Failed to add domain')
    }
  }

  const handleRemove = async (domain: string) => {
    const result = await removeBlacklistedDomain(domain)
    if (result.success) {
      await loadDomains()
    }
  }

  const handleClearAll = async () => {
    if (!window.confirm('Are you sure you want to remove all ignored domains?')) {
      return
    }

    const result = await clearBlacklistedDomains()
    if (result.success) {
      await loadDomains()
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleAdd()
    }
  }

  // Filter domains based on search term
  const filteredDomains = searchTerm
    ? domains.filter((domain) =>
        domain.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : domains

  return (
    <div className="blacklist-tab-container">
      {/* Description */}
      <div className="blacklist-description">
        <p>
          Block InboxKey from starting sessions on entire domains and their subdomains.
        </p>
        <p className="blacklist-hint">
          Example: <code>example.com</code> will block <code>example.com</code>, <code>www.example.com</code>, and <code>sub.example.com</code>
        </p>
      </div>

      {/* Add Form */}
      <div className="blacklist-add-section">
        <div className="blacklist-input-group">
          <input
            type="text"
            className="blacklist-input"
            placeholder="example.com"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            aria-label="Domain to ignore"
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={error ? 'domain-hint domain-error' : 'domain-hint'}
            data-testid="domain-input"
          />
          <button
            type="button"
            className="btn btn--primary"
            onClick={handleAdd}
            disabled={isLoading || domains.length >= MAX_BLACKLIST_ENTRIES}
            aria-describedby={domains.length >= MAX_BLACKLIST_ENTRIES ? 'domain-limit-warning' : undefined}
            data-testid="domain-add-button"
          >
            Add Domain
          </button>
        </div>

        <div id="domain-hint" className="blacklist-hint sr-only">
          Enter a domain like example.com without http or www
        </div>

        {error && (
          <div
            id="domain-error"
            className="blacklist-error"
            role="alert"
            data-testid="domain-error"
          >
            {error}
          </div>
        )}

        {domains.length >= MAX_BLACKLIST_ENTRIES && (
          <div id="domain-limit-warning" className="blacklist-warning" role="alert">
            Maximum of {MAX_BLACKLIST_ENTRIES} domains reached
          </div>
        )}
      </div>

      {/* Domain List */}
      {isLoading ? (
        <div className="blacklist-loading">Loading...</div>
      ) : (
        <div className="blacklist-list-section">
          {/* Header Row: Search, Count, Clear All */}
          <div className="blacklist-list-header">
            <BlacklistSearchFilter
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder="Search domains..."
            />
            <span className="blacklist-count">
              {searchTerm ? `${filteredDomains.length} of ` : ''}{domains.length} {domains.length === 1 ? 'domain' : 'domains'}
            </span>
            <button
              type="button"
              className="btn btn--text btn--danger"
              onClick={handleClearAll}
              data-testid="domain-clear-all"
              disabled={domains.length === 0}
            >
              Clear All
            </button>
          </div>

          {/* List or Empty State */}
          {domains.length === 0 ? (
            <div className="blacklist-empty">
              <p className="blacklist-empty-icon">🌐</p>
              <p className="blacklist-empty-text">No ignored domains</p>
              <p className="blacklist-empty-hint">
                Add domains above to prevent InboxKey from working on them
              </p>
            </div>
          ) : filteredDomains.length === 0 ? (
            <div className="blacklist-empty">
              <div className="blacklist-empty-icon">🔍</div>
              <p className="blacklist-empty-text">No matching domains</p>
              <p className="blacklist-empty-hint">
                Try adjusting your search or{' '}
                <button
                  type="button"
                  className="btn btn--text"
                  onClick={() => setSearchTerm('')}
                  style={{ display: 'inline', minHeight: 'auto', padding: '0', textDecoration: 'underline' }}
                >
                  clear the filter
                </button>
              </p>
            </div>
          ) : (
            <ul className="blacklist-list" data-testid="domain-list" aria-label="Ignored domains">
              {filteredDomains.map((domain) => (
                <li key={domain} className="blacklist-item">
                  <span className="blacklist-item-text" title={domain}>
                    {domain}
                  </span>
                  <button
                    type="button"
                    className="blacklist-remove-btn"
                    onClick={() => handleRemove(domain)}
                    aria-label={`Remove ${domain} from ignored domains`}
                    data-testid={`domain-remove-${domain}`}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
