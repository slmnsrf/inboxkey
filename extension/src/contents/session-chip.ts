/**
 * Session Chip Component
 * Displays watch session status as an in-page chip near detected fields
 */

export type ChipState = 'listening' | 'filled' | 'copied' | 'timeout'

export interface ChipHandle {
  update(state: ChipState): void
  hide(): void
}

const STYLE_ID = 'inboxkey-session-chip-styles'
const ANIMATION_DURATION_MS = 300
const AUTO_DISMISS_DELAY_MS = 5000 // Success states (filled/copied)
const AUTO_DISMISS_ERROR_DELAY_MS = 7000 // Error states (timeout - longer for readability)
const AUTO_DISMISS_LISTENING_DELAY_MS = 45000 // Listening state safety net (45s)

// State configuration
const STATE_CONFIG: Record<ChipState, { text: string; color: string; icon: string }> = {
  listening: {
    text: 'Listening for code',
    color: '#3B82F6', // Primary blue
    icon: '👂'
  },
  filled: {
    text: 'Filled ✓',
    color: '#10B981', // Success green
    icon: '✓'
  },
  copied: {
    text: 'Code copied to clipboard',
    color: '#10B981', // Success green
    icon: '📋'
  },
  timeout: {
    text: 'No new code. Try resend or check popup.',
    color: '#EF4444', // Error red
    icon: '⏱'
  }
}

/**
 * Show a session status chip near the target field
 */
export function showSessionChip(field: HTMLInputElement): ChipHandle {
  // Inject styles if not already present
  injectStyles()

  // Create chip element
  const chip = createChipElement()
  const liveRegion = chip.querySelector('[role="status"]') as HTMLDivElement

  // Position chip near field
  positionChipNearField(chip, field)

  // Add to DOM
  document.body.appendChild(chip)

  // Track auto-dismiss timeout
  let autoDismissTimeout: number | null = null

  // Initialize chip with 'listening' state to prevent blank blue box
  const initialState: ChipState = 'listening'
  updateChipState(chip, liveRegion, initialState)

  // Keyboard handler for Esc key
  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      handle.hide()
    }
  }
  document.addEventListener('keydown', handleKeydown)

  // Close button click handler
  const closeBtn = chip.querySelector('.inboxkey-chip-close') as HTMLButtonElement
  const handleCloseClick = () => {
    handle.hide()
  }
  closeBtn.addEventListener('click', handleCloseClick)

  // Create handle for external control
  const handle: ChipHandle = {
    update(state: ChipState) {
      updateChipState(chip, liveRegion, state)

      // Clear any existing timeout
      if (autoDismissTimeout !== null) {
        clearTimeout(autoDismissTimeout)
      }

      // FIXED: Auto-dismiss for ALL states (including listening) with appropriate timing
      let delay: number

      if (state === 'listening') {
        delay = AUTO_DISMISS_LISTENING_DELAY_MS // 45s safety net
      } else if (state === 'timeout') {
        delay = AUTO_DISMISS_ERROR_DELAY_MS // 7s for errors
      } else {
        delay = AUTO_DISMISS_DELAY_MS // 5s for filled/copied
      }

      autoDismissTimeout = window.setTimeout(() => {
        handle.hide()
      }, delay)
    },

    hide() {
      // Clear auto-dismiss timeout
      if (autoDismissTimeout !== null) {
        clearTimeout(autoDismissTimeout)
        autoDismissTimeout = null
      }

      // Remove event listeners
      document.removeEventListener('keydown', handleKeydown)
      closeBtn.removeEventListener('click', handleCloseClick)

      // Dismiss with animation
      dismissChip(chip)
    }
  }

  return handle
}

/**
 * Create the chip DOM structure
 */
function createChipElement(): HTMLDivElement {
  const chip = document.createElement('div')
  chip.className = 'inboxkey-chip'
  chip.setAttribute('role', 'status')
  chip.setAttribute('aria-live', 'polite')
  chip.setAttribute('aria-atomic', 'true')

  const content = document.createElement('div')
  content.className = 'inboxkey-chip-content'

  const iconEl = document.createElement('span')
  iconEl.className = 'inboxkey-chip-icon'
  iconEl.setAttribute('aria-hidden', 'true')

  const textEl = document.createElement('span')
  textEl.className = 'inboxkey-chip-text'

  // Close button
  const closeBtn = document.createElement('button')
  closeBtn.className = 'inboxkey-chip-close'
  closeBtn.setAttribute('aria-label', 'Dismiss notification')
  closeBtn.setAttribute('type', 'button')
  closeBtn.innerHTML = '×'

  // Hidden live region for accessibility announcements
  const liveRegion = document.createElement('div')
  liveRegion.className = 'inboxkey-chip-sr-only'
  liveRegion.setAttribute('role', 'status')
  liveRegion.setAttribute('aria-live', 'polite')

  content.appendChild(iconEl)
  content.appendChild(textEl)
  content.appendChild(closeBtn)
  chip.appendChild(content)
  chip.appendChild(liveRegion)

  return chip
}

