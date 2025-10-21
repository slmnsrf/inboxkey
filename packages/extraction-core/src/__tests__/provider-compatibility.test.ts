/**
 * Multi-Provider Compatibility Test
 *
 * Validates extraction-core works consistently across email providers.
 * Detects provider-specific regressions that might be masked in aggregate metrics.
 *
 * Providers tested:
 * - Gmail (gmail.com, googlemail.com)
 * - Outlook (outlook.com, hotmail.com, live.com)
 * - IMAP (generic/other providers)
 *
 * Baseline targets:
 * - Each provider must achieve >= 85% recall
 * - No provider should have significantly worse performance than others
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

type Provider = 'gmail' | 'outlook' | 'imap'

function detectProvider(from: string): Provider {
  const domain = from.toLowerCase()

  if (domain.includes('gmail.com') || domain.includes('googlemail.com')) {
    return 'gmail'
  }

  if (
    domain.includes('outlook.com') ||
    domain.includes('hotmail.com') ||
    domain.includes('live.com') ||
    domain.includes('microsoft.com')
  ) {
    return 'outlook'
  }

  return 'imap'
}

function loadAllFixtures(): EmailFixture[] {
  const categories = ['otp', 'alphanumeric', 'magic-links', 'password-resets', 'edge-cases']
  const allFixtures: EmailFixture[] = []

  for (const category of categories) {
    try {
      const fixturesPath = join(__dirname, 'fixtures', category)
      const files = readdirSync(fixturesPath).filter(f => f.endsWith('.json'))

      for (const file of files) {
        const content = readFileSync(join(fixturesPath, file), 'utf-8')
        allFixtures.push(JSON.parse(content) as EmailFixture)
      }
    } catch (err) {
      // Category may not exist yet
      continue
    }
  }

  return allFixtures
}

describe('Provider Compatibility', () => {
  it('should achieve >= 85% recall for each provider', () => {
    const fixtures = loadAllFixtures().filter(f =>
      f.type === 'otp' || f.type === 'alphanumeric' || f.category === 'otp'
    )

    if (fixtures.length === 0) {
      console.warn('⚠️  No fixtures found - ensure fixtures are properly linked')
      return
    }

    // Group by provider
    const byProvider: Record<Provider, EmailFixture[]> = {
      gmail: [],
      outlook: [],
      imap: []
    }

    for (const fixture of fixtures) {
      const provider = detectProvider(fixture.from)
      byProvider[provider].push(fixture)
    }

    const results: Record<Provider, { recall: number; total: number; correct: number }> = {
      gmail: { recall: 0, total: 0, correct: 0 },
      outlook: { recall: 0, total: 0, correct: 0 },
      imap: { recall: 0, total: 0, correct: 0 }
    }

    // Calculate recall per provider
    for (const [provider, providerFixtures] of Object.entries(byProvider)) {
      if (providerFixtures.length === 0) continue

      let correctExtractions = 0

      for (const fixture of providerFixtures) {
        const result = extractOTPs(fixture.body, {
          subject: fixture.subject,
          allowAlnum: true
        })

        if (fixture.extracted?.code) {
          const found = result.some(r => r.code === fixture.extracted.code)
          if (found) correctExtractions++
        }
      }

      const recall = (correctExtractions / providerFixtures.length) * 100
      results[provider as Provider] = {
        recall,
        total: providerFixtures.length,
        correct: correctExtractions
      }
    }

    // Report results
    console.log('\n📊 Provider-Specific Recall:')
    for (const [provider, metrics] of Object.entries(results)) {
      if (metrics.total === 0) {
        console.log(`   ${provider.toUpperCase()}: N/A (no fixtures)`)
        continue
      }

      const status = metrics.recall >= 85 ? '✓' : '✗'
      console.log(
        `   ${status} ${provider.toUpperCase()}: ${metrics.recall.toFixed(1)}% ` +
        `(${metrics.correct}/${metrics.total})`
      )

      // Only require >= 85% if we have fixtures
      expect(metrics.recall).toBeGreaterThanOrEqual(85)
    }
  })

  it('should detect provider-specific failures', () => {
    const fixtures = loadAllFixtures().filter(f =>
      f.type === 'otp' || f.type === 'alphanumeric' || f.category === 'otp'
    )

    if (fixtures.length === 0) return

    const failuresByProvider: Record<Provider, EmailFixture[]> = {
      gmail: [],
      outlook: [],
      imap: []
    }

    for (const fixture of fixtures) {
      const result = extractOTPs(fixture.body, {
        subject: fixture.subject,
        allowAlnum: true
      })

      if (fixture.extracted?.code) {
        const found = result.some(r => r.code === fixture.extracted.code)
        if (!found) {
          const provider = detectProvider(fixture.from)
          failuresByProvider[provider].push(fixture)
        }
      }
    }

    console.log('\n📋 Provider-Specific Failures:')
    for (const [provider, failures] of Object.entries(failuresByProvider)) {
      if (failures.length === 0) {
        console.log(`   ✓ ${provider.toUpperCase()}: No failures`)
      } else {
        console.log(`   • ${provider.toUpperCase()}: ${failures.length} failures`)
        failures.slice(0, 3).forEach(f => {
          console.log(`     - ${f.id}: from "${f.from.substring(0, 30)}..."`)
        })
      }
    }
  })

  it('should not have significant variance between providers (±10%)', () => {
    const fixtures = loadAllFixtures().filter(f =>
      f.type === 'otp' || f.type === 'alphanumeric' || f.category === 'otp'
    )

    if (fixtures.length === 0) return

    const recallByProvider: number[] = []

    for (const provider of ['gmail', 'outlook', 'imap'] as Provider[]) {
      const providerFixtures = fixtures.filter(f => detectProvider(f.from) === provider)
      if (providerFixtures.length === 0) continue

      let correctExtractions = 0
      for (const fixture of providerFixtures) {
        const result = extractOTPs(fixture.body, {
          subject: fixture.subject,
          allowAlnum: true
        })

        if (fixture.extracted?.code) {
          const found = result.some(r => r.code === fixture.extracted.code)
          if (found) correctExtractions++
        }
      }

      const recall = (correctExtractions / providerFixtures.length) * 100
      recallByProvider.push(recall)
    }

    if (recallByProvider.length < 2) {
      console.log('⚠️  Not enough provider diversity to check variance')
      return
    }

    const maxRecall = Math.max(...recallByProvider)
    const minRecall = Math.min(...recallByProvider)
    const variance = maxRecall - minRecall

    console.log(`\n📊 Provider Variance: ${variance.toFixed(1)}% (max: ${maxRecall.toFixed(1)}%, min: ${minRecall.toFixed(1)}%)`)

    if (variance > 10) {
      console.warn(`⚠️  High variance detected - some providers may need specific tuning`)
    }

    expect(variance).toBeLessThanOrEqual(10)
  })

  it('should document provider distribution in test fixtures', () => {
    const fixtures = loadAllFixtures()

    const distribution: Record<Provider, number> = {
      gmail: 0,
      outlook: 0,
      imap: 0
    }

    for (const fixture of fixtures) {
      const provider = detectProvider(fixture.from)
      distribution[provider]++
    }

    const total = fixtures.length
    console.log('\n📊 Fixture Provider Distribution:')
    console.log(`   Gmail: ${distribution.gmail} (${((distribution.gmail / total) * 100).toFixed(1)}%)`)
    console.log(`   Outlook: ${distribution.outlook} (${((distribution.outlook / total) * 100).toFixed(1)}%)`)
    console.log(`   IMAP/Other: ${distribution.imap} (${((distribution.imap / total) * 100).toFixed(1)}%)`)
    console.log(`   Total: ${total} fixtures`)

    // Ensure we have some diversity
    const providersWithFixtures = Object.values(distribution).filter(count => count > 0).length
    expect(providersWithFixtures).toBeGreaterThanOrEqual(2)
  })
})
