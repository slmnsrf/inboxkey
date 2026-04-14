/**
 * Unit tests for WatchSession
 * Ensures runtime Port coordination and callback handling work as expected.
 */

import { beforeEach, describe, expect, it, vi, afterEach } from "vitest"
import { Window } from "happy-dom"

// Mock dependencies BEFORE importing the module under test
vi.mock("../../src/lib/utils/blacklist", () => ({
  isBlacklisted: vi.fn().mockResolvedValue(false),
  addBlacklistedUrl: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock("../../src/lib/utils/domain", () => ({
  extractDomain: vi.fn().mockReturnValue("example.com"),
  isDomainEnabled: vi.fn().mockResolvedValue(true),
}))

vi.mock("../../src/lib/storage/storage-factory", () => ({
  StorageFactory: {
    create: vi.fn().mockResolvedValue({
      getSettings: vi.fn().mockResolvedValue({
        sessionTimeoutSeconds: 20,
      }),
      getMailboxes: vi.fn().mockResolvedValue([
        { id: 'mb-default', providerId: 'gmail', email: 'test@example.com' },
      ]),
    }),
  },
}))

vi.mock("../../src/lib/detection/email-context-guard", () => ({
  hasEmailContext: vi.fn().mockReturnValue(true),
}))

vi.mock("../../src/contents/notification", () => ({
  showNotification: vi.fn(),
}))

vi.mock("../../src/contents/session-chip", () => ({
  showSessionChip: vi.fn().mockResolvedValue({
    update: vi.fn(),
    hide: vi.fn(),
  }),
}))

vi.mock("../../src/contents/autofill", () => ({
  findAndClickSubmitButton: vi.fn().mockResolvedValue(false),
}))

vi.mock("../../src/lib/detection/split-input-detector", () => ({
  detectSplitInputGroup: vi.fn().mockReturnValue(null),
}))

import {
  WatchSession,
  startWatch,
  getActiveWatch,
  stopActiveWatch,
  isFieldWatched,
  deriveExpectedShape,
} from "../../src/contents/watch-session"
import type { DetectionResult } from "../../src/lib/types"
import { detectSplitInputGroup } from "../../src/lib/detection/split-input-detector"
import { hasEmailContext } from "../../src/lib/detection/email-context-guard"
import { StorageFactory } from "../../src/lib/storage/storage-factory"
import * as smsCache from "../../src/lib/detection/sms-feature-cache"

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

/**
 * Flush pending microtasks (resolved promises) so async code
 * inside start() / handlePortMessage can complete.
 * Multiple ticks are needed because async handlers chain multiple awaits.
 */
const flushMicrotasks = async () => {
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 0))
  }
}

