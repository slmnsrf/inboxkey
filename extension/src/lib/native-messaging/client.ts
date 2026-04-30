/**
 * Native Messaging Client for InboxBridge
 *
 * Singleton client for communicating with InboxBridge native app via Chrome's
 * Native Messaging API. Handles port lifecycle, request/response matching,
 * timeouts, and error handling.
 *
 * Key features:
 * - Singleton pattern (one instance per extension)
 * - Lazy connection (connects on first request, not on getInstance)
 * - Request/response correlation via UUID
 * - Timeout handling (30s default, configurable)
 * - Auto-reconnect on port disconnect
 * - Thread-safe (handles concurrent requests)
 *
 * @example
 * ```typescript
 * const client = NativeMessagingClient.getInstance()
 *
 * // Health check
 * const ping = await client.ping()
 * console.log('Bridge version:', ping.version)
 *
 * // Fetch emails
 * const result = await client.request<FetchRecentResult>(
 *   'mail.fetchRecent',
 *   { accountId: 'acc_123', sinceMinutes: 10, limit: 15 }
 * )
 * console.log('Messages:', result.messages)
 * ```
 */

import type {
  NativeRequest,
  NativeResponse,
  PingResult,
  NativeErrorCodeType,
} from './types'
import { NativeErrorCode } from './types'

/**
 * Native Messaging error with structured error code
 */
export class NativeMessagingError extends Error {
  constructor(
    message: string,
    public code: NativeErrorCodeType,
    public details?: unknown
  ) {
    super(message)
    this.name = 'NativeMessagingError'
  }
}

/**
 * Narrow an unknown thrown value to "the bridge responded METHOD_NOT_FOUND".
 * Used by the uninstall flow to distinguish "old bridge, graceful fallback
 * to per-account removal" from every other kind of failure (transport
 * error, structured cleanup error, unexpected). Both non-METHOD_NOT_FOUND
 * cases are treated as unknown_failure by the caller.
 */
export function isMethodNotFound(error: unknown): boolean {
  return (
    error instanceof NativeMessagingError &&
    error.code === NativeErrorCode.METHOD_NOT_FOUND
  )
}

/**
 * Pending request awaiting response
 */
interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timeoutId: ReturnType<typeof setTimeout>
}

/**
 * Request options
 */
interface RequestOptions {
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number
}

/**
 * Native Messaging Client (singleton)
 *
 * Manages communication with InboxBridge native app.
 */
export class NativeMessagingClient {
  private static instance: NativeMessagingClient | null = null

  private port: chrome.runtime.Port | null = null
  private pendingRequests = new Map<string, PendingRequest>()
  private isConnecting = false
  /**
   * Timestamp (ms) of the most recent port disconnect. Used to throttle
   * reconnect attempts so that a crashed/missing native host doesn't
   * produce a connectNative storm on every poll interval.
   */
  private lastDisconnectAtMs = 0
  private static readonly RECONNECT_COOLDOWN_MS = 5000

  /**
   * Native host ID from manifest (com.inboxkey.bridge)
   */
  private static readonly NATIVE_HOST_ID = 'com.inboxkey.bridge'

  /**
   * Protocol version supported by this client
   */
  private static readonly PROTOCOL_VERSION = 1

  /**
   * Default request timeout (30 seconds)
   */
  private static readonly DEFAULT_TIMEOUT_MS = 30000

  /**
   * Private constructor (singleton pattern)
   */
  private constructor() {}

  /**
   * Get singleton instance
   *
   * NOTE: Does NOT auto-connect. Connection is lazy (happens on first request).
   *
   * @returns Singleton instance
   */
  static getInstance(): NativeMessagingClient {
    if (!NativeMessagingClient.instance) {
      NativeMessagingClient.instance = new NativeMessagingClient()
    }
    return NativeMessagingClient.instance
  }

  /**
   * Check if currently connected to native app
   */
  isConnected(): boolean {
    return this.port !== null
  }

