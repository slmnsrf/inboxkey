/**
 * BlacklistUrlTab Component
 *
 * Tab content for managing blacklisted URLs.
 * Features:
 * - Add new URLs with validation
 * - Remove individual URLs
 * - Remove all URLs (inline confirmation)
 * - Empty state messaging
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
import { Link, Search, X } from 'lucide-react'
import { BlacklistSearchFilter } from './BlacklistSearchFilter'
import { t, plural } from '@/lib/i18n'
import './BlacklistTab.css'

export function BlacklistUrlTab() {
  const [urls, setUrls] = useState<string[]>([])
  const [inputValue, setInputValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [confirmingRemoveAll, setConfirmingRemoveAll] = useState(false)

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
      setError(t('blacklist_url_error_empty'))
      return
    }

    const result = await addBlacklistedUrl(inputValue.trim())

    if (result.success) {
      setInputValue('')
      await loadUrls()
    } else {
      setError(result.errorMessage || t('blacklist_url_error_add_failed'))
    }
  }

  const handleRemove = async (url: string) => {
    const result = await removeBlacklistedUrl(url)
    if (result.success) {
      await loadUrls()
    }
  }

  const handleRemoveAll = async () => {
    const result = await clearBlacklistedUrls()
    if (result.success) {
      setConfirmingRemoveAll(false)
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

  // Build count text
  const countText = searchTerm
    ? `${t('blacklist_url_count_filtered', [String(filteredUrls.length), String(urls.length)])} `
    : ''
  const unitText = plural('blacklist_url_count_singular', 'blacklist_url_count_plural', urls.length)

  return (
    <div className="blacklist-tab-container">
      {/* Description */}
      <div className="blacklist-description">
        <p>{t('blacklist_url_description')}</p>
        <p className="blacklist-hint">{t('blacklist_url_hint')}</p>
      </div>

      {/* Add Form */}
      <div className="blacklist-add-section">
        <div className="blacklist-input-group">
          <input
            type="text"
            className="blacklist-input"
            placeholder={t('blacklist_url_placeholder')}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            aria-label={t('blacklist_url_input_aria')}
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
            {t('blacklist_url_add_button')}
          </button>
        </div>

        <div id="url-hint" className="blacklist-hint sr-only">
          {t('blacklist_url_hint_sr')}
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
            {t('blacklist_url_limit_warning', String(MAX_BLACKLIST_ENTRIES))}
          </div>
        )}
      </div>

      {/* URL List */}
      {isLoading ? (
        <div className="blacklist-loading">{t('blacklist_loading')}</div>
      ) : (
        <div className="blacklist-list-section">
          {/* Header Row: Search, Count, Remove All */}
          <div className="blacklist-list-header">
            <BlacklistSearchFilter
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder={t('blacklist_url_search_placeholder')}
            />
            <span className="blacklist-count">
              {searchTerm ? countText : unitText}
            </span>
            {confirmingRemoveAll ? (
              <div className="confirm-inline" role="alertdialog">
                <p className="confirm-inline__text">{t('blacklist_remove_all_confirm_urls')}</p>
                <div className="confirm-inline__actions">
                  <button
                    type="button"
                    className="btn btn--danger btn--sm"
                    onClick={handleRemoveAll}
                  >
                    {t('blacklist_remove_all_yes')}
                  </button>
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={() => setConfirmingRemoveAll(false)}
                  >
                    {t('blacklist_cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn--text btn--danger"
                onClick={() => setConfirmingRemoveAll(true)}
                data-testid="url-clear-all"
                disabled={urls.length === 0}
              >
                {t('blacklist_remove_all_button')}
              </button>
            )}
          </div>

          {/* List or Empty State */}
          {urls.length === 0 ? (
            <div className="blacklist-empty">
              <p className="blacklist-empty-icon"><Link size={24} /></p>
              <p className="blacklist-empty-text">{t('blacklist_url_empty_title')}</p>
            </div>
          ) : filteredUrls.length === 0 ? (
            <div className="blacklist-empty">
              <div className="blacklist-empty-icon"><Search size={24} /></div>
              <p className="blacklist-empty-text">{t('blacklist_url_no_match_title')}</p>
              <p className="blacklist-empty-hint">
                {t('blacklist_url_no_match_hint')}{' '}
                <button
                  type="button"
                  className="btn btn--text"
                  onClick={() => setSearchTerm('')}
                  style={{ display: 'inline', minHeight: 'auto', padding: '0', textDecoration: 'underline' }}
                >
                  {t('blacklist_clear_filter')}
                </button>
              </p>
            </div>
          ) : (
            <ul className="blacklist-list" data-testid="url-list" aria-label={t('blacklist_tab_urls')}>
              {filteredUrls.map((url) => (
                <li key={url} className="blacklist-item">
                  <span className="blacklist-item-text" title={url}>
                    {url}
                  </span>
                  <button
                    type="button"
                    className="blacklist-remove-btn"
                    onClick={() => handleRemove(url)}
                    aria-label={t('blacklist_url_remove_aria', url)}
                    data-testid={`url-remove-${url}`}
                  >
                    <X size={14} />
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