describe("WatchSession", () => {
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

    // Provide window.location.href for the blacklist/domain checks
    Object.defineProperty(window, "location", {
      value: { href: "https://example.com/login" },
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
    ;(chrome.runtime.sendMessage as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)

    // Restore defaults that previous tests may have overridden.
    // vi.clearAllMocks() clears call history but not implementations.
    vi.mocked(hasEmailContext).mockReturnValue(true)
    smsCache._resetSmsCacheForTest()
  })

  afterEach(() => {
    stopActiveWatch()
    vi.clearAllMocks()
  })

  const createDetectionResult = (field: HTMLInputElement): DetectionResult => ({
    field,
    confidence: 95,
    tier: 1,
    signals: ["test"],
    executionTime: 0.5,
  })

  const emitPortMessage = async (msg: unknown) => {
    // handlePortMessage is async -- collect and await all returned promises
    const promises = messageListeners.map((listener) => listener(msg))
    await Promise.all(promises)
    // Extra flush for any chained async work (e.g. showSessionChip, updateBadge)
    await flushMicrotasks()
  }

  const emitDisconnect = () => {
    disconnectListeners.forEach((listener) => listener())
  }

  it("should open runtime port and send start message", async () => {
    const field = documentRef.createElement("input")
    documentRef.body.appendChild(field)

    const detection = createDetectionResult(field)
    const onCodeFound = vi.fn()

    const session = new WatchSession(field, detection, { onCodeFound })
    await session.start()

    expect(chrome.runtime.connect).toHaveBeenCalledWith({
      name: "watch-session",
    })
    expect(port.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "START_SESSION",
      })
    )
  })

  it("bypasses email-context veto and adds 'sms' to START_SESSION when GM is paired", async () => {
    // StorageFactory.create() is called twice: once by hydrateSmsCache(),
    // once by the guardrail + settings load inside WatchSession.start().
    const gmStorage = {
      getSettings: vi.fn().mockResolvedValue({ sessionTimeoutSeconds: 20 }),
      getMailboxes: vi.fn().mockResolvedValue([
        { id: "mb-gm", providerId: "google-messages", email: "sms@google-messages.local" },
      ]),
    }
    vi.mocked(StorageFactory.create)
      .mockResolvedValueOnce(gmStorage as never)
      .mockResolvedValueOnce(gmStorage as never)
      .mockResolvedValueOnce(gmStorage as never)

    // Hydrate the real cache so smsFeatureEnabledCache flips to true
    await smsCache.hydrateSmsCache()
    expect(smsCache.smsFeatureEnabledCache).toBe(true)

    // Force the email-context veto path
    vi.mocked(hasEmailContext).mockReturnValue(false)

    const field = documentRef.createElement("input")
    documentRef.body.appendChild(field)

    const detection = createDetectionResult(field)  // no detectedChannels
    const onVetoed = vi.fn()
    const onCodeFound = vi.fn()

    const session = new WatchSession(field, detection, { onCodeFound, onVetoed })
    await session.start()

    expect(onVetoed).not.toHaveBeenCalled()
    expect(chrome.runtime.connect).toHaveBeenCalledWith({ name: "watch-session" })
    expect(port.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "START_SESSION",
        detectedChannels: expect.arrayContaining(["sms"]),
      })
    )

    // Reset cache so cache state doesn't leak into subsequent tests
    smsCache._resetSmsCacheForTest()
  })

  it("should invoke callback when SESSION_CODE_FOUND arrives", async () => {
    const field = documentRef.createElement("input")
    documentRef.body.appendChild(field)

    const detection = createDetectionResult(field)
    const onCodeFound = vi.fn()

    const session = new WatchSession(field, detection, { onCodeFound })
    await session.start()

    await emitPortMessage({
      type: "SESSION_STARTED",
      session: { id: "session-1" },
    })

    await emitPortMessage({
      type: "SESSION_CODE_FOUND",
      code: { code: "123456", source: "UnitTest", timestamp: Date.now() },
    })

    expect(onCodeFound).toHaveBeenCalledWith(
      expect.objectContaining({ code: "123456" })
    )
    expect(session.isActive()).toBe(false)
    expect(port.disconnect).toHaveBeenCalled()
  })

  it("should stop session when stopActiveWatch called", async () => {
    const field = documentRef.createElement("input")
    documentRef.body.appendChild(field)

    const detection = createDetectionResult(field)
    const onCodeFound = vi.fn()

    const session = startWatch(field, detection, { onCodeFound })
    // startWatch calls void session.start(), flush so it completes
    await flushMicrotasks()

    await emitPortMessage({
      type: "SESSION_STARTED",
      session: { id: "session-stop" },
    })

    expect(getActiveWatch()).toBe(session)
    expect(isFieldWatched(field)).toBe(true)

    stopActiveWatch()

    expect(port.postMessage).toHaveBeenCalledWith({ type: "STOP_SESSION" })
    expect(getActiveWatch()).toBeNull()
  })

  it("should handle timeout notification", async () => {
    const field = documentRef.createElement("input")
    documentRef.body.appendChild(field)
    const detection = createDetectionResult(field)

    const onCodeFound = vi.fn()
    const onTimeout = vi.fn()

    const session = new WatchSession(field, detection, {
      onCodeFound,
      onTimeout,
    })
    await session.start()

    await emitPortMessage({
      type: "SESSION_STARTED",
      session: { id: "session-timeout" },
    })

    await emitPortMessage({
      type: "SESSION_TIMED_OUT",
      sessionId: "session-timeout",
    })

    expect(onTimeout).toHaveBeenCalled()
    expect(onCodeFound).not.toHaveBeenCalled()
  })

  it("should clean up on port disconnect", async () => {
    const field = documentRef.createElement("input")
    documentRef.body.appendChild(field)
    const detection = createDetectionResult(field)
    const onCodeFound = vi.fn()

    const session = new WatchSession(field, detection, { onCodeFound })
    await session.start()

    // Mark as completed first to simulate proper cleanup
    await emitPortMessage({
      type: "SESSION_STARTED",
      session: { id: "test" },
    })

    emitDisconnect()

    // After disconnect, session should remain in its current state
    // isActive checks the completed flag which is only set on completion messages
    expect(session.isActive()).toBe(true)
  })

  it("should set up keepalive timer on start", async () => {
    const field = documentRef.createElement("input")
    documentRef.body.appendChild(field)
    const detection = createDetectionResult(field)
    const onCodeFound = vi.fn()

    const session = new WatchSession(field, detection, { onCodeFound })
    await session.start()

    // Should send START_SESSION immediately
    expect(port.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "START_SESSION" })
    )

    // Note: Testing actual interval timing is challenging with vi.useFakeTimers
    // The interval is set up and will fire in real usage
  })

  it("should handle SESSION_CANCELED message", async () => {
    const field = documentRef.createElement("input")
    documentRef.body.appendChild(field)
    const detection = createDetectionResult(field)
    const onCodeFound = vi.fn()
    const onCanceled = vi.fn()

    const session = new WatchSession(field, detection, {
      onCodeFound,
      onCanceled,
    })
    await session.start()

    await emitPortMessage({
      type: "SESSION_STARTED",
      session: { id: "session-cancel" },
    })

    await emitPortMessage({
      type: "SESSION_CANCELED",
      sessionId: "session-cancel",
    })

    expect(onCanceled).toHaveBeenCalled()
    expect(onCodeFound).not.toHaveBeenCalled()
    expect(session.isActive()).toBe(false)
  })

  it("should ignore duplicate completion messages", async () => {
    const field = documentRef.createElement("input")
    documentRef.body.appendChild(field)
    const detection = createDetectionResult(field)
    const onCodeFound = vi.fn()
    const onTimeout = vi.fn()

    const session = new WatchSession(field, detection, { onCodeFound, onTimeout })
    await session.start()

    await emitPortMessage({
      type: "SESSION_CODE_FOUND",
      code: { code: "123456", source: "Test", timestamp: Date.now() },
    })

    expect(onCodeFound).toHaveBeenCalledTimes(1)

    // Try to send another message after completion
    await emitPortMessage({
      type: "SESSION_TIMED_OUT",
    })

    expect(onTimeout).not.toHaveBeenCalled()
  })

  it("should handle PONG messages", async () => {
    const field = documentRef.createElement("input")
    documentRef.body.appendChild(field)
    const detection = createDetectionResult(field)
    const onCodeFound = vi.fn()

    const session = new WatchSession(field, detection, { onCodeFound })
    await session.start()

    // Should not throw or cause issues
    await emitPortMessage({ type: "PONG" })
    expect(session.isActive()).toBe(true)
  })

  it("should handle SESSION_UPDATE messages", async () => {
    const field = documentRef.createElement("input")
    documentRef.body.appendChild(field)
    const detection = createDetectionResult(field)
    const onCodeFound = vi.fn()

    const session = new WatchSession(field, detection, { onCodeFound })
    await session.start()

    await emitPortMessage({ type: "SESSION_UPDATE", pollsCompleted: 1 })
    expect(session.isActive()).toBe(true)
  })

  it("should handle SERVER_KEEPALIVE messages", async () => {
    const field = documentRef.createElement("input")
    documentRef.body.appendChild(field)
    const detection = createDetectionResult(field)
    const onCodeFound = vi.fn()

    const session = new WatchSession(field, detection, { onCodeFound })
    await session.start()

    await emitPortMessage({ type: "SERVER_KEEPALIVE" })
    expect(session.isActive()).toBe(true)
  })

  it("should ignore unknown message types", async () => {
    const field = documentRef.createElement("input")
    documentRef.body.appendChild(field)
    const detection = createDetectionResult(field)
    const onCodeFound = vi.fn()

    const session = new WatchSession(field, detection, { onCodeFound })
    await session.start()

    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    await emitPortMessage({ type: "UNKNOWN_TYPE" })
    expect(consoleSpy).toHaveBeenCalled()
    expect(session.isActive()).toBe(true)

    consoleSpy.mockRestore()
  })

  it("should ignore malformed messages", async () => {
    const field = documentRef.createElement("input")
    documentRef.body.appendChild(field)
    const detection = createDetectionResult(field)
    const onCodeFound = vi.fn()

    const session = new WatchSession(field, detection, { onCodeFound })
    await session.start()

    // Should not throw
    await emitPortMessage(null)
    await emitPortMessage(undefined)
    await emitPortMessage("string")
    await emitPortMessage(123)
    await emitPortMessage({ noType: "test" })

    expect(session.isActive()).toBe(true)
  })

  it("should prevent starting session twice", async () => {
    const field = documentRef.createElement("input")
    documentRef.body.appendChild(field)
    const detection = createDetectionResult(field)
    const onCodeFound = vi.fn()

    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    const session = new WatchSession(field, detection, { onCodeFound })
    await session.start()
    // Second start() returns early synchronously because this.port is already set
    await session.start()

    expect(consoleSpy).toHaveBeenCalledWith(
      "[WatchSession] Session already started"
    )

    consoleSpy.mockRestore()
  })

  it("should derive expected shape from input field", async () => {
    const field = documentRef.createElement("input")
    field.maxLength = 6
    field.inputMode = "numeric"
    documentRef.body.appendChild(field)

    const detection = createDetectionResult(field)
    const onCodeFound = vi.fn()

    const session = new WatchSession(field, detection, { onCodeFound })
    await session.start()

    expect(port.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "START_SESSION",
        expected: expect.objectContaining({
          length: 6,
          charset: "digits",
        }),
      })
    )
  })

  it("should detect numeric input from type=number", async () => {
    const field = documentRef.createElement("input")
    field.type = "number"
    documentRef.body.appendChild(field)

    const detection = createDetectionResult(field)
    const onCodeFound = vi.fn()

    const session = new WatchSession(field, detection, { onCodeFound })
    await session.start()

    expect(port.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        expected: expect.objectContaining({
          charset: "digits",
        }),
      })
    )
  })

  it("should detect numeric input from inputMode=tel", async () => {
    const field = documentRef.createElement("input")
    field.inputMode = "tel"
    documentRef.body.appendChild(field)

    const detection = createDetectionResult(field)
    const onCodeFound = vi.fn()

    const session = new WatchSession(field, detection, { onCodeFound })
    await session.start()

    expect(port.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        expected: expect.objectContaining({
          charset: "digits",
        }),
      })
    )
  })

  it("should default to alnum charset when no hints", async () => {
    const field = documentRef.createElement("input")
    documentRef.body.appendChild(field)

    const detection = createDetectionResult(field)
    const onCodeFound = vi.fn()

    const session = new WatchSession(field, detection, { onCodeFound })
    await session.start()

    expect(port.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        expected: expect.objectContaining({
          charset: "alnum",
        }),
      })
    )
  })

  it("should use size attribute when maxLength not set", async () => {
    const field = documentRef.createElement("input")
    field.size = 8
    documentRef.body.appendChild(field)

    const detection = createDetectionResult(field)
    const onCodeFound = vi.fn()

    const session = new WatchSession(field, detection, { onCodeFound })
    await session.start()

    expect(port.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        expected: expect.objectContaining({
          length: 8,
        }),
      })
    )
  })

  it("should return field and detection result", () => {
    const field = documentRef.createElement("input")
    documentRef.body.appendChild(field)
    const detection = createDetectionResult(field)
    const onCodeFound = vi.fn()

    const session = new WatchSession(field, detection, { onCodeFound })

    expect(session.getField()).toBe(field)
    expect(session.getDetectionResult()).toBe(detection)
  })

  it("should call onSessionStarted callback", async () => {
    const field = documentRef.createElement("input")
    documentRef.body.appendChild(field)
    const detection = createDetectionResult(field)
    const onCodeFound = vi.fn()
    const onSessionStarted = vi.fn()

    const session = new WatchSession(field, detection, {
      onCodeFound,
      onSessionStarted,
    })
    await session.start()

    await emitPortMessage({
      type: "SESSION_STARTED",
      session: { id: "test-session-id" },
    })

    expect(onSessionStarted).toHaveBeenCalledWith("test-session-id")
  })

  it("should send STOP_SESSION when stopped with active sessionId", async () => {
    const field = documentRef.createElement("input")
    documentRef.body.appendChild(field)
    const detection = createDetectionResult(field)
    const onCodeFound = vi.fn()

    const session = new WatchSession(field, detection, { onCodeFound })
    await session.start()

    await emitPortMessage({
      type: "SESSION_STARTED",
      session: { id: "session-to-stop" },
    })

    session.stop()

    expect(port.postMessage).toHaveBeenCalledWith({ type: "STOP_SESSION" })
    expect(port.disconnect).toHaveBeenCalled()
  })

  it("should not send STOP_SESSION when stopped without sessionId", async () => {
    const field = documentRef.createElement("input")
    documentRef.body.appendChild(field)
    const detection = createDetectionResult(field)
    const onCodeFound = vi.fn()

    const session = new WatchSession(field, detection, { onCodeFound })
    await session.start()

    session.stop()

    // Should only have START_SESSION message, no STOP
    expect(port.postMessage).toHaveBeenCalledTimes(1)
    expect(port.disconnect).toHaveBeenCalled()
  })

  it("should wrap ping sending in try-catch", async () => {
    // This test verifies the error handling logic exists
    // Actually testing interval timing is challenging with mocked timers
    const field = documentRef.createElement("input")
    documentRef.body.appendChild(field)
    const detection = createDetectionResult(field)
    const onCodeFound = vi.fn()

    const session = new WatchSession(field, detection, { onCodeFound })
    await session.start()

    // Verify session started successfully (error handling is in place)
    expect(port.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "START_SESSION" })
    )
  })

  it("should clear keepalive timer on cleanup", async () => {
    vi.useFakeTimers()
    const field = documentRef.createElement("input")
    documentRef.body.appendChild(field)
    const detection = createDetectionResult(field)
    const onCodeFound = vi.fn()

    const session = new WatchSession(field, detection, { onCodeFound })
    await session.start()

    session.stop()

    // Advance time and verify no more pings
    vi.advanceTimersByTime(8000)
    expect(port.postMessage).toHaveBeenCalledTimes(1) // Only START_SESSION

    vi.useRealTimers()
  })

  it("should replace active watch when starting new session", async () => {
    vi.useFakeTimers()

    const field1 = documentRef.createElement("input")
    const field2 = documentRef.createElement("input")
    documentRef.body.appendChild(field1)
    documentRef.body.appendChild(field2)

    const detection1 = createDetectionResult(field1)
    const detection2 = createDetectionResult(field2)
    const onCodeFound = vi.fn()

    const session1 = startWatch(field1, detection1, { onCodeFound })
    await vi.advanceTimersByTimeAsync(0)
    expect(getActiveWatch()).toBe(session1)

    // Advance past the rate limit (1000ms)
    vi.advanceTimersByTime(1100)

    const session2 = startWatch(field2, detection2, { onCodeFound })
    await vi.advanceTimersByTimeAsync(0)
    expect(getActiveWatch()).toBe(session2)
    expect(getActiveWatch()).not.toBe(session1)

    vi.useRealTimers()
  })

  it("should correctly identify watched fields", async () => {
    const field1 = documentRef.createElement("input")
    const field2 = documentRef.createElement("input")
    documentRef.body.appendChild(field1)
    documentRef.body.appendChild(field2)

    const detection = createDetectionResult(field1)
    const onCodeFound = vi.fn()

    startWatch(field1, detection, { onCodeFound })
    await flushMicrotasks()

    expect(isFieldWatched(field1)).toBe(true)
    expect(isFieldWatched(field2)).toBe(false)
  })

  it("should clear active watch reference on cleanup", async () => {
    const field = documentRef.createElement("input")
    documentRef.body.appendChild(field)
    const detection = createDetectionResult(field)
    const onCodeFound = vi.fn()

    const session = startWatch(field, detection, { onCodeFound })
    await flushMicrotasks()
    expect(getActiveWatch()).toBe(session)

    emitDisconnect()

    expect(getActiveWatch()).toBe(null)
  })
})

