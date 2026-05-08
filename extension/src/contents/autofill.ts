/**
 * Autofill Module
 * Handles safe autofilling of verification codes with visual feedback
 */

export const config = {
  matches: ["https://*/*"],
}

import { extractDomain, isDomainEnabled } from '@/lib/utils/domain'
import { findSubmitButton } from './submit-button-finder'
import { logAutoSubmitFailure } from '@/lib/storage/telemetry'
import { detectSplitInputGroup, type SplitInputGroup } from '@/lib/detection/split-input-detector'
import { debugLog } from '@/lib/utils/debug-log'
export interface AutofillOptions {
  code: string
  field: HTMLInputElement
}

function setNativeInputValue(field: HTMLInputElement, value: string): void {
  const ownDescriptor = Object.getOwnPropertyDescriptor(field, 'value')
  const prototype = Object.getPrototypeOf(field)
  const prototypeDescriptor = prototype
    ? Object.getOwnPropertyDescriptor(prototype, 'value')
    : undefined
  const setter = prototypeDescriptor?.set ?? ownDescriptor?.set

  if (setter) {
    setter.call(field, value)
  } else {
    field.value = value
  }
}

function createInputEvent(
  type: 'beforeinput' | 'input',
  value: string
): Event {
  try {
    return new InputEvent(type, {
      bubbles: true,
      cancelable: type === 'beforeinput',
      data: value,
      inputType: 'insertText',
    })
  } catch {
    return new Event(type, { bubbles: true, cancelable: type === 'beforeinput' })
  }
}

function dispatchFillEvents(field: HTMLInputElement, value: string): void {
  const key = value.length === 1 ? value : ''
  const keyboardInit: KeyboardEventInit = {
    bubbles: true,
    key,
    code: /^\d$/.test(key) ? `Digit${key}` : '',
  }

  field.dispatchEvent(new KeyboardEvent('keydown', keyboardInit))
  field.dispatchEvent(createInputEvent('beforeinput', value))
  field.dispatchEvent(createInputEvent('input', value))
  field.dispatchEvent(new KeyboardEvent('keyup', keyboardInit))
  field.dispatchEvent(new Event('change', { bubbles: true }))
}

/**
 * Autofill a verification code into an input field
 * @returns true if successful, false if field is not fillable
 */
export async function autofillCode(options: AutofillOptions): Promise<boolean> {
  const { code, field } = options

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
    console.log('[Autofill] Cannot autofill empty code')
    return false
  }

  // Check if field still exists in DOM
  if (!document.contains(field)) {
    console.log('[Autofill] Field no longer exists in DOM')
    return false
  }

  // Check if field is readonly or disabled
  if (field.readOnly) {
    console.log('[Autofill] Field is readonly, cannot autofill')
    return false
  }

  if (field.disabled) {
    console.log('[Autofill] Field is disabled, cannot autofill')
    return false
  }

  // Check if field is visible. Some React OTP libraries render a
  // styled div overlay on top of a real input with opacity:0 and/or
  // pointer-events:none so keyboard focus still works; the visible
  // overlay is what the user sees and the framework's synthetic-event
  // system is driven by. Filling the hidden input in that layout sets
  // the DOM value but leaves the visible boxes blank.
  const style = window.getComputedStyle(field)
  if (
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    style.opacity === '0' ||
    style.pointerEvents === 'none'
  ) {
    console.log('[Autofill] Field is not visible/interactive, cannot autofill')
    return false
  }

  const rect = field.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) {
    console.log('[Autofill] Field has zero size, cannot autofill')
    return false
  }

  // Check for split-input group
  const group = detectSplitInputGroup(field)

  if (group && group.inputs.length > 1) {
    console.log(
      `[Autofill] Split-input group detected: ${group.inputs.length} inputs (pattern=${group.pattern})`
    )
    return autofillSplitInputs(code, group)
  }

  // Perform autofill (single field)
  console.log(`[Autofill] Autofilling code (redacted ${code.length} chars)`)

  await fillSingleField(field, code)

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
 * Fill a single input with the full code value and dispatch the
 * framework-reactivity event sequence. Marks the field as filled.
 *
 * Extracted so the leader-only-submitted branch of autofillSplitInputs
 * can reuse the same fill-and-mark behavior without re-running
 * auto-submit logic (which only the single-field path triggers).
 *
 * @param field - Input to fill
 * @param code - Full verification code value
 * @returns true (always; caller handles availability/visibility checks)
 */
