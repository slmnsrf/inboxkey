/**
 * Popup Bridge Service
 *
 * Handles communication between popup UI and background worker.
 * Includes fallback to direct storage reads if SW is dead.
 */

import type { PopupCache, PopupRequest, PopupResponse } from '@/shared/popup-messages'

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
        throw new Error('Invalid response format')
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
