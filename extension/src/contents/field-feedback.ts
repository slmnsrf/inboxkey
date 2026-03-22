/**
 * Field Feedback Core Module (Shadow DOM Overlay)
 *
 * Renders a shimmer border overlay around a target input field using a closed
 * Shadow DOM appended to document.body. Replaces the previous DOM-wrapping
 * approach which broke on many sites.
 *
 * Architecture:
 *   OverlayManager (singleton) -- one rAF loop for all overlays
 *   FieldOverlay   (per-input) -- custom element with closed shadow root
 *   Aria regions   (shared)    -- outside shadow DOM for screen reader access
 */

import { generateShadowCSS, generateEnhancedKeyframes } from '@/contents/field-feedback-styles'
import { detectSplitInputGroup } from '@/lib/detection/split-input-detector'

// ─── Public types ────────────────────────────────────────────────────────────

export type ChipState = 'listening' | 'filled' | 'copied' | 'timeout'

export interface ChipHandle {
  update: (state: ChipState) => void
  hide: () => void
}

export interface FieldFeedbackOptions {
  onClose?: () => void | Promise<void>
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_TEXT: Record<ChipState | 'idle', string> = {
  idle: '',
  listening: 'InboxKey',
  filled: 'Code filled',
  copied: 'Copied to clipboard',
  timeout: 'No code received',
}

const ARIA_TEXT: Record<ChipState, string> = {
  listening: 'InboxKey is checking for a verification code',
  filled: 'Verification code filled automatically',
  copied: 'Code copied to clipboard',
  timeout: 'No verification code received',
}

const AUTO_DISMISS_MS: Partial<Record<ChipState, number>> = {
  filled: 3000,
  copied: 2000,
  timeout: 4000,
}

/** Visibility hysteresis thresholds (fraction of area) */
const VISIBLE_SHOW_THRESHOLD = 0.25
const VISIBLE_HIDE_THRESHOLD = 0.05

// ─── No-op handle ────────────────────────────────────────────────────────────

const NO_OP_HANDLE: ChipHandle = {
  update: (_state: ChipState) => { /* disabled */ },
  hide: () => { /* disabled */ },
}

// Track active handles for re-entrancy
const activeHandles = new WeakMap<HTMLInputElement, ChipHandle>()

// ─── @property registration (idempotent, once per page) ──────────────────────

let propertyRegistered = false
let supportsAtProperty = false

function registerAngleProperty(): void {
  if (propertyRegistered) return
  propertyRegistered = true

  try {
    if (typeof CSS !== 'undefined' && CSS.registerProperty) {
      CSS.registerProperty({
        name: '--inboxkey-angle',
        syntax: '<angle>',
        initialValue: '0deg',
        inherits: false,
      })
      supportsAtProperty = true
    }
  } catch {
    // Already registered or not supported -- both are fine
  }
}

// ─── Aria live regions (shared, outside Shadow DOM) ──────────────────────────

let srStatusEl: HTMLElement | null = null
let srAlertEl: HTMLElement | null = null

const SR_ONLY_STYLES =
  'position:absolute;width:1px;height:1px;overflow:hidden;' +
  'clip:rect(0,0,0,0);white-space:nowrap;border-width:0;'

function ensureAriaRegions(): void {
  if (!srStatusEl) {
    srStatusEl = document.getElementById('inboxkey-sr-status')
    if (!srStatusEl) {
      srStatusEl = document.createElement('div')
      srStatusEl.id = 'inboxkey-sr-status'
      srStatusEl.setAttribute('role', 'status')
      srStatusEl.setAttribute('aria-live', 'polite')
      srStatusEl.style.cssText = SR_ONLY_STYLES
      document.body.appendChild(srStatusEl)
    }
  }

  if (!srAlertEl) {
    srAlertEl = document.getElementById('inboxkey-sr-alert')
    if (!srAlertEl) {
      srAlertEl = document.createElement('div')
      srAlertEl.id = 'inboxkey-sr-alert'
      srAlertEl.setAttribute('role', 'alert')
      srAlertEl.setAttribute('aria-live', 'assertive')
      srAlertEl.style.cssText = SR_ONLY_STYLES
      document.body.appendChild(srAlertEl)
    }
  }
}

function announceState(state: ChipState): void {
  ensureAriaRegions()
  const text = ARIA_TEXT[state]
  if (state === 'timeout') {
    if (srAlertEl) srAlertEl.textContent = text
  } else {
    if (srStatusEl) srStatusEl.textContent = text
  }
}

// ─── Dark background detection ──────────────────────────────────────────────

function isDarkBackground(field: HTMLInputElement): boolean {
  const bg = getComputedStyle(field).backgroundColor
  const match = bg.match(/\d+/g)
  if (!match || match.length < 3) return false
  const [r, g, b] = match.map(Number)
  return (0.299 * r + 0.587 * g + 0.114 * b) < 128
}

// ─── OverlayManager (singleton) ──────────────────────────────────────────────

class OverlayManager {
  private static instance: OverlayManager | null = null
  private overlays = new Set<FieldOverlay>()
  private rafId: number | null = null

