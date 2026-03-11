import { describe, it, expect, beforeEach } from 'vitest'
import { Window } from 'happy-dom'
import { detectVerificationField, resetCooldownRegistry } from '../../src/lib/detection/field-detector'

describe('False Positive Regression Tests', () => {
  let window: Window
  let document: Document

  beforeEach(() => {
    window = new Window()
    document = window.document
    global.document = document as any
    global.window = window as any
    global.performance = window.performance as any
    resetCooldownRegistry()
  })

  describe('Example 1 & 2: Developer token name fields', () => {
    it('should NOT detect Railway tokenName field', () => {
      document.body.innerHTML = `
        <form>
          <label for="tokenName">Token Name</label>
          <input type="text" id="tokenName" name="tokenName" placeholder="My API Token">
        </form>
      `
      const result = detectVerificationField({ strictVisibility: false })
      expect(result).toBeNull()
    })

    it('should NOT detect Supabase tokenName field', () => {
      document.body.innerHTML = `
        <form>
          <label for="tokenName">Name</label>
          <input type="text" id="tokenName" name="tokenName"
                 placeholder="Provide a name for your token">
        </form>
      `
      const result = detectVerificationField({ strictVisibility: false })
      expect(result).toBeNull()
    })

    it('should NOT detect generic token management field', () => {
      document.body.innerHTML = `
        <div>
          <h2>Personal Access Tokens</h2>
          <label for="token_description">Token Description</label>
          <input type="text" id="token_description" name="token_description">
        </div>
      `
      const result = detectVerificationField({ strictVisibility: false })
      expect(result).toBeNull()
    })
  })

  describe('Example 3: Authenticator app with autocomplete="one-time-code"', () => {
    it('should NOT detect authenticator-only field even with autocomplete', () => {
      document.body.innerHTML = `
        <div>
          <p>Enter the code from your authenticator app</p>
          <input type="text" autocomplete="one-time-code" name="code">
        </div>
      `
      const result = detectVerificationField({ strictVisibility: false })
      expect(result).toBeNull()
    })

    it('should STILL detect email+authenticator hybrid with autocomplete', () => {
      document.body.innerHTML = `
        <div>
          <p>Enter the code from your email or authenticator app</p>
          <input type="text" autocomplete="one-time-code" name="code">
        </div>
      `
      const result = detectVerificationField({ strictVisibility: false })
      expect(result).not.toBeNull()
    })
  })

  describe('Positive recall: real OTP fields still detected', () => {
    it('should detect autocomplete="one-time-code"', () => {
      document.body.innerHTML = `
        <input type="text" autocomplete="one-time-code">
      `
      const result = detectVerificationField({ strictVisibility: false })
      expect(result).not.toBeNull()
      expect(result!.confidence).toBeGreaterThanOrEqual(95)
    })

    it('should detect name="otp"', () => {
      document.body.innerHTML = `
        <input type="text" name="otp">
      `
      const result = detectVerificationField({ strictVisibility: false })
      expect(result).not.toBeNull()
    })

    it('should detect name="verificationCode"', () => {
      document.body.innerHTML = `
        <input type="text" name="verificationCode">
      `
      const result = detectVerificationField({ strictVisibility: false })
      expect(result).not.toBeNull()
    })
  })
})
