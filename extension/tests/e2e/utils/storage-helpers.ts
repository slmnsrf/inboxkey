/**
 * Helper utilities for working with chrome.storage in E2E tests
 */

import type { Page } from '@playwright/test'

export interface StoredCode {
  code: string
  timestamp: number
  source: string
  siteMatch?: string
  used: boolean
}

export interface Settings {
  autoFillEnabled: boolean
  lockEnabled: boolean
  lockTimeoutMinutes: number
  allowedDomains: string[]
  deniedDomains: string[]
  notificationsEnabled: boolean
}

/**
 * Inject a verification code into chrome.storage.local
 */
export async function injectCode(
  backgroundPage: Page,
  code: string,
  siteUrl?: string,
  source = 'E2E Test'
): Promise<void> {
  await backgroundPage.evaluate(
    async ({ code, siteUrl, source }) => {
      const storedCode = {
        code,
        timestamp: Date.now(),
        source,
        siteMatch: siteUrl,
        used: false,
      }

      return new Promise<void>((resolve) => {
        chrome.storage.local.get(['recent_codes'], (result) => {
          const codes = result.recent_codes || []
          codes.unshift(storedCode)
          chrome.storage.local.set({ recent_codes: codes }, () => resolve())
        })
      })
    },
    { code, siteUrl, source }
  )
}

/**
 * Get all stored codes from chrome.storage.local
 */
export async function getStoredCodes(backgroundPage: Page): Promise<StoredCode[]> {
  return await backgroundPage.evaluate(async () => {
    return new Promise<StoredCode[]>((resolve) => {
      chrome.storage.local.get(['recent_codes'], (result) => {
        resolve(result.recent_codes || [])
      })
    })
  })
}

/**
 * Clear all codes from storage
 */
export async function clearCodes(backgroundPage: Page): Promise<void> {
  await backgroundPage.evaluate(async () => {
    return new Promise<void>((resolve) => {
      chrome.storage.local.set({ recent_codes: [] }, () => resolve())
    })
  })
}

/**
 * Clear all storage data
 */
export async function clearStorage(backgroundPage: Page): Promise<void> {
  await backgroundPage.evaluate(async () => {
    return new Promise<void>((resolve) => {
      chrome.storage.local.clear(() => {
        chrome.storage.session.clear(() => resolve())
      })
    })
  })
}

/**
 * Initialize extension with master password
 */
export async function initializeExtension(
  backgroundPage: Page,
  password: string
): Promise<void> {
  await backgroundPage.evaluate(
    async (pwd) => {
      // This would call the extension's initialization API
      // For now, just set up basic storage structure
      return new Promise<void>((resolve) => {
        chrome.storage.local.set(
          {
            version: 1,
            recent_codes: [],
            settings: {
              autoFillEnabled: true,
              lockEnabled: true,
              lockTimeoutMinutes: 15,
              allowedDomains: [],
              deniedDomains: [],
              notificationsEnabled: true,
            },
          },
          () => resolve()
        )
      })
    },
    password
  )
}

/**
 * Lock the extension
 */
export async function lockExtension(backgroundPage: Page): Promise<void> {
  await backgroundPage.evaluate(async () => {
    return new Promise<void>((resolve) => {
      chrome.storage.session.set(
        {
          session_state: {
            isLocked: true,
            unlockedAt: undefined,
            activeWatchSessions: [],
          },
        },
        () => resolve()
      )
    })
  })
}

/**
 * Unlock the extension
 */
export async function unlockExtension(
  backgroundPage: Page,
  password: string
): Promise<void> {
  await backgroundPage.evaluate(
    async (pwd) => {
      // This would verify the password and unlock
      // For now, just set unlocked state
      return new Promise<void>((resolve) => {
        chrome.storage.session.set(
          {
            session_state: {
              isLocked: false,
              unlockedAt: Date.now(),
              activeWatchSessions: [],
            },
          },
          () => resolve()
        )
      })
    },
    password
  )
}

/**
 * Get extension settings
 */
export async function getSettings(backgroundPage: Page): Promise<Settings> {
  return await backgroundPage.evaluate(async () => {
    return new Promise<Settings>((resolve) => {
      chrome.storage.local.get(['settings'], (result) => {
        resolve(result.settings || {
          autoFillEnabled: true,
          lockEnabled: false,
          lockTimeoutMinutes: 15,
          allowedDomains: [],
          deniedDomains: [],
          notificationsEnabled: true,
        })
      })
    })
  })
}

/**
 * Update extension settings
 */
export async function updateSettings(
  backgroundPage: Page,
  settings: Partial<Settings>
): Promise<void> {
  await backgroundPage.evaluate(
    async (newSettings) => {
      return new Promise<void>((resolve) => {
        chrome.storage.local.get(['settings'], (result) => {
          const currentSettings = result.settings || {}
          const updatedSettings = { ...currentSettings, ...newSettings }
          chrome.storage.local.set({ settings: updatedSettings }, () => resolve())
        })
      })
    },
    settings
  )
}

/**
 * Check if extension is locked
 */
export async function isExtensionLocked(backgroundPage: Page): Promise<boolean> {
  return await backgroundPage.evaluate(async () => {
    return new Promise<boolean>((resolve) => {
      chrome.storage.session.get(['session_state'], (result) => {
        resolve(result.session_state?.isLocked || false)
      })
    })
  })
}

/**
 * Get the number of active watch sessions
 */
export async function getActiveWatchCount(backgroundPage: Page): Promise<number> {
  return await backgroundPage.evaluate(async () => {
    return new Promise<number>((resolve) => {
      chrome.storage.session.get(['session_state'], (result) => {
        resolve(result.session_state?.activeWatchSessions?.length || 0)
      })
    })
  })
}
