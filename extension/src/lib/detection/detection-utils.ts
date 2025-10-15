/**
 * Shared detection utility functions
 * Used across Tier 1 and Tier 2 detection layers
 */

/**
 * Resolve aria-describedby text for an input element.
 * Handles space-separated IDs per the ARIA spec.
 *
 * @param input - Input field to resolve aria-describedby from
 * @returns Combined text from all referenced elements
 */
export function getAriaDescribedbyText(input: HTMLInputElement): string {
  const describedby = input.getAttribute('aria-describedby')
  if (!describedby) return ''

  return describedby
    .split(/\s+/)
    .map(id => input.ownerDocument?.getElementById(id)?.textContent?.trim() || '')
    .filter(Boolean)
    .join(' ')
}
