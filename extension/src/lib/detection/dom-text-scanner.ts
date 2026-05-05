/**
 * DOM Text Scanner
 *
 * Utilities for scanning text content from DOM elements while excluding
 * navigation, footer, and header zones to avoid false positives.
 */

/** Elements to exclude from text scanning */
const EXCLUDED_TAGS = new Set([
  'HEADER',
  'FOOTER',
  'NAV',
  // Code/markup blocks: their text content is implementation, not user-visible
  // copy. JSDoc tags ("@type {RegExp}"), TS decorators ("@Component"), CSS
  // at-rules ("@media") otherwise spoof email-context heuristics that look for
  // an "@" character.
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'TEMPLATE',
])

/** ARIA roles to exclude from text scanning */
const EXCLUDED_ROLES = new Set(['navigation', 'banner', 'contentinfo'])

/**
 * Get text content from container, excluding footer/nav/header zones.
 */
export function getFilteredText(container: HTMLElement): string {
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
