/**
 * InboxKey Popup UI
 *
 * Main popup component that displays recent verification codes and magic links.
 * Designed for <200ms open time with cached data.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { ThemeProvider } from './ui/contexts/ThemeContext'
import { ToastProvider, useToast } from './ui/contexts/ToastContext'
import { ToastContainer } from './ui/components/ToastContainer'
import { ErrorBanner } from './ui/components/ErrorBanner'
import { PopupFooter } from './ui/components/PopupFooter'
import { Header } from './ui/components/Header'
import { CodeListSection } from './ui/components/CodeListSection'
import { MagicLinkSection } from './ui/components/MagicLinkSection'
import { LoadingSkeleton } from './ui/components/LoadingSkeleton'
import { usePopupData } from './ui/hooks/usePopupData'
import { useSyncErrors } from './ui/hooks/useSyncErrors'
import { PopupBridge } from './ui/services/popup-bridge'
import { ClipboardService } from './ui/services/clipboard-service'
import { LinkService } from './ui/services/link-service'
import './popup.css'
import type { PopupCacheMagicLink } from '@/shared/popup-messages'
import { t } from '@/lib/i18n'

const bridge = new PopupBridge()
const clipboardService = new ClipboardService()
const linkService = new LinkService()
function PopupContent() {
  const { data, loading, error, refresh, isSyncing: isAutoSyncing } = usePopupData()
  const { showToast } = useToast()
  const { syncError, dismissSyncError } = useSyncErrors()
  const [isManualSyncing, setIsManualSyncing] = useState(false)
  const [currentTabDomain, setCurrentTabDomain] = useState<string | null>(null)

  // Get current tab domain for link matching
  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.url) {
        try {
          const url = new URL(tabs[0].url)
          setCurrentTabDomain(url.hostname)
        } catch (e) {
          console.warn('[Popup] Failed to parse tab URL:', e)
        }
      }
    })
  }, [])

  // Mark codes as seen when popup opens
  useEffect(() => {
    bridge.markCodesSeen().catch((err) => {
      console.warn('[Popup] Failed to mark codes as seen:', err)
    })
  }, [])

  const hasCodes = useMemo(() => (data?.codes?.length ?? 0) > 0, [data])
  const hasLinks = useMemo(() => (data?.magicLinks?.length ?? 0) > 0, [data])

  const handleCopy = async (code: string) => {
    try {
      await clipboardService.copyCode(code)
      await bridge.markCodeUsed(code)
      showToast(`📋 Code copied: ${code}`, 'success', 3000)
    } catch (err) {
      showToast('⚠️ Failed to copy code', 'error', 5000)
      console.error('[Popup] Copy failed:', err)
    }
  }

  const handleOpenLink = async (link: PopupCacheMagicLink) => {
    try {
      await linkService.openLink(link)
      await bridge.markLinkOpened(link.url)
      const domain = link.source || new URL(link.url).hostname
      showToast(`🔗 Opened ${domain}`, 'success', 3000)
    } catch (err) {
      if (err instanceof Error && err.message.includes('wait')) {
        showToast('⚠️ Too many link opens. Wait...', 'error', 5000)
      } else {
        showToast('⚠️ Failed to open link', 'error', 5000)
      }
      console.error('[Popup] Open link failed:', err)
    }
  }

  const handleSync = async () => {
    if (isManualSyncing || isAutoSyncing) return

    setIsManualSyncing(true)
    try {
      await bridge.triggerSync()
      await refresh()
      const mailboxCount = data?.mailboxCount ?? 0
      const message = mailboxCount > 0
        ? `Synced ${mailboxCount} ${mailboxCount === 1 ? 'account' : 'accounts'}`
        : 'Synced successfully'
      showToast(message, 'success', 3000)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Sync failed'
      showToast(`⚠️ ${errorMsg}`, 'error', 5000)
      console.error('[Popup] Sync failed:', err)
    } finally {
      setIsManualSyncing(false)
    }
  }

  // Show loading skeleton while loading data
  if (loading) {
    return <LoadingSkeleton />
  }

  if (error) {
    return (
      <div className="popup-error">
        <h2>Error Loading Data</h2>
        <p>{error}</p>
      </div>
    )
  }

  if (!data) {
    return <LoadingSkeleton />
  }

  /**
   * Get best code with domain-first logic:
   * - If 2+ codes: prefer domain-matched (domainAffinity > 0), else most recent
   * - If 1 code: just return it
   */
  const getBestCode = () => {
    if (!hasCodes || !data.codes.length) return null
    if (data.codes.length === 1) return data.codes[0]

    // Find domain-matched code (domainAffinity > 0 means matches current tab)
    const domainMatchedCode = data.codes.find((c) => c.domainAffinity && c.domainAffinity > 0)
    return domainMatchedCode || data.codes[0]
  }

  /**
   * Get best link with domain-first logic:
   * - If 2+ links: prefer current-domain link, else most recent
   * - If 1 link: just return it
   */
  const getBestLink = () => {
    if (!hasLinks || !data.magicLinks.length) return null
    if (data.magicLinks.length === 1) return data.magicLinks[0]

    // Find link matching current tab domain
    if (currentTabDomain) {
      const domainMatchedLink = data.magicLinks.find((link) => {
        try {
          const linkUrl = new URL(link.url)
          const linkHostname = linkUrl.hostname
          // Exact match or subdomain match
          return (
            linkHostname === currentTabDomain ||
            linkHostname.endsWith('.' + currentTabDomain) ||
            currentTabDomain.endsWith('.' + linkHostname)
          )
        } catch (e) {
          return false
        }
      })
      if (domainMatchedLink) return domainMatchedLink
    }

    // No domain match: return most recent
    return data.magicLinks[0]
  }

  const bestCode = getBestCode()
  const latestLink = getBestLink()

  const isSyncing = isManualSyncing || isAutoSyncing

  return (
    <div className="popup-container" aria-label={t('popup_title')}>
      <Header
        mailboxCount={data.mailboxCount}
        lastSync={data.lastSync}
        onSync={handleSync}
        isSyncing={isSyncing}
      />
      {syncError && (
        <ErrorBanner
          variant={syncError.variant}
          type={syncError.type}
          message={syncError.message}
          actionLabel={syncError.actionLabel}
          onAction={syncError.onAction}
          onDismiss={() => dismissSyncError(syncError.type)}
        />
      )}
      <main className="popup-main" aria-live="polite">
        <div className="popup-quick-actions" role="group" aria-label={t('popup_quick_actions')}>
          <button
            type="button"
            className="popup-quick-actions__button popup-quick-actions__button--primary"
            onClick={() => bestCode && handleCopy(bestCode.code)}
            disabled={!bestCode}
          >
            {t('button_paste_best')}
          </button>
          <button
            type="button"
            className="popup-quick-actions__button popup-quick-actions__button--secondary"
            onClick={() => latestLink && handleOpenLink(latestLink)}
            disabled={!latestLink}
          >
            {t('button_open_last')}
          </button>
        </div>
        <CodeListSection codes={data.codes} onCopy={handleCopy} />
        <MagicLinkSection links={data.magicLinks} onOpen={handleOpenLink} />
      </main>
      <PopupFooter />
      <ToastContainer />
    </div>
  )
}

function PopupApp() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <PopupContent />
      </ToastProvider>
    </ThemeProvider>
  )
}

export default PopupApp
