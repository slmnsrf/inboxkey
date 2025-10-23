/**
 * Popup Bridge Service
 *
 * Handles communication between popup UI and background worker.
 * Includes fallback to direct storage reads if SW is dead.
 */

import type { PopupCache, PopupRequest, PopupResponse, SyncErrorInfo } from '@/shared/popup-messages'

/**
 * Lock status interface
 */
export interface LockStatus {
  isInitialized: boolean
  isUnlocked: boolean
}

export class PopupBridge {
  /**
   * Get popup data from background worker.
   */
  async getPopupData(timeout = 5000): Promise<PopupCache> {
    const response = await this.sendMessage<PopupCache>(
      { type: 'GET_POPUP_DATA' },
      timeout
    )
    return response
  }

  /**
   * Get lock status from background.
   */
  async getLockStatus(): Promise<LockStatus> {
    const response = await chrome.runtime.sendMessage({ type: 'GET_LOCK_STATUS' })
    if (!response.success) {
      throw new Error(response.error)
    }
    return {
      isInitialized: response.isInitialized,
      isUnlocked: response.isUnlocked,
    }
  }

  /**
   * Mark a code as used (when copied).
   */
  async markCodeUsed(code: string): Promise<void> {
    await chrome.runtime.sendMessage({ type: 'MARK_CODE_USED', code })
  }

  /**
   * Mark a magic link as opened.
   */
  async markLinkOpened(url: string): Promise<void> {
    await chrome.runtime.sendMessage({ type: 'MARK_LINK_OPENED', url })
  }

  /**
   * Mark all codes as seen (called when popup opens).
   */
  async markCodesSeen(): Promise<void> {
    return this.sendMessage({ type: 'MARK_CODES_SEEN' })
  }

  /**
   * Get the current tab's domain (eTLD+1).
   */
  async getCurrentTabDomain(): Promise<string> {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tabs[0]?.url) {
      throw new Error('No active tab found')
    }

    // Import domain utility
    const { extractDomain } = await import('@/lib/utils/domain')
    return extractDomain(tabs[0].url)
  }

  /**
   * Get domain preference for a specific domain.
   */
  async getDomainPreference(domain: string): Promise<boolean> {
    const { isDomainEnabled } = await import('@/lib/utils/domain')
    return isDomainEnabled(domain)
  }

  /**
   * Set domain preference for a specific domain.
   */
  async setDomainPreference(domain: string, enabled: boolean): Promise<void> {
    const response = await chrome.runtime.sendMessage({
      type: 'SET_DOMAIN_PREFERENCE',
      domain,
      enabled
    })

    if (!response.success) {
      throw new Error(response.error || 'Failed to set domain preference')
    }
  }

  /**
   * Trigger manual email sync.
   * @returns New popup data with updated codes
   */
  async triggerSync(): Promise<PopupCache> {
    const response = await chrome.runtime.sendMessage({ type: 'TRIGGER_SYNC' })
    if (!response.success) {
      throw new Error(response.error)
    }
    return response.data
  }

  /**
   * Get current sync error state from background.
   * @returns Sync error info or null if no error
   */
  async getSyncError(): Promise<SyncErrorInfo | null> {
    return this.sendMessage<SyncErrorInfo | null>({ type: 'GET_SYNC_ERROR' })
  }

  private async sendMessage<T>(
    request: PopupRequest,
    timeout = 5000
  ): Promise<T> {
    return Promise.race([
      chrome.runtime.sendMessage(request).then((response: PopupResponse) => {
        if (!response.success) {
          throw new Error(response.error)
        }
        // Type guard to handle union type
        if ('data' in response) {
          return response.data as T
        }
        if ('mailboxes' in response) {
          return response.mailboxes as T
        }
        if ('error' in response) {
          return response.error as T
        }
        // For { success: true } responses with no data (e.g., MARK_CODES_SEEN)
        return undefined as T
      }),
      this.timeoutPromise(timeout)
    ]).catch(async (err) => {
      // Fallback: read directly from storage if SW is dead
      if (request.type === 'GET_POPUP_DATA') {
        return this.readCacheFromStorage() as T
      }
      throw err
    })
  }

  private timeoutPromise(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout')), ms)
    })
  }

  private async readCacheFromStorage(): Promise<PopupCache> {
    const result = await chrome.storage.session.get('inboxkey.popup_cache')
    return result['inboxkey.popup_cache'] || {
      codes: [],
      magicLinks: [],
      lastSync: 0,
      mailboxCount: 0
    }
  }
}
