/**
 * Performance Reporter
 *
 * Generates performance reports and compares against baselines.
 * Detects performance regressions that might be introduced during fine-tuning.
 */

import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

export interface PerformanceMetrics {
  shortText: {
    avgTimeMs: number
    iterations: number
    totalMs: number
  }
  mediumText: {
    avgTimeMs: number
    iterations: number
    totalMs: number
  }
  longText: {
    avgTimeMs: number
    iterations: number
    totalMs: number
  }
  throughput: {
    extractionsPerSec: number
    totalExtractions: number
    totalMs: number
  }
  memory: {
    deltaMB: number
    startMB: number
    endMB: number
  }
}

export interface PerformanceReport {
  timestamp: string
  metrics: PerformanceMetrics
  comparison?: PerformanceComparison
}

export interface PerformanceComparison {
  baseline: {
    shortText: number
    mediumText: number
    longText: number
    throughput: number
    maxMemoryDelta: number
  }
  actual: {
    shortText: number
    mediumText: number
    longText: number
    throughput: number
    memoryDelta: number
  }
  degradations: Array<{
    metric: string
    baseline: number
    actual: number
    degradation: number // percentage
    threshold: number
    status: 'PASS' | 'WARN' | 'FAIL'
  }>
  verdict: 'PASS' | 'PASS_WITH_WARNINGS' | 'FAIL'
}

/**
 * Generate performance report from metrics
 */
export function generatePerformanceReport(metrics: PerformanceMetrics): PerformanceReport {
  return {
    timestamp: new Date().toISOString(),
    metrics
  }
}

/**
 * Compare report against baseline and return pass/fail with degradations
 */
export function compareWithBaseline(report: PerformanceReport): PerformanceComparison {
  // Load baseline
  const baselinePath = join(__dirname, 'performance-baseline.json')
  const baselineData = JSON.parse(readFileSync(baselinePath, 'utf-8'))
  const baselines = baselineData.baselines

  const degradations: PerformanceComparison['degradations'] = []

  // Compare short text
  const shortTextDegradation = calculateDegradation(
    baselines.shortText.avgTimeMs,
    report.metrics.shortText.avgTimeMs
  )
  degradations.push({
    metric: 'Short Text (avg time)',
    baseline: baselines.shortText.avgTimeMs,
    actual: report.metrics.shortText.avgTimeMs,
    degradation: shortTextDegradation,
    threshold: baselines.shortText.maxDegradation,
    status: getDegradationStatus(shortTextDegradation, baselines.shortText.maxDegradation)
  })

  // Compare medium text
  const mediumTextDegradation = calculateDegradation(
    baselines.mediumText.avgTimeMs,
    report.metrics.mediumText.avgTimeMs
  )
  degradations.push({
    metric: 'Medium Text (avg time)',
    baseline: baselines.mediumText.avgTimeMs,
    actual: report.metrics.mediumText.avgTimeMs,
    degradation: mediumTextDegradation,
    threshold: baselines.mediumText.maxDegradation,
    status: getDegradationStatus(mediumTextDegradation, baselines.mediumText.maxDegradation)
  })

  // Compare long text
  const longTextDegradation = calculateDegradation(
    baselines.longText.avgTimeMs,
    report.metrics.longText.avgTimeMs
  )
  degradations.push({
    metric: 'Long Text (avg time)',
    baseline: baselines.longText.avgTimeMs,
    actual: report.metrics.longText.avgTimeMs,
    degradation: longTextDegradation,
    threshold: baselines.longText.maxDegradation,
    status: getDegradationStatus(longTextDegradation, baselines.longText.maxDegradation)
  })

  // Compare throughput (inverse - lower is worse)
  const throughputDegradation = calculateDegradation(
    baselines.throughput.extractionsPerSec,
    report.metrics.throughput.extractionsPerSec,
    true // inverse
  )
  degradations.push({
    metric: 'Throughput (extractions/sec)',
    baseline: baselines.throughput.extractionsPerSec,
    actual: report.metrics.throughput.extractionsPerSec,
    degradation: throughputDegradation,
    threshold: baselines.throughput.maxDegradation,
    status: getDegradationStatus(throughputDegradation, baselines.throughput.maxDegradation)
  })

  // Compare memory
  const memoryStatus = report.metrics.memory.deltaMB <= baselines.memory.maxDeltaMB
    ? 'PASS'
    : 'FAIL'
  degradations.push({
    metric: 'Memory Delta (MB)',
    baseline: baselines.memory.maxDeltaMB,
    actual: report.metrics.memory.deltaMB,
    degradation: 0, // Not a percentage degradation
    threshold: 0,
    status: memoryStatus
  })

  // Determine overall verdict
  const hasFailures = degradations.some(d => d.status === 'FAIL')
  const hasWarnings = degradations.some(d => d.status === 'WARN')

  const verdict = hasFailures
    ? 'FAIL'
    : hasWarnings
    ? 'PASS_WITH_WARNINGS'
    : 'PASS'

  const comparison: PerformanceComparison = {
    baseline: {
      shortText: baselines.shortText.avgTimeMs,
      mediumText: baselines.mediumText.avgTimeMs,
      longText: baselines.longText.avgTimeMs,
      throughput: baselines.throughput.extractionsPerSec,
      maxMemoryDelta: baselines.memory.maxDeltaMB
    },
    actual: {
      shortText: report.metrics.shortText.avgTimeMs,
      mediumText: report.metrics.mediumText.avgTimeMs,
      longText: report.metrics.longText.avgTimeMs,
      throughput: report.metrics.throughput.extractionsPerSec,
      memoryDelta: report.metrics.memory.deltaMB
    },
    degradations,
    verdict
  }

  report.comparison = comparison

  return comparison
}

