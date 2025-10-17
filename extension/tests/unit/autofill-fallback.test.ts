/**
 * Unit tests for Autofill Fallback Feature
 * Tests the fallback mechanism when autofill fails (field removed, hidden, etc.)
 */

import { beforeEach, describe, expect, it, vi, afterEach } from "vitest"
import { Window } from "happy-dom"
import { WatchSession } from "../../src/contents/watch-session"
import type { DetectionResult } from "../../src/lib/types"

interface MockPort {
  name: string
  postMessage: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
  onMessage: {
    addListener: (fn: (msg: unknown) => void) => void
    removeListener: (fn: (msg: unknown) => void) => void
  }
  onDisconnect: {
    addListener: (fn: () => void) => void
    removeListener: (fn: () => void) => void
  }
}

describe("Autofill Fallback", () => {
  let windowRef: Window
  let documentRef: Document
  let port: MockPort
  const messageListeners: Array<(msg: unknown) => void> = []
  const disconnectListeners: Array<() => void> = []

  beforeEach(() => {
    windowRef = new Window()
    documentRef = windowRef.document
    global.window = windowRef as unknown as Window & typeof globalThis
    global.document = documentRef

    // Mock clipboard API
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      writable: true,
      configurable: true,
    })

    messageListeners.length = 0
    disconnectListeners.length = 0

    port = {
      name: "watch-session",
      postMessage: vi.fn(),
      disconnect: vi.fn(),
      onMessage: {
        addListener: (fn) => {
          messageListeners.push(fn)
        },
        removeListener: (fn) => {
          const index = messageListeners.indexOf(fn)
          if (index >= 0) {
            messageListeners.splice(index, 1)
          }
        },
      },
      onDisconnect: {
        addListener: (fn) => {
          disconnectListeners.push(fn)
        },
        removeListener: (fn) => {
          const index = disconnectListeners.indexOf(fn)
          if (index >= 0) {
            disconnectListeners.splice(index, 1)
          }
        },
      },
    }

    ;(chrome.runtime.connect as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      port
    )
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  const createDetectionResult = (field: HTMLInputElement): DetectionResult => ({
    field,
    confidence: 95,
    tier: 1,
    signals: ["test"],
    executionTime: 0.5,
  })

  const emitPortMessage = (msg: unknown) => {
    messageListeners.forEach((listener) => listener(msg))
  }

  describe("Successful autofill", () => {
    it("should autofill when field is available and not call fallback", async () => {
      const field = documentRef.createElement("input")
      field.type = "text"
      documentRef.body.appendChild(field)

      const detection = createDetectionResult(field)
      const onCodeFound = vi.fn()
      const onAutofill = vi.fn().mockResolvedValue(true) // Autofill succeeds

      const session = new WatchSession(field, detection, {
        onCodeFound,
        onAutofill,
      })
      session.start()

      emitPortMessage({
        type: "SESSION_STARTED",
        session: { id: "session-1" },
      })

      emitPortMessage({
        type: "SESSION_CODE_FOUND",
        code: { code: "123456", source: "Test", timestamp: Date.now() },
      })

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(onCodeFound).toHaveBeenCalledWith(
        expect.objectContaining({ code: "123456" })
      )
      expect(onAutofill).toHaveBeenCalledWith(
        expect.objectContaining({ code: "123456" }),
        field
      )

      // Clipboard should NOT be called when autofill succeeds
      expect(navigator.clipboard.writeText).not.toHaveBeenCalled()

      // No notification should be added
      const notification = documentRef.querySelector(".inboxkey-notification")
      expect(notification).toBeNull()
    })
  })

  describe("Autofill failure fallback", () => {
    it("should copy to clipboard when autofill fails", async () => {
      const field = documentRef.createElement("input")
      field.type = "text"
      documentRef.body.appendChild(field)

      const detection = createDetectionResult(field)
      const onCodeFound = vi.fn()
      const onAutofill = vi.fn().mockResolvedValue(false) // Autofill fails

      const session = new WatchSession(field, detection, {
        onCodeFound,
        onAutofill,
      })
      session.start()

      emitPortMessage({
        type: "SESSION_STARTED",
        session: { id: "session-1" },
      })

      emitPortMessage({
        type: "SESSION_CODE_FOUND",
        code: { code: "123456", source: "Test", timestamp: Date.now() },
      })

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(onAutofill).toHaveBeenCalled()
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("123456")
    })

    it("should show notification when autofill fails", async () => {
      const field = documentRef.createElement("input")
      field.type = "text"
      documentRef.body.appendChild(field)

      const detection = createDetectionResult(field)
      const onCodeFound = vi.fn()
      const onAutofill = vi.fn().mockResolvedValue(false) // Autofill fails

      const session = new WatchSession(field, detection, {
        onCodeFound,
        onAutofill,
      })
      session.start()

      emitPortMessage({
        type: "SESSION_STARTED",
        session: { id: "session-1" },
      })

      emitPortMessage({
        type: "SESSION_CODE_FOUND",
        code: { code: "123456", source: "Test", timestamp: Date.now() },
      })

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 10))

      // Check notification was added
      const notification = documentRef.querySelector(".inboxkey-notification")
      expect(notification).toBeTruthy()
      expect(notification?.textContent).toContain("123456")
      expect(notification?.textContent).toContain("copied to clipboard")
    })

    it("should handle clipboard API failure gracefully", async () => {
      const field = documentRef.createElement("input")
      field.type = "text"
      documentRef.body.appendChild(field)

      const detection = createDetectionResult(field)
      const onCodeFound = vi.fn()
      const onAutofill = vi.fn().mockResolvedValue(false) // Autofill fails

      // Mock clipboard failure
      vi.mocked(navigator.clipboard.writeText).mockRejectedValue(
        new Error("Permission denied")
      )

      const session = new WatchSession(field, detection, {
        onCodeFound,
        onAutofill,
      })
      session.start()

      emitPortMessage({
        type: "SESSION_STARTED",
        session: { id: "session-1" },
      })

      emitPortMessage({
        type: "SESSION_CODE_FOUND",
        code: { code: "123456", source: "Test", timestamp: Date.now() },
      })

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 10))

      // Should still show notification even if clipboard fails
      const notification = documentRef.querySelector(".inboxkey-notification")
      expect(notification).toBeTruthy()
      expect(notification?.textContent).toContain("123456")
      expect(notification?.textContent).toContain("copy this code manually")
    })

    it("should use info notification type when clipboard fails", async () => {
      const field = documentRef.createElement("input")
      field.type = "text"
      documentRef.body.appendChild(field)

      const detection = createDetectionResult(field)
      const onCodeFound = vi.fn()
      const onAutofill = vi.fn().mockResolvedValue(false)

      vi.mocked(navigator.clipboard.writeText).mockRejectedValue(
        new Error("Permission denied")
      )

      const session = new WatchSession(field, detection, {
        onCodeFound,
        onAutofill,
      })
      session.start()

      emitPortMessage({
        type: "SESSION_STARTED",
        session: { id: "session-1" },
      })

      emitPortMessage({
        type: "SESSION_CODE_FOUND",
        code: { code: "123456", source: "Test", timestamp: Date.now() },
      })

      await new Promise((resolve) => setTimeout(resolve, 10))

      const notification = documentRef.querySelector(".inboxkey-notification")
      expect(notification?.classList.contains("inboxkey-notification--info")).toBe(
        true
      )
    })

    it("should handle autofill throwing an error", async () => {
      const field = documentRef.createElement("input")
      field.type = "text"
      documentRef.body.appendChild(field)

      const detection = createDetectionResult(field)
      const onCodeFound = vi.fn()
      const onAutofill = vi.fn().mockRejectedValue(new Error("Autofill error"))

      const session = new WatchSession(field, detection, {
        onCodeFound,
        onAutofill,
      })
      session.start()

      emitPortMessage({
        type: "SESSION_STARTED",
        session: { id: "session-1" },
      })

      emitPortMessage({
        type: "SESSION_CODE_FOUND",
        code: { code: "123456", source: "Test", timestamp: Date.now() },
      })

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 10))

      // Should trigger fallback
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("123456")

      const notification = documentRef.querySelector(".inboxkey-notification")
      expect(notification).toBeTruthy()
    })
  })

  describe("Legacy path (no onAutofill callback)", () => {
    it("should not trigger fallback when onAutofill is not provided", async () => {
      const field = documentRef.createElement("input")
      field.type = "text"
      documentRef.body.appendChild(field)

      const detection = createDetectionResult(field)
      const onCodeFound = vi.fn()

      const session = new WatchSession(field, detection, {
        onCodeFound,
        // No onAutofill callback
      })
      session.start()

      emitPortMessage({
        type: "SESSION_STARTED",
        session: { id: "session-1" },
      })

      emitPortMessage({
        type: "SESSION_CODE_FOUND",
        code: { code: "123456", source: "Test", timestamp: Date.now() },
      })

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(onCodeFound).toHaveBeenCalledWith(
        expect.objectContaining({ code: "123456" })
      )

      // Clipboard should NOT be called in legacy path
      expect(navigator.clipboard.writeText).not.toHaveBeenCalled()

      // No notification should be added
      const notification = documentRef.querySelector(".inboxkey-notification")
      expect(notification).toBeNull()
    })
  })

  describe("XSS Protection", () => {
    it("should escape HTML in code value", async () => {
      const field = documentRef.createElement("input")
      field.type = "text"
      documentRef.body.appendChild(field)

      const detection = createDetectionResult(field)
      const onCodeFound = vi.fn()
      const onAutofill = vi.fn().mockResolvedValue(false)

      const session = new WatchSession(field, detection, {
        onCodeFound,
        onAutofill,
      })
      session.start()

      emitPortMessage({
        type: "SESSION_STARTED",
        session: { id: "session-1" },
      })

      emitPortMessage({
        type: "SESSION_CODE_FOUND",
        code: {
          code: '<script>alert("xss")</script>',
          source: "Test",
          timestamp: Date.now(),
        },
      })

      await new Promise((resolve) => setTimeout(resolve, 10))

      const notification = documentRef.querySelector(".inboxkey-notification")
      // Using textContent prevents XSS - the script won't be in innerHTML as executable
      const titleEl = notification?.querySelector(".inboxkey-notification-title")
      // The title element should not contain executable script tags
      const scriptTags = titleEl?.querySelectorAll("script")
      expect(scriptTags?.length || 0).toBe(0)
      // textContent should show the original text (safe)
      expect(notification?.textContent).toContain('<script>alert("xss")</script>')
    })
  })

  describe("Notification styling", () => {
    it("should inject styles only once", async () => {
      const field1 = documentRef.createElement("input")
      const field2 = documentRef.createElement("input")
      documentRef.body.appendChild(field1)
      documentRef.body.appendChild(field2)

      const detection1 = createDetectionResult(field1)
      const detection2 = createDetectionResult(field2)
      const onAutofill = vi.fn().mockResolvedValue(false)

      // First session
      const session1 = new WatchSession(field1, detection1, {
        onCodeFound: vi.fn(),
        onAutofill,
      })
      session1.start()

      emitPortMessage({
        type: "SESSION_STARTED",
        session: { id: "session-1" },
      })

      emitPortMessage({
        type: "SESSION_CODE_FOUND",
        code: { code: "111111", source: "Test", timestamp: Date.now() },
      })

      await new Promise((resolve) => setTimeout(resolve, 10))

      const stylesBefore = documentRef.querySelectorAll(
        "#inboxkey-notification-styles"
      ).length

      // Second session
      const session2 = new WatchSession(field2, detection2, {
        onCodeFound: vi.fn(),
        onAutofill,
      })
      session2.start()

      messageListeners.length = 0 // Clear listeners
      messageListeners.push((msg: unknown) => {
        if (
          typeof msg === "object" &&
          msg !== null &&
          (msg as { type?: string }).type === "SESSION_CODE_FOUND"
        ) {
          // Handle second session
        }
      })

      emitPortMessage({
        type: "SESSION_STARTED",
        session: { id: "session-2" },
      })

      emitPortMessage({
        type: "SESSION_CODE_FOUND",
        code: { code: "222222", source: "Test", timestamp: Date.now() },
      })

      await new Promise((resolve) => setTimeout(resolve, 10))

      const stylesAfter = documentRef.querySelectorAll(
        "#inboxkey-notification-styles"
      ).length

      // Should still be only one style element
      expect(stylesBefore).toBe(1)
      expect(stylesAfter).toBe(1)
    })

    it("should use high z-index for notification", async () => {
      const field = documentRef.createElement("input")
      documentRef.body.appendChild(field)

      const detection = createDetectionResult(field)
      const onAutofill = vi.fn().mockResolvedValue(false)

      const session = new WatchSession(field, detection, {
        onCodeFound: vi.fn(),
        onAutofill,
      })
      session.start()

      emitPortMessage({
        type: "SESSION_STARTED",
        session: { id: "session-1" },
      })

      emitPortMessage({
        type: "SESSION_CODE_FOUND",
        code: { code: "123456", source: "Test", timestamp: Date.now() },
      })

      await new Promise((resolve) => setTimeout(resolve, 10))

      const styles = documentRef.getElementById("inboxkey-notification-styles")
      expect(styles?.textContent).toContain("z-index: 2147483647")
    })

    it("should use success notification type for successful clipboard copy", async () => {
      const field = documentRef.createElement("input")
      documentRef.body.appendChild(field)

      const detection = createDetectionResult(field)
      const onAutofill = vi.fn().mockResolvedValue(false)

      const session = new WatchSession(field, detection, {
        onCodeFound: vi.fn(),
        onAutofill,
      })
      session.start()

      emitPortMessage({
        type: "SESSION_STARTED",
        session: { id: "session-1" },
      })

      emitPortMessage({
        type: "SESSION_CODE_FOUND",
        code: { code: "123456", source: "Test", timestamp: Date.now() },
      })

      await new Promise((resolve) => setTimeout(resolve, 10))

      const notification = documentRef.querySelector(".inboxkey-notification")
      expect(
        notification?.classList.contains("inboxkey-notification--success")
      ).toBe(true)
    })
  })

  describe("Notification auto-dismiss", () => {
    it("should auto-dismiss notification after 5 seconds", async () => {
      vi.useFakeTimers()

      const field = documentRef.createElement("input")
      documentRef.body.appendChild(field)

      const detection = createDetectionResult(field)
      const onAutofill = vi.fn().mockResolvedValue(false)

      const session = new WatchSession(field, detection, {
        onCodeFound: vi.fn(),
        onAutofill,
      })
      session.start()

      emitPortMessage({
        type: "SESSION_STARTED",
        session: { id: "session-1" },
      })

      emitPortMessage({
        type: "SESSION_CODE_FOUND",
        code: { code: "123456", source: "Test", timestamp: Date.now() },
      })

      await vi.advanceTimersByTimeAsync(10)

      expect(documentRef.querySelector(".inboxkey-notification")).toBeTruthy()

      // Fast-forward 5 seconds + animation time
      await vi.advanceTimersByTimeAsync(5300)

      expect(documentRef.querySelector(".inboxkey-notification")).toBeFalsy()

      vi.useRealTimers()
    })

    it("should auto-dismiss info notification after 7 seconds when clipboard fails", async () => {
      vi.useFakeTimers()

      const field = documentRef.createElement("input")
      documentRef.body.appendChild(field)

      const detection = createDetectionResult(field)
      const onAutofill = vi.fn().mockResolvedValue(false)

      vi.mocked(navigator.clipboard.writeText).mockRejectedValue(
        new Error("Permission denied")
      )

      const session = new WatchSession(field, detection, {
        onCodeFound: vi.fn(),
        onAutofill,
      })
      session.start()

      emitPortMessage({
        type: "SESSION_STARTED",
        session: { id: "session-1" },
      })

      emitPortMessage({
        type: "SESSION_CODE_FOUND",
        code: { code: "123456", source: "Test", timestamp: Date.now() },
      })

      await vi.advanceTimersByTimeAsync(10)

      expect(documentRef.querySelector(".inboxkey-notification")).toBeTruthy()

      // Fast-forward 7 seconds + animation time
      await vi.advanceTimersByTimeAsync(7300)

      expect(documentRef.querySelector(".inboxkey-notification")).toBeFalsy()

      vi.useRealTimers()
    })
  })

  describe("Multiple codes scenario", () => {
    it("should handle multiple autofill failures in sequence", async () => {
      const field = documentRef.createElement("input")
      documentRef.body.appendChild(field)

      const detection = createDetectionResult(field)
      const onAutofill = vi.fn().mockResolvedValue(false)

      // First code
      const session1 = new WatchSession(field, detection, {
        onCodeFound: vi.fn(),
        onAutofill,
      })
      session1.start()

      emitPortMessage({
        type: "SESSION_STARTED",
        session: { id: "session-1" },
      })

      emitPortMessage({
        type: "SESSION_CODE_FOUND",
        code: { code: "111111", source: "Test", timestamp: Date.now() },
      })

      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("111111")

      // Clear mock
      vi.mocked(navigator.clipboard.writeText).mockClear()

      // Second code
      messageListeners.length = 0

      const session2 = new WatchSession(field, detection, {
        onCodeFound: vi.fn(),
        onAutofill,
      })

      session2.start()

      messageListeners.forEach((listener) => {
        listener({
          type: "SESSION_STARTED",
          session: { id: "session-2" },
        })

        listener({
          type: "SESSION_CODE_FOUND",
          code: { code: "222222", source: "Test", timestamp: Date.now() },
        })
      })

      await new Promise((resolve) => setTimeout(resolve, 10))

      // Both clipboard copies should have been called
      const allCalls = vi.mocked(navigator.clipboard.writeText).mock.calls
      expect(allCalls.length).toBeGreaterThanOrEqual(1)
    })
  })
})
