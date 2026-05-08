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
function getIdReferenceText(element: Element, attribute: string): string {
  const refs = element.getAttribute(attribute)
  if (!refs) return ''

  return refs
    .split(/\s+/)
    .map(id => element.ownerDocument?.getElementById(id)?.textContent?.trim() || '')
    .filter(Boolean)
    .join(' ')
}

export function getAriaDescribedbyText(input: HTMLInputElement): string {
  return getIdReferenceText(input, 'aria-describedby')
}

/**
 * Resolve aria-labelledby text for an input element.
 * Handles space-separated IDs per the ARIA spec.
 */
export function getAriaLabelledbyText(input: HTMLInputElement): string {
  return getIdReferenceText(input, 'aria-labelledby')
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

const ACCESSIBLE_CONTEXT_ROLES = new Set([
  'group',
  'radiogroup',
  'dialog',
  'alertdialog',
])

const ACCESSIBLE_CONTEXT_TAGS = new Set([
  'FIELDSET',
  'DIALOG',
])

function getDirectLegendText(element: HTMLElement): string {
  if (element.tagName !== 'FIELDSET') return ''

  for (const child of Array.from(element.children)) {
    if (child.tagName === 'LEGEND') {
      return child.textContent?.trim() || ''
    }
  }

  return ''
}

function pushUniqueText(parts: string[], value: string | null | undefined): void {
  const text = value?.trim()
  if (!text) return
  if (parts.includes(text)) return
  parts.push(text)
}

/**
 * Read the accessible name/description from nearby semantic wrappers.
 *
 * OTP widgets often put the meaningful delivery context on a group or
 * modal, while each individual cell only says "OTP digit 1". This helper
 * inherits compact accessible context from ancestors such as:
 * - role="group" aria-label="Phone verification code"
 * - fieldset > legend
 * - role="dialog" aria-labelledby / aria-describedby
 *
 * It deliberately reads accessible names/descriptions only, not arbitrary
 * ancestor textContent, so split-input structure remains separate from
 * delivery-channel evidence.
 */
export function getAccessibleAncestorContextText(input: HTMLInputElement): string {
  const parts: string[] = []
  let node: HTMLElement | null = input.parentElement
  let depth = 0

  while (node && node !== document.body && depth < 8) {
    const role = node.getAttribute('role')?.toLowerCase() || ''
    const isAccessibleContext =
      ACCESSIBLE_CONTEXT_ROLES.has(role) ||
      ACCESSIBLE_CONTEXT_TAGS.has(node.tagName) ||
      node.getAttribute('aria-modal') === 'true'

    if (isAccessibleContext) {
      pushUniqueText(parts, node.getAttribute('aria-label'))
      pushUniqueText(parts, getIdReferenceText(node, 'aria-labelledby'))
      pushUniqueText(parts, getIdReferenceText(node, 'aria-describedby'))
      pushUniqueText(parts, getDirectLegendText(node))
    }

    if (
      role === 'dialog' ||
      role === 'alertdialog' ||
      node.tagName === 'DIALOG' ||
      node.tagName === 'FORM' ||
      node.getAttribute('aria-modal') === 'true'
    ) {
      break
    }

    node = node.parentElement
    depth += 1
  }

  return parts.join(' ')
}
