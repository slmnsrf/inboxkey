/**
 * Shape Matcher - Expected Shape Bias Scoring
 *
 * This module implements shape-based scoring for verification codes based on
 * expected characteristics like length and character set composition.
 *
 * Scoring Algorithm (spec Section 9.4):
 * - Length matching:
 *   - Exact match: +0.20
 *   - Within ±1: +0.06
 *   - Outside ±1: -0.12
 * - Charset matching:
 *   - Match: +0.08
 *
 * Returns raw floating point scores that the caller will multiply by appropriate weights.
 *
 * @module shape-matcher
 */

/**
 * Expected shape characteristics for a verification code
 */
export interface ExpectedShape {
  /**
   * Expected length of the verification code
   * If undefined, length scoring is skipped
   */
  len?: number;

  /**
   * Expected character set composition
   * - 'digits': Only numeric characters (0-9)
   * - 'alnum': Alphanumeric characters (a-z, A-Z, 0-9)
   * If undefined, charset scoring is skipped
   */
  charset?: 'digits' | 'alnum';
}

/**
 * Detects the character set composition of a code string
 *
 * @param code - The verification code to analyze
 * @returns 'digits' if only numeric, 'alnum' if alphanumeric, null otherwise
 */
function detectCharset(code: string): 'digits' | 'alnum' | null {
  if (!code || code.length === 0) {
    return null;
  }

  const hasDigits = /\d/.test(code);
  const hasLetters = /[a-zA-Z]/.test(code);
  const hasOther = /[^a-zA-Z0-9]/.test(code);

  // If contains non-alphanumeric characters, return null
  if (hasOther) {
    return null;
  }

  // Only digits
  if (hasDigits && !hasLetters) {
    return 'digits';
  }

  // Contains letters (with or without digits)
  if (hasLetters) {
    return 'alnum';
  }

  // Edge case: empty or only whitespace
  return null;
}

/**
 * Calculates length-based score component
 *
 * @param actualLen - Actual length of the code
 * @param expectedLen - Expected length
 * @returns Score contribution: +0.20 (exact), +0.06 (±1), or -0.12 (outside)
 */
function scoreLengthMatch(actualLen: number, expectedLen: number): number {
  const diff = Math.abs(actualLen - expectedLen);

  if (diff === 0) {
    // Exact match
    return 0.20;
  } else if (diff === 1) {
    // Within ±1
    return 0.06;
  } else {
    // Outside ±1
    return -0.12;
  }
}

/**
 * Calculates charset-based score component
 *
 * @param actualCharset - Detected charset of the code
 * @param expectedCharset - Expected charset
 * @returns Score contribution: +0.08 (match) or 0 (no match/unknown)
 */
function scoreCharsetMatch(
  actualCharset: 'digits' | 'alnum' | null,
  expectedCharset: 'digits' | 'alnum'
): number {
  if (actualCharset === expectedCharset) {
    return 0.08;
  }
  return 0.0;
}

/**
 * Computes the shape score for a verification code against expected characteristics
 *
 * This function evaluates how well a code matches the expected shape defined by
 * length and character set. The returned score is a raw floating point value that
 * the caller should multiply by appropriate weighting factors.
 *
 * @param code - The verification code to score
 * @param expected - Expected shape characteristics
 * @returns Raw shape score as a floating point number (caller will apply weights)
 *
 * @example
 * ```typescript
 * // 6-digit code expectation
 * const score1 = shapeScore('123456', { len: 6, charset: 'digits' });
 * // Returns: 0.28 (0.20 for exact length + 0.08 for charset match)
 *
 * // 6-digit code but got 5 digits
 * const score2 = shapeScore('12345', { len: 6, charset: 'digits' });
 * // Returns: 0.14 (0.06 for ±1 length + 0.08 for charset match)
 *
 * // 6-digit code but got alphanumeric
 * const score3 = shapeScore('A1B2C3', { len: 6, charset: 'digits' });
 * // Returns: 0.20 (0.20 for exact length, 0 for charset mismatch)
 * ```
 */
export function shapeScore(code: string, expected: ExpectedShape): number {
  let score = 0.0;

  // Length scoring
  if (expected.len !== undefined) {
    score += scoreLengthMatch(code.length, expected.len);
  }

  // Charset scoring
  if (expected.charset !== undefined) {
    const actualCharset = detectCharset(code);
    score += scoreCharsetMatch(actualCharset, expected.charset);
  }

  return score;
}