  /**
   * Connect to native app
   *
   * Creates Native Messaging port and sets up message/disconnect listeners.
   * Safe to call multiple times (no-op if already connected).
   *
   * @throws {NativeMessagingError} If connection fails
   */
  private connect(): void {
    // Already connected
    if (this.port !== null) {
      return
    }

    // Prevent concurrent connection attempts
    if (this.isConnecting) {
      return
    }

    // Reconnect cooldown: if the bridge disconnected recently (bridge
    // crash, host-not-found, etc.) short-circuit instead of retrying
    // every poll interval. Without this, a persistent native-host
    // failure produces a connectNative storm at the polling frequency.
    const sinceDisconnectMs = Date.now() - this.lastDisconnectAtMs
    if (this.lastDisconnectAtMs > 0 && sinceDisconnectMs < NativeMessagingClient.RECONNECT_COOLDOWN_MS) {
      throw new NativeMessagingError(
        'Bridge disconnected recently; reconnect throttled.',
        NativeErrorCode.PORT_DISCONNECTED,
        { cooldownRemainingMs: NativeMessagingClient.RECONNECT_COOLDOWN_MS - sinceDisconnectMs }
      )
    }

    this.isConnecting = true

    try {
      // Connect to native host
      this.port = chrome.runtime.connectNative(NativeMessagingClient.NATIVE_HOST_ID)

      // Set up message listener
      this.port.onMessage.addListener((message: unknown) => {
        this.handleMessage(message)
      })

      // Set up disconnect listener
      this.port.onDisconnect.addListener(() => {
        this.handleDisconnect()
      })

      console.log('[NativeMessagingClient] Connected to InboxBridge')
    } catch (error) {
      this.isConnecting = false
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.warn('[NativeMessagingClient] Connection failed:', errorMessage)

      throw new NativeMessagingError(
        `Failed to connect to InboxBridge: ${errorMessage}. Make sure InboxBridge is installed and the manifest is registered.`,
        NativeErrorCode.PORT_DISCONNECTED,
        { originalError: errorMessage }
      )
    }

    this.isConnecting = false
  }

  /**
   * Handle incoming message from native app
   */
  private handleMessage(message: unknown): void {
    // Validate message structure
    if (!this.isValidResponse(message)) {
      console.warn('[NativeMessagingClient] Invalid response format:', message)
      return
    }

    const response = message as NativeResponse

    // Find pending request
    const pending = this.pendingRequests.get(response.id)
    if (!pending) {
      console.warn('[NativeMessagingClient] Received response for unknown request ID:', response.id)
      return
    }

    // Remove from pending
    this.pendingRequests.delete(response.id)
    clearTimeout(pending.timeoutId)

    // Handle error response
    if (response.error) {
      const error = new NativeMessagingError(
        response.error.message,
        response.error.code as NativeErrorCodeType,
        response.error.details
      )
      pending.reject(error)
      return
    }

    // Handle success response
    pending.resolve(response.result)
  }

  /**
   * Handle port disconnect
   */
  private handleDisconnect(): void {
    const error = chrome.runtime.lastError
    const errorMessage = error?.message || 'Unknown reason'

    // Chrome's exact disconnect message when the native host is not registered
    // is "Specified native messaging host not found". This is the expected
    // signal when InboxBridge is not installed - downgrade to debug so it
    // does not surface as a warning. Match the full Chrome phrase (not just
    // "not found") so legitimate bridge crashes with messages like
    // "Account not found" or "Config file not found" still log as warnings.
    const isHostNotFound = errorMessage.toLowerCase().includes('native messaging host not found')
    if (isHostNotFound) {
      console.debug('[NativeMessagingClient] Native host not installed (expected when bridge is not set up)')
    } else {
      console.warn('[NativeMessagingClient] Port disconnected:', errorMessage)
    }

    // Reject all pending requests
    for (const [_id, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timeoutId)
      pending.reject(
        new NativeMessagingError(
          `InboxBridge disconnected: ${errorMessage}. Make sure InboxBridge is running.`,
          NativeErrorCode.PORT_DISCONNECTED,
          { originalError: errorMessage }
        )
      )
    }

    // Clear state
    this.pendingRequests.clear()
    this.port = null
    this.isConnecting = false
    this.lastDisconnectAtMs = Date.now()
  }

  /**
   * Validate response message structure
   */
  private isValidResponse(message: unknown): boolean {
    if (typeof message !== 'object' || message === null) {
      return false
    }

    const msg = message as Record<string, unknown>

    // Check required fields
    if (typeof msg.v !== 'number' || typeof msg.id !== 'string') {
      return false
    }

    // Must have either result or error
    if (!('result' in msg) && !('error' in msg)) {
      return false
    }

    return true
  }

  /**
   * Generate unique request ID (UUID v4)
   */
  private generateRequestId(): string {
    return crypto.randomUUID()
  }

