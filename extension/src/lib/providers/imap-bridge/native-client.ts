/**
 * Native Messaging client for InboxBridge
 * Handles RPC calls to the native InboxBridge application
 */

type PendingRequest = {
  resolve: (result: any) => void;
  reject: (error: Error) => void;
  timeout: number;
};

export class NativeMessagingClient {
  private port: chrome.runtime.Port | null = null;
  private pendingRequests = new Map<string, PendingRequest>();
  private eventListeners = new Set<(event: any) => void>();
  private reconnecting = false;

  /**
   * Connect to InboxBridge native app
   */
  connect(): void {
    if (this.port) return;

    try {
      this.port = chrome.runtime.connectNative('com.inboxkey.bridge');

      this.port.onMessage.addListener((message) => {
        this.handleMessage(message);
      });

      this.port.onDisconnect.addListener(() => {
        this.handleDisconnect();
      });
    } catch (error) {
      throw new Error(`Failed to connect to InboxBridge: ${error}`);
    }
  }

  /**
   * Call RPC method with timeout
   */
  async call<T = any>(method: string, params: any = {}, timeout = 30000): Promise<T> {
    this.ensureConnected();

    const id = crypto.randomUUID();
    const request = {
      v: 1,
      id,
      method,
      params
    };

    return new Promise<T>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, timeout);

      this.pendingRequests.set(id, { resolve, reject, timeout: timeoutId });

      try {
        this.port!.postMessage(request);
      } catch (error) {
        window.clearTimeout(timeoutId);
        this.pendingRequests.delete(id);
        reject(error);
      }
    });
  }

  /**
   * Subscribe to events from native app
   */
  onEvent(listener: (event: any) => void): void {
    this.eventListeners.add(listener);
  }

  /**
   * Unsubscribe from events
   */
  offEvent(listener: (event: any) => void): void {
    this.eventListeners.delete(listener);
  }

  /**
   * Disconnect from native app
   */
  disconnect(): void {
    if (this.port) {
      this.port.disconnect();
      this.port = null;
    }
    this.pendingRequests.clear();
  }

  /**
   * Check if InboxBridge is installed
   */
  async checkInstallStatus(): Promise<{
    installed: boolean;
    version?: string;
    keychain?: string;
  }> {
    try {
      this.connect();
      const result = await this.call('installStatus.get', {}, 5000);
      return {
        installed: result.installed,
        version: result.version,
        keychain: result.keychain
      };
    } catch (error) {
      return { installed: false };
    }
  }

  private ensureConnected(): void {
    if (!this.port) {
      this.connect();
    }
  }

  private handleMessage(message: any): void {
    if (message.id && this.pendingRequests.has(message.id)) {
      const { resolve, reject, timeout } = this.pendingRequests.get(message.id)!;
      window.clearTimeout(timeout);
      this.pendingRequests.delete(message.id);

      if (message.error) {
        reject(new Error(`${message.error.code}: ${message.error.message}`));
      } else {
        resolve(message.result);
      }
    } else if (message.event) {
      // Broadcast event to listeners
      this.eventListeners.forEach(listener => listener(message));
    }
  }

  private handleDisconnect(): void {
    const error = chrome.runtime.lastError;
    this.port = null;

    // Reject all pending requests
    for (const [_id, { reject, timeout }] of this.pendingRequests.entries()) {
      window.clearTimeout(timeout);
      reject(new Error(error ? error.message : 'InboxBridge disconnected'));
    }
    this.pendingRequests.clear();

    // Attempt reconnection if not intentional
    if (!this.reconnecting && error) {
      this.reconnecting = true;
      setTimeout(() => {
        this.reconnecting = false;
        try {
          this.connect();
        } catch (e) {
          console.error('Failed to reconnect to InboxBridge:', e);
        }
      }, 5000);
    }
  }
}

// Singleton instance
let clientInstance: NativeMessagingClient | null = null;

export function getNativeClient(): NativeMessagingClient {
  if (!clientInstance) {
    clientInstance = new NativeMessagingClient();
  }
  return clientInstance;
}
