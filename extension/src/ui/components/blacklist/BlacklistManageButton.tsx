/**
 * ExcludedSitesInline Component
 *
 * Inline preview of excluded domains/URLs matching the v2 prototype:
 * - Up to 3 entries shown with type badge (DOMAIN / URL) + value + remove button
 * - Footer with "+ Add a domain or URL" and "Manage all (N) →" link
 * - Empty state with dashed border
 *
 * Reference: prototypes/settings/main-settings-v2.html
 */

import React, { useState, useEffect, useCallback } from 'react'
import { Plus, X } from 'lucide-react'
import { t } from '@/lib/i18n'
import {
  getBlacklistedDomains,
  getBlacklistedUrls,
  removeBlacklistedDomain,
  removeBlacklistedUrl,
} from '@/lib/utils/blacklist'

export interface BlacklistManageButtonProps {
  onClick: () => void
}

interface ExcludedEntry {
  type: 'domain' | 'url'
  value: string
}

const MAX_INLINE = 3

export function BlacklistManageButton({ onClick }: BlacklistManageButtonProps) {
  const [entries, setEntries] = useState<ExcludedEntry[]>([])
  const [totalCount, setTotalCount] = useState(0)

  const loadEntries = useCallback(async () => {
    try {
      const [domains, urls] = await Promise.all([
        getBlacklistedDomains(),
        getBlacklistedUrls(),
      ])
      const all: ExcludedEntry[] = [
        ...domains.map((d) => ({ type: 'domain' as const, value: d })),
        ...urls.map((u) => ({ type: 'url' as const, value: u })),
      ]
      setTotalCount(all.length)
      setEntries(all.slice(0, MAX_INLINE))
    } catch (error) {
      console.warn('[ExcludedSitesInline] Failed to load entries:', error)
    }
  }, [])

  useEffect(() => {
    void loadEntries()
  }, [loadEntries])

  const handleRemove = useCallback(
    async (entry: ExcludedEntry) => {
      const result =
        entry.type === 'domain'
          ? await removeBlacklistedDomain(entry.value)
          : await removeBlacklistedUrl(entry.value)
      if (result.success) {
        await loadEntries()
      }
    },
    [loadEntries],
  )

  if (totalCount === 0) {
    return (
      <div className="excluded excluded--empty">
        <p className="excluded__empty-text">
          {t('settings_blacklist_empty')}
        </p>
      </div>
    )
  }

  return (
    <div className="excluded">
      {entries.map((entry) => (
        <div key={`${entry.type}-${entry.value}`} className="excluded__row">
          <span className="excluded__type">
            {entry.type === 'domain' ? 'Domain' : 'URL'}
          </span>
          <span className="excluded__value">{entry.value}</span>
          <button
            className="excluded__remove"
            type="button"
            aria-label={`Remove ${entry.value}`}
            onClick={() => handleRemove(entry)}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      ))}
      <div className="excluded__footer">
        <button className="excluded__add" type="button" onClick={onClick}>
          <Plus size={14} aria-hidden="true" />
          {t('settings_blacklist_add_inline')}
        </button>
        <button
          className="excluded__manage"
          type="button"
          onClick={onClick}
        >
          {t('settings_blacklist_manage_all', [String(totalCount)])}
        </button>
      </div>
    </div>
  )
}
