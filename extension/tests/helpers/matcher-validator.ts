/**
 * Matcher Validator - Validate code extraction and pattern matching
 *
 * Provides utilities for testing OTP/code extraction from emails and
 * validating pattern matching accuracy.
 */

export interface CodePattern {
  name: string;
  regex: RegExp;
  description: string;
  examples: string[];
}

export interface MatchResult {
  matched: boolean;
  code: string | null;
  pattern: string | null;
  confidence: 'high' | 'medium' | 'low';
  position?: { start: number; end: number };
  context?: string;
}

export interface ValidationResult {
  success: boolean;
  expected: string;
  actual: string | null;
  pattern: string | null;
  confidence: string;
  message: string;
}

/**
 * Common OTP/code patterns
 */
export const CODE_PATTERNS: CodePattern[] = [
  {
    name: 'numeric-4',
    regex: /\b\d{4}\b/,
    description: '4-digit numeric code',
    examples: ['1234', '5678', '9012'],
  },
  {
    name: 'numeric-6',
    regex: /\b\d{6}\b/,
    description: '6-digit numeric code',
    examples: ['123456', '789012', '345678'],
  },
  {
    name: 'numeric-8',
    regex: /\b\d{8}\b/,
    description: '8-digit numeric code',
    examples: ['12345678', '87654321', '11223344'],
  },
  {
    name: 'alphanumeric-8',
    regex: /\b[A-Z0-9]{8}\b/i,
    description: '8-character alphanumeric code',
    examples: ['AB12CD34', 'XY56ZW78', 'QW89ER12'],
  },
  {
    name: 'alphanumeric-10',
    regex: /\b[A-Z0-9]{10}\b/i,
    description: '10-character alphanumeric code',
    examples: ['AB12CD34EF', 'XY56ZW78IJ', 'QW89ER12TY'],
  },
  {
    name: 'formatted-6-digit',
    regex: /\b\d{3}[-\s]\d{3}\b/,
    description: '6-digit code with separator (123-456 or 123 456)',
    examples: ['123-456', '789-012', '123 456'],
  },
  {
    name: 'formatted-8-digit',
    regex: /\b\d{4}[-\s]\d{4}\b/,
    description: '8-digit code with separator (1234-5678)',
    examples: ['1234-5678', '8765-4321', '1122 3344'],
  },
];

/**
 * Contextual keywords that indicate nearby code
 */
const CONTEXT_KEYWORDS = [
  'verification code',
  'security code',
  'otp',
  'one-time password',
  'authentication code',
  'confirm code',
  'access code',
  'pin code',
  'codigo de verificacion', // Spanish
  'code de verification', // French
  'bestätigungscode', // German
  '验证码', // Chinese
  '確認コード', // Japanese
];

/**
 * Extract code from text using pattern matching
 */
export function extractCode(text: string, preferredPattern?: string): MatchResult {
  // Normalize text
  const normalizedText = text.replace(/\s+/g, ' ').trim();

  // Try patterns in order of specificity
  const patternsToTry = preferredPattern
    ? [CODE_PATTERNS.find((p) => p.name === preferredPattern)!, ...CODE_PATTERNS]
    : CODE_PATTERNS;

  for (const pattern of patternsToTry) {
    if (!pattern) continue;

    const match = normalizedText.match(pattern.regex);

    if (match) {
      const code = match[0];
      const start = match.index!;
      const end = start + code.length;

      // Get surrounding context (50 chars before and after)
      const contextStart = Math.max(0, start - 50);
      const contextEnd = Math.min(normalizedText.length, end + 50);
      const context = normalizedText.substring(contextStart, contextEnd);

      // Check if code appears near contextual keywords
      const hasContext = CONTEXT_KEYWORDS.some((keyword) =>
        context.toLowerCase().includes(keyword.toLowerCase())
      );

      // Determine confidence
      let confidence: 'high' | 'medium' | 'low' = 'medium';

      if (hasContext) {
        confidence = 'high';
      } else if (pattern.name.includes('numeric-6') || pattern.name.includes('numeric-4')) {
        confidence = 'medium';
      } else {
        confidence = 'low';
      }

      return {
        matched: true,
        code: normalizeCode(code),
        pattern: pattern.name,
        confidence,
        position: { start, end },
        context,
      };
    }
  }

  return {
    matched: false,
    code: null,
    pattern: null,
    confidence: 'low',
  };
}

/**
 * Extract multiple codes from text (for edge cases with multiple codes)
 */
export function extractAllCodes(text: string): MatchResult[] {
  const results: MatchResult[] = [];
  const seen = new Set<string>();

  for (const pattern of CODE_PATTERNS) {
    const matches = text.matchAll(new RegExp(pattern.regex, 'g'));

    for (const match of matches) {
      const code = normalizeCode(match[0]);

      // Avoid duplicates
      if (seen.has(code)) continue;
      seen.add(code);

      const start = match.index!;
      const end = start + match[0].length;

      const contextStart = Math.max(0, start - 50);
      const contextEnd = Math.min(text.length, end + 50);
      const context = text.substring(contextStart, contextEnd);

      const hasContext = CONTEXT_KEYWORDS.some((keyword) =>
        context.toLowerCase().includes(keyword.toLowerCase())
      );

      results.push({
        matched: true,
        code,
        pattern: pattern.name,
        confidence: hasContext ? 'high' : 'medium',
        position: { start, end },
        context,
      });
    }
  }

  return results;
}

