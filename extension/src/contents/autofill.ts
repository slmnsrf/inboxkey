/**
 * Autofill Module
 * Handles safe autofilling of verification codes with visual feedback
 */

import { extractDomain, isDomainEnabled } from '@/lib/utils/domain'
import { findSubmitButton } from './submit-button-finder'
import { logAutoSubmitFailure } from '@/lib/storage/telemetry'
import { detectSplitInputGroup } from '@/lib/detection/split-input-detector'

export interface AutofillOptions {
  code: string
  field: HTMLInputElement
  showFeedback?: boolean
}

/**
 * Autofill a verification code into an input field
 * @returns true if successful, false if field is not fillable
 */
export async function autofillCode(options: AutofillOptions): Promise<boolean> {
  const { code, field, showFeedback = true } = options

  // Check if domain is enabled
  const domain = extractDomain(window.location.href)
  if (domain) {
    const enabled = await isDomainEnabled(domain)
    if (!enabled) {
      console.log('[Autofill] Domain is disabled, skipping autofill')
      return false
    }
  }

  // Validation checks
  if (!code || code.length === 0) {
    console.warn('[Autofill] Cannot autofill empty code')
    return false
  }

  // Check if field still exists in DOM
  if (!document.contains(field)) {
    console.warn('[Autofill] Field no longer exists in DOM')
    return false
  }

  // Check if field is readonly or disabled
  if (field.readOnly) {
    console.warn('[Autofill] Field is readonly, cannot autofill')
    return false
  }

  if (field.disabled) {
    console.warn('[Autofill] Field is disabled, cannot autofill')
    return false
  }

  // Check if field is visible
  const style = window.getComputedStyle(field)
  if (style.display === 'none' || style.visibility === 'hidden') {
    console.warn('[Autofill] Field is not visible, cannot autofill')
    return false
  }

  const rect = field.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) {
    console.warn('[Autofill] Field has zero size, cannot autofill')
    return false
  }

  // Check for split-input group
  const group = detectSplitInputGroup(field)

  if (group && group.inputs.length > 1) {
    console.log(`[Autofill] Split-input group detected: ${group.inputs.length} inputs`)
    return autofillSplitInputs(code, group.inputs, showFeedback)
  }

  // Perform autofill (single field)
  console.log('[Autofill] Autofilling code:', code)

  // Focus the field first
  field.focus()

  // Set the value
  field.value = code

  // Dispatch events to trigger framework reactivity
  // Order matters: input -> change -> blur
  field.dispatchEvent(new Event('input', { bubbles: true }))
  field.dispatchEvent(new Event('change', { bubbles: true }))

  // Some frameworks use 'keyup' or 'keydown' for validation
  field.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }))
  field.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }))

  // Mark as filled for tracking
  field.setAttribute('data-inboxkey-filled', 'true')
  field.setAttribute('data-inboxkey-timestamp', Date.now().toString())

  // Visual feedback
  if (showFeedback) {
    showSuccessFeedback(field)
  }

  // Check if we should auto-submit
  const shouldAutoSubmit = await checkForAutoSubmit(field)
  if (shouldAutoSubmit) {
    console.log('[Autofill] Auto-submitting form')
    await submitForm(field)
  }

  console.log('[Autofill] Autofill completed successfully')
  return true
}

/**
 * Autofill code across multiple split inputs (e.g., Steam's 5-input code)
 * Distributes code character-by-character: "12345" → "1" "2" "3" "4" "5"
 *
 * @param code - Verification code to fill
 * @param inputs - Array of input fields in DOM order
 * @param showFeedback - Whether to show visual feedback
 * @returns true if successful
 */