/**
 * Update chip to reflect new state
 */
function updateChipState(
  chip: HTMLDivElement,
  liveRegion: HTMLDivElement,
  state: ChipState
): void {
  const config = STATE_CONFIG[state]
  const iconEl = chip.querySelector('.inboxkey-chip-icon') as HTMLSpanElement
  const textEl = chip.querySelector('.inboxkey-chip-text') as HTMLSpanElement

  // Update content
  iconEl.textContent = config.icon
  textEl.textContent = config.text

  // Update background color
  chip.style.backgroundColor = config.color

  // Announce to screen readers
  liveRegion.textContent = config.text

  // Update state class
  chip.setAttribute('data-state', state)
}

/**
 * Position chip near the target field
 */
function positionChipNearField(chip: HTMLDivElement, field: HTMLInputElement): void {
  const rect = field.getBoundingClientRect()
  const scrollX = window.pageXOffset || document.documentElement.scrollLeft
  const scrollY = window.pageYOffset || document.documentElement.scrollTop

  // Position below the field with some offset
  const left = rect.left + scrollX
  const top = rect.bottom + scrollY + 8 // 8px gap below field

  chip.style.left = `${left}px`
  chip.style.top = `${top}px`

  // Reposition on scroll and resize
  const updatePosition = () => {
    const newRect = field.getBoundingClientRect()
    const newScrollX = window.pageXOffset || document.documentElement.scrollLeft
    const newScrollY = window.pageYOffset || document.documentElement.scrollTop
    chip.style.left = `${newRect.left + newScrollX}px`
    chip.style.top = `${newRect.bottom + newScrollY + 8}px`
  }

  window.addEventListener('scroll', updatePosition, { passive: true })
  window.addEventListener('resize', updatePosition, { passive: true })

  // Cleanup on chip removal
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.removedNodes.forEach((node) => {
        if (node === chip) {
          window.removeEventListener('scroll', updatePosition)
          window.removeEventListener('resize', updatePosition)
          observer.disconnect()
        }
      })
    })
  })

  observer.observe(document.body, { childList: true })
}

/**
 * Dismiss chip with animation
 */
function dismissChip(chip: HTMLDivElement): void {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  if (prefersReducedMotion) {
    // Immediate removal for reduced motion preference
    chip.style.opacity = '0'
    setTimeout(() => {
      if (chip.parentNode) {
        chip.parentNode.removeChild(chip)
      }
    }, 50)
  } else {
    // Animated fade out
    chip.style.animation = `inboxkeyChipFadeOut ${ANIMATION_DURATION_MS}ms ease-out`
    setTimeout(() => {
      if (chip.parentNode) {
        chip.parentNode.removeChild(chip)
      }
    }, ANIMATION_DURATION_MS)
  }
}

/**
 * Inject chip styles into the page
 */
function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) {
    return
  }

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .inboxkey-chip {
      position: absolute;
      background: #3B82F6;
      color: white;
      padding: 12px; /* Uniform internal spacing on 4px grid */
      border-radius: 6px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', sans-serif;
      font-size: 13px;
      line-height: 1.4;
      max-width: 320px;
      animation: inboxkeyChipFadeIn 0.3s ease-out;
      pointer-events: auto;
    }

    @media (prefers-reduced-motion: reduce) {
      .inboxkey-chip {
        animation: inboxkeyChipFadeInReduced 0.3s ease-out; /* Match standard timing */
      }
    }

    .inboxkey-chip-content {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .inboxkey-chip-icon {
      flex-shrink: 0;
      font-size: 14px;
      line-height: 1;
    }

    .inboxkey-chip-text {
      flex: 1;
      font-weight: 500;
    }

    .inboxkey-chip-close {
      flex-shrink: 0;
      width: 24px; /* Increased for better accessibility (closer to 44px minimum) */
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      background: rgba(255, 255, 255, 0.2);
      color: white;
      border-radius: 4px;
      font-size: 18px;
      line-height: 1;
      cursor: pointer;
      padding: 0;
      margin-left: 4px;
      transition: background 0.2s ease;
    }

    .inboxkey-chip-close:hover {
      background: rgba(255, 255, 255, 0.3);
    }

    .inboxkey-chip-close:focus {
      outline: 2px solid white;
      outline-offset: 2px;
    }

    .inboxkey-chip-close:active {
      background: rgba(255, 255, 255, 0.4);
    }

    .inboxkey-chip-sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border-width: 0;
    }

    @keyframes inboxkeyChipFadeIn {
      from {
        opacity: 0;
        transform: translateY(-8px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes inboxkeyChipFadeInReduced {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }

    @keyframes inboxkeyChipFadeOut {
      from {
        opacity: 1;
        transform: translateY(0);
      }
      to {
        opacity: 0;
        transform: translateY(-8px);
      }
    }
  `

  document.head.appendChild(style)
}
