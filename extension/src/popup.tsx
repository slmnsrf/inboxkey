/**
 * InboxKey Popup UI
 *
 * Main popup component that displays recent verification codes and magic links.
 * Designed for <200ms open time with cached data.
 */

import React, { useState } from 'react'
import { LockProvider, useLockContext } from './ui/contexts/LockContext'
import { ThemeProvider } from './ui/contexts/ThemeContext'
import { ToastProvider, useToast } from './ui/contexts/ToastContext'
import { ToastContainer } from './ui/components/ToastContainer'
import { PopupLockOverlay } from './ui/components/security'
import { PopupFooter } from './ui/components/PopupFooter'
import { Header } from './ui/components/Header'
import { CodeListSection } from './ui/components/CodeListSection'
import { MagicLinkSection } from './ui/components/MagicLinkSection'
import { LoadingSkeleton } from './ui/components/LoadingSkeleton'
import { usePopupData } from './ui/hooks/usePopupData'
import { PopupBridge } from './ui/services/popup-bridge'
import { ClipboardService } from './ui/services/clipboard-service'
import { LinkService } from './ui/services/link-service'
import './popup.css'
import type { PopupCacheMagicLink } from '@/shared/popup-messages'

const bridge = new PopupBridge()
const clipboardService = new ClipboardService()
const linkService = new LinkService()
function PopupContent() {
  const { data, loading, error, refresh } = usePopupData()
  const { isInitialized, isUnlocked, isLoading, lock } = useLockContext()
  const { showToast } = useToast()
  const [isSyncing, setIsSyncing] = useState(false)
  const [isLocking, setIsLocking] = useState(false)

  const handleCopy = async (code: string) => {
    try {
      await clipboardService.copyCode(code)
      await bridge.markCodeUsed(code)
      showToast('✓ Copied to clipboard', 'success')
    } catch (err) {
      showToast('Failed to copy code', 'error')
      console.error('[Popup] Copy failed:', err)
    }
  }

  const handleOpenLink = async (link: PopupCacheMagicLink) => {
    try {
      await linkService.openLink(link)
      await bridge.markLinkOpened(link.url)
      showToast('✓ Link opened', 'success')
    } catch (err) {
      if (err instanceof Error && err.message.includes('wait')) {
        showToast('Too many link opens. Please wait.', 'error')
      } else {
        showToast('Failed to open link', 'error')
      }
      console.error('[Popup] Open link failed:', err)
    }
  }

  const handleUnlock = async () => {
    // Refresh data after unlocking
    await refresh()
  }

  const handleSync = async () => {
    if (isSyncing) return

    setIsSyncing(true)
    try {
      await bridge.triggerSync()
      await refresh()
      showToast('✓ Synced successfully', 'success')
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Sync failed'
      showToast(errorMsg, 'error')
      console.error('[Popup] Sync failed:', err)
    } finally {
      setIsSyncing(false)
    }
  }

  const handleLock = async () => {
    if (isLocking) return

    setIsLocking(true)
    try {
      await lock()
      // No toast needed - UI will update to show lock screen
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to lock extension'
      showToast(errorMsg, 'error')
      console.error('[Popup] Lock failed:', err)
    } finally {
      setIsLocking(false)
    }
  }

  // Show loading skeleton while data or lock status is loading
  if (loading || isLoading) {
    return <LoadingSkeleton />
  }

  // Show lock screen if initialized and locked
  if (isInitialized && !isUnlocked) {
    return <PopupLockOverlay onUnlock={handleUnlock} />
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

  return (
    <div className="popup-container">
      <Header
        mailboxCount={data.mailboxCount}
        lastSync={data.lastSync}
        onSync={handleSync}
        isSyncing={isSyncing}
        showLockButton={isInitialized && isUnlocked}
        onLock={handleLock}
        isLocking={isLocking}
      />
      <CodeListSection codes={data.codes} onCopy={handleCopy} />
      <MagicLinkSection links={data.magicLinks} onOpen={handleOpenLink} />
      <PopupFooter />
      <ToastContainer />
    </div>
  )
}

function PopupApp() {
  return (
    <ThemeProvider>
      <LockProvider>
        <ToastProvider>
          <PopupContent />
        </ToastProvider>
      </LockProvider>
    </ThemeProvider>
  )
}

export default PopupApp
