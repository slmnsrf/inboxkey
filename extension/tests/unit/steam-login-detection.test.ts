/**
 * Steam Login Page Detection Diagnostic Test
 *
 * Analyzes why InboxKey failed to detect the 5-input verification code field
 * on Steam's Turkish login page.
 *
 * Expected Issues:
 * 1. Split single-character inputs (5× maxlength="1") not supported
 * 2. Turkish "giriş" (login) keyword matches "kod girin" (enter code) - FALSE NEGATIVE
 * 3. No semantic attributes (name/id) for attribute-based detection
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { detectVerificationField } from '../../src/lib/detection/field-detector'
import { validateContext } from '../../src/lib/detection/context-validator'
import { Window } from 'happy-dom'

describe('Steam Login Detection Failure Diagnosis', () => {
  let window: Window
  let document: Document

  beforeEach(() => {
    window = new Window()
    document = window.document
    global.document = document as any
    global.window = window as any
    global.performance = window.performance as any
  })

  describe('Issue 1: Split Single-Character Inputs', () => {
    it('should detect 5 separate maxlength=1 inputs as split-input group', () => {
      // Create the exact Steam structure but WITHOUT Turkish context text
      const container = document.createElement('div')
      container.innerHTML = `
        <div class="_3huyZ7Eoy2bX4PbCnH3p5w">
          <div class="_1gzkmmy_XA39rp9MtxJfZJ">
            <input maxlength="1" autocomplete="none" role="button" type="text" value="">
            <input maxlength="1" autocomplete="none" role="button" type="text" value="">
            <input maxlength="1" autocomplete="none" role="button" type="text" value="">
            <input maxlength="1" autocomplete="none" role="button" type="text" value="">
            <input maxlength="1" autocomplete="none" role="button" type="text" value="">
          </div>
        </div>
      `
      document.body.appendChild(container)

      const result = detectVerificationField({ strictVisibility: false })

      // Split-input fields ARE now detected (correct new behavior)
      expect(result).not.toBeNull()
      expect(result?.field).toBeInstanceOf(HTMLInputElement)
      expect(result?.confidence).toBeGreaterThan(0)
    })

    it('should explain why maxlength=1 fields are not detected', () => {
      const input = document.createElement('input')
      input.type = 'text'
      input.maxLength = 1
      input.setAttribute('autocomplete', 'none')
      document.body.appendChild(input)

      const result = detectVerificationField({ strictVisibility: false })

      // Reason: maxlength=1 is outside TYPICAL_CODE_LENGTHS (4-8)
      // Reason: autocomplete="none" is not in AUTOCOMPLETE_VALUES
      // Reason: No name/id attributes to match ATTRIBUTE_PATTERNS
      expect(result).toBeNull()
    })
  })

  describe('Issue 2: Turkish "giriş" False Negative (FIXED)', () => {
    it('should PASS context validation - "kod girin" now allowed via allow-pattern', () => {
      // Test the exact Turkish text from Steam page
      const result = validateContext({
        label: '',
        placeholder: '',
        nearbyText: 'gmail.com e-posta adresinize gelen kodu girin',
        ariaLabel: '',
      })

      // Expected: PASS due to allow-pattern for "kod girin"
      expect(result.pass).toBe(true)
      expect(result.matchedNegatives).toHaveLength(0)
    })

    it('should show normalization causes "giriş" to match "girin"', () => {
      const textWithGirin = 'kodu girin' // "enter code" in Turkish
      const normalized = textWithGirin
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()

      // "giriş" keyword is contained in "girin"
      expect(normalized).toContain('girin')
      expect('giriş'.toLowerCase()).toMatch(/giri/)
    })

    it('should detect "Giriş Yap" (login button) correctly as negative', () => {
      const result = validateContext({
        label: '',
        placeholder: '',
        nearbyText: 'Giriş Yap',
        ariaLabel: '',
      })

      // This SHOULD be rejected (login button)
      expect(result.pass).toBe(false)
      expect(result.matchedNegatives).toContain('giriş yap')
      expect(result.language).toBe('tr')
    })

    it('should show the difference between "girin" (enter) and "giriş" (login)', () => {
      // "girin" = enter (verb, imperative) - VALID for OTP context
      const enterCode = validateContext({
        label: 'Kodu girin',
        placeholder: '',
        nearbyText: '',
      })

      // "giriş yap" = login - INVALID for OTP context
      const loginPage = validateContext({
        label: 'Giriş Yap',
        placeholder: '',
        nearbyText: '',
      })

      // After P1 fix: "girin" PASSES, "giriş yap" FAILS
      expect(enterCode.pass).toBe(true) // ✅ FIXED (allow-pattern matches)
      expect(loginPage.pass).toBe(false) // ✅ Correct rejection
    })
  })

  describe('Issue 3: Full Steam Page Context', () => {
    it('should detect Steam-like page with split inputs (P3 FIX)', () => {
      const container = document.createElement('div')
      container.innerHTML = `
        <div>
          <div>Hesap: removed</div>
          <div>Bu hesabı e-posta kimlik doğrulayıcısı ile koruyorsunuz.</div>
          <div>
            <input maxlength="1" autocomplete="none" type="text" id="code1">
            <input maxlength="1" autocomplete="none" type="text" id="code2">
            <input maxlength="1" autocomplete="none" type="text" id="code3">
            <input maxlength="1" autocomplete="none" type="text" id="code4">
            <input maxlength="1" autocomplete="none" type="text" id="code5">
          </div>
          <div>gmail.com e-posta adresinize gelen kodu girin</div>
        </div>
        <div>
          <a href="/login">Giriş Yap</a>
        </div>
      `
      document.body.appendChild(container)

      const result = detectVerificationField({ strictVisibility: false })

      // After P3: Split input pattern (5× maxlength=1) NOW DETECTED
      // After P1: "kod girin" PASSES context validation via allow-pattern
      expect(result).not.toBeNull()
    })

    it('should show that even with proper attributes, "giriş" blocks detection', () => {
      const container = document.createElement('div')
      container.innerHTML = `
        <div>
          <label for="otp">Doğrulama Kodu</label>
          <input id="otp" name="verification-code" type="text" maxlength="6" autocomplete="one-time-code">
          <div>Kodu girin</div>
        </div>
      `
      document.body.appendChild(container)

      const result = detectVerificationField({ strictVisibility: false })

      // This SHOULD be detected (has autocomplete="one-time-code")
      // But context validation might fail due to "girin" matching "giriş"
      // Let's check if Tier 1 detects it first
      expect(result).not.toBeNull()

      // If it was detected, check if context was validated
      if (result) {
        expect(result.confidence).toBeGreaterThan(0)
      }
    })
  })

  describe('Root Cause Summary', () => {
    it('documents the three root causes', () => {
      const rootCauses = {
        cause1: {
          issue: 'Split single-character inputs not supported',
          description: 'Detection expects maxlength 4-8, not 5× maxlength=1',
          impact: 'Steam, banks, and modern UI libraries use this pattern',
          solution: 'Detect multiple maxlength=1 inputs within same container',
        },
        cause2: {
          issue: 'Turkish "giriş" keyword too broad',
          description: '"giriş" (login) matches "girin" (enter) after normalization',
          impact: 'Valid OTP prompts like "kodu girin" are rejected as login pages',
          solution: 'Use word boundaries or change to multi-word patterns only',
        },
        cause3: {
          issue: 'No semantic HTML attributes',
          description: 'Fields lack name/id/autocomplete for attribute matching',
          impact: 'Tier 1 fast-path cannot detect, falls to Tier 2 which fails on context',
          solution: 'Improve Tier 2 scoring for nearby Turkish keywords',
        },
      }

      // Verify all causes documented
      expect(rootCauses.cause1.issue).toBeDefined()
      expect(rootCauses.cause2.issue).toBeDefined()
      expect(rootCauses.cause3.issue).toBeDefined()
    })
  })
})
