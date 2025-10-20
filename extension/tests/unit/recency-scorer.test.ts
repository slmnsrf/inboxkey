/**
 * Recency Scorer Unit Tests
 *
 * Comprehensive tests for recency boost and session boost scoring functions.
 * Tests cover exponential decay behavior, session timing windows, and edge cases.
 */

import { describe, it, expect } from 'vitest'
import { recencyBoost, sessionBoost } from '@/lib/matching/recency-scorer'

describe('recencyBoost', () => {
  it('should return 0.20 for age 0 seconds (brand new email)', () => {
    const boost = recencyBoost(0)
    expect(boost).toBeCloseTo(0.20, 2)
  })

  it('should return ~0.12 for age 60 seconds (1 minute old)', () => {
    const boost = recencyBoost(60)
    // Expected: 0.20 * e^(-60/120) = 0.20 * e^(-0.5) ≈ 0.1213
    expect(boost).toBeCloseTo(0.12, 2)
  })

  it('should return ~0.074 for age 120 seconds (2 minutes old)', () => {
    const boost = recencyBoost(120)
    // Expected: 0.20 * e^(-120/120) = 0.20 * e^(-1) ≈ 0.0736
    expect(boost).toBeCloseTo(0.074, 2)
  })

  it('should return ~0.012 for age 300 seconds (5 minutes old)', () => {
    const boost = recencyBoost(300)
    // Expected: 0.20 * e^(-300/120) = 0.20 * e^(-2.5) ≈ 0.0164
    expect(boost).toBeCloseTo(0.012, 1)
  })

  it('should return 0.20 for negative age (clock skew safety)', () => {
    const boost = recencyBoost(-10)
    // Negative ages should be treated as 0 for safety
    expect(boost).toBeCloseTo(0.20, 2)
  })
})

describe('sessionBoost', () => {
  const sessionStart = 1000000 // arbitrary millisecond timestamp

  it('should return 0.15 when received exactly at session start', () => {
    const boost = sessionBoost(sessionStart, sessionStart)
    expect(boost).toBe(0.15)
  })

  it('should return 0.15 when received 10s before session start (within 15s window)', () => {
    const receivedAt = sessionStart - 10000 // 10 seconds before
    const boost = sessionBoost(receivedAt, sessionStart)
    expect(boost).toBe(0.15)
  })

  it('should return 0.0 when received 20s before session start (outside window)', () => {
    const receivedAt = sessionStart - 20000 // 20 seconds before (beyond 15s window)
    const boost = sessionBoost(receivedAt, sessionStart)
    expect(boost).toBe(0.0)
  })

  it('should return 0.15 when received 100s after session start (unbounded after)', () => {
    const receivedAt = sessionStart + 100000 // 100 seconds after
    const boost = sessionBoost(receivedAt, sessionStart)
    expect(boost).toBe(0.15)
  })
})