/**
 * Normalize code by removing formatting (dashes, spaces)
 */
export function normalizeCode(code: string): string {
  return code.replace(/[-\s]/g, '');
}

/**
 * Validate extracted code against expected code
 */
export function validateExtraction(
  text: string,
  expectedCode: string,
  expectedPattern?: string
): ValidationResult {
  const result = extractCode(text, expectedPattern);

  const success = result.matched && result.code === normalizeCode(expectedCode);

  return {
    success,
    expected: normalizeCode(expectedCode),
    actual: result.code,
    pattern: result.pattern,
    confidence: result.confidence,
    message: success
      ? `Successfully extracted code: ${result.code}`
      : `Failed to extract expected code. Expected: ${expectedCode}, Got: ${result.code || 'null'}`,
  };
}

/**
 * Test pattern matching accuracy across multiple samples
 */
export function testPatternAccuracy(
  samples: Array<{ text: string; expectedCode: string; expectedPattern?: string }>
): {
  total: number;
  passed: number;
  failed: number;
  accuracy: number;
  failures: ValidationResult[];
} {
  const results = samples.map((sample) =>
    validateExtraction(sample.text, sample.expectedCode, sample.expectedPattern)
  );

  const passed = results.filter((r) => r.success).length;
  const failed = results.length - passed;
  const failures = results.filter((r) => !r.success);

  return {
    total: results.length,
    passed,
    failed,
    accuracy: (passed / results.length) * 100,
    failures,
  };
}

/**
 * Check if a code matches a specific pattern
 */
export function matchesPattern(code: string, patternName: string): boolean {
  const pattern = CODE_PATTERNS.find((p) => p.name === patternName);

  if (!pattern) {
    throw new Error(`Unknown pattern: ${patternName}`);
  }

  return pattern.regex.test(code);
}

/**
 * Detect pattern type from a code
 */
export function detectPattern(code: string): string | null {
  for (const pattern of CODE_PATTERNS) {
    if (pattern.regex.test(code)) {
      return pattern.name;
    }
  }

  return null;
}

/**
 * Generate test cases for a pattern
 */
export function generateTestCases(patternName: string, count: number = 10): string[] {
  const pattern = CODE_PATTERNS.find((p) => p.name === patternName);

  if (!pattern) {
    throw new Error(`Unknown pattern: ${patternName}`);
  }

  const testCases: string[] = [];

  // Use examples first
  testCases.push(...pattern.examples.slice(0, Math.min(count, pattern.examples.length)));

  // Generate random codes if needed
  while (testCases.length < count) {
    const code = generateRandomCode(patternName);
    if (code && !testCases.includes(code)) {
      testCases.push(code);
    }
  }

  return testCases;
}

/**
 * Generate a random code matching a pattern
 */
function generateRandomCode(patternName: string): string | null {
  const digits = '0123456789';
  const alphanumeric = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  switch (patternName) {
    case 'numeric-4':
      return Array.from({ length: 4 }, () => digits[Math.floor(Math.random() * digits.length)]).join('');

    case 'numeric-6':
      return Array.from({ length: 6 }, () => digits[Math.floor(Math.random() * digits.length)]).join('');

    case 'numeric-8':
      return Array.from({ length: 8 }, () => digits[Math.floor(Math.random() * digits.length)]).join('');

    case 'alphanumeric-8':
      return Array.from({ length: 8 }, () => alphanumeric[Math.floor(Math.random() * alphanumeric.length)]).join(
        ''
      );

    case 'alphanumeric-10':
      return Array.from({ length: 10 }, () => alphanumeric[Math.floor(Math.random() * alphanumeric.length)]).join(
        ''
      );

    case 'formatted-6-digit': {
      const part1 = Array.from({ length: 3 }, () => digits[Math.floor(Math.random() * digits.length)]).join('');
      const part2 = Array.from({ length: 3 }, () => digits[Math.floor(Math.random() * digits.length)]).join('');
      return `${part1}-${part2}`;
    }

    case 'formatted-8-digit': {
      const part1 = Array.from({ length: 4 }, () => digits[Math.floor(Math.random() * digits.length)]).join('');
      const part2 = Array.from({ length: 4 }, () => digits[Math.floor(Math.random() * digits.length)]).join('');
      return `${part1}-${part2}`;
    }

    default:
      return null;
  }
}

/**
 * Validate that a pattern is correctly defined
 */
export function validatePattern(pattern: CodePattern): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!pattern.name) {
    errors.push('Pattern must have a name');
  }

  if (!pattern.regex) {
    errors.push('Pattern must have a regex');
  }

  if (!pattern.description) {
    errors.push('Pattern must have a description');
  }

  if (!pattern.examples || pattern.examples.length === 0) {
    errors.push('Pattern must have at least one example');
  }

  // Test that examples match the regex
  if (pattern.regex && pattern.examples) {
    pattern.examples.forEach((example, index) => {
      if (!pattern.regex.test(example)) {
        errors.push(`Example ${index + 1} "${example}" does not match pattern regex`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Export utility object
 */
export const MatcherValidator = {
  CODE_PATTERNS,
  extractCode,
  extractAllCodes,
  normalizeCode,
  validateExtraction,
  testPatternAccuracy,
  matchesPattern,
  detectPattern,
  generateTestCases,
  validatePattern,
};

export default MatcherValidator;
