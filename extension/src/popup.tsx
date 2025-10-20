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
import { PopupFooter } from './ui/components/PopupFooter'
import { Header } from './ui/components/Header'
import { CodeListSection } from './ui/components/CodeListSection'
import { MagicLinkSection } from './ui/components/MagicLinkSection'
import { LoadingSkeleton } from './ui/components/LoadingSkeleton'
import { usePopupData } from './ui/hooks/usePopupData'
import { PopupBridge } from './ui/services/popup-bridge'
import { ClipboardService } from './ui/services/clipboard-service'
import { LinkService } from './ui/services/link-service'
import { needsMigration } from '@/lib/storage/migration-to-plaintext'
import { MigrationDialog } from './ui/components/migration/MigrationDialog'
import './popup.css'
import './ui/components/migration/MigrationDialog.css'
import type { PopupCacheMagicLink } from '@/shared/popup-messages'
import { t } from '@/lib/i18n'

const bridge = new PopupBridge()
const clipboardService = new ClipboardService()
const linkService = new LinkService()
function PopupContent() {
  const { data, loading, error, refresh } = usePopupData()
  const { showToast } = useToast()
  const [isSyncing, setIsSyncing] = useState(false)
  const [showMigration, setShowMigration] = useState(false)
  const [checkingMigration, setCheckingMigration] = useState(true)

  // Check for migration needs on mount
  useEffect(() => {
    checkMigrationStatus()
  }, [])

  async function checkMigrationStatus() {
    try {
      const needed = await needsMigration()
      setShowMigration(needed)
    } catch (error) {
      console.error('[Popup] Failed to check migration status:', error)
    } finally {
      setCheckingMigration(false)
    }
  }

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
    if (isSyncing) return

    setIsSyncing(true)
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
      setIsSyncing(false)
    }
  }

  // Show loading skeleton while checking migration or loading data
  if (checkingMigration || loading) {
    return <LoadingSkeleton />
  }

  // Show migration dialog if migration needed (highest priority)
  if (showMigration) {
    return (
      <MigrationDialog
        onComplete={async () => {
          setShowMigration(false)
          // Clear badge
          chrome.action.setBadgeText({ text: '' })
          // Refresh data after migration
          await refresh()
        }}
        onSkip={async () => {
          setShowMigration(false)
          // Clear badge
          chrome.action.setBadgeText({ text: '' })
          // Refresh data after skip
          await refresh()
        }}
      />
    )
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

  const bestCode = hasCodes ? data.codes[0] : null
  const latestLink = hasLinks ? data.magicLinks[0] : null

  return (
    <div className="popup-container" aria-label={t('popup_title')}>
      <Header
        mailboxCount={data.mailboxCount}
        lastSync={data.lastSync}
        onSync={handleSync}
        isSyncing={isSyncing}
      />
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