  static getInstance(): OverlayManager {
    if (!OverlayManager.instance) {
      OverlayManager.instance = new OverlayManager()
    }
    return OverlayManager.instance
  }

  add(overlay: FieldOverlay): void {
    this.overlays.add(overlay)
    if (this.overlays.size === 1) {
      this.startLoop()
    }
  }

  remove(overlay: FieldOverlay): void {
    this.overlays.delete(overlay)
    if (this.overlays.size === 0) {
      this.stopLoop()
    }
  }

  private startLoop(): void {
    const tick = (): void => {
      for (const overlay of this.overlays) {
        overlay.syncPosition()
      }
      // Only continue loop if overlays remain (syncPosition may trigger destroy)
      if (this.overlays.size > 0) {
        this.rafId = requestAnimationFrame(tick)
      } else {
        this.rafId = null
      }
    }
    this.rafId = requestAnimationFrame(tick)
  }

  private stopLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }
}

// ─── FieldOverlay (per-input instance) ───────────────────────────────────────

interface FieldOverlayOptions {
  isGroup?: boolean
  groupTargets?: HTMLInputElement[]
  hideStatusText?: boolean
  staggerDelay?: number
  onClose?: () => void | Promise<void>
  onDestroy?: () => void
}

class FieldOverlay {
  private host: HTMLElement
  private shadow: ShadowRoot
  private borderRing: HTMLDivElement
  private statusText: HTMLSpanElement
  private target: HTMLInputElement
  private isGroup: boolean
  private groupTargets: HTMLInputElement[]
  private destroyed = false
  private dismissTimer: ReturnType<typeof setTimeout> | null = null
  private currentState: ChipState | 'idle' = 'idle'
  private abortController: AbortController
  private intersectionObserver: IntersectionObserver | null = null
  private isIntersecting = true
  private wasVisible = true  // hysteresis tracking
  private onDestroyCallback?: () => void

