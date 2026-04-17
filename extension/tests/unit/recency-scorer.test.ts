/**
 * Recency Scorer Unit Tests
 *
 * Tests for recency boost and session boost scoring functions.
 * recencyBoost returns a [0, 1.0] raw score; callers weight it.
 */

import { describe, it, expect } from 'vitest'
import { recencyBoost, sessionBoost } from '@/lib/matching/recency-scorer'

describe('recencyBoost', () => {
  it('should return 1.0 for age 0 seconds (brand new email)', () => {
    const boost = recencyBoost(0)
    expect(boost).toBeCloseTo(1.0, 4)
  })

  it('should return ~0.607 for age 60 seconds (1 minute old)', () => {
    const boost = recencyBoost(60)
    // e^(-60/120) = e^(-0.5) ≈ 0.6065
    expect(boost).toBeCloseTo(0.6065, 3)
  })

  it('should return ~0.368 for age 120 seconds (2 minutes old)', () => {
    const boost = recencyBoost(120)
    // e^(-1) ≈ 0.3679
    expect(boost).toBeCloseTo(0.3679, 3)
  })

  it('should return ~0.082 for age 300 seconds (5 minutes old)', () => {
    const boost = recencyBoost(300)
    // e^(-2.5) ≈ 0.0821
    expect(boost).toBeCloseTo(0.082, 2)
  })

  it('should return 1.0 for negative age (clock skew safety)', () => {
    const boost = recencyBoost(-10)
    expect(boost).toBeCloseTo(1.0, 4)
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

  it('should return 0.15 when received 100s after session start (inside 120s post-window)', () => {
    const receivedAt = sessionStart + 100000 // 100 seconds after
    const boost = sessionBoost(receivedAt, sessionStart)
    expect(boost).toBe(0.15)
  })

  it('should return 0.0 when received 130s after session start (past 120s post-window)', () => {
    const receivedAt = sessionStart + 130000
    const boost = sessionBoost(receivedAt, sessionStart)
    expect(boost).toBe(0.0)
  })
})
