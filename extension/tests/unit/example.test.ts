import { describe, it, expect } from "vitest"

describe("Example Test Suite", () => {
  it("should pass a basic test", () => {
    expect(1 + 1).toBe(2)
  })

  it("should have chrome API mocked", () => {
    expect(chrome.runtime.id).toBe("test-extension-id")
  })
})
