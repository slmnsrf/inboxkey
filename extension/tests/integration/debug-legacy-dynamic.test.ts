/**
 * Diagnostic test for Legacy Form and Dynamic Inject failures
 */

import { describe, it } from 'vitest'
import { Window } from 'happy-dom'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  detectVerificationField,
  resetCooldownRegistry,
} from '../../src/lib/detection/field-detector'
import { detectTier1 } from '../../src/lib/detection/tier1-fast'
import { createCooldownRegistry } from '../../src/lib/detection/cooldown-registry'

describe('Legacy Form and Dynamic Inject Diagnostics', () => {
  it('DEBUG: Legacy Form detection', () => {
    resetCooldownRegistry()

    const htmlContent = readFileSync(
      join(__dirname, '../fixtures/detection/legacy-form.html'),
      'utf-8'
    )

    const window = new Window()
    const document = window.document
    document.write(htmlContent)

    global.document = document as any
    global.window = window as any
    global.performance = window.performance as any

    // Check what inputs exist
    const inputs = document.querySelectorAll('input')
    console.log('\n=== LEGACY FORM DIAGNOSTIC ===')
    console.log(`Step 1: Found ${inputs.length} input(s)`)

    inputs.forEach((input, i) => {
      console.log(`\nInput ${i + 1}:`, {
        type: input.type,
        name: input.name,
        id: input.id,
        maxlength: input.maxLength,
        'data-testid': input.getAttribute('data-testid'),
      })
    })

    // Check page text
    const bodyText = document.body.textContent || ''
    console.log('\nStep 2: Page text preview:', bodyText.substring(0, 200))

    // Try Tier1 detection directly on the verification input
    const verificationInput = document.querySelector('[name="seccode"]') as HTMLInputElement
    if (verificationInput) {
      const cooldown = createCooldownRegistry()
      const tier1Result = detectTier1(verificationInput, cooldown)
      console.log('\nStep 3: Tier1 direct result:', tier1Result)
    }

    // Try full detection
    const result = detectVerificationField({ strictVisibility: false })

    console.log('\nStep 4: Full detection result:', result ? {
      detected: true,
      fieldId: result.field.id,
      fieldName: result.field.name,
      confidence: result.confidence,
      tier: result.tier,
      signals: result.signals,
    } : 'NULL')
    console.log('===========================\n')
  })

  it('DEBUG: Dynamic Inject detection', () => {
    resetCooldownRegistry()

    const htmlContent = readFileSync(
      join(__dirname, '../fixtures/detection/dynamic-inject.html'),
      'utf-8'
    )

    const window = new Window()
    const document = window.document
    document.write(htmlContent)

    global.document = document as any
    global.window = window as any
    global.performance = window.performance as any

    // Trigger injection
    const injectScript = document.querySelector('script')?.textContent
    if (injectScript && injectScript.includes('injectVerificationField')) {
      const fn = new Function(injectScript + '; return injectVerificationField;')
      const injectVerificationField = fn()
      injectVerificationField()
    }

    // Check what inputs exist
    const inputs = document.querySelectorAll('input')
    console.log('\n=== DYNAMIC INJECT DIAGNOSTIC ===')
    console.log(`Step 1: Found ${inputs.length} input(s)`)

    inputs.forEach((input, i) => {
      console.log(`\nInput ${i + 1}:`, {
        type: input.type,
        name: input.name,
        id: input.id,
        autocomplete: input.autocomplete,
        inputmode: input.getAttribute('inputmode'),
        maxlength: input.maxLength,
        'data-testid': input.getAttribute('data-testid'),
      })
    })

    // Check page text
    const bodyText = document.body.textContent || ''
    console.log('\nStep 2: Page text preview:', bodyText.substring(0, 300))

    // Try Tier1 detection directly on the verification input
    const verificationInput = document.querySelector('[id="dynamic-otp"]') as HTMLInputElement
    if (verificationInput) {
      const cooldown = createCooldownRegistry()
      const tier1Result = detectTier1(verificationInput, cooldown)
      console.log('\nStep 3: Tier1 direct result:', tier1Result)
    }

    // Try full detection
    const result = detectVerificationField({ strictVisibility: false })

    console.log('\nStep 4: Full detection result:', result ? {
      detected: true,
      fieldId: result.field.id,
      fieldName: result.field.name,
      confidence: result.confidence,
      tier: result.tier,
      signals: result.signals,
    } : 'NULL')
    console.log('===========================\n')
  })
})
