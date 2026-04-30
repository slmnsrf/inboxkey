/**
 * Validation Metrics Interface and Utilities
 *
 * Provides structured metrics comparison for detecting regressions and overfitting.
 */

export interface ValidationMetrics {
  dataset: 'golden' | 'holdout'
  timestamp: string
  recall: number // Percentage (0-100)
  precision: number // Percentage (0-100)
  f1Score: number // Calculated from recall and precision
  totalFixtures: number
  correctExtractions: number
  falsePositives: number
  falseNegatives: number
  performance?: {
    avgTimeMs: number
    throughput: number // extractions per second
    memoryDeltaMB: number
  }
}

export interface MetricsComparison {
  before: ValidationMetrics
  after: ValidationMetrics
  changes: {
    recall: number // Delta percentage points
    precision: number
    f1Score: number
  }
  verdict: 'IMPROVED' | 'STABLE' | 'DEGRADED' | 'OVERFITTING'
  reasons: string[]
}

/**
 * Compare before/after metrics and detect degradation or overfitting
 */
export function compareMetrics(
  before: ValidationMetrics,
  after: ValidationMetrics
): MetricsComparison {
  const changes = {
    recall: after.recall - before.recall,
    precision: after.precision - before.precision,
    f1Score: after.f1Score - before.f1Score
  }

  const reasons: string[] = []
  let verdict: MetricsComparison['verdict'] = 'STABLE'

  // Check for degradation
  if (changes.recall < -2) {
    reasons.push(`Recall degraded by ${Math.abs(changes.recall).toFixed(1)}%`)
    verdict = 'DEGRADED'
  }

  if (changes.precision < -2) {
    reasons.push(`Precision degraded by ${Math.abs(changes.precision).toFixed(1)}%`)
    verdict = 'DEGRADED'
  }

  // Check for improvement
  if (changes.recall > 2 || changes.precision > 2) {
    if (verdict !== 'DEGRADED') {
      verdict = 'IMPROVED'
      if (changes.recall > 2) {
        reasons.push(`Recall improved by ${changes.recall.toFixed(1)}%`)
      }
      if (changes.precision > 2) {
        reasons.push(`Precision improved by ${changes.precision.toFixed(1)}%`)
      }
    }
  }

  // Stable if no significant changes
  if (Math.abs(changes.recall) <= 2 && Math.abs(changes.precision) <= 2) {
    verdict = 'STABLE'
    reasons.push('Metrics stable (within ±2% threshold)')
  }

  return {
    before,
    after,
    changes,
    verdict,
    reasons
  }
}

/**
 * Detect overfitting by comparing golden vs holdout metrics
 */
export function detectOverfitting(
  goldenComparison: MetricsComparison,
  holdoutComparison: MetricsComparison
): {
  isOverfitting: boolean
  reasons: string[]
  recommendation: string
} {
  const reasons: string[] = []
  let isOverfitting = false

  // Overfitting pattern: Golden improves, holdout degrades
  if (
    goldenComparison.changes.recall > 2 &&
    holdoutComparison.changes.recall < -2
  ) {
    isOverfitting = true
    reasons.push(
      `Golden recall improved (+${goldenComparison.changes.recall.toFixed(1)}%) ` +
      `but holdout degraded (${holdoutComparison.changes.recall.toFixed(1)}%)`
    )
  }

  // Large gap between golden and holdout
  const recallGap = Math.abs(
    goldenComparison.after.recall - holdoutComparison.after.recall
  )
  if (recallGap > 10) {
    isOverfitting = true
    reasons.push(
      `Large recall gap between golden (${goldenComparison.after.recall.toFixed(1)}%) ` +
      `and holdout (${holdoutComparison.after.recall.toFixed(1)}%) - ${recallGap.toFixed(1)}% difference`
    )
  }

  const recommendation = isOverfitting
    ? 'ROLLBACK and try more generalized approach (avoid pattern-specific optimizations)'
    : 'Safe to proceed'

  return {
    isOverfitting,
    reasons,
    recommendation
  }
}

/**
 * Calculate F1 score from recall and precision
 */
export function calculateF1(recall: number, precision: number): number {
  if (recall === 0 && precision === 0) return 0
  return (2 * recall * precision) / (recall + precision)
}

/**
 * Format metrics for console output
 */
export function formatMetrics(metrics: ValidationMetrics): string {
  const lines = [
    `Dataset: ${metrics.dataset}`,
    `Timestamp: ${metrics.timestamp}`,
    `Recall: ${metrics.recall.toFixed(1)}%`,
    `Precision: ${metrics.precision.toFixed(1)}%`,
    `F1 Score: ${metrics.f1Score.toFixed(1)}%`,
    `Fixtures: ${metrics.totalFixtures}`,
    `Correct: ${metrics.correctExtractions}`,
    `False Positives: ${metrics.falsePositives}`,
    `False Negatives: ${metrics.falseNegatives}`
  ]

  if (metrics.performance) {
    lines.push(`Avg Time: ${metrics.performance.avgTimeMs.toFixed(2)}ms`)
    lines.push(`Throughput: ${metrics.performance.throughput.toFixed(0)} msgs/sec`)
    lines.push(`Memory Delta: ${metrics.performance.memoryDeltaMB.toFixed(2)}MB`)
  }

  return lines.join('\n')
}

/**
 * Format comparison for console output
 */
export function formatComparison(comparison: MetricsComparison): string {
  const { before, after, changes, verdict, reasons } = comparison

  const verdictSymbol = {
    IMPROVED: '✓',
    STABLE: '→',
    DEGRADED: '✗',
    OVERFITTING: '⚠️'
  }[verdict]

  return [
    `\n${verdictSymbol} ${verdict}`,
    `Recall: ${before.recall.toFixed(1)}% → ${after.recall.toFixed(1)}% (${changes.recall >= 0 ? '+' : ''}${changes.recall.toFixed(1)}%)`,
    `Precision: ${before.precision.toFixed(1)}% → ${after.precision.toFixed(1)}% (${changes.precision >= 0 ? '+' : ''}${changes.precision.toFixed(1)}%)`,
    `F1 Score: ${before.f1Score.toFixed(1)}% → ${after.f1Score.toFixed(1)}% (${changes.f1Score >= 0 ? '+' : ''}${changes.f1Score.toFixed(1)}%)`,
    '',
    ...reasons.map(r => `  • ${r}`)
  ].join('\n')
}