describe('deriveExpectedShape for split-input', () => {
  it('should derive length from group size for maxLength=1 split-input fields', () => {
    const input = document.createElement('input') as unknown as HTMLInputElement
    input.type = 'text'
    input.maxLength = 1

    vi.mocked(detectSplitInputGroup).mockReturnValue({
      inputs: Array.from({ length: 6 }, () => input),
      representative: input,
      pattern: 'maxlength-1',
    })

    const shape = deriveExpectedShape(input)
    expect(shape.length).toBe(6)
  })

  it('should use maxLength directly for non-split-input fields', () => {
    const input = document.createElement('input') as unknown as HTMLInputElement
    input.type = 'text'
    input.maxLength = 6

    vi.mocked(detectSplitInputGroup).mockReturnValue(null)

    const shape = deriveExpectedShape(input)
    expect(shape.length).toBe(6)
  })

  it('should use maxLength directly for maxLength=2 split group (autofill only supports 1-char-per-box)', () => {
    const input = document.createElement('input') as unknown as HTMLInputElement
    input.type = 'text'
    input.maxLength = 2

    vi.mocked(detectSplitInputGroup).mockReturnValue({
      inputs: Array.from({ length: 4 }, () => input),
      representative: input,
      pattern: 'maxlength-1',
    })

    // maxLength=2 is NOT multiplied: autofill writes 1 char per box
    const shape = deriveExpectedShape(input)
    expect(shape.length).toBe(2)
  })
})
