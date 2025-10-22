/**
 * Diagnostic for Edge Case false positive
 */

import { describe, it } from 'vitest'
import { Window } from 'happy-dom'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  detectVerificationField,
  resetCooldownRegistry,
} from '../../src/lib/detection/field-detector'

describe('Edge Case False Positive Diagnostic', () => {
  it('DEBUG: Which field is being detected?', () => {
    resetCooldownRegistry()

    const htmlContent = readFileSync(
      join(__dirname, '../fixtures/detection/edge-case.html'),
      'utf-8'
    )

    const window = new Window()
    const document = window.document
    document.write(htmlContent)

    global.document = document as any
    global.window = window as any
    global.performance = window.performance as any

    console.log('\n=== EDGE CASE FALSE POSITIVE DIAGNOSTIC ===')

    const inputs = document.querySelectorAll('input')
    console.log(`Total inputs found: ${inputs.length}`)

    // Try detection
    const result = detectVerificationField({ strictVisibility: false })

    if (result) {
      console.log('\n❌ FALSE POSITIVE DETECTED!')
      console.log('Field:', {
        id: result.field.id,
        name: result.field.name,
        type: result.field.type,
        maxlength: result.field.maxLength,
        disabled: result.field.disabled,
        style: result.field.getAttribute('style'),
      })
      console.log('Detection result:', {
        confidence: result.confidence,
        tier: result.tier,
        signals: result.signals,
        executionTime: result.executionTime,
      })
    } else {
      console.log('\n✅ Correctly returned NULL (no false positives)')
    }

    console.log('===========================\n')
  })
})
