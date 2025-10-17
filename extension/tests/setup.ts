import { vi } from "vitest"
import "@testing-library/jest-dom"

// Create in-memory storage for chrome.storage mock
const createMockStorage = () => {
  const storage = new Map<string, any>()

  return {
    get: vi.fn(async (keys?: string | string[] | null) => {
      if (keys === null || keys === undefined) {
        // Return all items
        const result: Record<string, any> = {}
        storage.forEach((value, key) => {
          result[key] = value
        })
        return result
      }

      if (typeof keys === "string") {
        // Single key
        const value = storage.get(keys)
        return value !== undefined ? { [keys]: value } : {}
      }

      if (Array.isArray(keys)) {
        // Multiple keys
        const result: Record<string, any> = {}
        keys.forEach((key) => {
          const value = storage.get(key)
          if (value !== undefined) {
            result[key] = value
          }
        })
        return result
      }

      return {}
    }),
    set: vi.fn(async (items: Record<string, any>) => {
      Object.entries(items).forEach(([key, value]) => {
        storage.set(key, value)
      })
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      const keyArray = Array.isArray(keys) ? keys : [keys]
      keyArray.forEach((key) => storage.delete(key))
    }),
    clear: vi.fn(async () => {
      storage.clear()
    }),
  }
}

// Mock chrome API for tests
global.chrome = {
  runtime: {
    id: "test-extension-id",
    getManifest: () => ({ version: "0.0.1" }),
    getURL: (path: string) => `chrome-extension://test/${path}`,
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    connect: vi.fn(),
    onConnect: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  storage: {
    local: createMockStorage(),
    session: createMockStorage(),
  },
  tabs: {
    query: vi.fn(),
    sendMessage: vi.fn(),
    update: vi.fn(),
  },
  alarms: {
    create: vi.fn(),
    clear: vi.fn(),
    getAll: vi.fn((callback: (alarms: chrome.alarms.Alarm[]) => void) => {
      callback([])
    }),
    onAlarm: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any
