/**
 * InboxKey Popup UI
 *
 * Main popup component that displays recent verification codes and magic links.
 * Designed for <200ms open time with cached data.
 */

import React, { useEffect, useState } from 'react'
import { ThemeProvider } from './ui/contexts/ThemeContext'
import { ToastProvider, useToast } from './ui/contexts/ToastContext'
import { ToastContainer } from './ui/components/ToastContainer'
import { ErrorBanner } from './ui/components/ErrorBanner'
import { PopupFooter } from './ui/components/PopupFooter'
import { Header } from './ui/components/Header'
import { CodeListSection } from './ui/components/CodeListSection'
import { MagicLinkSection } from './ui/components/MagicLinkSection'
import { RecentItemsSection } from './ui/components/RecentItemsSection'
import { LoadingSkeleton } from './ui/components/LoadingSkeleton'
import { usePopupData } from './ui/hooks/usePopupData'
import { useSyncErrors } from './ui/hooks/useSyncErrors'
import { PopupBridge } from './ui/services/popup-bridge'
import { ClipboardService } from './ui/services/clipboard-service'
import { LinkService } from './ui/services/link-service'
import { PopupErrorBoundary } from './ui/components/PopupErrorBoundary'
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
  const [justSynced, setJustSynced] = useState(false)

  // Mark codes as seen when popup opens
  useEffect(() => {
    bridge.markCodesSeen().catch((err) => {
      console.warn('[Popup] Failed to mark codes as seen:', err)
    })
  }, [])

  const handleCopy = async (code: string) => {
    try {
      await clipboardService.copyCode(code)
      await bridge.markCodeUsed(code)
      // Visual feedback via code text color flash - no toast needed
    } catch (err) {
      showToast(t('toast_error_copy'), 'error', 5000)
      console.error('[Popup] Copy failed:', err)
    }
  }

  const handleOpenLink = async (link: PopupCacheMagicLink) => {
    try {
      await linkService.openLink(link)
      await bridge.markLinkOpened(link.url)
      // Visual feedback via button text color transition - no toast needed
    } catch (err) {
      if (err instanceof Error && err.message.includes('wait')) {
        showToast(t('toast_rate_limited'), 'error', 5000)
      } else {
        showToast(t('toast_error_link'), 'error', 5000)
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

      // Trigger green flash on sync status
      setJustSynced(true)

      // Auto-reset after 3 seconds (matches CSS transition duration)
      setTimeout(() => {
        setJustSynced(false)
      }, 3000)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Sync failed'
      showToast(errorMsg, 'error', 5000)
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

  const isSyncing = isManualSyncing || isAutoSyncing

  return (
    <div className="popup-container" aria-label={t('popup_title')}>
      <Header
        mailboxCount={data.mailboxCount}
        lastSync={data.lastSync}
        onSync={handleSync}
        isSyncing={isSyncing}
        justSynced={justSynced}
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
        {/* Use unified section if available (V2), otherwise fall back to legacy separate sections */}
        {'items' in data && data.items ? (
          <RecentItemsSection
            items={data.items}
            onCopyCode={handleCopy}
            onOpenLink={handleOpenLink}
          />
        ) : (
          <>
            <CodeListSection codes={data.codes} onCopy={handleCopy} />
            <MagicLinkSection links={data.magicLinks} onOpen={handleOpenLink} />
          </>
        )}
      </main>
      <PopupFooter />
      <ToastContainer />
    </div>
  )
}

function PopupApp() {
  return (
    <PopupErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <PopupContent />
        </ToastProvider>
      </ThemeProvider>
    </PopupErrorBoundary>
  )
}

export default PopupApp
