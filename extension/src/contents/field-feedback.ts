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
  filled: 1500,
  copied: 3000,
  timeout: 3000,
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
  const originalParent = wrapper.parentElement! // wrapper is already inserted

  // Tooltip
  const tooltip = createTooltip('Checking emails', options.onClose, () => {
    options.onClose?.()
    handle.hide()
  })
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

      // Update tooltip content
      if (state === 'listening') {
        tooltip.innerHTML = buildTooltipHTML('Checking emails', true, () => {
          options.onClose?.()
          handle.hide()
        })
      } else {
        tooltip.textContent = TOOLTIP_TEXT[state]
      }

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

      // Synchronous DOM unwrap
      unwrapField(field, wrapper, originalParent)
    },
  }

  // Rebind dismiss button now that handle is defined
  wireTooltipDismiss(tooltip, options.onClose, () => {
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
  const originalParents: (Element | null)[] = []
  const resizeObservers: ResizeObserver[] = []

  for (const input of inputs) {
    if (input.parentElement?.hasAttribute(WRAP_ATTR)) {
      wrappers.push(input.parentElement as HTMLDivElement)
      originalParents.push(input.parentElement.parentElement)
      continue
    }
    const wrapper = createWrapper(input)
    wrappers.push(wrapper)
    originalParents.push(wrapper.parentElement)
    resizeObservers.push(attachResizeObserver(input, wrapper))
  }

  // Single tooltip on first wrapper
  const firstWrapper = wrappers[0]
  const tooltip = createTooltip('Checking emails', options.onClose, () => {
    options.onClose?.()
    handle.hide()
  })
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

      if (state === 'listening') {
        tooltip.innerHTML = buildTooltipHTML('Checking emails', true, () => {
          options.onClose?.()
          handle.hide()
        })
      } else {
        tooltip.textContent = TOOLTIP_TEXT[state]
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
        const parent = originalParents[i]
        if (parent && wrapper.parentElement === parent) {
          unwrapField(inputs[i], wrapper, parent as HTMLElement)
        } else if (wrapper.parentElement) {
          unwrapField(inputs[i], wrapper, wrapper.parentElement)
        }
      }
    },
  }

  wireTooltipDismiss(tooltip, options.onClose, () => {
    options.onClose?.()
    handle.hide()
  })

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
 * Build the inner HTML string for a tooltip in listening state (includes dismiss button).
 */
function buildTooltipHTML(
  text: string,
  showDismiss: boolean,
  _onDismiss: () => void
): string {
  if (!showDismiss) return text
  // We return just text here; the button is re-wired after assignment
  return `${text}<button class="inboxkey-field-tooltip-dismiss" type="button" aria-label="Dismiss InboxKey">×</button>`
}

/**
 * Create a tooltip element in listening state.
 */
function createTooltip(
  _text: string,
  _onClose: FieldFeedbackOptions['onClose'],
  onDismiss: () => void
): HTMLDivElement {
  const tooltip = document.createElement('div')
  tooltip.className = 'inboxkey-field-tooltip'
  tooltip.innerHTML = buildTooltipHTML('Checking emails', true, onDismiss)

  wireTooltipDismiss(tooltip, _onClose, onDismiss)

  return tooltip
}

/**
 * Attach click listener to dismiss button inside tooltip (if present).
 * Replaces any previous listener by cloning the button.
 */
function wireTooltipDismiss(
  tooltip: HTMLDivElement,
  _onClose: FieldFeedbackOptions['onClose'],
  onDismiss: () => void
): void {
  const btn = tooltip.querySelector('.inboxkey-field-tooltip-dismiss')
  if (!btn) return

  // Clone to remove old listeners
  const newBtn = btn.cloneNode(true) as HTMLButtonElement
  btn.parentNode?.replaceChild(newBtn, btn)

  newBtn.addEventListener('click', () => {
    onDismiss()
  })
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
 * Inject the field-feedback stylesheet into <head> (idempotent).
 */
function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = generateFieldFeedbackCSS('light') // Theme detection is Task 7

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

