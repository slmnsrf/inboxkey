import { describe, it, beforeEach } from 'vitest'
import { Window } from 'happy-dom'
import { readFileSync } from 'fs'
import { join } from 'path'
import { detectVerificationField } from '../../src/lib/detection/field-detector'
import { detectTier1 } from '../../src/lib/detection/tier1-fast'
import { classifyDeliveryChannel } from '../../src/lib/detection/signal-classifier'
import { validateContext } from '../../src/lib/detection/context-validator'
import { createCooldownRegistry } from '../../src/lib/detection/cooldown-registry'

describe('Detection Diagnostics', () => {
  it('DEBUG: Amazon OTP step-by-step', () => {
    const window = new Window()
    const document = window.document
    const htmlContent = readFileSync(
      join(__dirname, '../fixtures/detection/amazon-otp.html'),
      'utf-8'
    )
    document.write(htmlContent)

    global.document = document as any
    global.window = window as any
    global.performance = window.performance as any

    // Step 1: Check if inputs are found
    const inputs = document.querySelectorAll('input')
    console.log('\n=== AMAZON OTP DIAGNOSTIC ===')
    console.log(`Step 1: Found ${inputs.length} input(s)`)

    if (inputs.length === 0) {
      console.log('❌ NO INPUTS FOUND - document.querySelectorAll failed')
      return
    }

    const input = inputs[0] as HTMLInputElement
    console.log(`Step 2: Input attributes:`, {
      id: input.id,
      name: input.name,
      type: input.type,
      maxLength: input.maxLength,
      autocomplete: input.getAttribute('autocomplete'),
    })

    // Step 3: Extract text for signal classifier
    const labelElement = document.querySelector(`label[for="${input.id}"]`)
    const label = labelElement?.textContent?.trim() || ''
    const placeholder = input.placeholder || ''
    const nearbyText = document.querySelector('.alert-text')?.textContent?.trim() || ''

    console.log(`Step 3: Text sources:`, {
      label,
      placeholder,
      nearbyTextPreview: nearbyText.substring(0, 100) + '...',
    })

    // Step 4: Test signal classifier
    const signalResult = classifyDeliveryChannel({
      label,
      placeholder,
      nearbyText,
      ariaLabel: '',
    })
    console.log(`Step 4: Signal classifier result:`, signalResult)

    // Step 5: Test context validator
    const contextResult = validateContext({
      label,
      placeholder,
      nearbyText,
      ariaLabel: '',
      pageTitle: document.title,
    })
    console.log(`Step 5: Context validator result:`, contextResult)

    // Step 6: Run full Tier1 detection
    const cooldown = createCooldownRegistry()
    const tier1Result = detectTier1(input, cooldown)
    console.log(`Step 6: Tier1 result:`, tier1Result)

    // Step 7: Run full detection
    const fullResult = detectVerificationField({ strictVisibility: false })
    console.log(`Step 7: Full detection result:`, fullResult ? 'DETECTED' : 'NULL')
    console.log('===========================\n')
  })

  it('DEBUG: Startup Minimal step-by-step', () => {
    const window = new Window()
    const document = window.document
    const htmlContent = readFileSync(
      join(__dirname, '../fixtures/detection/startup-minimal.html'),
      'utf-8'
    )
    document.write(htmlContent)

    global.document = document as any
    global.window = window as any
    global.performance = window.performance as any

    const inputs = document.querySelectorAll('input')
    console.log('\n=== STARTUP MINIMAL DIAGNOSTIC ===')
    console.log(`Step 1: Found ${inputs.length} input(s)`)

    if (inputs.length === 0) {
      console.log('❌ NO INPUTS FOUND')
      return
    }

    const input = inputs[0] as HTMLInputElement
    console.log(`Step 2: Input attributes:`, {
      id: input.id || '(none)',
      name: input.name || '(none)',
      type: input.type,
      inputmode: input.getAttribute('inputmode'),
      maxLength: input.maxLength,
      placeholder: input.placeholder,
    })

    // Extract all text from page
    const h1 = document.querySelector('h1')?.textContent?.trim() || ''
    const p = document.querySelector('p')?.textContent?.trim() || ''

    console.log(`Step 3: Page text:`, {
      title: document.title,
      h1,
      paragraph: p,
    })

    const signalResult = classifyDeliveryChannel({
      label: '',
      placeholder: input.placeholder,
      nearbyText: h1 + ' ' + p,
      ariaLabel: '',
    })
    console.log(`Step 4: Signal classifier:`, signalResult)

    const contextResult = validateContext({
      label: '',
      placeholder: input.placeholder,
      nearbyText: h1 + ' ' + p,
      ariaLabel: '',
      pageTitle: document.title,
    })
    console.log(`Step 5: Context validator:`, contextResult)

    const cooldown = createCooldownRegistry()
    const tier1Result = detectTier1(input, cooldown)
    console.log(`Step 6: Tier1 result:`, tier1Result)

    const fullResult = detectVerificationField({ strictVisibility: false })
    console.log(`Step 7: Full detection:`, fullResult ? 'DETECTED' : 'NULL')
    console.log('===========================\n')
  })

  it('DEBUG: GitHub 2FA step-by-step', () => {
    const window = new Window()
    const document = window.document
    const htmlContent = readFileSync(
      join(__dirname, '../fixtures/detection/github-2fa.html'),
      'utf-8'
    )
    document.write(htmlContent)

    global.document = document as any
    global.window = window as any
    global.performance = window.performance as any

    const inputs = document.querySelectorAll('input')
    console.log('\n=== GITHUB 2FA DIAGNOSTIC (PASSING TEST) ===')
    console.log(`Step 1: Found ${inputs.length} input(s)`)

    if (inputs.length === 0) {
      console.log('❌ NO INPUTS FOUND')
      return
    }

    const input = inputs[0] as HTMLInputElement
    console.log(`Step 2: Input attributes:`, {
      id: input.id,
      name: input.name,
      type: input.type,
      autocomplete: input.getAttribute('autocomplete'),
      inputmode: input.getAttribute('inputmode'),
      pattern: input.getAttribute('pattern'),
    })

    const label = document.querySelector(`label[for="${input.id}"]`)?.textContent?.trim() || ''
    const nearbyText = document.querySelector('p')?.textContent?.trim() || ''

    console.log(`Step 3: Text sources:`, {
      label,
      nearbyTextPreview: nearbyText.substring(0, 100),
    })

    const signalResult = classifyDeliveryChannel({
      label,
      placeholder: '',
      nearbyText,
      ariaLabel: '',
    })
    console.log(`Step 4: Signal classifier:`, signalResult)

    const contextResult = validateContext({
      label,
      placeholder: '',
      nearbyText,
      ariaLabel: '',
      pageTitle: document.title,
    })
    console.log(`Step 5: Context validator:`, contextResult)

    const cooldown = createCooldownRegistry()
    const tier1Result = detectTier1(input, cooldown)
    console.log(`Step 6: Tier1 result:`, tier1Result)

    const fullResult = detectVerificationField({ strictVisibility: false })
    console.log(`Step 7: Full detection:`, fullResult ? 'DETECTED' : 'NULL')
    console.log('===========================\n')
  })
})
