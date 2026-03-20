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

/** Semantic container elements to walk up to */
const SEMANTIC_CONTAINERS = new Set(['FORM', 'MAIN', 'SECTION', 'ARTICLE'])

/** Elements to exclude from text scanning */
const EXCLUDED_TAGS = new Set(['HEADER', 'FOOTER', 'NAV'])

/** ARIA roles to exclude from text scanning */
const EXCLUDED_ROLES = new Set(['navigation', 'banner', 'contentinfo'])

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
 * Falls back to N levels up if no semantic container found.
 */
function findScanContainer(field: HTMLInputElement): HTMLElement | null {
  let node: HTMLElement | null = field.parentElement
  let depth = 0

  while (node && node !== document.body) {
    if (SEMANTIC_CONTAINERS.has(node.tagName)) {
      return node
    }
    depth++
    if (depth >= FALLBACK_DEPTH) {
      return node
    }
    node = node.parentElement
  }

  return node // document.body or null
}

/**
 * Get text content from container, excluding footer/nav/header zones.
 */
function getFilteredText(container: HTMLElement): string {
  const parts: string[] = []

  function walk(node: Node): void {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement
      if (EXCLUDED_TAGS.has(el.tagName)) return
      const role = el.getAttribute('role')
      if (role && EXCLUDED_ROLES.has(role)) return
    }

    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim()
      if (text) parts.push(text)
    } else {
      for (const child of node.childNodes) {
        walk(child)
      }
    }
  }

  walk(container)
  return parts.join(' ')
}
