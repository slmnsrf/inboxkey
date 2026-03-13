/**
 * Field Feedback Core Module
 *
 * Wraps a target input field with a shimmer border container, tooltip,
 * inline text, and ARIA live region. Manages state transitions from
 * listening → filled/copied/timeout, and handles clean DOM unwrapping.
 */

import { generateFieldFeedbackCSS } from '@/contents/field-feedback-styles'
import { detectSplitInputGroup } from '@/lib/detection/split-input-detector'

export type ChipState = 'listening' | 'filled' | 'copied' | 'timeout'

export interface ChipHandle {
  update: (state: ChipState) => void
  hide: () => void
}

export interface FieldFeedbackOptions {
  sessionTimeoutSeconds?: number
  onClose?: () => void | Promise<void>
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STYLE_ID = 'inboxkey-field-feedback-styles'
const WRAP_ATTR = 'data-inboxkey-wrapped'

const TOOLTIP_TEXT: Record<ChipState, string> = {
  listening: 'Checking emails',
  filled: 'Code filled',
  copied: 'Copied to clipboard',
  timeout: 'No code received',
}

const ARIA_TEXT: Record<ChipState, string> = {
  listening: 'Checking emails for verification code',
  filled: 'Success: Code filled automatically',
  copied: 'Success: Code copied to clipboard',
  timeout: 'Error: No code received',
}

const AUTO_DISMISS_MS: Partial<Record<ChipState, number>> = {
  filled: 2000,
  copied: 3000,
  timeout: 3000,
}

const INLINE_TEXT: Record<ChipState, string> = {
  listening: 'Checking emails...',
  filled: 'Code filled',
  copied: 'Copied to clipboard',
  timeout: 'No code received',
}

// ─── No-op handle ─────────────────────────────────────────────────────────────

const NO_OP_HANDLE: ChipHandle = {
  update: (_state: ChipState) => { /* disabled */ },
  hide: () => { /* disabled */ },
}

// Track active handles for re-entrancy: return the existing live handle
const activeHandles = new WeakMap<HTMLInputElement, ChipHandle>()

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Show field feedback on `field`. Returns a ChipHandle for state updates and cleanup.
 * If `showSessionChips` is disabled in settings, returns a silent no-op handle.
 */
export async function showFieldFeedback(
  field: HTMLInputElement,
  options: FieldFeedbackOptions = {}
): Promise<ChipHandle> {
  // ── 1. Check setting ──────────────────────────────────────────────────────
  try {
    const result = await chrome.storage.local.get('settings')
    const enabled = result.settings?.showSessionChips ?? true
    if (!enabled) {
      return NO_OP_HANDLE
    }
  } catch {
    // Fail-open: show feedback even if storage read fails
  }

  // ── 2. Inject styles (idempotent) ─────────────────────────────────────────
  injectStyles()

  // ── 3. Detect split-input group ───────────────────────────────────────────
  const splitGroup = detectSplitInputGroup(field)
  const isSplit = splitGroup !== null && splitGroup.inputs.length > 1

  if (isSplit) {
    return buildSplitHandle(splitGroup!.inputs, options)
  }

  return buildSingleHandle(field, options)
}

// ─── Single-field path ────────────────────────────────────────────────────────

function buildSingleHandle(
  field: HTMLInputElement,
  options: FieldFeedbackOptions
): ChipHandle {
  // Re-entrancy guard: return existing live handle
  if (field.parentElement?.hasAttribute(WRAP_ATTR)) {
    const existing = activeHandles.get(field)
    if (existing) return existing
  }

  const wrapper = createWrapper(field)

  // Tooltip (dismiss button wired after handle is defined)
  const tooltip = createTooltip('Checking emails', true)
  wrapper.appendChild(tooltip)

  // Inline text
  const inlineText = document.createElement('span')
  inlineText.className = 'inboxkey-inline-text'
  inlineText.textContent = 'Checking emails...'
  wrapper.appendChild(inlineText)

  // ARIA live region
  const liveRegion = createLiveRegion('Checking emails for verification code')
  wrapper.appendChild(liveRegion)

  // ResizeObserver to keep wrapper sized with field
  const resizeObserver = attachResizeObserver(field, wrapper)

  let autoDismissTimer: ReturnType<typeof setTimeout> | null = null

  const handle: ChipHandle = {
    update(state: ChipState) {
      // Swap wrapper state class
      swapStateClass(wrapper, state)

      // Update tooltip content (DOM API, no innerHTML)
      const showDismiss = state === 'listening'
      setTooltipContent(tooltip, TOOLTIP_TEXT[state], showDismiss)
      if (showDismiss) {
        wireTooltipDismiss(tooltip, () => {
          options.onClose?.()
          handle.hide()
        })
      }

      // Update inline text
      inlineText.textContent = INLINE_TEXT[state]

      // Update ARIA region
      liveRegion.textContent = ARIA_TEXT[state]

      // Auto-dismiss for terminal states
      if (autoDismissTimer !== null) {
        clearTimeout(autoDismissTimer)
        autoDismissTimer = null
      }
      const delay = AUTO_DISMISS_MS[state]
      if (delay !== undefined) {
        autoDismissTimer = setTimeout(() => handle.hide(), delay)
      }
    },

    hide() {
      if (autoDismissTimer !== null) {
        clearTimeout(autoDismissTimer)
        autoDismissTimer = null
      }
      resizeObserver.disconnect()
      activeHandles.delete(field)

      // Synchronous DOM unwrap -- use current parent, not stale reference
      const currentParent = wrapper.parentElement
      if (currentParent) {
        unwrapField(field, wrapper, currentParent)
      }
    },
  }

  // Wire dismiss button now that handle is defined
  wireTooltipDismiss(tooltip, () => {
    options.onClose?.()
    handle.hide()
  })

  activeHandles.set(field, handle)
  return handle
}

// ─── Split-input path ─────────────────────────────────────────────────────────

function buildSplitHandle(
  inputs: HTMLInputElement[],
  options: FieldFeedbackOptions
): ChipHandle {
  const wrappers: HTMLDivElement[] = []
  const resizeObservers: ResizeObserver[] = []

  for (const input of inputs) {
    if (input.parentElement?.hasAttribute(WRAP_ATTR)) {
      wrappers.push(input.parentElement as HTMLDivElement)
      continue
    }
    const wrapper = createWrapper(input)
    wrappers.push(wrapper)
    resizeObservers.push(attachResizeObserver(input, wrapper))
  }

  // Single tooltip on first wrapper (dismiss button wired after handle)
  const firstWrapper = wrappers[0]
  const tooltip = createTooltip('Checking emails', true)
  firstWrapper.appendChild(tooltip)

  // ARIA live region on first wrapper (no inline text for split inputs)
  const liveRegion = createLiveRegion('Checking emails for verification code')
  firstWrapper.appendChild(liveRegion)

  let autoDismissTimer: ReturnType<typeof setTimeout> | null = null

  const handle: ChipHandle = {
    update(state: ChipState) {
      for (const wrapper of wrappers) {
        swapStateClass(wrapper, state)
      }

      // Update tooltip (DOM API)
      const showDismiss = state === 'listening'
      setTooltipContent(tooltip, TOOLTIP_TEXT[state], showDismiss)
      if (showDismiss) {
        wireTooltipDismiss(tooltip, () => {
          options.onClose?.()
          handle.hide()
        })
      }

      liveRegion.textContent = ARIA_TEXT[state]

      if (autoDismissTimer !== null) {
        clearTimeout(autoDismissTimer)
        autoDismissTimer = null
      }
      const delay = AUTO_DISMISS_MS[state]
      if (delay !== undefined) {
        autoDismissTimer = setTimeout(() => handle.hide(), delay)
      }
    },

    hide() {
      if (autoDismissTimer !== null) {
        clearTimeout(autoDismissTimer)
        autoDismissTimer = null
      }
      for (const ro of resizeObservers) {
        ro.disconnect()
      }
      for (let i = 0; i < inputs.length; i++) {
        const wrapper = wrappers[i]
        if (wrapper.parentElement) {
          unwrapField(inputs[i], wrapper, wrapper.parentElement)
        }
        activeHandles.delete(inputs[i])
      }
    },
  }

  wireTooltipDismiss(tooltip, () => {
    options.onClose?.()
    handle.hide()
  })

  // Register handle for all inputs in the split group
  for (const input of inputs) {
    activeHandles.set(input, handle)
  }

  return handle
}

// ─── DOM helpers ──────────────────────────────────────────────────────────────

/**
 * Wrap `field` in a shimmer container div. Returns the wrapper (already in DOM).
 */
function createWrapper(field: HTMLInputElement): HTMLDivElement {
  const computedStyle = getComputedStyle(field)
  const borderRadius = computedStyle.borderRadius

  const wrapper = document.createElement('div')
  wrapper.className = 'inboxkey-shimmer-wrap inboxkey-shimmer-wrap--listening'
  wrapper.setAttribute(WRAP_ATTR, '1')
  wrapper.style.borderRadius = borderRadius
  wrapper.style.width = field.offsetWidth ? `${field.offsetWidth}px` : ''
  wrapper.style.height = field.offsetHeight ? `${field.offsetHeight}px` : ''

  // Insert wrapper before field, then move field inside
  const parent = field.parentElement!
  parent.insertBefore(wrapper, field)
  wrapper.appendChild(field)

  return wrapper
}

/**
 * Synchronously move `field` back to `targetParent` before `wrapper`, then remove wrapper.
 */
function unwrapField(
  field: HTMLInputElement,
  wrapper: HTMLDivElement,
  targetParent: Element | HTMLElement
): void {
  if (!targetParent) return

  // Remove tooltip, inline text, and live region first
  wrapper.querySelectorAll(
    '.inboxkey-field-tooltip, .inboxkey-inline-text, [role="status"]'
  ).forEach(el => el.remove())

  // Move field back
  if (wrapper.parentElement === targetParent) {
    targetParent.insertBefore(field, wrapper)
  } else {
    targetParent.appendChild(field)
  }

  // Remove wrapper
  if (wrapper.parentElement) {
    wrapper.parentElement.removeChild(wrapper)
  }
}

/**
 * Swap the state modifier class on `wrapper`.
 */
function swapStateClass(wrapper: HTMLDivElement, state: ChipState): void {
  const allStates: ChipState[] = ['listening', 'filled', 'copied', 'timeout']
  for (const s of allStates) {
    wrapper.classList.remove(`inboxkey-shimmer-wrap--${s}`)
  }
  wrapper.classList.add(`inboxkey-shimmer-wrap--${state}`)
}

/**
 * Create a tooltip element. Uses DOM API (no innerHTML) to avoid XSS surface.
 */
function createTooltip(
  text: string,
  showDismiss: boolean
): HTMLDivElement {
  const tooltip = document.createElement('div')
  tooltip.className = 'inboxkey-field-tooltip'
  setTooltipContent(tooltip, text, showDismiss)
  return tooltip
}

/**
 * Set tooltip text and optionally add dismiss button (DOM API, no innerHTML).
 */
function setTooltipContent(
  tooltip: HTMLDivElement,
  text: string,
  showDismiss: boolean
): void {
  // Clear existing content
  while (tooltip.firstChild) tooltip.removeChild(tooltip.firstChild)

  tooltip.appendChild(document.createTextNode(text))

  if (showDismiss) {
    const btn = document.createElement('button')
    btn.className = 'inboxkey-field-tooltip-dismiss'
    btn.type = 'button'
    btn.setAttribute('aria-label', 'Dismiss InboxKey')
    btn.textContent = '\u00D7' // ×
    tooltip.appendChild(btn)
  }
}

/**
 * Attach click listener to dismiss button inside tooltip (if present).
 */
function wireTooltipDismiss(
  tooltip: HTMLDivElement,
  onDismiss: () => void
): void {
  const btn = tooltip.querySelector('.inboxkey-field-tooltip-dismiss')
  if (!btn) return
  btn.addEventListener('click', () => onDismiss())
}

/**
 * Create the ARIA live region element.
 */
function createLiveRegion(initialText: string): HTMLDivElement {
  const region = document.createElement('div')
  region.setAttribute('role', 'status')
  region.setAttribute('aria-live', 'polite')
  region.className = 'inboxkey-sr-only'
  region.textContent = initialText
  return region
}

/**
 * Attach a ResizeObserver that keeps wrapper dimensions in sync with field.
 */
function attachResizeObserver(
  field: HTMLInputElement,
  wrapper: HTMLDivElement
): ResizeObserver {
  const ro = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect
      if (width) wrapper.style.width = `${width}px`
      if (height) wrapper.style.height = `${height}px`
    }
  })
  ro.observe(field)
  return ro
}

/**
 * One-shot theme detection. Checks common dark mode signals.
 * Does not react to runtime theme changes (deferred).
 */
function detectTheme(): 'light' | 'dark' {
  // Check data-theme attribute on html/body (common pattern)
  const htmlTheme = document.documentElement.getAttribute('data-theme')
  if (htmlTheme === 'dark') return 'dark'

  const bodyTheme = document.body?.getAttribute('data-theme')
  if (bodyTheme === 'dark') return 'dark'

  // Check class-based dark mode (e.g., Tailwind's .dark class)
  if (document.documentElement.classList.contains('dark')) return 'dark'

  // Fallback to system preference
  if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark'

  return 'light'
}

/**
 * Inject the field-feedback stylesheet into <head> (idempotent).
 */
function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = generateFieldFeedbackCSS(detectTheme())

  // SR-only utility not included in field-feedback-styles.ts, append it here
  style.textContent += `
.inboxkey-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
`

  document.head.appendChild(style)
}

