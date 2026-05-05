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
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
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
  notifications: {
    create: vi.fn(),
    clear: vi.fn(),
    update: vi.fn(),
    onClicked: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    onClosed: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    onButtonClicked: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  identity: {
    getAuthToken: vi.fn(),
    removeCachedAuthToken: vi.fn(),
    getRedirectURL: vi.fn((path?: string) => `https://test-extension-id.chromiumapp.org/${path ?? ''}`),
    launchWebAuthFlow: vi.fn(),
  },
  scripting: {
    executeScript: vi.fn(async () => [{ result: null }]),
  },
  i18n: {
    getMessage: vi.fn((key: string, substitutions?: string | string[]) => {
      // Return the key itself if no translation (for testing)
      // This allows tests to check for specific keys
      const translations: Record<string, string> = {
        section_magic_links: "Magic Links",
        section_codes: "Codes",
        label_from: "From",
        label_to: "To",
        label_subject: "Subject",
        label_code: "Code",
        value_not_available: "N/A",
        button_copy: "Copy",
        button_copied: "Copied",
        button_open: "Open",
        button_opening: "Opening",
        time_just_now_short: "now",
        time_minutes_short: "$1m ago",
        time_hours_short: "$1h ago",
        time_days_short: "$1d ago",
        aria_copy_code: "Copy code $1 from $2",
        aria_open_link_simple: "Open link $1",
        aria_received_time: "Received $1",
        empty_no_codes_title: "No codes yet",
        empty_no_codes_message: "New verification codes will appear here.",
        empty_no_links_title: "No magic links",
        empty_no_links_message: "Sign-in and verification links will appear here.",
        empty_no_mailboxes_title: "No mailboxes connected",
        empty_no_mailboxes_message: "Connect a mailbox to get started.",
        empty_error_title: "Something went wrong",
        empty_error_message: "Unable to load your messages.",
        accounts_header: "Connected Accounts",
        accounts_recent_title: "Recent Emails",
        accounts_recent_description: "Your latest verification codes and magic links",
        accounts_recent_empty: "No recent activity",
        trust_indicator_title: "Privacy first",
        trust_indicator_readonly: "Read-only access to your emails",
        trust_indicator_local_storage: "Local storage only",
        trust_indicator_local: "All processing happens locally",
        provider_gmail_connect: "Connect Gmail",
        accounts_panel_heading: "Connected Accounts",
        accounts_panel_summary: "Manage your email accounts",
        accounts_status_not_connected: "Not connected",
        accounts_status_connected: "Connected",
        accounts_status_error: "Error",
        toast_code_copied: "Code copied to clipboard",
        toast_code_copied_with_code: "Verification code $1 copied to clipboard",
        toast_code_copied_paste_hint: "Just paste it and submit.",
        toast_dismiss_aria: "Dismiss notification",
      }

      let message = translations[key] || key

      // Handle substitutions
      if (substitutions) {
        const subs = Array.isArray(substitutions) ? substitutions : [substitutions]
        subs.forEach((sub, index) => {
          message = message.replace(`$${index + 1}`, sub)
        })
      }

      return message
    }),
    getUILanguage: vi.fn(() => "en"),
    getAcceptLanguages: vi.fn((callback: (languages: string[]) => void) => {
      callback(["en-US", "en"])
    }),
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any
