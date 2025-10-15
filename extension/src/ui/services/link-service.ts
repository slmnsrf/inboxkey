/**
 * Link Service
 *
 * Handles magic link operations with security checks:
 * - HTTPS validation
 * - Confirmation for reset links
 * - Rate limiting (max 5 links per minute)
 */

import type { PopupCacheMagicLink } from '@/shared/popup-messages'

export class LinkService {
  private openCount = 0
  private lastResetTime = Date.now()

  /**
   * Open magic link with security checks.
   */
  async openLink(link: PopupCacheMagicLink): Promise<void> {
    // 1. HTTPS validation (defense in depth)
    if (!link.url.startsWith('https://')) {
      throw new Error('Only HTTPS links are allowed')
    }

    // 2. Confirmation for reset links
    if (link.type === 'reset') {
      const confirmed = confirm(
        'Open Password Reset Link?\n\n' +
        'This will open a password reset link. Make sure you initiated this request.'
      )
      if (!confirmed) {
        return
      }
    }

    // 3. Rate limiting (max 5 links per minute)
    if (!this.checkRateLimit()) {
      throw new Error('Too many link opens. Please wait.')
    }

    // 4. Open in new tab
    await chrome.tabs.create({ url: link.url })
  }

  private checkRateLimit(): boolean {
    const now = Date.now()

    // Reset counter every minute
    if (now - this.lastResetTime > 60_000) {
      this.openCount = 0
      this.lastResetTime = now
    }

    if (this.openCount >= 5) {
      return false
    }

    this.openCount++
    return true
  }
}
