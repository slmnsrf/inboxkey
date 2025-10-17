import { t } from '@/lib/i18n'

const ONE_MINUTE_MS = 60_000
const FIVE_MINUTES_MS = 5 * ONE_MINUTE_MS
const DAY_MS = 24 * 60 * 60 * 1000

type RateLimitRule = {
  windowMs: number
  limit: number
  buildMessage: (remainingMs: number) => string
}

const RATE_LIMIT_RULES: RateLimitRule[] = [
  {
    windowMs: DAY_MS,
    limit: 15,
    buildMessage: () => t('security_rate_limit_day')
  },
  {
    windowMs: FIVE_MINUTES_MS,
    limit: 10,
    buildMessage: (remainingMs: number) => {
      const minutes = Math.max(1, Math.ceil(remainingMs / ONE_MINUTE_MS))
      return t('security_rate_limit_five_minutes', String(minutes))
    }
  },
  {
    windowMs: ONE_MINUTE_MS,
    limit: 3,
    buildMessage: (remainingMs: number) => {
      const seconds = Math.max(1, Math.ceil(remainingMs / 1000))
      return t('lock_screen_rate_limited', String(seconds))
    }
  }
]

export interface LockStatus {
  isInitialized: boolean
  isUnlocked: boolean
  isLoading: boolean
}

/**
 * Lock service for interacting with background KeyManager
 */
export class LockService {
  private failedAttemptTimestamps: number[] = []
  private lockout: { until: number; message: string } | null = null

  /**
   * Get current lock status from background
   */
  async getStatus(): Promise<LockStatus> {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_LOCK_STATUS'
      })

      if (!response.success) {
        throw new Error(response.error || 'Failed to get lock status')
      }

      return {
        isInitialized: response.isInitialized ?? false,
        isUnlocked: response.isUnlocked ?? false,
        isLoading: false,
      }
    } catch (error) {
      console.error('[LockService] Error getting status:', error)
      // Return safe defaults on error
      return {
        isInitialized: false,
        isUnlocked: false,
        isLoading: false,
      }
    }
  }

  /**
   * Initialize lock mode with a password
   * @param password - Master password (min 8 characters)
   * @throws Error if initialization fails
   */
  async initialize(password: string): Promise<void> {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'INITIALIZE_PASSWORD',
        password,
      })

      if (!response.success) {
        throw new Error(response.error || 'Failed to initialize password')
      }

      this.resetRateLimiting()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to initialize: ${message}`)
    }
  }

  /**
   * Unlock the extension with password
   * Implements rate limiting with exponential backoff
   *
   * @param password - User's master password
   * @returns Success status and error message if failed
   */
  async unlock(password: string): Promise<{ success: boolean; error?: string }> {
    const now = Date.now()

    if (this.lockout) {
      if (now < this.lockout.until) {
        return {
          success: false,
          error: this.lockout.message,
        }
      }

      // Lockout window has passed
      this.lockout = null
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'UNLOCK',
        password,
      })

      if (!response.success) {
        const rateLimit = this.recordFailedAttempt(now)
        if (rateLimit) {
          this.lockout = rateLimit
          return { success: false, error: rateLimit.message }
        }

        return {
          success: false,
          error: response.error || t('lock_screen_wrong_password'),
        }
      }

      this.resetRateLimiting()

      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        success: false,
        error: `Failed to unlock: ${message}`,
      }
    }
  }

  /**
   * Lock the extension
   */
  async lock(): Promise<void> {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'LOCK',
      })

      if (!response.success) {
        throw new Error(response.error || 'Failed to lock')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to lock: ${message}`)
    }
  }

  /**
   * Change password
   * @param currentPassword - Current master password
   * @param newPassword - New master password
   * @throws Error if password change fails
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CHANGE_PASSWORD',
        currentPassword,
        newPassword,
      })

      if (!response.success) {
        throw new Error(response.error || 'Failed to change password')
      }

      this.resetRateLimiting()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to change password: ${message}`)
    }
  }

  /**
   * Disable password protection
   * @param password - Current master password to confirm
   * @throws Error if disable fails
   */
  async disablePasswordProtection(password: string): Promise<void> {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'DISABLE_PASSWORD',
        password,
      })

      if (!response.success) {
        throw new Error(response.error || 'Failed to disable password protection')
      }

      this.resetRateLimiting()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to disable password protection: ${message}`)
    }
  }

  /**
   * Calculate lockout duration with exponential backoff
   * After 3 failed attempts: 1s
   * After 4 failed attempts: 2s
   * After 5+ failed attempts: 2^(attempts-3) seconds
   *
   * @private
   */
  private recordFailedAttempt(timestamp: number): { until: number; message: string } | null {
    this.failedAttemptTimestamps.push(timestamp)

    // Keep only attempts from the last 24 hours
    this.failedAttemptTimestamps = this.failedAttemptTimestamps.filter(
      (attemptTs) => timestamp - attemptTs <= DAY_MS
    )

    for (const rule of RATE_LIMIT_RULES) {
      const cutoff = timestamp - rule.windowMs
      const attemptsInWindow = this.failedAttemptTimestamps.filter((attemptTs) => attemptTs > cutoff)

      if (attemptsInWindow.length >= rule.limit) {
        const earliest = attemptsInWindow[0]
        const until = earliest + rule.windowMs
        const remainingMs = Math.max(0, until - timestamp)

        return {
          until,
          message: rule.buildMessage(remainingMs),
        }
      }
    }

    return null
  }

  resetRateLimiting(): void {
    this.failedAttemptTimestamps = []
    this.lockout = null
  }
}

/**
 * Singleton instance of LockService
 */
let lockServiceInstance: LockService | null = null

/**
 * Get the singleton LockService instance
 */
export function getLockService(): LockService {
  if (!lockServiceInstance) {
    lockServiceInstance = new LockService()
  }
  return lockServiceInstance
}
