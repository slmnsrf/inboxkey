/**
 * DebugPanel
 * ----------
 * Power-user diagnostics under Settings → Advanced. Renders the
 * extraction debug log written by EmailPollingService — a chronological
 * trace of which gate each polled email passed or failed and why.
 *
 * Default off. The toggle gates whether new entries are recorded; it
 * does NOT clear existing log on flip-off (user explicitly clears).
 *
 * Privacy note: the underlying log redacts OTP code values and strips
 * magic-link query strings. Subject/from are stored verbatim because
 * the user is reviewing their own inbox locally.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Bug, RefreshCw, Trash2, ChevronRight, AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react'
import { StorageFactory } from '@/lib/storage/storage-factory'
import { useToast } from '@/ui/contexts/ToastContext'
import { STORAGE_KEYS } from '@/lib/storage/schema'
import {
  getEntries,
  clearLog,
  EXTRACTION_DEBUG_LOG_CAP,
  type ExtractionLogEntry,
  type ExtractionLogOtp,
  type ExtractionLogLink,
} from '@/lib/services/extraction-debug-log'

type FilterKind = 'all' | 'accepted' | 'rejected' | 'skipped' | 'errors'

const FILTERS: { kind: FilterKind; label: string }[] = [
  { kind: 'all', label: 'All' },
  { kind: 'accepted', label: 'Accepted' },
  { kind: 'rejected', label: 'Rejected' },
  { kind: 'skipped', label: 'Skipped' },
  { kind: 'errors', label: 'Errors' },
]

export function DebugPanel() {
  const { showToast } = useToast()
  const [enabled, setEnabled] = useState<boolean>(false)
  const [entries, setEntries] = useState<ExtractionLogEntry[]>([])
  const [filter, setFilter] = useState<FilterKind>('all')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState<boolean>(true)
  const [confirmingClear, setConfirmingClear] = useState<boolean>(false)

  const loadEnabled = useCallback(async () => {
    try {
      const storage = await StorageFactory.create()
      const settings = await storage.getSettings()
      setEnabled(settings.extractionDebugLogEnabled === true)
    } catch (err) {
      console.warn('[DebugPanel] failed to load setting:', err)
    }
  }, [])

  const loadEntries = useCallback(async () => {
    const list = await getEntries()
    setEntries(list)
  }, [])

  // Initial load + chrome.storage subscription so the list live-updates as
  // new entries arrive while the user is watching.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      await Promise.all([loadEnabled(), loadEntries()])
      if (!cancelled) setLoading(false)
    })()

    const onStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string
    ) => {
      if (area !== 'local') return
      if (changes[STORAGE_KEYS.EXTRACTION_DEBUG_LOG]) {
        const next = changes[STORAGE_KEYS.EXTRACTION_DEBUG_LOG]?.newValue
        setEntries(Array.isArray(next) ? (next as ExtractionLogEntry[]) : [])
      }
      if (changes[STORAGE_KEYS.SETTINGS]) {
        const next = changes[STORAGE_KEYS.SETTINGS]?.newValue
        if (next && typeof next === 'object') {
          setEnabled(Boolean((next as { extractionDebugLogEnabled?: boolean }).extractionDebugLogEnabled))
        }
      }
    }

    chrome.storage.onChanged.addListener(onStorageChange)
    return () => {
      cancelled = true
      chrome.storage.onChanged.removeListener(onStorageChange)
    }
  }, [loadEnabled, loadEntries])

  const handleToggle = async () => {
    try {
      const newValue = !enabled
      setEnabled(newValue)
      const storage = await StorageFactory.create()
      await storage.updateSettings({ extractionDebugLogEnabled: newValue })
      showToast(
        newValue
          ? 'Extraction debug log enabled'
          : 'Extraction debug log disabled (existing entries kept)',
        'success'
      )
    } catch (err) {
      console.warn('[DebugPanel] toggle failed:', err)
      setEnabled(!enabled)
      showToast('Failed to update setting', 'error')
    }
  }

  const handleClear = async () => {
    try {
      await clearLog()
      setEntries([])
      setExpanded(new Set())
      setConfirmingClear(false)
      showToast('Debug log cleared', 'success')
    } catch (err) {
      console.warn('[DebugPanel] clear failed:', err)
      showToast('Failed to clear log', 'error')
    }
  }

  const filtered = useMemo(() => {
    if (filter === 'all') return entries
    return entries.filter((e) => {
      switch (e.outcome.kind) {
        case 'extracted':
          return filter === (e.outcome.passed ? 'accepted' : 'rejected')
        case 'skipped-too-old':
        case 'skipped-seen':
          return filter === 'skipped'
        case 'extraction-error':
        case 'provider-error':
          return filter === 'errors'
        default:
          return false
      }
    })
  }, [entries, filter])

  const toggleExpand = (i: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  if (loading) {
    return (
      <div className="advanced-debug-panel advanced-debug-panel--loading">
        <span>Loading…</span>
      </div>
    )
  }

  return (
    <div className="advanced-debug-panel">
      <div className="setting-divider" />

      <div className="setting-row">
        <div className="setting-row__info">
          <label htmlFor="extraction-debug-log-toggle" className="setting-row__label">
            <Bug size={14} aria-hidden="true" style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />
            Extraction debug log
          </label>
          <p className="setting-row__description">
            Record how each polled email is processed (scores, gate decisions, redacted code candidates). Stored locally only. OTP codes redacted; magic-link query strings stripped.
          </p>
        </div>
        <div className="setting-row__control">
          <label className="toggle">
            <input
              id="extraction-debug-log-toggle"
              type="checkbox"
              checked={enabled}
              onChange={handleToggle}
              aria-describedby="extraction-debug-log-help"
            />
            <span className="slider" />
          </label>
        </div>
      </div>

      <p id="extraction-debug-log-help" className="advanced-settings-card__hint">
        Capacity {EXTRACTION_DEBUG_LOG_CAP} entries (newest first). Disabling does not auto-clear; use the button below.
      </p>

      <div className="advanced-debug-panel__toolbar">
        <div className="advanced-debug-panel__filters" role="tablist" aria-label="Filter debug entries">
          {FILTERS.map((f) => (
            <button
              key={f.kind}
              type="button"
              role="tab"
              aria-selected={filter === f.kind}
              className={
                'advanced-debug-panel__filter-btn' +
                (filter === f.kind ? ' advanced-debug-panel__filter-btn--active' : '')
              }
              onClick={() => setFilter(f.kind)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="advanced-debug-panel__actions">
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={loadEntries}
            aria-label="Refresh entries"
          >
            <RefreshCw size={12} />
            Refresh
          </button>
          {confirmingClear ? (
            <div className="confirm-inline" role="alertdialog">
              <p className="confirm-inline__text">Clear all entries?</p>
              <div className="confirm-inline__actions">
                <button type="button" className="btn btn--danger btn--sm" onClick={handleClear}>
                  Clear
                </button>
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  onClick={() => setConfirmingClear(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() => setConfirmingClear(true)}
              disabled={entries.length === 0}
            >
              <Trash2 size={12} />
              Clear log
            </button>
          )}
        </div>
      </div>

      <div className="advanced-debug-panel__count">
        {filtered.length === entries.length
          ? `${entries.length} entries`
          : `${filtered.length} of ${entries.length} entries`}
      </div>

      {filtered.length === 0 ? (
        <div className="advanced-debug-panel__empty">
          {entries.length === 0
            ? enabled
              ? 'No entries yet. Trigger a code-detection flow and refresh.'
              : 'No entries. Enable the toggle above to start recording.'
            : 'No entries match this filter.'}
        </div>
      ) : (
        <ul className="advanced-debug-panel__list" role="list">
          {filtered.map((entry, i) => (
            <DebugEntryRow
              key={entry.ts + ':' + entry.message.id + ':' + i}
              entry={entry}
              expanded={expanded.has(i)}
              onToggle={() => toggleExpand(i)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

interface DebugEntryRowProps {
  entry: ExtractionLogEntry
  expanded: boolean
  onToggle: () => void
}

function DebugEntryRow({ entry, expanded, onToggle }: DebugEntryRowProps) {
  const ts = new Date(entry.ts).toLocaleTimeString()
  const subject = entry.message.subject?.slice(0, 60) ?? '(no subject)'
  const from = entry.message.from ?? '(unknown)'
  const badge = badgeFor(entry.outcome)

  return (
    <li className="advanced-debug-panel__entry">
      <button
        type="button"
        className="advanced-debug-panel__entry-summary"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span className="advanced-debug-panel__entry-time">{ts}</span>
        <span
          className={`advanced-debug-panel__badge advanced-debug-panel__badge--${badge.tone}`}
        >
          {badge.icon}
          {badge.label}
        </span>
        <span className="advanced-debug-panel__entry-subject" title={entry.message.subject}>
          {subject}
        </span>
        <span className="advanced-debug-panel__entry-from" title={from}>
          {from}
        </span>
        <ChevronRight
          size={12}
          className={
            'advanced-debug-panel__entry-chev' +
            (expanded ? ' advanced-debug-panel__entry-chev--expanded' : '')
          }
        />
      </button>

      {expanded && <DebugEntryDetails entry={entry} />}
    </li>
  )
}

function DebugEntryDetails({ entry }: { entry: ExtractionLogEntry }) {
  const o = entry.outcome
  return (
    <div className="advanced-debug-panel__entry-details">
      <DetailRow label="Mailbox">{entry.mailboxId}</DetailRow>
      <DetailRow label="Provider">{entry.provider}</DetailRow>
      <DetailRow label="Extractor">v{entry.extractorVersion}</DetailRow>
      <DetailRow label="Message ID">
        <code>{entry.message.id || '(none)'}</code>
      </DetailRow>
      {entry.message.receivedEpochMs && (
        <DetailRow label="Received">
          {new Date(entry.message.receivedEpochMs).toLocaleString()}
        </DetailRow>
      )}
      <DetailRow label="Body lengths">
        text={entry.message.bodyTextLen} · html={entry.message.bodyHtmlLen}
        {entry.message.bodyTextLen === 0 && entry.message.bodyHtmlLen === 0 && (
          <span className="advanced-debug-panel__warn"> ⚠ both empty</span>
        )}
      </DetailRow>

      <div className="setting-divider" />

      {o.kind === 'extracted' && (
        <>
          <DetailRow label="Decision">
            {o.passed ? 'PASSED gate' : 'FAILED gate'} (top {o.topScore.toFixed(3)} vs min {o.minScore.toFixed(3)})
          </DetailRow>

          <div className="advanced-debug-panel__sub">
            <strong>OTP candidates ({o.otps.length})</strong>
            {o.otps.length === 0 ? (
              <span className="advanced-debug-panel__muted">none</span>
            ) : (
              <ul>
                {o.otps.map((otp, i) => (
                  <li key={i}>
                    <OtpRow otp={otp} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="advanced-debug-panel__sub">
            <strong>Link candidates ({o.links.length})</strong>
            {o.links.length === 0 ? (
              <span className="advanced-debug-panel__muted">none</span>
            ) : (
              <ul>
                {o.links.map((link, i) => (
                  <li key={i}>
                    <LinkRow link={link} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {o.kind === 'skipped-too-old' && (
        <DetailRow label="Reason">
          Outside time window. Age {Math.round(o.ageMs / 1000)}s · threshold {Math.round(o.thresholdMs / 1000)}s
        </DetailRow>
      )}

      {o.kind === 'skipped-seen' && (
        <DetailRow label="Reason">Already processed under this extractor version (seen-store hit).</DetailRow>
      )}

      {(o.kind === 'extraction-error' || o.kind === 'provider-error') && (
        <DetailRow label={o.kind === 'extraction-error' ? 'Extraction error' : 'Provider error'}>
          <code className="advanced-debug-panel__error">{o.error}</code>
        </DetailRow>
      )}
    </div>
  )
}

function OtpRow({ otp }: { otp: ExtractionLogOtp }) {
  const [revealed, setRevealed] = useState(false)
  return (
    <div className="advanced-debug-panel__otp">
      <code>{revealed ? '(redacted-only by design)' : otp.codeRedacted}</code>
      <span className="advanced-debug-panel__muted">
        · {otp.charset} · conf {otp.confidence.toFixed(3)}
        {otp.keyword && ` · keyword "${otp.keyword}"`}
        {otp.keywordDistance !== undefined && ` · dist ${otp.keywordDistance}`}
      </span>
      {otp.snippet && (
        <button
          type="button"
          className="advanced-debug-panel__icon-btn"
          onClick={() => setRevealed(!revealed)}
          aria-label="Toggle context snippet"
          title={revealed ? 'Hide snippet' : 'Show snippet'}
        >
          {revealed ? <EyeOff size={11} /> : <Eye size={11} />}
        </button>
      )}
      {revealed && otp.snippet && (
        <div className="advanced-debug-panel__snippet">{otp.snippet}</div>
      )}
    </div>
  )
}

function LinkRow({ link }: { link: ExtractionLogLink }) {
  return (
    <div className="advanced-debug-panel__link">
      <code>
        {link.domain}
        {link.pathPreview ?? ''}
      </code>
      <span className="advanced-debug-panel__muted">
        · score {link.score.toFixed(3)}
        {link.reasons.length > 0 && ` · reasons: ${link.reasons.join(', ')}`}
      </span>
    </div>
  )
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="advanced-debug-panel__detail-row">
      <span className="advanced-debug-panel__detail-label">{label}</span>
      <span className="advanced-debug-panel__detail-value">{children}</span>
    </div>
  )
}

function badgeFor(outcome: ExtractionLogEntry['outcome']): {
  label: string
  tone: 'pass' | 'fail' | 'skip' | 'error'
  icon: React.ReactNode
} {
  switch (outcome.kind) {
    case 'extracted':
      return outcome.passed
        ? { label: 'accepted', tone: 'pass', icon: <CheckCircle2 size={11} aria-hidden="true" /> }
        : { label: 'rejected', tone: 'fail', icon: <AlertCircle size={11} aria-hidden="true" /> }
    case 'skipped-too-old':
      return { label: 'too old', tone: 'skip', icon: null }
    case 'skipped-seen':
      return { label: 'seen', tone: 'skip', icon: null }
    case 'extraction-error':
      return { label: 'extract err', tone: 'error', icon: <AlertCircle size={11} aria-hidden="true" /> }
    case 'provider-error':
      return { label: 'provider err', tone: 'error', icon: <AlertCircle size={11} aria-hidden="true" /> }
  }
}
