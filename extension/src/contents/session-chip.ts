/**
 * Session Chip Component
 * Displays watch session status as an in-page chip near detected fields
 */

import {
  COLOR_PRIMARY,
  COLOR_SUCCESS,
  COLOR_ERROR,
  SPACE_XS,
  SPACE_SM,
  SPACE_MD,
  FONT_FAMILY_UI,
  DURATION_FAST,
  DURATION_NORMAL
} from '../lib/design-tokens'

export type ChipState = 'listening' | 'filled' | 'copied' | 'timeout'

export interface ChipHandle {
  update(state: ChipState): void
  hide(): void
}

// No-op handle for when chips are disabled
const NO_OP_CHIP_HANDLE: ChipHandle = {
  update: (_state: ChipState) => {
    // Silent no-op
  },
  hide: () => {
    // Silent no-op
  }
}

const STYLE_ID = 'inboxkey-session-chip-styles'
const ANIMATION_DURATION_MS = 300
// Intentional deviation from 3s toast standard for faster success feedback (opt-in feature)
const AUTO_DISMISS_FILLED_MS = 1500 // filled: 1.5s
const AUTO_DISMISS_COPIED_MS = 3000 // copied: 3s
const AUTO_DISMISS_TIMEOUT_MS = 3000 // timeout: 3s

interface StateConfig {
  text: string
  color: string
  icon: string
  autoDismissMs: number | null
  showCloseButton: boolean
}

// State configuration
const STATE_CONFIG: Record<ChipState, StateConfig> = {
  listening: {
    text: 'Checking e-mails...',
    color: COLOR_PRIMARY,
    icon: '⋯',
    autoDismissMs: null, // Dynamic - set at runtime
    showCloseButton: true
  },
  filled: {
    text: 'Code filled',
    color: COLOR_SUCCESS,
    icon: '✓',
    autoDismissMs: AUTO_DISMISS_FILLED_MS,
    showCloseButton: false
  },
  copied: {
    text: 'Code copied to clipboard',
    color: COLOR_SUCCESS,
    icon: '⎘',
    autoDismissMs: AUTO_DISMISS_COPIED_MS,
    showCloseButton: false
  },
  timeout: {
    text: 'No code received',
    color: COLOR_ERROR,
    icon: '○',
    autoDismissMs: AUTO_DISMISS_TIMEOUT_MS,
    showCloseButton: false
  }
}

/**
 * Show a session status chip near the target field
 */