  constructor(target: HTMLInputElement, options: FieldOverlayOptions = {}) {
    this.target = target
    this.isGroup = options.isGroup ?? false
    this.groupTargets = options.groupTargets ?? [target]
    this.onDestroyCallback = options.onDestroy
    this.abortController = new AbortController()
    const signal = this.abortController.signal

    // Register @property once
    registerAngleProperty()

    // Ensure aria regions exist
    ensureAriaRegions()

    // Create host element
    this.host = document.createElement('inboxkey-overlay')
    this.host.setAttribute('data-state', 'idle')

    // Double-load guard
    const targetId = this.generateTargetId()
    this.host.setAttribute('data-target-id', targetId)

    // Detect dark theme from target's background
    const darkTarget = this.isGroup ? this.groupTargets[0] : this.target
    if (isDarkBackground(darkTarget)) {
      this.host.setAttribute('data-theme', 'dark')
    }

    // Attach closed shadow
    this.shadow = this.host.attachShadow({ mode: 'closed' })

    // Build shadow DOM
    const style = document.createElement('style')
    style.textContent = generateShadowCSS() + (supportsAtProperty ? generateEnhancedKeyframes() : '')
    this.shadow.appendChild(style)

    const ring = document.createElement('div')
    ring.className = 'border-ring'
    this.shadow.appendChild(ring)
    this.borderRing = ring

    // Stagger delay for split inputs
    if (options.staggerDelay) {
      ring.style.setProperty('--stagger-delay', options.staggerDelay + 'ms')
    }

    const text = document.createElement('span')
    text.className = 'status-text'
    if (options.hideStatusText) text.style.display = 'none'
    this.shadow.appendChild(text)
    this.statusText = text

    // Focus/blur listeners on target (via AbortController for cleanup)
    this.target.addEventListener('focusin', () => {
      if (!this.destroyed) this.host.setAttribute('data-focused', 'true')
    }, { signal })

    this.target.addEventListener('focusout', () => {
      if (!this.destroyed) this.host.removeAttribute('data-focused')
    }, { signal })

    // Escape key dismissal (document-level)
    if (options.onClose) {
      const onClose = options.onClose
      document.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Escape' && !this.destroyed) {
          onClose()
        }
      }, { signal })
    }

    // Append to body
    document.body.appendChild(this.host)

    // Set up IntersectionObserver for coarse visibility
    this.setupIntersectionObserver()

    // Initial position sync
    this.syncPosition()

    // Register with manager
    OverlayManager.getInstance().add(this)
  }

  /**
   * Generate a unique ID for the target input to prevent double-load.
   */
  private generateTargetId(): string {
    // Use existing id or name, fall back to a positional hash
    if (this.target.id) return `id:${this.target.id}`
    if (this.target.name) return `name:${this.target.name}`
    // Use DOM path as fallback
    const rect = this.target.getBoundingClientRect()
    return `pos:${Math.round(rect.left)}:${Math.round(rect.top)}`
  }

  /**
   * Set up IntersectionObserver for coarse visibility detection.
   * Fine-grained rect-clipping is done in syncPosition().
   */
  private setupIntersectionObserver(): void {
    try {
      this.intersectionObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            // Hysteresis: show at >25% visible, hide at <5%
            if (this.isIntersecting) {
              // Currently visible: only hide if ratio drops below hide threshold
              if (entry.intersectionRatio < VISIBLE_HIDE_THRESHOLD) {
                this.isIntersecting = false
              }
            } else {
              // Currently hidden: only show if ratio exceeds show threshold
              if (entry.intersectionRatio >= VISIBLE_SHOW_THRESHOLD) {
                this.isIntersecting = true
              }
            }
          }
        },
        { threshold: [VISIBLE_HIDE_THRESHOLD, VISIBLE_SHOW_THRESHOLD] }
      )

      const primary = this.isGroup ? this.groupTargets[0] : this.target
      this.intersectionObserver.observe(primary)
    } catch {
      // IntersectionObserver not available, always treat as visible
      this.isIntersecting = true
    }
  }

  /**
   * Sync overlay position to target's bounding rect.
   * Called every frame by OverlayManager.
   */
  syncPosition(): void {
    if (this.destroyed) return

    // Check target is still in DOM (shadow-DOM aware: getRootNode() returns
    // the shadow root or document, and isConnected is true if attached anywhere)
    if (!this.target.isConnected) {
      this.destroy()
      return
    }

    let rect: { left: number; top: number; width: number; height: number; bottom: number; right: number }

    if (this.isGroup && this.groupTargets.length > 1) {
      // Compute bounding rect spanning all group targets
      const rects = this.groupTargets.map(t => t.getBoundingClientRect())
      const left = Math.min(...rects.map(r => r.left))
      const top = Math.min(...rects.map(r => r.top))
      const right = Math.max(...rects.map(r => r.right))
      const bottom = Math.max(...rects.map(r => r.bottom))
      rect = { left, top, right, bottom, width: right - left, height: bottom - top }
    } else {
      const r = this.target.getBoundingClientRect()
      rect = { left: r.left, top: r.top, width: r.width, height: r.height, bottom: r.bottom, right: r.right }
    }

    // Visibility gating (IntersectionObserver coarse + rect-clipping fine)
    const visible = this.isIntersecting && this.isVisibleInClippingAncestors(rect)

    // Hysteresis: require >25% to show, <5% to hide
    if (visible && !this.wasVisible) {
      this.wasVisible = true
    } else if (!visible && this.wasVisible) {
      this.wasVisible = false
    }

    this.host.setAttribute('data-visible', this.wasVisible ? 'true' : 'false')

    // Position with rounded values for subpixel accuracy
    this.host.style.left = Math.round(rect.left) + 'px'
    this.host.style.top = Math.round(rect.top) + 'px'
    this.host.style.width = Math.round(rect.width) + 'px'
    this.host.style.height = Math.round(rect.height) + 'px'

    // Inherit border-radius from target (or use default for groups)
    if (this.isGroup) {
      this.borderRing.style.borderRadius = '8px'
    } else {
      const computed = getComputedStyle(this.target)
      this.borderRing.style.borderRadius = computed.borderRadius || '0px'
    }

    // Viewport flip: status text below when near top edge
    const textPosition = rect.top < 28 ? 'below' : 'above'
    this.host.setAttribute('data-text-pos', textPosition)

    // Compact mode: hide pill on narrow inputs
    const isNarrow = rect.width < 120
    this.host.setAttribute('data-compact', isNarrow ? 'true' : 'false')

    // Adaptive border thickness
    const borderWidth = rect.width < 80 ? 3 : rect.width < 200 ? 2.5 : 2
    this.borderRing.style.setProperty('--border-width', borderWidth + 'px')
  }

  /**
   * Fine-grained visibility check against clipping ancestors.
   */
  private isVisibleInClippingAncestors(
    rect: { left: number; top: number; width: number; height: number; bottom: number; right: number }
  ): boolean {
    if (rect.width === 0 || rect.height === 0) return false

    const primary = this.isGroup ? this.groupTargets[0] : this.target
    let parent = primary.parentElement

    while (parent && parent !== document.body && parent !== document.documentElement) {
      const style = getComputedStyle(parent)
      const overflow = style.overflow + style.overflowX + style.overflowY

      if (overflow.includes('hidden') || overflow.includes('scroll') || overflow.includes('auto')) {
        const parentRect = parent.getBoundingClientRect()
        // Vertical clipping
        if (rect.bottom < parentRect.top + 1 || rect.top > parentRect.bottom - 1) {
          return false
        }
        // Horizontal clipping
        if (rect.right < parentRect.left + 1 || rect.left > parentRect.right - 1) {
          return false
        }
      }
      parent = parent.parentElement
    }
    return true
  }

  /**
   * Update overlay to a new state.
   */
  setState(state: ChipState | 'idle'): void {
    if (this.destroyed) return
    this.currentState = state
    this.host.setAttribute('data-state', state)

    // Screen reader announcement (only for ChipState, not idle)
    if (state !== 'idle') {
      announceState(state as ChipState)
    }

    // Update status text content
    const textContent = STATUS_TEXT[state]
    this.host.setAttribute('data-text', textContent)

    // Build status text DOM (no innerHTML)
    while (this.statusText.firstChild) {
      this.statusText.removeChild(this.statusText.firstChild)
    }

    if (state !== 'idle' && textContent) {
      if (state === 'listening') {
        this.statusText.appendChild(document.createTextNode(textContent))
        const dots = document.createElement('span')
        dots.className = 'listening-dots'
        this.statusText.appendChild(dots)
      } else {
        this.statusText.appendChild(document.createTextNode(textContent))
      }
    }

    // Auto-dismiss timer
    if (this.dismissTimer !== null) {
      clearTimeout(this.dismissTimer)
      this.dismissTimer = null
    }

    if (state !== 'idle') {
      const delay = AUTO_DISMISS_MS[state as ChipState]
      if (delay !== undefined) {
        this.dismissTimer = setTimeout(() => this.destroy(), delay)
      }
    }
  }

  /**
   * Get current state.
   */
  getState(): ChipState | 'idle' {
    return this.currentState
  }

  /**
   * Remove overlay and clean up all resources.
   */
  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true

    // Cancel auto-dismiss
    if (this.dismissTimer !== null) {
      clearTimeout(this.dismissTimer)
      this.dismissTimer = null
    }

    // Remove from rAF loop
    OverlayManager.getInstance().remove(this)

    // Abort all event listeners (focus, blur, escape)
    this.abortController.abort()

    // Disconnect IntersectionObserver
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect()
      this.intersectionObserver = null
    }

    // Remove from DOM
    if (this.host.parentElement) {
      this.host.parentElement.removeChild(this.host)
    }

    // Notify owner to clean up references (e.g., activeHandles)
    this.onDestroyCallback?.()
  }
}