async function fillSingleField(field: HTMLInputElement, code: string): Promise<boolean> {
  // Focus the field first
  field.focus()

  // Use the native setter so React/AntD controlled inputs observe the
  // value change, then dispatch the browser-like event sequence.
  setNativeInputValue(field, code)
  dispatchFillEvents(field, code)

  // Mark as filled for tracking
  field.setAttribute('data-inboxkey-filled', 'true')
  field.setAttribute('data-inboxkey-timestamp', Date.now().toString())

  return true
}

/**
 * Autofill code across multiple split inputs (e.g., Steam's 5-input code)
 * Distributes code character-by-character: "12345" → "1" "2" "3" "4" "5"
 *
 * Special-case: asymmetric-leader groups where only the leader has a
 * `name` attribute (cells are presentation-only). The page submits the
 * full code from the leader; per-cell distribution would corrupt the
 * value. Fall back to filling the leader with the full code.
 *
 * @param code - Verification code to fill
 * @param group - Detected split-input group (DOM-ordered)
 * @returns true if successful
 */
async function autofillSplitInputs(
  code: string,
  group: SplitInputGroup
): Promise<boolean> {
  // Leader-only-submitted variant: the leader has a name and the
  // cells are presentation-only (no name attribute). The framework
  // funnels submission through the leader's value, so distributing
  // chars across cells would NOT submit the code at all. Fill just
  // the leader with the full code.
  if (group.pattern === 'asymmetric-leader') {
    const [leader, ...cells] = group.inputs  // sorted DOM-order, leader at [0]
    if (leader.name !== '' && cells.every(c => c.name === '')) {
      console.log(
        '[Autofill] Asymmetric-leader, leader-only-submitted: filling leader with full code'
      )
      return fillSingleField(leader, code)
    }
  }

  const inputs = group.inputs
  const chars = code.split('')

  // Filter to fillable inputs only (skip readOnly, disabled)
  const fillableInputs = inputs.filter(input => !input.readOnly && !input.disabled)

  console.log(`[Autofill] Distributing ${chars.length} characters across ${fillableInputs.length} fillable inputs (${inputs.length} total)`)

  // Strict shape contract: code length must exactly match fillable input count
  if (chars.length !== fillableInputs.length) {
    console.log(
      `[Autofill] Shape mismatch: code has ${chars.length} chars but ${fillableInputs.length} fillable inputs`
    )
    return false
  }

  // Fill each fillable input with one character
  for (let i = 0; i < fillableInputs.length; i++) {
    const input = fillableInputs[i]

    // Focus the input
    input.focus()

    // Use the native setter so React/AntD controlled inputs observe the
    // value change, then dispatch the browser-like event sequence.
    setNativeInputValue(input, chars[i])
    dispatchFillEvents(input, chars[i])

    // Mark as filled
    input.setAttribute('data-inboxkey-filled', 'true')
    input.setAttribute('data-inboxkey-timestamp', Date.now().toString())
  }

  // Focus last filled input (matches user expectation)
  fillableInputs[fillableInputs.length - 1].focus()

  console.log('[Autofill] Split-input autofill completed successfully')
  return true
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
    console.log('[Autofill] No form found to submit')
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
      debugLog('[Autofill] Failed to click button:', clickError)
      await logAutoSubmitFailure(url, 'click_failed', {
        buttonText: button.textContent || undefined
      })
      return false
    }
  } catch (error) {
    debugLog('[Autofill] findAndClickSubmitButton error:', error)
    await logAutoSubmitFailure(url, 'no_buttons')
    return false
  }
}
