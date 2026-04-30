import { describe, it, expect } from 'vitest'
import { shapeScore, type ExpectedShape } from '@/lib/matching/shape-matcher'

describe('shapeScore', () => {
  describe('Length scoring', () => {
    it('should return 0.20 for exact length match', () => {
      const code = '123456'
      const expected: ExpectedShape = { len: 6 }
      const score = shapeScore(code, expected)
      expect(score).toBeCloseTo(0.20, 2)
    })

    it('should return 0.06 for length within ±1', () => {
      const code = '12345'
      const expected: ExpectedShape = { len: 6 }
      const score = shapeScore(code, expected)
      expect(score).toBeCloseTo(0.06, 2)
    })

    it('should return -0.12 for length outside ±1', () => {
      const code = '1234'
      const expected: ExpectedShape = { len: 6 }
      const score = shapeScore(code, expected)
      expect(score).toBeCloseTo(-0.12, 2)
    })

    it('should return 0.0 when no expected length is provided', () => {
      const code = '123456'
      const expected: ExpectedShape = {}
      const score = shapeScore(code, expected)
      expect(score).toBeCloseTo(0.0, 2)
    })
  })

  describe('Charset scoring', () => {
    it('should return 0.08 for digits matching digits charset', () => {
      const code = '123456'
      const expected: ExpectedShape = { charset: 'digits' }
      const score = shapeScore(code, expected)
      expect(score).toBeCloseTo(0.08, 2)
    })

    it('should return 0.08 for alphanumeric matching alnum charset', () => {
      const code = 'A1B2C3'
      const expected: ExpectedShape = { charset: 'alnum' }
      const score = shapeScore(code, expected)
      expect(score).toBeCloseTo(0.08, 2)
    })

    it('should return 0.0 for charset mismatch', () => {
      const code = 'A1B2C3'
      const expected: ExpectedShape = { charset: 'digits' }
      const score = shapeScore(code, expected)
      expect(score).toBeCloseTo(0.0, 2)
    })
  })

  describe('Combined scoring', () => {
    it('should return 0.28 for perfect match (length + charset)', () => {
      const code = '123456'
      const expected: ExpectedShape = { len: 6, charset: 'digits' }
      const score = shapeScore(code, expected)
      expect(score).toBeCloseTo(0.28, 2)
    })

    it('should return 0.20 for length match + charset mismatch', () => {
      const code = 'A1B2C3'
      const expected: ExpectedShape = { len: 6, charset: 'digits' }
      const score = shapeScore(code, expected)
      expect(score).toBeCloseTo(0.20, 2)
    })

    it('should return 0.14 for length ±1 + charset match', () => {
      const code = '12345'
      const expected: ExpectedShape = { len: 6, charset: 'digits' }
      const score = shapeScore(code, expected)
      expect(score).toBeCloseTo(0.14, 2)
    })

    it('should return -0.04 for length outside ±1 + charset match', () => {
      const code = '1234'
      const expected: ExpectedShape = { len: 6, charset: 'digits' }
      const score = shapeScore(code, expected)
      expect(score).toBeCloseTo(-0.04, 2)
    })

    it('should return 0.0 when no expected shape is provided', () => {
      const code = '123456'
      const expected: ExpectedShape = {}
      const score = shapeScore(code, expected)
      expect(score).toBeCloseTo(0.0, 2)
    })
  })
})
