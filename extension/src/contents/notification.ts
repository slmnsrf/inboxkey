/**
 * Notification Module
 * Displays toast notifications to users within content script context
 */

import { COLOR_SUCCESS, COLOR_ERROR, COLOR_PRIMARY } from '~lib/design-tokens'

interface NotificationOptions {
  title: string
  message: string
  duration?: number // milliseconds, default 5000
  type?: 'success' | 'error' | 'info'
}

const STYLE_ID = 'inboxkey-notification-styles'
const ANIMATION_DURATION_MS = 300

/**
 * Show a toast notification to the user
 */
export function showNotification(options: NotificationOptions): void {
  const { title, message, duration = 5000, type = 'success' } = options

  // Inject styles if not already present
  injectStyles()

  // Create notification element
  const notification = createNotificationElement(title, message, type)

  // Add to DOM
  document.body.appendChild(notification)

  // Auto-dismiss after duration
  setTimeout(() => {
    dismissNotification(notification)
  }, duration)
}

/**
 * Create the notification DOM element
 */
function createNotificationElement(
  title: string,
  message: string,
  type: 'success' | 'error' | 'info'
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

  return notification
}

/**
 * Dismiss a notification with animation
 */
function dismissNotification(notification: HTMLDivElement): void {
  notification.style.animation = `inboxkeySlideIn ${ANIMATION_DURATION_MS}ms ease-out reverse`

  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification)
    }
  }, ANIMATION_DURATION_MS)
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
      padding: 16px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', sans-serif;
      max-width: 320px;
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
  `

  document.head.appendChild(style)
}
