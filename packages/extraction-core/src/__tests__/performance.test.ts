/**
 * Performance Benchmark Test (Enhanced with Baseline Comparison)
 *
 * Ensures extraction remains fast under typical and stress conditions.
 * Compares against baselines defined in performance-baseline.json.
 *
 * Baselines:
 * - Short text (~200 chars): ≤ 2.1ms avg (baseline: 2.0ms, +5% tolerance)
 * - Medium text (~1000 chars): ≤ 5.25ms avg (baseline: 5.0ms, +5% tolerance)
 * - Long text (~5000 chars): ≤ 21ms avg (baseline: 20.0ms, +5% tolerance)
 * - Throughput: ≥ 475 extractions/sec (baseline: 500, -5% tolerance)
 * - Memory: ≤ 5MB delta (leak detection)
 */

import { describe, it, expect } from 'vitest'
import { extractOTPs } from '../extraction/otp-extractor'
import {
  generatePerformanceReport,
  compareWithBaseline,
  formatComparison,
  type PerformanceMetrics
} from './performance-reporter'

const SHORT_TEXT = `
Hi there,

Your verification code is 123456. Please enter this code within the next 10 minutes.

Thanks,
The Team
`

const MEDIUM_TEXT = `
Dear Customer,

Thank you for signing up with our service. We're excited to have you on board!

To complete your registration, please verify your email address by entering the
verification code below:

Your verification code: 847293

This code will expire in 15 minutes for security reasons. If you didn't request
this code, please ignore this email.

Here are some helpful resources to get you started:
- Getting Started Guide: https://example.com/guide
- FAQ: https://example.com/faq
- Support: https://example.com/support

If you have any questions or need assistance, please don't hesitate to contact
our support team at support@example.com or call us at 1-800-123-4567.

Best regards,
Customer Success Team
`.repeat(2) // ~1000 chars

const LONG_TEXT = `
Dear Customer,

Thank you for signing up with our service. We're excited to have you on board!

To complete your registration, please verify your email address by entering the
verification code below:

Your verification code: 847293

This code will expire in 15 minutes for security reasons. If you didn't request
this code, please ignore this email.

Here are some helpful resources to get you started:
- Getting Started Guide: https://example.com/guide
- FAQ: https://example.com/faq
- Support: https://example.com/support

If you have any questions or need assistance, please don't hesitate to contact
our support team at support@example.com or call us at 1-800-123-4567.

We're committed to providing you with the best experience possible. Here are
some features you can explore:

1. Dashboard - View your account overview
2. Analytics - Track your usage and metrics
3. Settings - Customize your preferences
4. Integrations - Connect with your favorite tools
5. API Access - Build custom integrations

Best regards,
Customer Success Team

---
This email was sent to you@email.com. If you no longer wish to receive these
emails, you can unsubscribe here: https://example.com/unsubscribe

Privacy Policy: https://example.com/privacy
Terms of Service: https://example.com/terms

© 2025 Example Corp. All rights reserved.
123 Main Street, Suite 100
San Francisco, CA 94102
United States

Follow us:
Twitter: @example
LinkedIn: linkedin.com/company/example
Facebook: facebook.com/example
`.repeat(3) // ~5000 chars