// ─── Double-load guard ───────────────────────────────────────────────────────

function findExistingOverlay(target: HTMLInputElement): HTMLElement | null {
  const targetId = target.id
    ? `id:${target.id}`
    : target.name
      ? `name:${target.name}`
      : null

  if (!targetId) return null

  const existing = document.querySelector(
    `inboxkey-overlay[data-target-id="${CSS.escape(targetId)}"]`
  )
  return existing as HTMLElement | null
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Show field feedback on `field`. Returns a ChipHandle for state updates
 * and cleanup. If `showSessionChips` is disabled in settings, returns a
 * silent no-op handle.
 */
export async function showFieldFeedback(
  field: HTMLInputElement,
  options: FieldFeedbackOptions = {}
): Promise<ChipHandle> {
  // 1. Check setting
  try {
    const result = await chrome.storage.local.get('settings')
    const enabled = result.settings?.showSessionChips ?? true
    if (!enabled) {
      return NO_OP_HANDLE
    }
  } catch {
    // Fail-open: show feedback even if storage read fails
  }

  // 2. Re-entrancy guard: return existing handle
  const existing = activeHandles.get(field)
  if (existing) return existing

  // 3. Double-load guard: check for existing overlay DOM node
  if (findExistingOverlay(field)) {
    return NO_OP_HANDLE
  }

  // 4. Detect split-input group
  const splitGroup = detectSplitInputGroup(field)
  const isSplit = splitGroup !== null && splitGroup.inputs.length > 1

  if (isSplit) {
    return buildSplitHandle(splitGroup!.inputs, options)
  }

  return buildSingleHandle(field, options)
}

// ─── Single-field path ───────────────────────────────────────────────────────

function buildSingleHandle(
  field: HTMLInputElement,
  options: FieldFeedbackOptions
): ChipHandle {
  const overlay = new FieldOverlay(field, {
    onClose: options.onClose
      ? async () => {
          await options.onClose?.()
          handle.hide()
        }
      : undefined,
    onDestroy: () => {
      // Clean up activeHandles so the next session gets a fresh handle
      activeHandles.delete(field)
    },
  })

  // Start in listening state
  overlay.setState('listening')

  const handle: ChipHandle = {
    update(state: ChipState) {
      overlay.setState(state)
    },

    hide() {
      activeHandles.delete(field)
      overlay.destroy()
    },
  }

  activeHandles.set(field, handle)
  return handle
}

// ─── Split-input path ────────────────────────────────────────────────────────

function buildSplitHandle(
  inputs: HTMLInputElement[],
  options: FieldFeedbackOptions
): ChipHandle {
  const overlays: FieldOverlay[] = []

  for (let i = 0; i < inputs.length; i++) {
    // Check re-entrancy per input
    const existingHandle = activeHandles.get(inputs[i])
    if (existingHandle) return existingHandle

    const overlay = new FieldOverlay(inputs[i], {
      // Status text only on the last input
      hideStatusText: i < inputs.length - 1,
      // Stagger animation 150ms per box
      staggerDelay: i * 150,
      // Only wire Escape on the first overlay
      onClose: i === 0 && options.onClose
        ? async () => {
            await options.onClose?.()
            handle.hide()
          }
        : undefined,
      onDestroy: () => {
        activeHandles.delete(inputs[i])
      },
    })

    overlay.setState('listening')
    overlays.push(overlay)
  }

  const handle: ChipHandle = {
    update(state: ChipState) {
      for (const overlay of overlays) {
        overlay.setState(state)
      }
    },

    hide() {
      for (const input of inputs) {
        activeHandles.delete(input)
      }
      for (const overlay of overlays) {
        overlay.destroy()
      }
    },
  }

  // Register handle for all inputs in the split group
  for (const input of inputs) {
    activeHandles.set(input, handle)
  }

  return handle
}
