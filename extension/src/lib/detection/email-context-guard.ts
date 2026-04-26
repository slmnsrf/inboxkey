/**
 * Email Context Guard
 *
 * Scans the DOM near a detected field for email-related context signals.
 * Used as a pre-flight guardrail before starting a watch session.
 *
 * Reuses EMAIL_PATTERNS from signal-classifier.ts to avoid drift.
 * Failure-open: returns true (proceed) if scan throws.
 */

import { EMAIL_PATTERNS } from './signal-classifier'
import { getFilteredText } from './dom-text-scanner'

/** Semantic container elements to walk up to */
const SEMANTIC_CONTAINERS = new Set(['FORM', 'MAIN', 'SECTION', 'ARTICLE', 'DIALOG'])

/** ARIA roles that mark modal/dialog containers */
const DIALOG_ROLES = new Set(['dialog', 'alertdialog'])

/**
 * Check if an element is a modal/dialog container by ARIA semantics.
 * Catches modals built from <div> + role/aria-modal (Google Material, Radix, etc.)
 * which would otherwise have no recognizable semantic tag.
 */
function isDialogContainer(el: HTMLElement): boolean {
  const role = el.getAttribute('role')
  if (role && DIALOG_ROLES.has(role)) return true
  if (el.getAttribute('aria-modal') === 'true') return true
  return false
}

/** Max DOM levels to walk up if no semantic container found */
const FALLBACK_DEPTH = 5

/**
 * Check if there is email-related context near the given field.
 *
 * @param field - The detected input field
 * @returns true if email context found (or scan fails -- failure-open)
 */
export function hasEmailContext(field: HTMLInputElement): boolean {
  try {
    const container = findScanContainer(field)
    if (!container) return true // failure-open: no container = detached field

    const text = getFilteredText(container)

    // Signal 1: EMAIL_PATTERNS regex match (21 languages)
    for (const pattern of EMAIL_PATTERNS) {
      if (pattern.test(text)) return true
    }

    // Signal 2: @ character in scanned text
    if (text.includes('@')) return true

    // Signal 3: Email input field in container
    const emailInputs = container.querySelectorAll(
      'input[type="email"], input[autocomplete="email"]'
    )
    if (emailInputs.length > 0) return true

    return false
  } catch {
    return true // failure-open
  }
}

/**
 * Walk up from field to nearest semantic container.
 * Crosses shadow DOM boundaries via getRootNode().host.
 * Falls back to N levels up if no semantic container found.
 */
function findScanContainer(field: HTMLInputElement): HTMLElement | null {
  // Handle direct child of shadow root: parentElement is null but
  // the field is inside a shadow DOM. Jump to the host element.
  let node: HTMLElement | null = field.parentElement
  if (!node) {
    const root = field.getRootNode()
    if (root instanceof ShadowRoot && root.host instanceof HTMLElement) {
      node = root.host
    }
  }
  let depth = 0
  let fallback: HTMLElement | null = null

  // Walk the full ancestor chain looking for a semantic/dialog container.
  // Modals (Google, Material, Radix) are often deeper than FALLBACK_DEPTH,
  // so we can't bail out early -- we record the 5-level node as a fallback
  // and only use it if no semantic boundary is found before document.body.
  while (node && node !== document.body) {
    if (SEMANTIC_CONTAINERS.has(node.tagName) || isDialogContainer(node)) {
      return node
    }
    depth++
    if (depth === FALLBACK_DEPTH) {
      fallback = node
    }
    const next = node.parentElement
    if (next) {
      node = next
    } else {
      // Cross shadow DOM boundary: if inside a shadow root, jump to the host element
      const root = node.getRootNode()
      if (root instanceof ShadowRoot && root.host instanceof HTMLElement) {
        node = root.host
      } else {
        break
      }
    }
  }

  // No semantic container found: use the 5-level fallback if we walked that
  // far, otherwise the topmost reachable node (document.body or null).
  return fallback ?? node
}

