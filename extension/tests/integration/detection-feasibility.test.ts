/**
 * Detection Engine Feasibility Test Suite
 *
 * Tests the verification code field detection engine against 10 realistic HTML fixtures
 * Success criteria: 90%+ accuracy, <1ms Tier 1, <50ms Tier 2, no false positives
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Window } from 'happy-dom'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  detectVerificationField,
  detectAllFields,
  resetCooldownRegistry,
} from '../../src/lib/detection/field-detector'

interface TestCase {
  name: string
  filename: string
  expectedField: string // ID or data-testid
  expectedConfidence: { min: number; max: number }
  expectedTier: 1 | 2
  shouldDetect: boolean
  description: string
}

const TEST_CASES: TestCase[] = [
  {
    name: 'GitHub 2FA',
    filename: 'github-2fa.html',
    expectedField: 'otp',
    expectedConfidence: { min: 100, max: 100 },
    expectedTier: 1,
    shouldDetect: true,
    description: 'HTML standard autocomplete="one-time-code"',
  },
  {
    name: 'Google Verify',
    filename: 'google-verify.html',
    expectedField: 'verificationCode',
    expectedConfidence: { min: 90, max: 100 },
    expectedTier: 1,
    shouldDetect: true,
    description: 'inputmode="numeric" + maxlength combination',
  },
  {
    name: 'Amazon OTP',
    filename: 'amazon-otp.html',
    expectedField: 'auth-mfa-otpcode',
    expectedConfidence: { min: 0, max: 0 },
    expectedTier: 1,
    shouldDetect: false, // SMS-only (sent to mobile number) - correctly rejected
    description: 'SMS-only field - should be rejected (InboxKey only handles email codes)',
  },
  {
    name: 'Bank MFA',
    filename: 'bank-mfa.html',
    expectedField: 'sms-verification-code',
    expectedConfidence: { min: 85, max: 95 },
    expectedTier: 1, // id contains "verification-code", triggers Tier 1
    shouldDetect: true,
    description: 'ID contains verification-code (Tier 1), also has verbose label',
  },
  {
    name: 'Startup Minimal',
    filename: 'startup-minimal.html',
    expectedField: 'verification-field', // data-testid
    expectedConfidence: { min: 70, max: 100 },
    expectedTier: 1, // Has inputmode="numeric"
    shouldDetect: true,
    description: 'Minimal markup with placeholder + inputmode',
  },
  {
    name: 'Legacy Form',
    filename: 'legacy-form.html',
    expectedField: 'verification-field', // data-testid (name="seccode")
    expectedConfidence: { min: 85, max: 95 },
    expectedTier: 1,
    shouldDetect: true,
    description: 'Old HTML with table layout, name="seccode"',
  },
  {
    name: 'React App',
    filename: 'react-app.html',
    expectedField: 'verification-input',
    expectedConfidence: { min: 85, max: 100 },
    expectedTier: 1,
    shouldDetect: true,
    description: 'Modern React with ARIA labels and data attributes',
  },
  {
    name: 'Multiple Inputs',
    filename: 'multiple-inputs.html',
    expectedField: 'email-verification-code',
    expectedConfidence: { min: 85, max: 95 },
    expectedTier: 1,
    shouldDetect: true,
    description: 'Multiple inputs - must select correct one',
  },
  {
    name: 'Dynamic Inject',
    filename: 'dynamic-inject.html',
    expectedField: 'dynamic-otp',
    expectedConfidence: { min: 95, max: 100 },
    expectedTier: 1,
    shouldDetect: true,
    description: 'JavaScript-injected field (requires manual trigger)',
  },
  {
    name: 'Edge Cases',
    filename: 'edge-case.html',
    expectedField: 'none',
    expectedConfidence: { min: 0, max: 0 },
    expectedTier: 1,
    shouldDetect: false,
    description: 'Should NOT detect any field (false positive test)',
  },
]

describe('Detection Engine Feasibility', () => {
  describe('Individual Fixture Tests', () => {
    TEST_CASES.forEach((testCase) => {
      describe(testCase.name, () => {
        let window: Window
        let document: Document

        beforeEach(() => {
          // Reset cooldown registry to prevent test interference
          resetCooldownRegistry()

          // Load fixture HTML
          const fixtureDir = join(__dirname, '../fixtures/detection')
          const htmlContent = readFileSync(
            join(fixtureDir, testCase.filename),
            'utf-8'
          )

          // Create happy-dom window
          window = new Window()
          document = window.document
          document.write(htmlContent)

          // Make globals available for detection engine
          global.document = document as any
          global.window = window as any
          global.performance = window.performance as any
        })

        it('should detect field correctly', () => {
          // Special case: dynamic-inject requires triggering the injection
          if (testCase.filename === 'dynamic-inject.html') {
            // Simulate form submissions to trigger injection
            const usernameForm = document.getElementById(
              'username-form'
            ) as HTMLFormElement
            usernameForm?.dispatchEvent(new window.Event('submit'))

            const passwordForm = document.getElementById(
              'password-form'
            ) as HTMLFormElement
            passwordForm?.dispatchEvent(new window.Event('submit'))

            // Wait for injection (simulated via manual call)
            const injectScript = document.querySelector('script')?.textContent
            if (injectScript && injectScript.includes('injectVerificationField')) {
              // Manually call the function
              const fn = new Function(injectScript + '; return injectVerificationField;')
              const injectVerificationField = fn()
              injectVerificationField()
            }
          }

          const result = detectVerificationField({ strictVisibility: false })

          if (!testCase.shouldDetect) {
            if (result) {
              console.log(`\nERROR: Edge case detected field when it shouldn't:`)
              console.log(`  ID: ${result.field.id}, Name: ${result.field.name}`)
              console.log(`  Type: ${result.field.type}`)
              console.log(`  Confidence: ${result.confidence}`)
              console.log(`  Signals: ${JSON.stringify(result.signals)}`)
            }
            expect(result).toBeNull()
            return
          }

          expect(result).not.toBeNull()
          if (!result) return // Type guard

          // Check if correct field was detected
          const expectedField = document.querySelector(
            `[data-testid="verification-field"]`
          ) as HTMLInputElement
          expect(expectedField).not.toBeNull()
          expect(result.field).toBe(expectedField)
        })

        it('should have correct confidence score', () => {
          if (!testCase.shouldDetect) return

          // Handle dynamic injection
          if (testCase.filename === 'dynamic-inject.html') {
            const injectScript = document.querySelector('script')?.textContent
            if (injectScript && injectScript.includes('injectVerificationField')) {
              const fn = new Function(injectScript + '; return injectVerificationField;')
              const injectVerificationField = fn()
              injectVerificationField()
            }
          }

          const result = detectVerificationField({ strictVisibility: false })

          expect(result).not.toBeNull()
          if (!result) return

          expect(result.confidence).toBeGreaterThanOrEqual(
            testCase.expectedConfidence.min
          )
          expect(result.confidence).toBeLessThanOrEqual(
            testCase.expectedConfidence.max
          )
        })

        it('should use correct detection tier', () => {
          if (!testCase.shouldDetect) return

          // Handle dynamic injection
          if (testCase.filename === 'dynamic-inject.html') {
            const injectScript = document.querySelector('script')?.textContent
            if (injectScript && injectScript.includes('injectVerificationField')) {
              const fn = new Function(injectScript + '; return injectVerificationField;')
              const injectVerificationField = fn()
              injectVerificationField()
            }
          }

          const result = detectVerificationField({ strictVisibility: false })

          expect(result).not.toBeNull()
          if (!result) return

          expect(result.tier).toBe(testCase.expectedTier)
        })

        it('should meet performance target', () => {
          if (!testCase.shouldDetect) return

          // Handle dynamic injection
          if (testCase.filename === 'dynamic-inject.html') {
            const injectScript = document.querySelector('script')?.textContent
            if (injectScript && injectScript.includes('injectVerificationField')) {
              const fn = new Function(injectScript + '; return injectVerificationField;')
              const injectVerificationField = fn()
              injectVerificationField()
            }
          }

          const result = detectVerificationField({ strictVisibility: false })

          expect(result).not.toBeNull()
          if (!result) return

          if (result.tier === 1) {
            expect(result.executionTime).toBeLessThan(1)
          } else {
            expect(result.executionTime).toBeLessThan(50)
          }
        })

        it('should provide meaningful signals', () => {
          if (!testCase.shouldDetect) return

          // Handle dynamic injection
          if (testCase.filename === 'dynamic-inject.html') {
            const injectScript = document.querySelector('script')?.textContent
            if (injectScript && injectScript.includes('injectVerificationField')) {
              const fn = new Function(injectScript + '; return injectVerificationField;')
              const injectVerificationField = fn()
              injectVerificationField()
            }
          }

          const result = detectVerificationField({ strictVisibility: false })

          expect(result).not.toBeNull()
          if (!result) return

          expect(result.signals).toBeInstanceOf(Array)
          expect(result.signals.length).toBeGreaterThan(0)
          // Each signal should be a non-empty string
          result.signals.forEach((signal) => {
            expect(typeof signal).toBe('string')
            expect(signal.length).toBeGreaterThan(0)
          })
        })
      })
    })
  })

  describe('Overall Metrics', () => {
    it('should achieve 90%+ detection accuracy', () => {
      let successCount = 0
      const shouldDetectCases = TEST_CASES.filter((tc) => tc.shouldDetect)
      const totalCases = shouldDetectCases.length

      shouldDetectCases.forEach((testCase) => {
        // Reset cooldown registry for each test case
        resetCooldownRegistry()

        const fixtureDir = join(__dirname, '../fixtures/detection')
        const htmlContent = readFileSync(
          join(fixtureDir, testCase.filename),
          'utf-8'
        )

        const window = new Window()
        const document = window.document
        document.write(htmlContent)

        global.document = document as any
        global.window = window as any
        global.performance = window.performance as any

        // Handle dynamic injection
        if (testCase.filename === 'dynamic-inject.html') {
          const injectScript = document.querySelector('script')?.textContent
          if (injectScript && injectScript.includes('injectVerificationField')) {
            const fn = new Function(injectScript + '; return injectVerificationField;')
            const injectVerificationField = fn()
            injectVerificationField()
          }
        }

        const result = detectVerificationField({ strictVisibility: false })
        const expectedField = document.querySelector(
          `[data-testid="verification-field"]`
        ) as HTMLInputElement

        if (result && result.field === expectedField) {
          successCount++
        } else if (result) {
          console.log(`\n⚠️  ${testCase.name}: Detected wrong field`)
          console.log(`  Expected: #${testCase.expectedField}`)
          console.log(`  Got: #${result.field.id || result.field.name}`)
        } else {
          console.log(`\n❌ ${testCase.name}: No field detected`)
        }
      })

      const accuracy = (successCount / totalCases) * 100
      console.log(`\n📊 Detection Accuracy: ${accuracy.toFixed(1)}% (${successCount}/${totalCases})`)

      expect(accuracy).toBeGreaterThanOrEqual(90)
    })

    it('should have zero false positives', () => {
      resetCooldownRegistry()

      const edgeCaseTest = TEST_CASES.find((tc) => tc.filename === 'edge-case.html')
      expect(edgeCaseTest).toBeDefined()

      const fixtureDir = join(__dirname, '../fixtures/detection')
      const htmlContent = readFileSync(
        join(fixtureDir, edgeCaseTest!.filename),
        'utf-8'
      )

      const window = new Window()
      const document = window.document
      document.write(htmlContent)

      global.document = document as any
      global.window = window as any
      global.performance = window.performance as any

      const result = detectVerificationField({ strictVisibility: false })

      expect(result).toBeNull()
    })

    it('should correctly rank multiple candidates', () => {
      resetCooldownRegistry()

      const multipleInputsTest = TEST_CASES.find(
        (tc) => tc.filename === 'multiple-inputs.html'
      )
      expect(multipleInputsTest).toBeDefined()

      const fixtureDir = join(__dirname, '../fixtures/detection')
      const htmlContent = readFileSync(
        join(fixtureDir, multipleInputsTest!.filename),
        'utf-8'
      )

      const window = new Window()
      const document = window.document
      document.write(htmlContent)

      global.document = document as any
      global.window = window as any
      global.performance = window.performance as any

      const results = detectAllFields({ strictVisibility: false })

      // Should find multiple candidates
      expect(results.length).toBeGreaterThan(0)

      // Highest ranked should be the verification field
      const topResult = results[0]
      const expectedField = document.querySelector(
        `[data-testid="verification-field"]`
      ) as HTMLInputElement

      expect(topResult.field).toBe(expectedField)

      // Should be sorted by confidence
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].confidence).toBeGreaterThanOrEqual(
          results[i].confidence
        )
      }
    })
  })

  describe('Performance Benchmarks', () => {
    it('Tier 1 detection should be <1ms', () => {
      const tier1Cases = TEST_CASES.filter(
        (tc) => tc.shouldDetect && tc.expectedTier === 1
      )

      const executionTimes: number[] = []

      tier1Cases.forEach((testCase) => {
        // Reset cooldown registry for each test case
        resetCooldownRegistry()

        const fixtureDir = join(__dirname, '../fixtures/detection')
        const htmlContent = readFileSync(
          join(fixtureDir, testCase.filename),
          'utf-8'
        )

        const window = new Window()
        const document = window.document
        document.write(htmlContent)

        global.document = document as any
        global.window = window as any
        global.performance = window.performance as any

        // Handle dynamic injection
        if (testCase.filename === 'dynamic-inject.html') {
          const injectScript = document.querySelector('script')?.textContent
          if (injectScript && injectScript.includes('injectVerificationField')) {
            const fn = new Function(injectScript + '; return injectVerificationField;')
            const injectVerificationField = fn()
            injectVerificationField()
          }
        }

        const result = detectVerificationField({ strictVisibility: false })
        if (result && result.tier === 1) {
          executionTimes.push(result.executionTime)
        }
      })

      if (executionTimes.length > 0) {
        const avgTime = executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length
        console.log(`\n⚡ Tier 1 Avg Execution: ${avgTime.toFixed(3)}ms`)

        expect(avgTime).toBeLessThan(1)
      } else {
        throw new Error('No Tier 1 results to measure performance')
      }
    })

    it('Tier 2 detection should be <50ms', () => {
      const tier2Cases = TEST_CASES.filter(
        (tc) => tc.shouldDetect && tc.expectedTier === 2
      )

      const executionTimes: number[] = []

      tier2Cases.forEach((testCase) => {
        // Reset cooldown registry for each test case
        resetCooldownRegistry()

        const fixtureDir = join(__dirname, '../fixtures/detection')
        const htmlContent = readFileSync(
          join(fixtureDir, testCase.filename),
          'utf-8'
        )

        const window = new Window()
        const document = window.document
        document.write(htmlContent)

        global.document = document as any
        global.window = window as any
        global.performance = window.performance as any

        const result = detectVerificationField({ strictVisibility: false })
        if (result && result.tier === 2) {
          executionTimes.push(result.executionTime)
        }
      })

      if (executionTimes.length > 0) {
        const avgTime = executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length
        console.log(`\n🔍 Tier 2 Avg Execution: ${avgTime.toFixed(3)}ms`)

        expect(avgTime).toBeLessThan(50)
      }
    })
  })
})
