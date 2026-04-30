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

/**
 * Resolve aria-labelledby text for an input element.
 * Handles space-separated IDs per the ARIA spec.
 */
export function getAriaLabelledbyText(input: HTMLInputElement): string {
  const labelledby = input.getAttribute('aria-labelledby')
  if (!labelledby) return ''

  return labelledby
    .split(/\s+/)
    .map(id => input.ownerDocument?.getElementById(id)?.textContent?.trim() || '')
    .filter(Boolean)
    .join(' ')
}

function escapeCssString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/**
 * Resolve explicit <label for="..."> text without throwing on unusual IDs.
 */
export function getExplicitLabelText(input: HTMLInputElement): string {
  const id = input.id
  if (!id) return ''

  const doc = input.ownerDocument
  const labels: string[] = []

  try {
    const matches = doc?.querySelectorAll<HTMLLabelElement>(`label[for="${escapeCssString(id)}"]`)
    matches?.forEach(label => {
      if (label.textContent) labels.push(label.textContent.trim())
    })
  } catch {
    // Fallback for IDs that still break selector parsing in older engines.
    const allLabels = doc?.querySelectorAll<HTMLLabelElement>('label') || []
    Array.from(allLabels).forEach(label => {
      if ((label.htmlFor || label.getAttribute('for')) === id && label.textContent) {
        labels.push(label.textContent.trim())
      }
    })
  }

  return labels.filter(Boolean).join(' ')
}

/**
 * HTML autocomplete is a token list, e.g. "section-login one-time-code".
 */
export function getAutocompleteTokens(input: HTMLInputElement): string[] {
  return (input.getAttribute('autocomplete') || '')
    .toLowerCase()
    .split(/\s+/)
    .map(token => token.trim())
    .filter(Boolean)
}

export function getMatchingAutocompleteToken(
  input: HTMLInputElement,
  allowedValues: readonly string[]
): string | null {
  const allowed = new Set(allowedValues)
  return getAutocompleteTokens(input).find(token => allowed.has(token)) || null
}
