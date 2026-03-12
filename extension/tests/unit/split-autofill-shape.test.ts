/**
 * Split Autofill Shape Contract Tests
 *
 * Validates that autofillSplitInputs enforces strict shape equality:
 * code.length must exactly equal the number of fillable inputs.
 *
 * Bug: Previously only checked chars.length < fillableInputs.length,
 * allowing silent truncation when code was longer than inputs.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Window } from 'happy-dom'

// Mock dependencies before importing module under test
vi.mock('../../src/lib/utils/domain', () => ({
  extractDomain: vi.fn(() => 'example.com'),
  isDomainEnabled: vi.fn(() => Promise.resolve(true)),
}))
vi.mock('../../src/contents/submit-button-finder', () => ({
  findSubmitButton: vi.fn(() => Promise.resolve(null)),
}))
vi.mock('../../src/lib/storage/telemetry', () => ({
  logAutoSubmitFailure: vi.fn(() => Promise.resolve()),
  logBetaFeatureUsage: vi.fn(() => Promise.resolve()),
}))
vi.mock('../../src/lib/detection/split-input-detector', () => ({
  detectSplitInputGroup: vi.fn(() => null),
}))
// Mock watch-session dependencies for deriveExpectedShape
vi.mock('../../src/lib/storage/storage-factory', () => ({
  StorageFactory: { create: vi.fn() },
}))

import { autofillCode } from '../../src/contents/autofill'
import { detectSplitInputGroup } from '../../src/lib/detection/split-input-detector'
import { deriveExpectedShape } from '../../src/contents/watch-session'

describe('split autofill shape contract', () => {
  let window: Window
  let document: Document

  beforeEach(() => {
    window = new Window()
    document = window.document
    global.document = document as any
    global.window = window as any
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  function createSplitGroup(count: number): HTMLInputElement[] {
    const container = document.createElement('div')
    const inputs: HTMLInputElement[] = []
    for (let i = 0; i < count; i++) {
      const input = document.createElement('input') as HTMLInputElement
      input.type = 'text'
      input.maxLength = 1
      input.id = `otp-${i}`
      vi.spyOn(input, 'getBoundingClientRect').mockReturnValue({
        width: 40, height: 30, top: 100, left: 50 + i * 50,
        bottom: 130, right: 90 + i * 50, x: 50 + i * 50, y: 100,
        toJSON: () => ({})
      } as DOMRect)
      container.appendChild(input)
      inputs.push(input)
    }
    document.body.appendChild(container)
    return inputs
  }

  it('should return false when code is LONGER than fillable inputs (truncation bug)', async () => {
    const inputs = createSplitGroup(4)
    vi.mocked(detectSplitInputGroup).mockReturnValue({
      inputs,
      representative: inputs[0],
      pattern: 'maxlength-1',
    })

    const result = await autofillCode({ code: '123456', field: inputs[0] })

    expect(result).toBe(false)
  })

  it('should return true when code length matches fillable inputs exactly', async () => {
    const inputs = createSplitGroup(6)
    vi.mocked(detectSplitInputGroup).mockReturnValue({
      inputs,
      representative: inputs[0],
      pattern: 'maxlength-1',
    })

    const result = await autofillCode({ code: '123456', field: inputs[0] })

    expect(result).toBe(true)
  })

  it('should return false when code is shorter than fillable inputs', async () => {
    const inputs = createSplitGroup(6)
    vi.mocked(detectSplitInputGroup).mockReturnValue({
      inputs,
      representative: inputs[0],
      pattern: 'maxlength-1',
    })

    const result = await autofillCode({ code: '1234', field: inputs[0] })

    expect(result).toBe(false)
  })

  it('should skip readOnly inputs and match against fillable count only', async () => {
    const inputs = createSplitGroup(6)
    // Make last input readOnly (not the entry field)
    inputs[5].readOnly = true
    vi.mocked(detectSplitInputGroup).mockReturnValue({
      inputs,
      representative: inputs[0],
      pattern: 'maxlength-1',
    })

    // 5 fillable inputs, 5-char code = exact match
    const result = await autofillCode({ code: '12345', field: inputs[0] })

    expect(result).toBe(true)
  })

  it('should skip disabled inputs and match against fillable count only', async () => {
    const inputs = createSplitGroup(6)
    inputs[2].disabled = true
    vi.mocked(detectSplitInputGroup).mockReturnValue({
      inputs,
      representative: inputs[0],
      pattern: 'maxlength-1',
    })

    // 5 fillable inputs, 5-char code = exact match
    const result = await autofillCode({ code: '12345', field: inputs[0] })

    expect(result).toBe(true)
  })

  it('should reject when code matches total inputs but not fillable count', async () => {
    const inputs = createSplitGroup(6)
    // Make non-entry inputs readOnly/disabled
    inputs[2].readOnly = true
    inputs[4].disabled = true
    vi.mocked(detectSplitInputGroup).mockReturnValue({
      inputs,
      representative: inputs[0],
      pattern: 'maxlength-1',
    })

    // 4 fillable inputs, but sending 6 chars (matches total, not fillable)
    const result = await autofillCode({ code: '123456', field: inputs[0] })

    expect(result).toBe(false)
  })
})

describe('deriveExpectedShape (real function)', () => {
  let window: Window
  let document: Document

  beforeEach(() => {
    window = new Window()
    document = window.document
    global.document = document as any
    global.window = window as any
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function createField(attrs: Record<string, string | number>): HTMLInputElement {
    const input = document.createElement('input') as HTMLInputElement
    input.type = 'text'
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'maxLength') {
        input.maxLength = value as number
      } else if (key === 'inputMode') {
        input.setAttribute('inputmode', value as string)
      } else {
        input.setAttribute(key, String(value))
      }
    }
    document.body.appendChild(input)
    return input
  }

  function createSplitGroup(count: number, maxLength: number = 1): HTMLInputElement[] {
    const container = document.createElement('div')
    const inputs: HTMLInputElement[] = []
    for (let i = 0; i < count; i++) {
      const input = document.createElement('input') as HTMLInputElement
      input.type = 'text'
      input.maxLength = maxLength
      input.id = `split-${i}`
      container.appendChild(input)
      inputs.push(input)
    }
    document.body.appendChild(container)
    return inputs
  }

  it('should use groupSize for maxLength=1 split group (e.g., 6 inputs -> length 6)', () => {
    const inputs = createSplitGroup(6, 1)
    vi.mocked(detectSplitInputGroup).mockReturnValue({
      inputs,
      representative: inputs[0],
      pattern: 'maxlength-1',
    })

    const shape = deriveExpectedShape(inputs[0])
    expect(shape.length).toBe(6)
  })

  it('should use maxLength directly for maxLength=2 split group (autofill only supports 1-char-per-box)', () => {
    const inputs = createSplitGroup(4, 2)
    vi.mocked(detectSplitInputGroup).mockReturnValue({
      inputs,
      representative: inputs[0],
      pattern: 'maxlength-1',
    })

    // maxLength=2 is NOT multiplied because autofill writes 1 char per box
    const shape = deriveExpectedShape(inputs[0])
    expect(shape.length).toBe(2)
  })

  it('should use maxLength directly for maxLength=3 split group', () => {
    const inputs = createSplitGroup(4, 3)
    vi.mocked(detectSplitInputGroup).mockReturnValue({
      inputs,
      representative: inputs[0],
      pattern: 'maxlength-1',
    })

    const shape = deriveExpectedShape(inputs[0])
    expect(shape.length).toBe(3)
  })

  it('should use groupSize for unset maxLength split group (e.g., Microsoft)', () => {
    const inputs = createSplitGroup(6)
    // Simulate unset maxLength (browser default is -1)
    inputs.forEach(input => { input.removeAttribute('maxlength') })
    vi.mocked(detectSplitInputGroup).mockReturnValue({
      inputs,
      representative: inputs[0],
      pattern: 'sequential-name',
    })

    const shape = deriveExpectedShape(inputs[0])
    expect(shape.length).toBe(6)
  })

  it('should use maxLength directly for single field (no group)', () => {
    const field = createField({ maxLength: 6 })
    vi.mocked(detectSplitInputGroup).mockReturnValue(null)

    const shape = deriveExpectedShape(field)
    expect(shape.length).toBe(6)
  })

  it('should detect numeric charset from type=tel', () => {
    const field = createField({ maxLength: 6, type: 'tel' })
    vi.mocked(detectSplitInputGroup).mockReturnValue(null)

    const shape = deriveExpectedShape(field)
    expect(shape.charset).toBe('digits')
  })

  it('should default to alnum charset', () => {
    const field = createField({ maxLength: 6 })
    vi.mocked(detectSplitInputGroup).mockReturnValue(null)

    const shape = deriveExpectedShape(field)
    expect(shape.charset).toBe('alnum')
  })
})
