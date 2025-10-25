/**
 * Golden Dataset Test
 *
 * Validates extraction-core against 100+ manually verified email fixtures.
 * This test establishes baseline metrics and prevents regressions.
 *
 * Baseline targets:
 * - Recall >= 90% (must catch 90%+ of real OTPs)
 * - Precision >= 80% (max 20% false positives)
 */

import { describe, it, expect } from 'vitest'
import { extractOTPs } from '../extraction/otp-extractor.js'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

interface EmailFixture {
  id: string
  type: string
  category: string
  from: string
  subject: string
  body: string
  extracted?: {
    code: string
    pattern: string
    confidence: string
  }
  metadata?: Record<string, any>
}

function loadFixtures(category: string): EmailFixture[] {
  const fixturesPath = join(__dirname, 'fixtures', category)
  const files = readdirSync(fixturesPath).filter(f => f.endsWith('.json'))

  return files.map(file => {
    const content = readFileSync(join(fixturesPath, file), 'utf-8')
    return JSON.parse(content) as EmailFixture
  })
}

describe('Golden Dataset - OTP Extraction', () => {
  it('should achieve >= 90% recall on numeric OTP fixtures', () => {
    const fixtures = loadFixtures('otp')
    let correctExtractions = 0
    let totalFixtures = fixtures.length

    for (const fixture of fixtures) {
      const result = extractOTPs(fixture.body, { subject: fixture.subject })

      // Check if we extracted the expected code
      if (fixture.extracted?.code) {
        const found = result.some(r => r.code === fixture.extracted!.code)
        if (found) correctExtractions++
      }
    }

    const recall = (correctExtractions / totalFixtures) * 100
    console.log(`OTP Recall: ${recall.toFixed(1)}% (${correctExtractions}/${totalFixtures})`)

    expect(recall).toBeGreaterThanOrEqual(90)
  })

  it('should achieve >= 90% recall on alphanumeric code fixtures', () => {
    const fixtures = loadFixtures('alphanumeric')
    let correctExtractions = 0
    let totalFixtures = fixtures.length

    for (const fixture of fixtures) {
      const result = extractOTPs(fixture.body, {
        subject: fixture.subject,
        allowAlnum: true
      })

      // Check if we extracted the expected code
      if (fixture.extracted?.code) {
        const found = result.some(r => r.code === fixture.extracted!.code)
        if (found) correctExtractions++
      }
    }

    const recall = (correctExtractions / totalFixtures) * 100
    console.log(`Alphanumeric Recall: ${recall.toFixed(1)}% (${correctExtractions}/${totalFixtures})`)

    expect(recall).toBeGreaterThanOrEqual(90)
  })

  it('should achieve >= 80% precision (minimal false positives)', () => {
    const otpFixtures = loadFixtures('otp')
    const alnumFixtures = loadFixtures('alphanumeric')
    const allFixtures = [...otpFixtures, ...alnumFixtures]

    let truePositives = 0
    let falsePositives = 0
    let totalExtractions = 0

    for (const fixture of allFixtures) {
      const result = extractOTPs(fixture.body, {
        subject: fixture.subject,
        allowAlnum: true
      })

      totalExtractions += result.length

      if (fixture.extracted?.code) {
        const found = result.some(r => r.code === fixture.extracted!.code)
        if (found) {
          truePositives++
        } else if (result.length > 0) {
          // Extracted something but not the expected code
          falsePositives++
        }
      } else if (result.length > 0) {
        // Extracted code from fixture with no expected code
        falsePositives++
      }
    }

    const precision = totalExtractions > 0
      ? (truePositives / totalExtractions) * 100
      : 0

    console.log(`Precision: ${precision.toFixed(1)}% (${truePositives} TP, ${falsePositives} FP)`)

    expect(precision).toBeGreaterThanOrEqual(80)
  })

  it('should not extract codes from password reset emails', () => {
    const fixtures = loadFixtures('password-resets')
    let incorrectExtractions = 0

    for (const fixture of fixtures) {
      const result = extractOTPs(fixture.body, { subject: fixture.subject })

      // Password reset emails should not yield OTP codes
      // (they may have magic links but not short codes)
      if (result.length > 0) {
        incorrectExtractions++
      }
    }

    const errorRate = (incorrectExtractions / fixtures.length) * 100
    console.log(`Password reset false positive rate: ${errorRate.toFixed(1)}%`)

    // Allow max 10% false positives on password resets
    expect(errorRate).toBeLessThan(10)
  })

  it('should handle edge cases gracefully', () => {
    const fixtures = loadFixtures('edge-cases')

    // Should not crash on any edge case
    for (const fixture of fixtures) {
      expect(() => {
        extractOTPs(fixture.body, { subject: fixture.subject })
      }).not.toThrow()
    }
  })
})
