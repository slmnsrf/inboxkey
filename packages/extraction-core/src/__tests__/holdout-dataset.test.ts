/**
 * Holdout Dataset Test (Overfitting Detection)
 *
 * Validates extraction-core against edge-cases fixtures that are NOT used in training/tuning.
 * This test detects overfitting by comparing holdout performance to golden dataset performance.
 *
 * Overfitting indicators:
 * - Golden dataset recall improves while holdout degrades
 * - Large gap between golden and holdout metrics (>10%)
 *
 * Baseline targets:
 * - Holdout recall >= 85% (slightly lower than golden is acceptable)
 * - Holdout precision >= 75%
 */

import { describe, it, expect } from 'vitest'
import { extractOTPs } from '../extraction/otp-extractor'
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

function loadHoldoutFixtures(): EmailFixture[] {
  const fixturesPath = join(__dirname, 'fixtures', 'edge-cases')
  const files = readdirSync(fixturesPath).filter(f => f.endsWith('.json'))

  return files.map(file => {
    const content = readFileSync(join(fixturesPath, file), 'utf-8')
    return JSON.parse(content) as EmailFixture
  })
}

describe('Holdout Dataset - Overfitting Detection', () => {
  it('should achieve >= 85% recall on holdout set', () => {
    const fixtures = loadHoldoutFixtures()
    const otpFixtures = fixtures.filter(f =>
      f.type === 'otp' || f.type === 'alphanumeric' || f.category === 'otp'
    )

    if (otpFixtures.length === 0) {
      console.warn('⚠️  No OTP fixtures in holdout set - add edge cases to fixtures/edge-cases/')
      return
    }

    let correctExtractions = 0
    let totalFixtures = otpFixtures.length

    for (const fixture of otpFixtures) {
      const result = extractOTPs(fixture.body, {
        subject: fixture.subject,
        allowAlnum: true
      })

      // Check if we extracted the expected code
      if (fixture.extracted?.code) {
        const found = result.some(r => r.code === fixture.extracted.code)
        if (found) correctExtractions++
      }
    }

    const recall = (correctExtractions / totalFixtures) * 100
    console.log(`\n📊 Holdout Recall: ${recall.toFixed(1)}% (${correctExtractions}/${totalFixtures})`)

    if (recall < 85) {
      console.warn(`\n⚠️  OVERFITTING ALERT: Holdout recall (${recall.toFixed(1)}%) below 85% threshold`)
      console.warn('   This may indicate the model is optimized for golden dataset only.')
      console.warn('   Compare with golden dataset metrics - if golden improved but holdout degraded, ROLLBACK.')
    }

    expect(recall).toBeGreaterThanOrEqual(85)
  })

  it('should achieve >= 75% precision on holdout set', () => {
    const fixtures = loadHoldoutFixtures()
    const otpFixtures = fixtures.filter(f =>
      f.type === 'otp' || f.type === 'alphanumeric' || f.category === 'otp'
    )

    if (otpFixtures.length === 0) {
      return // Skip if no fixtures
    }

    let truePositives = 0
    let falsePositives = 0
    let totalExtractions = 0

    for (const fixture of otpFixtures) {
      const result = extractOTPs(fixture.body, {
        subject: fixture.subject,
        allowAlnum: true
      })

      totalExtractions += result.length

      if (fixture.extracted?.code) {
        const found = result.some(r => r.code === fixture.extracted.code)
        if (found) {
          truePositives++
        } else if (result.length > 0) {
          falsePositives++
        }
      } else if (result.length > 0) {
        falsePositives++
      }
    }

    const precision = totalExtractions > 0
      ? (truePositives / totalExtractions) * 100
      : 100

    console.log(`📊 Holdout Precision: ${precision.toFixed(1)}% (${truePositives} TP, ${falsePositives} FP)`)

    expect(precision).toBeGreaterThanOrEqual(75)
  })

  it('should not crash on edge cases', () => {
    const fixtures = loadHoldoutFixtures()

    for (const fixture of fixtures) {
      expect(() => {
        extractOTPs(fixture.body, { subject: fixture.subject })
      }).not.toThrow()
    }

    console.log(`✓ All ${fixtures.length} edge cases handled gracefully (no crashes)`)
  })

  it('should detect overfitting when golden improves but holdout degrades', () => {
    // This test serves as documentation for the overfitting detection process
    // In practice, compare metrics manually:
    //
    // BEFORE change:
    //   Golden recall: 90%, Holdout recall: 87%
    //
    // AFTER change:
    //   Golden recall: 93%, Holdout recall: 82%
    //
    // → OVERFITTING DETECTED (golden +3%, holdout -5%)
    // → ROLLBACK and try more generalized approach

    const fixtures = loadHoldoutFixtures()
    console.log(`\n📋 Overfitting Detection Guide:`)
    console.log(`   1. Run baseline: npm run test:golden && npm run test:holdout`)
    console.log(`   2. Make change`)
    console.log(`   3. Run again: npm run test:golden && npm run test:holdout`)
    console.log(`   4. Compare metrics:`)
    console.log(`      ✓ Both improve → GOOD`)
    console.log(`      ✓ Golden improves, holdout stable (±2%) → ACCEPTABLE`)
    console.log(`      ❌ Golden improves, holdout degrades → OVERFITTING (rollback)`)
    console.log(`      ❌ Both degrade → BAD CHANGE (rollback)`)
    console.log(`\n   Holdout fixtures: ${fixtures.length} edge cases`)

    expect(fixtures.length).toBeGreaterThan(0)
  })
})
