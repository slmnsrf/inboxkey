/**
 * Unit tests for Tier 1 fast-path detection with 5-layer defense
 *
 * Coverage:
 * - Layer 1: Cooldown integration
 * - Layer 2: Password type rejection (CRITICAL: Hepsiburada fix)
 * - Layer 3: URL pattern validation (GitHub/Steam setup page rejection)
 * - Layer 4: Autocomplete + Attribute pattern matching
 * - Layer 5: Context validation (Turkish "şifre" rejection)
 * - Performance: <0.15ms target
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { detectTier1 } from '../tier1-fast'
import { createCooldownRegistry } from '../cooldown-registry'
import type { CooldownRegistry } from '../cooldown-registry'

/**
 * Helper: Create mock input element with attributes
 */
function createInput(attrs: Record<string, string | number> = {}): HTMLInputElement {
  const input = document.createElement('input')

  // Set type first (default to text)
  input.type = (attrs.type as string) || 'text'

  // Set other attributes
  Object.entries(attrs).forEach(([key, value]) => {
    if (key === 'type') return // Already set
    if (key === 'maxLength') {
      input.maxLength = value as number
    } else if (key === 'dataset') {
      Object.assign(input.dataset, value)
    } else {
      input.setAttribute(key, String(value))
    }
  })

  return input
}

/**
 * Helper: Create labeled input
 */
function createLabeledInput(
  labelText: string,
  inputAttrs: Record<string, string | number> = {}
): { input: HTMLInputElement; label: HTMLLabelElement } {
  const input = createInput({ id: 'test-input', ...inputAttrs })
  const label = document.createElement('label')
  label.htmlFor = 'test-input'
  label.textContent = labelText

  document.body.appendChild(label)
  document.body.appendChild(input)

  return { input, label }
}

/**
 * Helper: Cleanup DOM
 */
function cleanup() {
  document.body.innerHTML = ''
}

