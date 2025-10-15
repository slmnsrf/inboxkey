/**
 * BlacklistDomainTab Component
 *
 * Tab content for managing blacklisted domains.
 * Features:
 * - Add new domains with validation
 * - Remove individual domains
 * - Remove all domains (inline confirmation)
 * - Empty state messaging
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
import { X } from 'lucide-react'
import { GlobeIcon } from '@/ui/components/icons/StatusIcons'
import { t, plural } from '@/lib/i18n'
import './BlacklistTab.css'

export function BlacklistDomainTab() {
  const [domains, setDomains] = useState<string[]>([])
  const [inputValue, setInputValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [confirmingRemoveAll, setConfirmingRemoveAll] = useState(false)

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
      setError(t('blacklist_domain_error_empty'))
      return
    }

    const result = await addBlacklistedDomain(inputValue.trim())

    if (result.success) {
      setInputValue('')
      await loadDomains()
    } else {
      setError(result.errorMessage || t('blacklist_domain_error_add_failed'))
    }
  }

  const handleRemove = async (domain: string) => {
    const result = await removeBlacklistedDomain(domain)
    if (result.success) {
      await loadDomains()
    }
  }

  const handleRemoveAll = async () => {
    const result = await clearBlacklistedDomains()
    if (result.success) {
      setConfirmingRemoveAll(false)
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

  // Build count text
  const countText = searchTerm
    ? `${t('blacklist_domain_count_filtered', [String(filteredDomains.length), String(domains.length)])} `
    : ''
  const unitText = plural('blacklist_domain_count_singular', 'blacklist_domain_count_plural', domains.length)

  return (
    <div className="blacklist-tab-container">
      {/* Description */}
      <div className="blacklist-description">
        <p>{t('blacklist_domain_description')}</p>
        <p className="blacklist-hint">{t('blacklist_domain_hint')}</p>
      </div>

      {/* Add Form */}
      <div className="blacklist-add-section">
        <div className="blacklist-input-group">
          <input
            type="text"
            className="blacklist-input"
            placeholder={t('blacklist_domain_placeholder')}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            aria-label={t('blacklist_domain_input_aria')}
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
            {t('blacklist_domain_add_button')}
          </button>
        </div>

        <div id="domain-hint" className="blacklist-hint sr-only">
          {t('blacklist_domain_hint_sr')}
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
            {t('blacklist_domain_limit_warning', String(MAX_BLACKLIST_ENTRIES))}
          </div>
        )}
      </div>

      {/* Domain List */}
      {isLoading ? (
        <div className="blacklist-loading">{t('blacklist_loading')}</div>
      ) : (
        <div className="blacklist-list-section">
          {/* Header Row: Search, Count, Remove All */}
          <div className="blacklist-list-header">
            <BlacklistSearchFilter
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder={t('blacklist_domain_search_placeholder')}
            />
            <span className="blacklist-count">
              {searchTerm ? countText : unitText}
            </span>
            {confirmingRemoveAll ? (
              <div className="confirm-inline" role="alertdialog">
                <p className="confirm-inline__text">{t('blacklist_remove_all_confirm_domains')}</p>
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
                data-testid="domain-clear-all"
                disabled={domains.length === 0}
              >
                {t('blacklist_remove_all_button')}
              </button>
            )}
          </div>

          {/* List or Empty State */}
          {domains.length === 0 ? (
            <div className="blacklist-empty">
              <div className="blacklist-empty-icon">
                <GlobeIcon size={48} />
              </div>
              <p className="blacklist-empty-text">{t('blacklist_domain_empty_title')}</p>
            </div>
          ) : filteredDomains.length === 0 ? (
            <div className="blacklist-empty">
              <div className="blacklist-empty-icon">
                <GlobeIcon size={48} />
              </div>
              <p className="blacklist-empty-text">{t('blacklist_domain_no_match_title')}</p>
              <p className="blacklist-empty-hint">
                {t('blacklist_domain_no_match_hint')}{' '}
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
            <ul className="blacklist-list" data-testid="domain-list" aria-label={t('blacklist_tab_domains')}>
              {filteredDomains.map((domain) => (
                <li key={domain} className="blacklist-item">
                  <span className="blacklist-item-text" title={domain}>
                    {domain}
                  </span>
                  <button
                    type="button"
                    className="blacklist-remove-btn"
                    onClick={() => handleRemove(domain)}
                    aria-label={t('blacklist_domain_remove_aria', domain)}
                    data-testid={`domain-remove-${domain}`}
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