export async function showSessionChip(
  field: HTMLInputElement,
  sessionTimeoutSeconds?: number,
  callbacks?: {
    onClose?: () => void | Promise<void>
  }
): Promise<ChipHandle> {
  // Check if chips are enabled in settings
  try {
    const result = await chrome.storage.local.get('settings')
    const showChips = result.settings?.showSessionChips ?? true // Default ON

    if (!showChips) {
      console.log('[SessionChip] Chips disabled in settings, returning no-op handle')
      return NO_OP_CHIP_HANDLE
    }
  } catch (error) {
    console.error('[SessionChip] Failed to check settings, showing chip anyway:', error)
    // Fallback to showing chip on error (fail-safe)
  }

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

  // Track current state for close button handler
  let currentState: ChipState = 'listening'

  // Initialize chip with 'listening' state to prevent blank blue box
  const initialState: ChipState = 'listening'
  updateChipState(chip, liveRegion, initialState, sessionTimeoutSeconds, callbacks)

  // Close button click handler
  const closeBtn = chip.querySelector('.inboxkey-chip-close') as HTMLButtonElement
  const handleCloseClick = async () => {
    // If in listening state, trigger onClose callback to blacklist URL
    if (currentState === 'listening' && callbacks?.onClose) {
      await callbacks.onClose()
    }
    handle.hide()
  }
  closeBtn.addEventListener('click', handleCloseClick)

  // Create handle for external control
  const handle: ChipHandle = {
    update(state: ChipState) {
      // Track current state
      currentState = state

      updateChipState(chip, liveRegion, state, sessionTimeoutSeconds, callbacks)

      // Clear any existing timeout
      if (autoDismissTimeout !== null) {
        clearTimeout(autoDismissTimeout)
      }

      // Auto-dismiss based on state configuration
      const config = STATE_CONFIG[state]
      let delay: number | null = config.autoDismissMs

      // For listening state, use dynamic timeout based on sessionTimeoutSeconds
      if (state === 'listening' && sessionTimeoutSeconds) {
        delay = sessionTimeoutSeconds * 1000 + 5000 // timeout + 5s buffer
      }

      if (delay !== null) {
        autoDismissTimeout = setTimeout(() => {
          handle.hide()
        }, delay) as unknown as number
      }
    },

    hide() {
      // Clear auto-dismiss timeout
      if (autoDismissTimeout !== null) {
        clearTimeout(autoDismissTimeout)
        autoDismissTimeout = null
      }

      // Remove event listeners
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
  state: ChipState,
  _sessionTimeoutSeconds?: number,
  _callbacks?: {
    onClose?: () => void | Promise<void>
  }
): void {
  const config = STATE_CONFIG[state]
  const iconEl = chip.querySelector('.inboxkey-chip-icon') as HTMLSpanElement
  const textEl = chip.querySelector('.inboxkey-chip-text') as HTMLSpanElement
  const closeBtn = chip.querySelector('.inboxkey-chip-close') as HTMLButtonElement

  // Update content
  if (config.icon) {
    iconEl.textContent = config.icon
    iconEl.style.display = ''
  } else {
    iconEl.textContent = ''
    iconEl.style.display = 'none'
  }
  textEl.textContent = config.text

  // Update background color
  chip.style.backgroundColor = config.color

  // Show/hide close button based on state and update tooltip
  if (config.showCloseButton) {
    closeBtn.style.display = ''
    closeBtn.setAttribute('title', 'Cancel & ignore this URL')
    closeBtn.setAttribute('aria-label', 'Cancel and ignore this URL')
  } else {
    closeBtn.style.display = 'none'
    closeBtn.removeAttribute('title')
    closeBtn.removeAttribute('aria-label') // Remove, don't set generic label
  }

  // Announce to screen readers with enhanced semantics
  const stateDescriptions: Record<ChipState, string> = {
    listening: 'Checking emails for verification code',
    filled: 'Success: Code filled automatically',
    copied: 'Success: Code copied to clipboard',
    timeout: 'Error: No code received'
  }
  liveRegion.textContent = stateDescriptions[state]

  // Update state class
  chip.setAttribute('data-state', state)
}

/**
 * Position chip near the target field with viewport boundary detection
 */
function positionChipNearField(chip: HTMLDivElement, field: HTMLInputElement): void {
  const positionChip = () => {
    const rect = field.getBoundingClientRect()
    const scrollX = window.pageXOffset || document.documentElement.scrollLeft
    const scrollY = window.pageYOffset || document.documentElement.scrollTop
    const viewportHeight = window.innerHeight
    const viewportWidth = window.innerWidth

    // Estimate chip height (will be measured after first render)
    const chipHeight = chip.offsetHeight || 60 // Fallback estimate
    const gap = 8 // 8px gap from field

    // Determine vertical position (above or below field)
    let top: number
    const spaceBelow = viewportHeight - rect.bottom
    const spaceAbove = rect.top

    if (spaceBelow < chipHeight + gap && spaceAbove > spaceBelow) {
      // Position above field if not enough space below and more space above
      top = rect.top + scrollY - chipHeight - gap
    } else {
      // Default: position below field
      top = rect.bottom + scrollY + gap
    }

    // Determine horizontal position with viewport constraints
    let left = rect.left + scrollX
    const chipWidth = chip.offsetWidth || 320 // Fallback to max-width

    // Ensure chip doesn't overflow viewport horizontally
    if (left + chipWidth > scrollX + viewportWidth) {
      left = scrollX + viewportWidth - chipWidth - 16 // 16px margin from edge
    }
    if (left < scrollX + 16) {
      left = scrollX + 16 // 16px margin from left edge
    }

    // Set max-width based on available space (with margins)
    const availableWidth = viewportWidth - 32 // 16px margins on each side
    chip.style.maxWidth = `${Math.min(320, availableWidth)}px`

    chip.style.left = `${left}px`
    chip.style.top = `${top}px`
  }

  // Initial positioning
  positionChip()

  // Reposition on scroll and resize
  window.addEventListener('scroll', positionChip, { passive: true })
  window.addEventListener('resize', positionChip, { passive: true })

  // Cleanup on chip removal
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.removedNodes.forEach((node) => {
        if (node === chip) {
          window.removeEventListener('scroll', positionChip)
          window.removeEventListener('resize', positionChip)
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
      background: ${COLOR_PRIMARY};
      color: white;
      padding: ${SPACE_MD}; /* Uniform internal spacing on 4px grid */
      border-radius: 6px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      z-index: 2147483647;
      font-family: ${FONT_FAMILY_UI};
      font-size: 13px;
      line-height: 1.4;
      max-width: 320px;
      animation: inboxkeyChipFadeIn ${DURATION_NORMAL}ms ease-out;
      pointer-events: auto;
    }

    /* Pulsing animation for listening state */
    .inboxkey-chip[data-state="listening"] {
      animation: inboxkeyChipFadeIn ${DURATION_NORMAL}ms ease-out, inboxkeyChipPulse 2s ease-in-out infinite;
    }

    @media (prefers-reduced-motion: reduce) {
      .inboxkey-chip {
        animation: inboxkeyChipFadeInReduced ${DURATION_NORMAL}ms ease-out;
      }

      /* Disable pulsing animation for reduced motion */
      .inboxkey-chip[data-state="listening"] {
        animation: inboxkeyChipFadeInReduced ${DURATION_NORMAL}ms ease-out;
      }
    }

    .inboxkey-chip-content {
      display: flex;
      align-items: center;
      gap: ${SPACE_SM};
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
      width: 44px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      background: rgba(255, 255, 255, 0.2);
      color: white;
      border-radius: 4px;
      font-size: 20px;
      line-height: 1;
      cursor: pointer;
      padding: 0;
      margin-left: ${SPACE_XS};
      transition: background ${DURATION_FAST}ms ease, transform ${DURATION_FAST}ms ease;
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
      transform: scale(0.95);
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
        transform: translateY(-4px);
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
        transform: translateY(-4px);
      }
    }

    @keyframes inboxkeyChipPulse {
      0%, 100% {
        opacity: 1;
      }
      50% {
        opacity: 0.85;
      }
    }
  `

  document.head.appendChild(style)
}