describe('Tier 1 Fast Detection', () => {
  let cooldown: CooldownRegistry

  beforeEach(() => {
    cooldown = createCooldownRegistry()
    cleanup()
  })

  // ═══════════════════════════════════════════════════════════════
  // Layer 1: Cooldown Integration
  // ═══════════════════════════════════════════════════════════════

  describe('Layer 1: Cooldown Check', () => {
    it('should skip fields in cooldown (rejected)', () => {
      const input = createInput({ name: 'otp-code' })

      // Mark as rejected
      cooldown.markRejected(input)

      const result = detectTier1(input, cooldown)

      expect(result.detected).toBe(false)
      expect(result.reason).toBe('Field in cooldown period')
      expect(result.metadata?.layer).toBe('cooldown')
    })

    it('should skip fields in cooldown (detected)', () => {
      const input = createInput({ autocomplete: 'one-time-code' })

      // Mark as detected
      cooldown.markDetected(input)

      const result = detectTier1(input, cooldown)

      expect(result.detected).toBe(false)
      expect(result.reason).toBe('Field in cooldown period')
      expect(result.metadata?.layer).toBe('cooldown')
    })

    it('should process fields after cooldown expires', () => {
      const input = createInput({ autocomplete: 'one-time-code' })

      // Mock Date.now to simulate time passing
      const originalNow = Date.now
      let currentTime = Date.now()
      vi.spyOn(Date, 'now').mockImplementation(() => currentTime)

      // Mark as detected (30s cooldown)
      cooldown.markDetected(input)

      // Advance time by 31 seconds
      currentTime += 31_000

      const result = detectTier1(input, cooldown)

      expect(result.detected).toBe(true)
      expect(result.confidence).toBe(1.0)

      // Restore original Date.now
      Date.now = originalNow
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // Layer 2: Password Attribute Cross-Validation (CRITICAL)
  // ═══════════════════════════════════════════════════════════════

  describe('Layer 2: Password Field Rejection (Hepsiburada fix)', () => {
    it('should reject type=password even with autocomplete=one-time-code', () => {
      const input = createInput({
        type: 'password',
        autocomplete: 'one-time-code',
        name: 'pin',
      })

      const result = detectTier1(input, cooldown)

      expect(result.detected).toBe(false)
      expect(result.reason).toBe('Password field detected (type=password)')
      expect(result.metadata?.layer).toBe('attribute')
      expect(result.confidence).toBe(0)
    })

    it('should reject type=password with exact name match', () => {
      const input = createInput({
        type: 'password',
        name: 'otp',
      })

      const result = detectTier1(input, cooldown)

      expect(result.detected).toBe(false)
      expect(result.reason).toBe('Password field detected (type=password)')
    })

    it('should reject type=password with inputmode=numeric', () => {
      const input = createInput({
        type: 'password',
        inputmode: 'numeric',
        maxLength: 6,
      })

      const result = detectTier1(input, cooldown)

      expect(result.detected).toBe(false)
      expect(result.reason).toBe('Password field detected (type=password)')
    })

    it('should mark password fields in cooldown', () => {
      const input = createInput({
        type: 'password',
        autocomplete: 'one-time-code',
      })

      detectTier1(input, cooldown)

      // Verify cooldown was set
      expect(cooldown.isInCooldown(input)).toBe(true)
    })

    it('should reject Hepsipay password field (custom attribute comefrom)', () => {
      // Real-world Hepsipay.com password field structure
      const input = createInput({
        type: 'tel',
        inputmode: 'numeric',
        autocomplete: 'one-time-code',
        maxLength: 6,
        id: 'hpOtpInputIdtjqfum4c5',
        comefrom: 'HpAuthSetPassword', // SMOKING GUN: Custom attribute
      })

      const result = detectTier1(input, cooldown)

      expect(result.detected).toBe(false)
      expect(result.reason).toContain('Password-related custom attribute')
      expect(result.reason).toContain('comefrom')
      expect(result.metadata?.layer).toBe('attribute')
      expect(result.confidence).toBe(0)
    })

    it('should reject custom attribute with multilingual password keywords', () => {
      // Test various language password keywords in custom attributes
      const testCases = [
        { attr: 'data-field', value: 'senha', lang: 'Portuguese' }, // senha
        { attr: 'field-type', value: 'contraseña', lang: 'Spanish' }, // contraseña
        { attr: 'data-input', value: 'パスワード', lang: 'Japanese' }, // password
        { attr: 'x-type', value: 'şifre', lang: 'Turkish' }, // şifre
        { attr: 'data-alan', value: 'parola', lang: 'Turkish' }, // parola
        { attr: 'campo', value: 'password', lang: 'English' }, // password
      ]

      testCases.forEach(({ attr, value, lang }) => {
        // Create fresh cooldown for each test case to avoid interference
        const freshCooldown = createCooldownRegistry()
        const input = createInput({
          type: 'tel',
          autocomplete: 'one-time-code',
          [attr]: value,
        })

        const result = detectTier1(input, freshCooldown)

        expect(result.detected).toBe(false)
        expect(result.reason).toContain('Password-related custom attribute')
        expect(result.metadata?.layer).toBe('attribute')
      })
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // Layer 3: URL Pattern Validation
  // ═══════════════════════════════════════════════════════════════

  describe('Layer 3: URL Pattern Validation (Setup Page Rejection)', () => {
    const originalLocation = window.location

    beforeEach(() => {
      // Mock window.location
      delete (window as any).location
      ;(window as any).location = { href: 'https://example.com/login' }
    })

    afterEach(() => {
      // Restore original location
      ;(window as any).location = originalLocation
    })

    it('should reject GitHub 2FA setup page', () => {
      ;(window as any).location.href =
        'https://github.com/settings/two_factor_authentication/setup/intro'
      const input = createInput({ autocomplete: 'one-time-code' })

      const result = detectTier1(input, cooldown)

      expect(result.detected).toBe(false)
      expect(result.reason).toBe('Setup/configuration page detected (URL pattern)')
      expect(result.metadata?.layer).toBe('url-pattern')
      expect(result.metadata?.url).toBe(
        'https://github.com/settings/two_factor_authentication/setup/intro'
      )
    })

    it('should reject Steam Guard setup page', () => {
      ;(window as any).location.href = 'https://store.steampowered.com/twofactor/setup'
      const input = createInput({ name: 'authcode' })

      const result = detectTier1(input, cooldown)

      expect(result.detected).toBe(false)
      expect(result.reason).toBe('Setup/configuration page detected (URL pattern)')
      expect(result.metadata?.layer).toBe('url-pattern')
    })

    it('should allow login pages with "setup" in domain', () => {
      ;(window as any).location.href = 'https://setup-example.com/login'
      const input = createInput({ autocomplete: 'one-time-code' })

      const result = detectTier1(input, cooldown)

      // Should pass through URL validation and detect normally
      expect(result.detected).toBe(true)
      expect(result.confidence).toBe(1.0)
    })

    it('should allow verify pages (allowlist)', () => {
      ;(window as any).location.href = 'https://example.com/auth/2fa/verify'
      const input = createInput({ autocomplete: 'one-time-code' })

      const result = detectTier1(input, cooldown)

      // Should pass through URL validation and detect normally
      expect(result.detected).toBe(true)
      expect(result.confidence).toBe(1.0)
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // Layer 4: Autocomplete + Attribute Pattern Matching
  // ═══════════════════════════════════════════════════════════════

  describe('Layer 4: Autocomplete Detection', () => {
    it('should detect autocomplete=one-time-code (100% confidence)', () => {
      const input = createInput({ autocomplete: 'one-time-code' })

      const result = detectTier1(input, cooldown)

      expect(result.detected).toBe(true)
      expect(result.confidence).toBe(1.0)
      expect(result.reason).toBe('autocomplete="one-time-code"')
      expect(result.metadata?.layer).toBe('autocomplete')
      expect(result.metadata?.matchedAttribute).toBe('autocomplete')
    })

    it('should detect autocomplete=one-time-password', () => {
      const input = createInput({ autocomplete: 'one-time-password' })

      const result = detectTier1(input, cooldown)

      expect(result.detected).toBe(true)
      expect(result.confidence).toBe(1.0)
      expect(result.reason).toBe('autocomplete="one-time-password"')
    })

    it('should detect autocomplete=otp', () => {
      const input = createInput({ autocomplete: 'otp' })

      const result = detectTier1(input, cooldown)

      expect(result.detected).toBe(true)
      expect(result.confidence).toBe(1.0)
    })

    it('should be case-insensitive for autocomplete', () => {
      const input = createInput({ autocomplete: 'ONE-TIME-CODE' })

      const result = detectTier1(input, cooldown)

      expect(result.detected).toBe(true)
      expect(result.confidence).toBe(1.0)
    })
  })

  describe('Layer 4: Name/ID Exact Match', () => {
    const exactMatches = ['code', 'otp', 'token', 'pin', 'mfa', '2fa', 'twofa', 'verify', 'verification']

    exactMatches.forEach((pattern) => {
      it(`should detect name="${pattern}" (95% confidence)`, () => {
        const input = createInput({ name: pattern })

        const result = detectTier1(input, cooldown)

        expect(result.detected).toBe(true)
        expect(result.confidence).toBe(0.95)
        expect(result.reason).toContain('exact match')
        expect(result.metadata?.matchedAttribute).toBe('name')
      })

      it(`should detect id="${pattern}" (95% confidence)`, () => {
        const input = createInput({ id: pattern })

        const result = detectTier1(input, cooldown)

        expect(result.detected).toBe(true)
        expect(result.confidence).toBe(0.95)
        expect(result.metadata?.matchedAttribute).toBe('id')
      })
    })

    it('should be case-insensitive for name/id', () => {
      const input = createInput({ name: 'OTP' })

      const result = detectTier1(input, cooldown)

      expect(result.detected).toBe(true)
      expect(result.confidence).toBe(0.95)
    })
  })

  describe('Layer 4: Name/ID Contains Match', () => {
    const containsPatterns = [
      'otp-input',
      'verification-code',
      'sms-token',
      'auth-pin',
      'mfa-field',
    ]

    containsPatterns.forEach((pattern) => {
      it(`should detect name="${pattern}" (90% confidence)`, () => {
        const input = createInput({ name: pattern })

        const result = detectTier1(input, cooldown)

        expect(result.detected).toBe(true)
        expect(result.confidence).toBe(0.9)
        expect(result.reason).toContain('contains match')
      })
    })
  })

  describe('Layer 4: Inputmode + Maxlength Combination', () => {
    const numericModes = ['numeric', 'tel', 'decimal']
    const validLengths = [4, 5, 6, 7, 8]

    numericModes.forEach((mode) => {
      validLengths.forEach((length) => {
        it(`should detect inputmode="${mode}" + maxlength=${length} (85% confidence)`, () => {
          const input = createInput({ inputmode: mode, maxLength: length })

          const result = detectTier1(input, cooldown)

          expect(result.detected).toBe(true)
          expect(result.confidence).toBe(0.85)
          expect(result.reason).toContain(`inputmode="${mode}"`)
          expect(result.reason).toContain(`maxlength=${length}`)
        })
      })
    })

    it('should reject maxlength < 4', () => {
      const input = createInput({ inputmode: 'numeric', maxLength: 3 })

      const result = detectTier1(input, cooldown)

      expect(result.detected).toBe(false)
    })

    it('should reject maxlength > 8', () => {
      const input = createInput({ inputmode: 'numeric', maxLength: 10 })

      const result = detectTier1(input, cooldown)

      expect(result.detected).toBe(false)
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // Layer 5: Context Validation (Multilingual)
  // ═══════════════════════════════════════════════════════════════

  describe('Layer 5: Context Validation - English', () => {
    it('should reject field with "password" label', () => {
      const { input } = createLabeledInput('Password', {
        autocomplete: 'one-time-code',
      })

      const result = detectTier1(input, cooldown)

      expect(result.detected).toBe(false)
      expect(result.reason).toContain('Context validation failed')
      expect(result.reason).toContain('password')
      expect(result.metadata?.layer).toBe('context')
    })

    it('should reject field with "sign in" label', () => {
      const { input } = createLabeledInput('Sign In', { name: 'otp' })

      const result = detectTier1(input, cooldown)

      expect(result.detected).toBe(false)
      expect(result.reason).toContain('sign in')
    })

    it('should reject field with "log in" nearby text', () => {
      const input = createInput({ autocomplete: 'one-time-code', id: 'code' })
      const container = document.createElement('div')
      const nearbyText = document.createElement('p')
      nearbyText.textContent = 'Log In to Your Account'

      container.appendChild(nearbyText)
      container.appendChild(input)
      document.body.appendChild(container)

      const result = detectTier1(input, cooldown)

      expect(result.detected).toBe(false)
      expect(result.reason).toContain('Context validation failed')
    })
  })

  describe('Layer 5: Context Validation - Turkish (Hepsiburada)', () => {
    it('should reject Turkish password field (şifre)', () => {
      const { input } = createLabeledInput('Şifre', {
        autocomplete: 'one-time-code',
        name: 'otpcode', // Use non-excluded name to test context validation
      })

      const result = detectTier1(input, cooldown)

      expect(result.detected).toBe(false)
      expect(result.reason).toContain('Context validation failed')
      expect(result.reason).toContain('şifre')
      expect(result.metadata?.layer).toBe('context')
    })

    it('should reject Turkish password field (parola)', () => {
      const { input } = createLabeledInput('Parola', { name: 'otp' })

      const result = detectTier1(input, cooldown)

      expect(result.detected).toBe(false)
      expect(result.reason).toContain('parola')
    })

    it('should reject Turkish login field (giriş yap)', () => {
      const { input } = createLabeledInput('Giriş Yap', { name: 'code' })

      const result = detectTier1(input, cooldown)

      expect(result.detected).toBe(false)
      expect(result.reason).toContain('giriş yap')
    })

    it('should handle mixed case Turkish text', () => {
      const { input } = createLabeledInput('ŞİFRE GİRİŞİ', { name: 'otp' })

      const result = detectTier1(input, cooldown)

      expect(result.detected).toBe(false)
      expect(result.reason).toContain('Context validation failed')
    })
  })

  describe('Layer 5: Context Validation - Other Languages', () => {
    const testCases = [
      { lang: 'Spanish', label: 'Contraseña', keyword: 'contraseña' },
      { lang: 'Portuguese', label: 'Senha', keyword: 'senha' },
      { lang: 'German', label: 'Passwort', keyword: 'passwort' },
      { lang: 'French', label: 'Mot de passe', keyword: 'mot de passe' },
    ]

    testCases.forEach(({ lang, label, keyword }) => {
      it(`should reject ${lang} password field (${keyword})`, () => {
        const { input } = createLabeledInput(label, { autocomplete: 'one-time-code' })

        const result = detectTier1(input, cooldown)

        expect(result.detected).toBe(false)
        expect(result.reason).toContain('Context validation failed')
      })
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // Exclusion Patterns
  // ═══════════════════════════════════════════════════════════════

  describe('Exclusion Patterns', () => {
    it('should reject zip code fields', () => {
      const input = createInput({ name: 'zipcode', maxLength: 5 })

      const result = detectTier1(input, cooldown)

      expect(result.detected).toBe(false)
      expect(result.reason).toBe('Zip/postal code detected')
    })

    it('should reject zip code fields with hyphen separator', () => {
      const input = createInput({ name: 'zip-code', maxLength: 10 })

      const result = detectTier1(input, cooldown)

      expect(result.detected).toBe(false)
      expect(result.reason).toContain('Excluded pattern')
      expect(result.reason).toContain('zip-code')
    })

    it('should reject zip code fields with underscore separator (Salesforce)', () => {
      const input = createInput({ name: 'Zip_Code__c', maxLength: 18 })

      const result = detectTier1(input, cooldown)

      expect(result.detected).toBe(false)
      expect(result.reason).toContain('Excluded pattern')
      expect(result.reason).toContain('zip_code__c')
    })

    it('should reject zip code fields with space separator', () => {
      const input = createInput({ name: 'zip code', maxLength: 10 })

      const result = detectTier1(input, cooldown)

      expect(result.detected).toBe(false)
      expect(result.reason).toContain('Excluded pattern')
    })

    it('should reject postal code fields', () => {
      const input = createInput({ name: 'postalcode', maxLength: 5 })

      const result = detectTier1(input, cooldown)

      expect(result.detected).toBe(false)
      expect(result.reason).toBe('Zip/postal code detected')
    })

    it('should reject user_name fields with underscore separator', () => {
      const input = createInput({ name: 'user_name' })

      const result = detectTier1(input, cooldown)

      expect(result.detected).toBe(false)
      expect(result.reason).toContain('Excluded pattern')
      expect(result.reason).toContain('user_name')
    })

    it('should reject first_name fields with underscore separator', () => {
      const input = createInput({ name: 'first_name' })

      const result = detectTier1(input, cooldown)

      expect(result.detected).toBe(false)
      expect(result.reason).toContain('Excluded pattern')
      expect(result.reason).toContain('first_name')
    })

    it('should reject last_name fields with underscore separator', () => {
      const input = createInput({ name: 'last_name' })

      const result = detectTier1(input, cooldown)

      expect(result.detected).toBe(false)
      expect(result.reason).toContain('Excluded pattern')
      expect(result.reason).toContain('last_name')
    })

    it('should reject full_name fields with underscore separator', () => {
      const input = createInput({ name: 'full_name' })

      const result = detectTier1(input, cooldown)

      expect(result.detected).toBe(false)
      expect(result.reason).toContain('Excluded pattern')
      expect(result.reason).toContain('full_name')
    })

    it('should reject e_mail fields with underscore separator', () => {
      const input = createInput({ name: 'e_mail' })

      const result = detectTier1(input, cooldown)

      expect(result.detected).toBe(false)
      expect(result.reason).toContain('Excluded pattern')
      expect(result.reason).toContain('e_mail')
    })

    it('should reject excluded patterns (CVV)', () => {
      const input = createInput({ name: 'cvv' })

      const result = detectTier1(input, cooldown)

      expect(result.detected).toBe(false)
      expect(result.reason).toContain('Excluded pattern')
    })

    it('should reject email fields', () => {
      const input = createInput({ name: 'email' })

      const result = detectTier1(input, cooldown)

      expect(result.detected).toBe(false)
    })

    // E-Commerce Exclusions
    it('should reject discount_code fields', () => {
      const input = createInput({ name: 'discount_code', maxlength: 10 })
      const result = detectTier1(input, cooldown)
      expect(result.detected).toBe(false)
      expect(result.reason).toContain('Excluded pattern')
    })

    it('should reject promo_code and promotional_code fields', () => {
      const input1 = createInput({ name: 'promo_code' })
      const result1 = detectTier1(input1, cooldown)
      expect(result1.detected).toBe(false)

      const input2 = createInput({ name: 'promotional_code' })
      const result2 = detectTier1(input2, cooldown)
      expect(result2.detected).toBe(false)
    })

    it('should reject coupon_code fields', () => {
      const input = createInput({ name: 'coupon_code', maxlength: 12 })
      const result = detectTier1(input, cooldown)
      expect(result.detected).toBe(false)
      expect(result.reason).toContain('Excluded pattern')
    })

    it('should reject voucher_code fields', () => {
      const input = createInput({ name: 'voucher_code' })
      const result = detectTier1(input, cooldown)
      expect(result.detected).toBe(false)
    })

    // API Exclusions
    it('should reject api_key and api_secret fields', () => {
      const input1 = createInput({ name: 'api_key', type: 'password' })
      const result1 = detectTier1(input1, cooldown)
      expect(result1.detected).toBe(false)

      const input2 = createInput({ name: 'api_secret', type: 'password' })
      const result2 = detectTier1(input2, cooldown)
      expect(result2.detected).toBe(false)
    })

    it('should reject access_token fields', () => {
      const input = createInput({ name: 'access_token', type: 'text' })
      const result = detectTier1(input, cooldown)
      expect(result.detected).toBe(false)
      expect(result.reason).toContain('Excluded pattern')
    })

    it('should reject refresh_token fields', () => {
      const input = createInput({ name: 'refresh_token', type: 'password' })
      const result = detectTier1(input, cooldown)
      expect(result.detected).toBe(false)
    })

    // Referral Exclusions
    it('should reject referral_code and referral_link fields', () => {
      const input1 = createInput({ name: 'referral_code', maxlength: 8 })
      const result1 = detectTier1(input1, cooldown)
      expect(result1.detected).toBe(false)

      const input2 = createInput({ name: 'referral_link' })
      const result2 = detectTier1(input2, cooldown)
      expect(result2.detected).toBe(false)
    })

    it('should reject affiliate_code fields', () => {
      const input = createInput({ name: 'affiliate_code' })
      const result = detectTier1(input, cooldown)
      expect(result.detected).toBe(false)
      expect(result.reason).toContain('Excluded pattern')
    })

    it('should reject invite_code and invitation_code fields', () => {
      const input1 = createInput({ name: 'invite_code', maxlength: 8 })
      const result1 = detectTier1(input1, cooldown)
      expect(result1.detected).toBe(false)

      const input2 = createInput({ name: 'invitation_code' })
      const result2 = detectTier1(input2, cooldown)
      expect(result2.detected).toBe(false)
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // Edge Cases
  // ═══════════════════════════════════════════════════════════════

  describe('Edge Cases', () => {
    it('should handle empty attributes', () => {
      const input = createInput({})

      const result = detectTier1(input, cooldown)

      expect(result.detected).toBe(false)
      expect(result.reason).toBe('No tier1 patterns matched')
    })

    it('should handle null/undefined placeholder', () => {
      const input = createInput({ autocomplete: 'one-time-code' })
      input.removeAttribute('placeholder')

      const result = detectTier1(input, cooldown)

      expect(result.detected).toBe(true)
    })

    it('should handle fields without labels', () => {
      const input = createInput({ name: 'otp' })

      const result = detectTier1(input, cooldown)

      expect(result.detected).toBe(true)
      expect(result.confidence).toBe(0.95)
    })

    it('should handle maxLength = -1 (no limit)', () => {
      const input = createInput({ inputmode: 'numeric' })
      // maxLength defaults to -1 (no limit)

      const result = detectTier1(input, cooldown)

      expect(result.detected).toBe(false)
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // Performance Benchmarks
  // ═══════════════════════════════════════════════════════════════

  describe('Performance', () => {
    it('should complete autocomplete check in <0.15ms (1000 iterations)', () => {
      const input = createInput({ autocomplete: 'one-time-code' })

      const startTime = performance.now()

      for (let i = 0; i < 1000; i++) {
        detectTier1(input, cooldown)
      }

      const endTime = performance.now()
      const avgTime = (endTime - startTime) / 1000

      expect(avgTime).toBeLessThan(0.15)
    })

    it('should complete name match in <0.15ms (1000 iterations)', () => {
      const input = createInput({ name: 'otp-code' })

      const startTime = performance.now()

      for (let i = 0; i < 1000; i++) {
        // Reset cooldown each iteration
        const freshCooldown = createCooldownRegistry()
        detectTier1(input, freshCooldown)
      }

      const endTime = performance.now()
      const avgTime = (endTime - startTime) / 1000

      expect(avgTime).toBeLessThan(0.15)
    })

    it('should complete context validation in <0.15ms (1000 iterations)', () => {
      const { input } = createLabeledInput('Enter verification code', {
        autocomplete: 'one-time-code',
      })

      const startTime = performance.now()

      for (let i = 0; i < 1000; i++) {
        const freshCooldown = createCooldownRegistry()
        detectTier1(input, freshCooldown)
      }

      const endTime = performance.now()
      const avgTime = (endTime - startTime) / 1000

      expect(avgTime).toBeLessThan(0.15)
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // Integration: All Layers Working Together
  // ═══════════════════════════════════════════════════════════════

  describe('Integration: 4-Layer Defense', () => {
    it('should pass all layers for valid OTP field', () => {
      const { input } = createLabeledInput('Enter verification code', {
        autocomplete: 'one-time-code',
        type: 'text',
      })

      const result = detectTier1(input, cooldown)

      expect(result.detected).toBe(true)
      expect(result.confidence).toBe(1.0)
      expect(result.metadata?.layer).toBe('autocomplete')
    })

    it('should fail Layer 2 (password type) before Layer 3', () => {
      const input = createInput({
        type: 'password',
        autocomplete: 'one-time-code',
        name: 'otp',
      })

      const result = detectTier1(input, cooldown)

      expect(result.detected).toBe(false)
      expect(result.metadata?.layer).toBe('attribute') // Layer 2
    })

    it('should fail Layer 4 (context) after Layer 3 match', () => {
      const { input } = createLabeledInput('Password', {
        autocomplete: 'one-time-code',
        type: 'text',
      })

      const result = detectTier1(input, cooldown)

      expect(result.detected).toBe(false)
      expect(result.metadata?.layer).toBe('context') // Layer 4
    })

    it('should mark rejected fields in cooldown', () => {
      const input = createInput({ type: 'password', name: 'otp' })

      detectTier1(input, cooldown)

      expect(cooldown.isInCooldown(input)).toBe(true)
    })

    it('should mark detected fields in cooldown', () => {
      const input = createInput({ autocomplete: 'one-time-code' })

      detectTier1(input, cooldown)

      expect(cooldown.isInCooldown(input)).toBe(true)
    })
  })
})