describe('Performance Benchmarks (Baseline Comparison)', () => {
  const metrics: PerformanceMetrics = {
    shortText: { avgTimeMs: 0, iterations: 0, totalMs: 0 },
    mediumText: { avgTimeMs: 0, iterations: 0, totalMs: 0 },
    longText: { avgTimeMs: 0, iterations: 0, totalMs: 0 },
    throughput: { extractionsPerSec: 0, totalExtractions: 0, totalMs: 0 },
    memory: { deltaMB: 0, startMB: 0, endMB: 0 }
  }

  it('should process short emails within baseline (≤2.1ms avg)', () => {
    const iterations = 1000
    const start = Date.now()

    for (let i = 0; i < iterations; i++) {
      extractOTPs(SHORT_TEXT)
    }

    const elapsed = Date.now() - start
    const avgTime = elapsed / iterations

    metrics.shortText = {
      avgTimeMs: avgTime,
      iterations,
      totalMs: elapsed
    }

    console.log(`Short text: ${avgTime.toFixed(2)}ms avg (${iterations} iterations, ${elapsed}ms total)`)

    // Baseline: 2.0ms, allow 5% degradation = 2.1ms
    expect(avgTime).toBeLessThan(2.1)
  })

  it('should process medium emails within baseline (≤5.25ms avg)', () => {
    const iterations = 500
    const start = Date.now()

    for (let i = 0; i < iterations; i++) {
      extractOTPs(MEDIUM_TEXT)
    }

    const elapsed = Date.now() - start
    const avgTime = elapsed / iterations

    metrics.mediumText = {
      avgTimeMs: avgTime,
      iterations,
      totalMs: elapsed
    }

    console.log(`Medium text: ${avgTime.toFixed(2)}ms avg (${iterations} iterations, ${elapsed}ms total)`)

    // Baseline: 5.0ms, allow 5% degradation = 5.25ms
    expect(avgTime).toBeLessThan(5.25)
  })

  it('should process long emails within baseline (≤21ms avg)', () => {
    const iterations = 100
    const start = Date.now()

    for (let i = 0; i < iterations; i++) {
      extractOTPs(LONG_TEXT)
    }

    const elapsed = Date.now() - start
    const avgTime = elapsed / iterations

    metrics.longText = {
      avgTimeMs: avgTime,
      iterations,
      totalMs: elapsed
    }

    console.log(`Long text: ${avgTime.toFixed(2)}ms avg (${iterations} iterations, ${elapsed}ms total)`)

    // Baseline: 20.0ms, allow 5% degradation = 21ms
    expect(avgTime).toBeLessThan(21)
  })

  it('should maintain throughput within baseline (≥475 emails/sec)', () => {
    const emails = [SHORT_TEXT, MEDIUM_TEXT, LONG_TEXT]
    const iterations = 500
    const start = Date.now()

    for (let i = 0; i < iterations; i++) {
      extractOTPs(emails[i % emails.length])
    }

    const elapsed = Date.now() - start
    const throughput = (iterations / elapsed) * 1000 // emails per second

    metrics.throughput = {
      extractionsPerSec: throughput,
      totalExtractions: iterations,
      totalMs: elapsed
    }

    console.log(`Throughput: ${throughput.toFixed(0)} emails/sec (${iterations} emails in ${elapsed}ms)`)

    // Baseline: 500/sec, allow 5% degradation = 475/sec
    expect(throughput).toBeGreaterThan(475)
  })

  it('should not leak memory (≤5MB delta)', () => {
    const startMem = process.memoryUsage().heapUsed / 1024 / 1024 // MB

    // Run multiple iterations to detect leaks
    for (let i = 0; i < 1000; i++) {
      extractOTPs(LONG_TEXT)
    }

    // Force GC if available
    if (global.gc) {
      global.gc()
    }

    const endMem = process.memoryUsage().heapUsed / 1024 / 1024 // MB
    const deltaMem = endMem - startMem

    metrics.memory = {
      deltaMB: deltaMem,
      startMB: startMem,
      endMB: endMem
    }

    console.log(`Memory: ${deltaMem.toFixed(2)}MB delta (start: ${startMem.toFixed(2)}MB, end: ${endMem.toFixed(2)}MB)`)

    // Baseline: max 5MB delta
    expect(deltaMem).toBeLessThan(5)
  })

  it('should generate performance report and compare with baseline', () => {
    // Generate report
    const report = generatePerformanceReport(metrics)

    // Compare with baseline
    const comparison = compareWithBaseline(report)

    // Format and display
    console.log(formatComparison(comparison))

    // Assert overall verdict
    if (comparison.verdict === 'FAIL') {
      const failures = comparison.degradations.filter(d => d.status === 'FAIL')
      const failureMessages = failures.map(f =>
        `${f.metric}: ${f.actual.toFixed(2)} (baseline: ${f.baseline.toFixed(2)}, degradation: ${(f.degradation * 100).toFixed(1)}%)`
      )
      throw new Error(`Performance baseline check FAILED:\n${failureMessages.join('\n')}`)
    }

    if (comparison.verdict === 'PASS_WITH_WARNINGS') {
      const warnings = comparison.degradations.filter(d => d.status === 'WARN')
      console.warn('\n⚠️  Performance warnings detected:')
      warnings.forEach(w => {
        console.warn(`   ${w.metric}: ${(w.degradation * 100).toFixed(1)}% degradation`)
      })
    }

    expect(comparison.verdict).not.toBe('FAIL')
  })
})
