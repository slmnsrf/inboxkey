/**
 * Session Chip - Backward Compatibility Wrapper
 * Delegates to field-feedback.ts which provides the shimmer border system.
 */
import { showFieldFeedback } from './field-feedback'
import type { ChipState, ChipHandle } from './field-feedback'

export type { ChipState, ChipHandle }

/**
 * Show a session status indicator on the target field.
 * Now delegates to the shimmer border system instead of the old floating chip.
 */
export async function showSessionChip(
  field: HTMLInputElement,
  sessionTimeoutSeconds?: number,
  callbacks?: {
    onClose?: () => void | Promise<void>
  }
): Promise<ChipHandle> {
  return showFieldFeedback(field, {
    sessionTimeoutSeconds,
    onClose: callbacks?.onClose
  })
}