/**
 * Calculate degradation percentage
 */
function calculateDegradation(
  baseline: number,
  actual: number,
  inverse = false
): number {
  if (inverse) {
    // For metrics where higher is better (throughput)
    return (baseline - actual) / baseline
  } else {
    // For metrics where lower is better (time)
    return (actual - baseline) / baseline
  }
}

/**
 * Get degradation status based on threshold
 */
function getDegradationStatus(
  degradation: number,
  threshold: number
): 'PASS' | 'WARN' | 'FAIL' {
  if (degradation <= 0) return 'PASS' // Improved or equal
  if (degradation <= threshold) return 'PASS' // Within acceptable threshold
  if (degradation <= threshold * 1.5) return 'WARN' // Slight overage
  return 'FAIL' // Significant degradation
}

/**
 * Save performance report to file
 */
export function savePerformanceReport(report: PerformanceReport, filename: string): void {
  const reportsDir = join(__dirname, 'performance-reports')

  // Create directory if it doesn't exist
  try {
    const { mkdirSync } = require('fs')
    mkdirSync(reportsDir, { recursive: true })
  } catch (err) {
    // Directory might already exist
  }

  const filepath = join(reportsDir, filename)
  writeFileSync(filepath, JSON.stringify(report, null, 2), 'utf-8')
}

/**
 * Format comparison for console output
 */
export function formatComparison(comparison: PerformanceComparison): string {
  const lines: string[] = []

  const verdictSymbol = {
    PASS: '✓',
    PASS_WITH_WARNINGS: '⚠️',
    FAIL: '✗'
  }[comparison.verdict]

  lines.push(`\n${verdictSymbol} ${comparison.verdict}`)
  lines.push('')

  for (const deg of comparison.degradations) {
    const statusSymbol = {
      PASS: '✓',
      WARN: '⚠️',
      FAIL: '✗'
    }[deg.status]

    if (deg.metric.includes('Memory')) {
      lines.push(
        `${statusSymbol} ${deg.metric}: ${deg.actual.toFixed(2)}MB ` +
        `(max: ${deg.baseline.toFixed(2)}MB)`
      )
    } else {
      const baselineStr = deg.metric.includes('Throughput')
        ? `${deg.baseline.toFixed(0)}/sec`
        : `${deg.baseline.toFixed(2)}ms`

      const actualStr = deg.metric.includes('Throughput')
        ? `${deg.actual.toFixed(0)}/sec`
        : `${deg.actual.toFixed(2)}ms`

      const change = deg.degradation * 100
      const changeStr = change >= 0 ? `+${change.toFixed(1)}%` : `${change.toFixed(1)}%`

      lines.push(
        `${statusSymbol} ${deg.metric}: ${actualStr} ` +
        `(baseline: ${baselineStr}, ${changeStr})`
      )
    }
  }

  return lines.join('\n')
}
