/**
 * Unit tests for Storage Schema Type Guards
 *
 * Tests schema validation and type guards including:
 * - isStoredCode type guard with backward compatibility
 * - Validation of optional fields (senderETLD, receivedAt, domainAffinity)
 * - Edge cases and boundary conditions
 */

import { describe, it, expect } from "vitest"
import {
  isStoredCode,
  isValidTimestamp,
  type StoredCode,
} from "@/lib/storage/schema"

describe("Schema Type Guards", () => {
  // ============================================================================
  // isStoredCode - Backward Compatibility
  // ============================================================================

  describe("isStoredCode - Backward Compatibility", () => {
    it("should accept old format code without new optional fields", () => {
      const oldFormatCode = {
        code: "123456",
        timestamp: Date.now(),
        source: "test@example.com",
        used: false,
      }

      expect(isStoredCode(oldFormatCode)).toBe(true)
    })

    it("should accept new format code with senderETLD", () => {
      const newFormatCode = {
        code: "123456",
        timestamp: Date.now(),
        source: "noreply@example.com",
        used: false,
        senderETLD: "example.com",
      }

      expect(isStoredCode(newFormatCode)).toBe(true)
    })

    it("should accept new format code with receivedAt", () => {
      const newFormatCode = {
        code: "123456",
        timestamp: Date.now(),
        source: "test@example.com",
        used: false,
        receivedAt: Date.now() - 1000,
      }

      expect(isStoredCode(newFormatCode)).toBe(true)
    })

    it("should accept new format code with domainAffinity", () => {
      const newFormatCode = {
        code: "123456",
        timestamp: Date.now(),
        source: "test@example.com",
        used: false,
        domainAffinity: 0.95,
      }

      expect(isStoredCode(newFormatCode)).toBe(true)
    })

    it("should accept new format code with all optional fields", () => {
      const fullFormatCode = {
        code: "123456",
        timestamp: Date.now(),
        source: "noreply@example.com",
        siteMatch: "example.com",
        used: false,
        mailboxId: crypto.randomUUID(),
        senderETLD: "example.com",
        receivedAt: Date.now() - 2000,
        domainAffinity: 0.85,
      }

      expect(isStoredCode(fullFormatCode)).toBe(true)
    })

    it("should reject code with invalid receivedAt timestamp", () => {
      const invalidCode = {
        code: "123456",
        timestamp: Date.now(),
        source: "test@example.com",
        used: false,
        receivedAt: -1, // Invalid timestamp
      }

      expect(isStoredCode(invalidCode)).toBe(false)
    })

    it("should reject code with non-string senderETLD", () => {
      const invalidCode = {
        code: "123456",
        timestamp: Date.now(),
        source: "test@example.com",
        used: false,
        senderETLD: 123, // Should be string
      }

      expect(isStoredCode(invalidCode)).toBe(false)
    })

    it("should reject code with non-number domainAffinity", () => {
      const invalidCode = {
        code: "123456",
        timestamp: Date.now(),
        source: "test@example.com",
        used: false,
        domainAffinity: "0.95", // Should be number
      }

      expect(isStoredCode(invalidCode)).toBe(false)
    })
  })

  // ============================================================================
  // isStoredCode - Required Fields Validation
  // ============================================================================

  describe("isStoredCode - Required Fields", () => {
    it("should reject code with empty code string", () => {
      const invalidCode = {
        code: "",
        timestamp: Date.now(),
        source: "test@example.com",
        used: false,
      }

      expect(isStoredCode(invalidCode)).toBe(false)
    })

    it("should reject code with missing code field", () => {
      const invalidCode = {
        timestamp: Date.now(),
        source: "test@example.com",
        used: false,
      }

      expect(isStoredCode(invalidCode)).toBe(false)
    })

    it("should reject code with missing timestamp", () => {
      const invalidCode = {
        code: "123456",
        source: "test@example.com",
        used: false,
      }

      expect(isStoredCode(invalidCode)).toBe(false)
    })

    it("should reject code with missing source", () => {
      const invalidCode = {
        code: "123456",
        timestamp: Date.now(),
        used: false,
      }

      expect(isStoredCode(invalidCode)).toBe(false)
    })

    it("should reject code with empty source", () => {
      const invalidCode = {
        code: "123456",
        timestamp: Date.now(),
        source: "",
        used: false,
      }

      expect(isStoredCode(invalidCode)).toBe(false)
    })

    it("should reject code with missing used field", () => {
      const invalidCode = {
        code: "123456",
        timestamp: Date.now(),
        source: "test@example.com",
      }

      expect(isStoredCode(invalidCode)).toBe(false)
    })

    it("should reject code with non-boolean used field", () => {
      const invalidCode = {
        code: "123456",
        timestamp: Date.now(),
        source: "test@example.com",
        used: "false",
      }

      expect(isStoredCode(invalidCode)).toBe(false)
    })
  })

  // ============================================================================
  // isStoredCode - Edge Cases
  // ============================================================================

  describe("isStoredCode - Edge Cases", () => {
    it("should reject null", () => {
      expect(isStoredCode(null)).toBe(false)
    })

    it("should reject undefined", () => {
      expect(isStoredCode(undefined)).toBe(false)
    })

    it("should reject primitive values", () => {
      expect(isStoredCode("string")).toBe(false)
      expect(isStoredCode(123)).toBe(false)
      expect(isStoredCode(true)).toBe(false)
    })

    it("should reject arrays", () => {
      const codeArray = [
        {
          code: "123456",
          timestamp: Date.now(),
          source: "test@example.com",
          used: false,
        },
      ]

      expect(isStoredCode(codeArray)).toBe(false)
    })

    it("should handle code with extra unknown fields", () => {
      const codeWithExtraFields = {
        code: "123456",
        timestamp: Date.now(),
        source: "test@example.com",
        used: false,
        unknownField: "should be ignored",
      }

      // Type guard should still return true for valid codes with extra fields
      expect(isStoredCode(codeWithExtraFields)).toBe(true)
    })
  })

  // ============================================================================
  // isValidTimestamp
  // ============================================================================

  describe("isValidTimestamp", () => {
    it("should accept current timestamp", () => {
      expect(isValidTimestamp(Date.now())).toBe(true)
    })

    it("should accept timestamp from 2020", () => {
      const timestamp2020 = new Date("2020-01-01").getTime()
      expect(isValidTimestamp(timestamp2020)).toBe(true)
    })

    it("should accept timestamp up to 2100", () => {
      const timestamp2099 = new Date("2099-12-31").getTime()
      expect(isValidTimestamp(timestamp2099)).toBe(true)
    })

    it("should accept 0 as special value", () => {
      expect(isValidTimestamp(0)).toBe(true)
    })

    it("should reject negative timestamps", () => {
      expect(isValidTimestamp(-1)).toBe(false)
    })

    it("should reject timestamp before 2020", () => {
      const timestamp2019 = new Date("2019-12-31").getTime()
      expect(isValidTimestamp(timestamp2019)).toBe(false)
    })

    it("should reject timestamp after 2100", () => {
      const timestamp2101 = new Date("2101-01-01").getTime()
      expect(isValidTimestamp(timestamp2101)).toBe(false)
    })

    it("should reject very old timestamps", () => {
      expect(isValidTimestamp(1000)).toBe(false)
    })
  })

  // ============================================================================
  // Type Safety Verification
  // ============================================================================

  describe("Type Safety", () => {
    it("should allow TypeScript to infer StoredCode type after validation", () => {
      const unknownData: unknown = {
        code: "123456",
        timestamp: Date.now(),
        source: "test@example.com",
        used: false,
        senderETLD: "example.com",
      }

      if (isStoredCode(unknownData)) {
        // TypeScript should now know this is StoredCode
        const code: StoredCode = unknownData
        expect(code.code).toBe("123456")
        expect(code.senderETLD).toBe("example.com")
      }
    })

    it("should handle optional fields correctly in type narrowing", () => {
      const oldFormatData: unknown = {
        code: "123456",
        timestamp: Date.now(),
        source: "test@example.com",
        used: false,
      }

      if (isStoredCode(oldFormatData)) {
        const code: StoredCode = oldFormatData
        expect(code.senderETLD).toBeUndefined()
        expect(code.receivedAt).toBeUndefined()
        expect(code.domainAffinity).toBeUndefined()
      }
    })
  })
})
