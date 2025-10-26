/**
 * BlacklistUrlTab Component
 *
 * Tab content for managing blacklisted URLs.
 * Features:
 * - Add new URLs with validation
 * - Remove individual URLs
 * - Clear all URLs
 * - Empty state with helpful hints
 * - Error messages for invalid/duplicate entries
 * - Shows normalized URLs (query/hash removed)
 */

import React, { useState, useEffect } from 'react'
import {
  getBlacklistedUrls,
  addBlacklistedUrl,
  removeBlacklistedUrl,
  clearBlacklistedUrls,
  MAX_BLACKLIST_ENTRIES,
} from '@/lib/utils/blacklist'
import { BlacklistSearchFilter } from './BlacklistSearchFilter'
import './BlacklistTab.css'

export function BlacklistUrlTab() {
  const [urls, setUrls] = useState<string[]>([])
  const [inputValue, setInputValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  // Load URLs on mount
  useEffect(() => {
    loadUrls()
  }, [])

  const loadUrls = async () => {
    setIsLoading(true)
    const loadedUrls = await getBlacklistedUrls()
    setUrls(loadedUrls)
    setIsLoading(false)
  }

  const handleAdd = async () => {
    setError(null)

    if (!inputValue.trim()) {
      setError('Please enter a URL')
      return
    }

    const result = await addBlacklistedUrl(inputValue.trim())

    if (result.success) {
      setInputValue('')
      await loadUrls()
    } else {
      setError(result.errorMessage || 'Failed to add URL')
    }
  }

  const handleRemove = async (url: string) => {
    const result = await removeBlacklistedUrl(url)
    if (result.success) {
      await loadUrls()
    }
  }

  const handleClearAll = async () => {
    if (!window.confirm('Are you sure you want to remove all ignored URLs?')) {
      return
    }

    const result = await clearBlacklistedUrls()
    if (result.success) {
      await loadUrls()
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleAdd()
    }
  }

  // Filter URLs based on search term
  const filteredUrls = searchTerm
    ? urls.filter((url) =>
        url.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : urls

  return (
    <div className="blacklist-tab-container">
      {/* Description */}
      <div className="blacklist-description">
        <p>
          Block InboxKey from starting sessions on specific URLs only.
        </p>
        <p className="blacklist-hint">
          Example: <code>https://example.com/login</code> will block only the login page, not other pages on example.com
        </p>
      </div>

      {/* Add Form */}
      <div className="blacklist-add-section">
        <div className="blacklist-input-group">
          <input
            type="text"
            className="blacklist-input"
            placeholder="https://example.com/login"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            aria-label="URL to ignore"
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={error ? 'url-hint url-error' : 'url-hint'}
            data-testid="url-input"
          />
          <button
            type="button"
            className="btn btn--primary"
            onClick={handleAdd}
            disabled={isLoading || urls.length >= MAX_BLACKLIST_ENTRIES}
            aria-describedby={urls.length >= MAX_BLACKLIST_ENTRIES ? 'url-limit-warning' : undefined}
            data-testid="url-add-button"
          >
            Add URL
          </button>
        </div>

        <div id="url-hint" className="blacklist-hint sr-only">
          Enter a complete URL like https://example.com/login
        </div>

        {error && (
          <div
            id="url-error"
            className="blacklist-error"
            role="alert"
            data-testid="url-error"
          >
            {error}
          </div>
        )}

        {urls.length >= MAX_BLACKLIST_ENTRIES && (
          <div id="url-limit-warning" className="blacklist-warning" role="alert">
            Maximum of {MAX_BLACKLIST_ENTRIES} URLs reached
          </div>
        )}
      </div>

      {/* URL List */}
      {isLoading ? (
        <div className="blacklist-loading">Loading...</div>
      ) : (
        <div className="blacklist-list-section">
          {/* Header Row: Search, Count, Clear All */}
          <div className="blacklist-list-header">
            <BlacklistSearchFilter
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder="Search URLs..."
            />
            <span className="blacklist-count">
              {searchTerm ? `${filteredUrls.length} of ` : ''}{urls.length} {urls.length === 1 ? 'URL' : 'URLs'}
            </span>
            <button
              type="button"
              className="btn btn--text btn--danger"
              onClick={handleClearAll}
              data-testid="url-clear-all"
              disabled={urls.length === 0}
            >
              Clear All
            </button>
          </div>

          {/* List or Empty State */}
          {urls.length === 0 ? (
            <div className="blacklist-empty">
              <p className="blacklist-empty-icon">🔗</p>
              <p className="blacklist-empty-text">No ignored URLs</p>
              <p className="blacklist-empty-hint">
                Add URLs above to prevent InboxKey from working on specific pages
              </p>
            </div>
          ) : filteredUrls.length === 0 ? (
            <div className="blacklist-empty">
              <div className="blacklist-empty-icon">🔍</div>
              <p className="blacklist-empty-text">No matching URLs</p>
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
            <ul className="blacklist-list" data-testid="url-list" aria-label="Ignored URLs">
              {filteredUrls.map((url) => (
                <li key={url} className="blacklist-item">
                  <span className="blacklist-item-text" title={url}>
                    {url}
                  </span>
                  <button
                    type="button"
                    className="blacklist-remove-btn"
                    onClick={() => handleRemove(url)}
                    aria-label={`Remove ${url} from ignored URLs`}
                    data-testid={`url-remove-${url}`}
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
