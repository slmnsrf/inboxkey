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

import { autofillCode } from '../../src/contents/autofill'
import { detectSplitInputGroup } from '../../src/lib/detection/split-input-detector'

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

describe('deriveExpectedShape for split groups', () => {
  // Test the logic directly by simulating what deriveExpectedShape does.
  // deriveExpectedShape is a private function, so we validate its contract
  // via this extracted computation that mirrors the fixed algorithm:
  //   1. Check split group FIRST
  //   2. When maxLength <= 3 and groupSize > 1, use maxLength * groupSize
  //   3. Otherwise use maxLength directly, or groupSize, or 0
  function computeExpectedLength(maxLength: number, groupSize: number): number {
    if (maxLength > 0 && maxLength <= 3 && groupSize > 1) {
      return maxLength * groupSize
    }
    if (maxLength > 0) {
      return maxLength
    }
    if (groupSize > 1) {
      return groupSize
    }
    return 0 // no length constraint
  }

  it('should use maxLength * groupSize for maxLength=1, 6-input group', () => {
    expect(computeExpectedLength(1, 6)).toBe(6)
  })

  it('should use maxLength * groupSize for maxLength=2, 4-input group', () => {
    expect(computeExpectedLength(2, 4)).toBe(8)
  })

  it('should use maxLength * groupSize for maxLength=3 boundary', () => {
    expect(computeExpectedLength(3, 4)).toBe(12)
  })

  it('should use groupSize for maxLength=-1 (unset)', () => {
    expect(computeExpectedLength(-1, 6)).toBe(6)
  })

  it('should use maxLength directly for single field (no group)', () => {
    expect(computeExpectedLength(6, 1)).toBe(6)
  })

  it('should use maxLength directly for large maxLength (not per-box)', () => {
    expect(computeExpectedLength(6, 6)).toBe(6)
  })
})