async function autofillSplitInputs(
  code: string,
  inputs: HTMLInputElement[],
  showFeedback: boolean
): Promise<boolean> {
  const chars = code.split('')

  console.log(`[Autofill] Distributing ${chars.length} characters across ${inputs.length} inputs`)

  // Fill each input with one character
  for (let i = 0; i < Math.min(chars.length, inputs.length); i++) {
    const input = inputs[i]

    // Focus the input
    input.focus()

    // Set the value
    input.value = chars[i]

    // Dispatch events to trigger framework reactivity
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }))

    // Mark as filled
    input.setAttribute('data-inboxkey-filled', 'true')
    input.setAttribute('data-inboxkey-timestamp', Date.now().toString())

    // Visual feedback
    if (showFeedback) {
      showSuccessFeedback(input)
    }
  }

  // Focus last filled input (matches user expectation)
  const lastIndex = Math.min(chars.length, inputs.length) - 1
  if (lastIndex >= 0) {
    inputs[lastIndex].focus()
  }

  console.log('[Autofill] Split-input autofill completed successfully')
  return true
}

/**
 * Show visual feedback for successful autofill
 */
function showSuccessFeedback(field: HTMLInputElement): void {
  // Save original styles
  const originalBackground = field.style.backgroundColor
  const originalBorder = field.style.border
  const originalTransition = field.style.transition

  // Apply success styles
  field.style.transition = 'background-color 0.3s ease'
  field.style.backgroundColor = '#e8f5e9' // Light green
  field.style.border = '2px solid #4caf50' // Green border

  // Revert after 2 seconds
  setTimeout(() => {
    field.style.transition = originalTransition
    field.style.backgroundColor = originalBackground
    field.style.border = originalBorder
  }, 2000)
}

/**
 * Check if we should auto-submit the form
 */
async function checkForAutoSubmit(_field: HTMLInputElement): Promise<boolean> {
  // For now, don't auto-submit to be safe
  // In the future, this could check user settings
  return false
}

/**
 * Submit the form containing the field
 */
async function submitForm(field: HTMLInputElement): Promise<void> {
  const form = field.closest('form')
  if (!form) {
    console.warn('[Autofill] No form found to submit')
    return
  }

  // Try to find and click the submit button
  const submitButton = form.querySelector<HTMLButtonElement>(
    'button[type="submit"], input[type="submit"]'
  )

  if (submitButton && !submitButton.disabled) {
    submitButton.click()
    return
  }

  // Fallback: submit the form directly
  form.submit()
}

/**
 * Check if a field has been filled by InboxKey
 */
export function isFieldFilledByInboxKey(field: HTMLInputElement): boolean {
  return field.getAttribute('data-inboxkey-filled') === 'true'
}

/**
 * Get the timestamp when field was filled
 */
export function getFieldFillTimestamp(field: HTMLInputElement): number | null {
  const timestamp = field.getAttribute('data-inboxkey-timestamp')
  return timestamp ? parseInt(timestamp, 10) : null
}

/**
 * Clear autofill tracking from a field
 */
export function clearAutofillTracking(field: HTMLInputElement): void {
  field.removeAttribute('data-inboxkey-filled')
  field.removeAttribute('data-inboxkey-timestamp')
}

/**
 * Find and click a submit button near the given field
 * @returns true if a submit button was found and clicked
 */
export async function findAndClickSubmitButton(
  field: HTMLInputElement,
  extendedDetection: boolean = false  // NEW parameter
): Promise<boolean> {
  console.log('[Autofill] Attempting to find and click submit button')
  console.log('[Autofill] Extended detection:', extendedDetection)

  const url = window.location.href

  try {
    // Use new button finder
    const button = await findSubmitButton({
      field,
      debugMode: false,
      extendedDetection  // Pass to finder
    })

    if (!button) {
      console.log('[Autofill] No safe submit button found')
      await logAutoSubmitFailure(url, 'no_safe_buttons', { buttonCount: 0 })
      return false
    }

    // Found a safe button, try to click it
    console.log('[Autofill] Clicking submit button:', button.textContent?.trim())

    try {
      button.click()
      console.log('[Autofill] Submit button clicked successfully')
      return true
    } catch (clickError) {
      console.error('[Autofill] Failed to click button:', clickError)
      await logAutoSubmitFailure(url, 'click_failed', {
        buttonText: button.textContent || undefined
      })
      return false
    }
  } catch (error) {
    console.error('[Autofill] findAndClickSubmitButton error:', error)
    await logAutoSubmitFailure(url, 'no_buttons')
    return false
  }
}