  /**
   * Send RPC request to native app
   *
   * Automatically connects if not connected. Handles request/response correlation,
   * timeouts, and errors.
   *
   * @param method - RPC method name (e.g., 'bridge.ping', 'mail.fetchRecent')
   * @param params - Method parameters (optional)
   * @param options - Request options (timeout, etc.)
   * @returns Promise that resolves with response result
   * @throws {NativeMessagingError} On connection, timeout, or RPC error
   *
   * @example
   * ```typescript
   * const result = await client.request<FetchRecentResult>(
   *   'mail.fetchRecent',
   *   { accountId: 'acc_123', sinceMinutes: 10, limit: 15 },
   *   { timeout: 60000 } // 60s timeout
   * )
   * ```
   */
  async request<T = unknown>(
    method: string,
    params?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    // Connect if needed (lazy connection)
    if (!this.isConnected()) {
      this.connect()
    }

    // Ensure we're connected
    if (!this.port) {
      throw new NativeMessagingError(
        'Failed to establish connection to InboxBridge',
        NativeErrorCode.PORT_DISCONNECTED
      )
    }

    // Generate unique request ID
    const id = this.generateRequestId()

    // Build request
    const request: NativeRequest = {
      v: NativeMessagingClient.PROTOCOL_VERSION,
      id,
      method,
      params: params || {},
    }

    // Create promise that resolves when response arrives
    const timeout = options?.timeout || NativeMessagingClient.DEFAULT_TIMEOUT_MS

    const promise = new Promise<T>((resolve, reject) => {
      // Set up timeout
      const timeoutId = setTimeout(() => {
        // Remove from pending
        this.pendingRequests.delete(id)

        // Reject with timeout error
        reject(
          new NativeMessagingError(
            `Request timed out after ${timeout}ms: ${method}`,
            NativeErrorCode.TIMEOUT,
            { method, timeout }
          )
        )
      }, timeout)

      // Store pending request
      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeoutId,
      })
    })

    // Send request
    try {
      this.port.postMessage(request)
      console.log(`[NativeMessagingClient] Sent request: ${method} (id: ${id})`)
    } catch (error) {
      // Remove from pending
      const pending = this.pendingRequests.get(id)
      if (pending) {
        clearTimeout(pending.timeoutId)
        this.pendingRequests.delete(id)
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      throw new NativeMessagingError(
        `Failed to send request: ${errorMessage}`,
        NativeErrorCode.PORT_DISCONNECTED,
        { originalError: errorMessage }
      )
    }

    return promise
  }

  /**
   * Alias for request() -- backward compatibility with UI consumers.
   */
  async call<T = unknown>(
    method: string,
    params?: unknown,
    timeout?: number
  ): Promise<T> {
    return this.request<T>(method, params, timeout ? { timeout } : undefined)
  }

  /**
   * Health check (ping InboxBridge)
   *
   * Validates connection and retrieves bridge version/protocol info.
   *
   * @returns Promise with ping result
   * @throws {NativeMessagingError} On connection or RPC error
   *
   * @example
   * ```typescript
   * const ping = await client.ping()
   * console.log('Bridge version:', ping.version)
   * console.log('Protocol version:', ping.protocolVersion)
   * ```
   */
  async ping(): Promise<PingResult> {
    return this.request<PingResult>('bridge.ping')
  }

  /**
   * Check if InboxBridge is installed and reachable.
   * Returns install status, version, and keychain backend.
   * Never throws -- returns { installed: false } on any error.
   */
  async checkInstallStatus(): Promise<{
    installed: boolean
    version?: string
    keychain?: string
  }> {
    try {
      const result = await this.request<{
        installed: boolean
        version: string
        keychain: string
      }>('installStatus.get', {}, { timeout: 5000 })
      return {
        installed: result.installed,
        version: result.version,
        keychain: result.keychain,
      }
    } catch {
      return { installed: false }
    }
  }

  /**
   * Disconnect from native app
   *
   * Closes the Native Messaging port and rejects all pending requests.
   * Safe to call multiple times (no-op if already disconnected).
   */
  disconnect(): void {
    if (!this.port) {
      return
    }

    console.log('[NativeMessagingClient] Disconnecting from InboxBridge')

    // Reject all pending requests
    for (const [_id, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timeoutId)
      pending.reject(
        new NativeMessagingError(
          'Client disconnected',
          NativeErrorCode.PORT_DISCONNECTED
        )
      )
    }

    // Clear state
    this.pendingRequests.clear()

    // Disconnect port
    this.port.disconnect()
    this.port = null
  }
}
