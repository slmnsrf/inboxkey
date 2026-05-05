/**
 * Notification Module
 * Displays toast notifications to users within content script context
 */

export const config = {
  matches: ["https://*/*"],
}

import { COLOR_SUCCESS, COLOR_ERROR, COLOR_PRIMARY } from '@/lib/design-tokens'
import { isHTMLDocument } from '@/lib/utils/is-html-document'
import { t } from '@/lib/i18n'

interface NotificationOptions {
  title: string
  message: string
  duration?: number // milliseconds, default 12000
  type?: 'success' | 'error' | 'info'
  /**
   * When true, render a small "×" close button that dismisses the toast
   * immediately on click. Defaults to true; pass false for terse,
   * non-actionable status toasts that don't need a control.
   */
  dismissible?: boolean
}

const STYLE_ID = 'inboxkey-notification-styles'
const ANIMATION_DURATION_MS = 300

/**
 * Pending dismiss/fade timers, so cancelPendingNotifications() can
 * clear them on page unload / SPA route change instead of leaking
 * callbacks that fire against a stale document.
 */
const pendingTimers = new Set<ReturnType<typeof setTimeout>>()

function trackTimer(id: ReturnType<typeof setTimeout>): ReturnType<typeof setTimeout> {
  pendingTimers.add(id)
  return id
}

export function cancelPendingNotifications(): void {
  for (const id of pendingTimers) {
    clearTimeout(id)
  }
  pendingTimers.clear()
}

/**
 * Show a toast notification to the user
 */
export function showNotification(options: NotificationOptions): void {
  // Bail out on non-HTML documents where document.body/document.head are null.
  // Defense-in-depth for content scripts injected into SVG/XML pages.
  if (!isHTMLDocument()) return

  const { title, message, duration = 12000, type = 'success', dismissible = true } = options

  // Inject styles if not already present
  injectStyles()

  // Create notification element
  const notification = createNotificationElement(title, message, type, dismissible)

  // Add to DOM
  document.body.appendChild(notification)

  // Auto-dismiss after duration. Tracked so an explicit close click can
  // cancel the timer and the toast doesn't try to fade twice.
  const dismissId = trackTimer(setTimeout(() => {
    pendingTimers.delete(dismissId)
    dismissNotification(notification)
  }, duration))

  if (dismissible) {
    const closeBtn = notification.querySelector<HTMLButtonElement>('.inboxkey-notification-close')
    closeBtn?.addEventListener('click', () => {
      clearTimeout(dismissId)
      pendingTimers.delete(dismissId)
      dismissNotification(notification)
    })
  }
}

/**
 * Create the notification DOM element
 */
function createNotificationElement(
  title: string,
  message: string,
  type: 'success' | 'error' | 'info',
  dismissible: boolean
): HTMLDivElement {
  const notification = document.createElement('div')
  notification.className = `inboxkey-notification inboxkey-notification--${type}`

  const content = document.createElement('div')
  content.className = 'inboxkey-notification-content'

  const titleEl = document.createElement('div')
  titleEl.className = 'inboxkey-notification-title'
  titleEl.textContent = title

  const messageEl = document.createElement('div')
  messageEl.className = 'inboxkey-notification-message'
  messageEl.textContent = message

  content.appendChild(titleEl)
  content.appendChild(messageEl)
  notification.appendChild(content)

  if (dismissible) {
    const closeBtn = document.createElement('button')
    closeBtn.type = 'button'
    closeBtn.className = 'inboxkey-notification-close'
    closeBtn.setAttribute('aria-label', t('toast_dismiss_aria') || 'Dismiss notification')
    closeBtn.textContent = '×' // multiplication sign — visually a clean × glyph
    notification.appendChild(closeBtn)
  }

  return notification
}

/**
 * Dismiss a notification with animation
 */
function dismissNotification(notification: HTMLDivElement): void {
  notification.style.animation = `inboxkeySlideIn ${ANIMATION_DURATION_MS}ms ease-out reverse`

  const fadeId = trackTimer(setTimeout(() => {
    pendingTimers.delete(fadeId)
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification)
    }
  }, ANIMATION_DURATION_MS))
}

/**
 * Inject notification styles into the page
 */
function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) {
    return
  }

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .inboxkey-notification {
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${COLOR_SUCCESS};
      color: white;
      padding: 14px 16px 14px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', sans-serif;
      max-width: 360px;
      display: flex;
      align-items: flex-start;
      gap: 12px;
      animation: inboxkeySlideIn 0.3s ease-out;
    }

    .inboxkey-notification--success {
      background: ${COLOR_SUCCESS};
    }

    .inboxkey-notification--error {
      background: ${COLOR_ERROR};
    }

    .inboxkey-notification--info {
      background: ${COLOR_PRIMARY};
    }

    @keyframes inboxkeySlideIn {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }

    .inboxkey-notification-content {
      display: flex;
      flex-direction: column;
      gap: 4px;
      flex: 1 1 auto;
      min-width: 0;
    }

    .inboxkey-notification-title {
      font-weight: 600;
      font-size: 14px;
      line-height: 1.4;
    }

    .inboxkey-notification-message {
      font-size: 12px;
      line-height: 1.4;
      opacity: 0.9;
    }

    .inboxkey-notification-close {
      flex: 0 0 auto;
      appearance: none;
      background: transparent;
      border: 0;
      color: inherit;
      opacity: 0.75;
      cursor: pointer;
      font-size: 20px;
      line-height: 1;
      padding: 2px 6px;
      margin: -2px -4px 0 0;
      border-radius: 4px;
      font-family: inherit;
      transition: opacity 120ms ease, background-color 120ms ease;
    }

    .inboxkey-notification-close:hover,
    .inboxkey-notification-close:focus-visible {
      opacity: 1;
      background-color: rgba(255, 255, 255, 0.15);
      outline: none;
    }

    .inboxkey-notification-close:focus-visible {
      box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.6);
    }
  `

  document.head.appendChild(style)
}
