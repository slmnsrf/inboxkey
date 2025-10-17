/**
 * Tests for LockService
 *
 * Tests lock service functionality including:
 * - Status retrieval
 * - Password initialization
 * - Unlock with rate limiting
 * - Lock operations
 * - Password changes
 * - Disable password protection
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { LockService, getLockService } from '../lock-service'

// Mock chrome API
const mockSendMessage = vi.fn()
global.chrome = {
  runtime: {
    sendMessage: mockSendMessage,
  },
} as any

describe('LockService', () => {
  let lockService: LockService

  beforeEach(() => {
    vi.clearAllMocks()
    lockService = new LockService()
    // Reset rate limiting state
    lockService.resetRateLimiting()
  })

  describe('getStatus', () => {
    it('should return lock status from background', async () => {
      const mockResponse = {
        success: true,
        isInitialized: true,
        isUnlocked: false,
      }
      mockSendMessage.mockResolvedValue(mockResponse)

      const status = await lockService.getStatus()

      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'GET_LOCK_STATUS',
      })
      expect(status).toEqual({
        isInitialized: true,
        isUnlocked: false,
        isLoading: false,
      })
    })

    it('should return safe defaults when background fails', async () => {
      mockSendMessage.mockResolvedValue({
        success: false,
        error: 'Background error',
      })

      const status = await lockService.getStatus()

      expect(status).toEqual({
        isInitialized: false,
        isUnlocked: false,
        isLoading: false,
      })
    })

    it('should handle chrome runtime errors gracefully', async () => {
      mockSendMessage.mockRejectedValue(new Error('Runtime error'))

      const status = await lockService.getStatus()

      expect(status).toEqual({
        isInitialized: false,
        isUnlocked: false,
        isLoading: false,
      })
    })
  })

  describe('initialize', () => {
    it('should send initialization request with password', async () => {
      mockSendMessage.mockResolvedValue({ success: true })

      await lockService.initialize('MyStrongPassword123!')

      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'INITIALIZE_PASSWORD',
        password: 'MyStrongPassword123!',
      })
    })

    it('should reset rate limiting on successful initialization', async () => {
      // Set up unlock to fail first
      mockSendMessage.mockResolvedValueOnce({
        success: false,
        error: 'Wrong password',
      })

      // Artificially set failed attempts
      await lockService.unlock('wrong')
      expect((lockService as any).failedAttempts).toBe(1)

      // Now initialize should succeed
      mockSendMessage.mockResolvedValueOnce({ success: true })
      await lockService.initialize('MyStrongPassword123!')

      expect((lockService as any).failedAttempts).toBe(0)
      expect((lockService as any).lockoutUntil).toBe(null)
    })

    it('should throw error when initialization fails', async () => {
      mockSendMessage.mockResolvedValue({
        success: false,
        error: 'Password too weak',
      })

      await expect(lockService.initialize('weak')).rejects.toThrow('Password too weak')
    })

    it('should handle chrome runtime errors', async () => {
      mockSendMessage.mockRejectedValue(new Error('Connection error'))

      await expect(lockService.initialize('password')).rejects.toThrow(
        'Failed to initialize: Connection error'
      )
    })
  })

  describe('unlock', () => {
    it('should successfully unlock with correct password', async () => {
      mockSendMessage.mockResolvedValue({ success: true })

      const result = await lockService.unlock('correctPassword')

      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'UNLOCK',
        password: 'correctPassword',
      })
      expect(result).toEqual({ success: true })
    })

    it('should return error for wrong password', async () => {
      mockSendMessage.mockResolvedValue({
        success: false,
        error: 'Wrong password',
      })

      const result = await lockService.unlock('wrongPassword')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Wrong password')
    })

    it('should reset rate limiting on successful unlock', async () => {
      // Fail twice
      mockSendMessage.mockResolvedValueOnce({
        success: false,
        error: 'Wrong password',
      })
      await lockService.unlock('wrong1')

      mockSendMessage.mockResolvedValueOnce({
        success: false,
        error: 'Wrong password',
      })
      await lockService.unlock('wrong2')

      expect((lockService as any).failedAttempts).toBe(2)

      // Now succeed
      mockSendMessage.mockResolvedValueOnce({ success: true })
      await lockService.unlock('correct')

      expect((lockService as any).failedAttempts).toBe(0)
      expect((lockService as any).lockoutUntil).toBe(null)
    })

    it('should handle chrome runtime errors', async () => {
      mockSendMessage.mockRejectedValue(new Error('Network error'))

      const result = await lockService.unlock('password')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to unlock')
    })
  })

  describe('unlock with rate limiting', () => {
    it('should track failed attempts', async () => {
      mockSendMessage.mockResolvedValue({
        success: false,
        error: 'Wrong password',
      })

      await lockService.unlock('wrong1')
      expect((lockService as any).failedAttempts).toBe(1)

      await lockService.unlock('wrong2')
      expect((lockService as any).failedAttempts).toBe(2)

      await lockService.unlock('wrong3')
      expect((lockService as any).failedAttempts).toBe(3)
    })

    it('should lock out after 3 failed attempts', async () => {
      mockSendMessage.mockResolvedValue({
        success: false,
        error: 'Wrong password',
      })

      // First 3 attempts
      await lockService.unlock('wrong1')
      await lockService.unlock('wrong2')
      const result3 = await lockService.unlock('wrong3')

      expect(result3.success).toBe(false)
      expect(result3.error).toContain('Locked out for')
      expect(result3.error).toContain('second')

      // 4th attempt should be blocked immediately
      const result4 = await lockService.unlock('wrong4')
      expect(result4.success).toBe(false)
      expect(result4.error).toContain('Too many failed attempts')
      expect(result4.error).toContain('second')

      // Background should not be called for locked-out attempt
      expect(mockSendMessage).toHaveBeenCalledTimes(3)
    })

    it('should implement exponential backoff (1s after 3 attempts)', async () => {
      mockSendMessage.mockResolvedValue({
        success: false,
        error: 'Wrong password',
      })

      // Fail 3 times
      await lockService.unlock('wrong1')
      await lockService.unlock('wrong2')
      const result3 = await lockService.unlock('wrong3')

      // Check lockout duration is 1 second
      expect(result3.error).toContain('1 second')
      expect((lockService as any).lockoutUntil).toBeGreaterThan(Date.now())
      expect((lockService as any).lockoutUntil).toBeLessThanOrEqual(Date.now() + 1000)
    })

    it('should implement exponential backoff (2s after 4 attempts)', async () => {
      mockSendMessage.mockResolvedValue({
        success: false,
        error: 'Wrong password',
      })

      // Fail 3 times to trigger lockout
      await lockService.unlock('wrong1')
      await lockService.unlock('wrong2')
      await lockService.unlock('wrong3')

      // Wait for lockout to expire (1 second)
      const lockoutUntil = (lockService as any).lockoutUntil
      ;(lockService as any).lockoutUntil = Date.now() - 100 // Expire lockout

      // 4th attempt should trigger 2-second lockout
      const result4 = await lockService.unlock('wrong4')

      expect(result4.success).toBe(false)
      expect(result4.error).toContain('2 seconds')
      expect((lockService as any).failedAttempts).toBe(4)
    })

    it('should implement exponential backoff (4s after 5 attempts)', async () => {
      mockSendMessage.mockResolvedValue({
        success: false,
        error: 'Wrong password',
      })

      // Manually set up state for 5th attempt
      ;(lockService as any).failedAttempts = 4
      ;(lockService as any).lockoutUntil = Date.now() - 100 // No active lockout

      const result = await lockService.unlock('wrong5')

      expect(result.success).toBe(false)
      expect(result.error).toContain('4 seconds')
    })

    it('should implement exponential backoff (8s after 6 attempts)', async () => {
      mockSendMessage.mockResolvedValue({
        success: false,
        error: 'Wrong password',
      })

      // Manually set up state for 6th attempt
      ;(lockService as any).failedAttempts = 5
      ;(lockService as any).lockoutUntil = Date.now() - 100

      const result = await lockService.unlock('wrong6')

      expect(result.success).toBe(false)
      expect(result.error).toContain('8 seconds')
    })

    it('should allow retry after lockout period expires', async () => {
      mockSendMessage.mockResolvedValue({
        success: false,
        error: 'Wrong password',
      })

      // Trigger lockout
      await lockService.unlock('wrong1')
      await lockService.unlock('wrong2')
      await lockService.unlock('wrong3')

      // Manually expire lockout
      ;(lockService as any).lockoutUntil = Date.now() - 100

      // Should allow retry
      const result = await lockService.unlock('retry')

      expect(result.success).toBe(false)
      expect(result.error).not.toContain('Too many failed attempts')
      expect(mockSendMessage).toHaveBeenCalledTimes(4) // 3 + 1 retry
    })

    it('should show singular second for 1 second lockout', async () => {
      mockSendMessage.mockResolvedValue({
        success: false,
        error: 'Wrong password',
      })

      // Trigger 1-second lockout
      await lockService.unlock('wrong1')
      await lockService.unlock('wrong2')
      const result = await lockService.unlock('wrong3')

      expect(result.error).toContain('1 second')
      expect(result.error).not.toContain('1 seconds')
    })

    it('should show plural seconds for multi-second lockout', async () => {
      mockSendMessage.mockResolvedValue({
        success: false,
        error: 'Wrong password',
      })

      ;(lockService as any).failedAttempts = 4
      ;(lockService as any).lockoutUntil = Date.now() - 100

      const result = await lockService.unlock('wrong5')

      expect(result.error).toContain('4 seconds')
    })
  })

  describe('lock', () => {
    it('should send lock request to background', async () => {
      mockSendMessage.mockResolvedValue({ success: true })

      await lockService.lock()

      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'LOCK',
      })
    })

    it('should throw error when lock fails', async () => {
      mockSendMessage.mockResolvedValue({
        success: false,
        error: 'Lock failed',
      })

      await expect(lockService.lock()).rejects.toThrow('Lock failed')
    })

    it('should handle chrome runtime errors', async () => {
      mockSendMessage.mockRejectedValue(new Error('Connection lost'))

      await expect(lockService.lock()).rejects.toThrow('Failed to lock: Connection lost')
    })
  })

  describe('changePassword', () => {
    it('should send change password request', async () => {
      mockSendMessage.mockResolvedValue({ success: true })

      await lockService.changePassword('oldPassword', 'newPassword123!')

      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'CHANGE_PASSWORD',
        currentPassword: 'oldPassword',
        newPassword: 'newPassword123!',
      })
    })

    it('should reset rate limiting on successful password change', async () => {
      mockSendMessage.mockResolvedValue({ success: true })

      // Set up failed attempts
      ;(lockService as any).failedAttempts = 5
      ;(lockService as any).lockoutUntil = Date.now() + 10000

      await lockService.changePassword('old', 'new')

      expect((lockService as any).failedAttempts).toBe(0)
      expect((lockService as any).lockoutUntil).toBe(null)
    })

    it('should throw error when change fails', async () => {
      mockSendMessage.mockResolvedValue({
        success: false,
        error: 'Current password is incorrect',
      })

      await expect(lockService.changePassword('wrong', 'new')).rejects.toThrow(
        'Current password is incorrect'
      )
    })

    it('should handle chrome runtime errors', async () => {
      mockSendMessage.mockRejectedValue(new Error('Service unavailable'))

      await expect(lockService.changePassword('old', 'new')).rejects.toThrow(
        'Failed to change password: Service unavailable'
      )
    })
  })

  describe('disablePasswordProtection', () => {
    it('should send disable request with password', async () => {
      mockSendMessage.mockResolvedValue({ success: true })

      await lockService.disablePasswordProtection('myPassword')

      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'DISABLE_PASSWORD',
        password: 'myPassword',
      })
    })

    it('should reset rate limiting on successful disable', async () => {
      mockSendMessage.mockResolvedValue({ success: true })

      // Set up failed attempts
      ;(lockService as any).failedAttempts = 3
      ;(lockService as any).lockoutUntil = Date.now() + 5000

      await lockService.disablePasswordProtection('password')

      expect((lockService as any).failedAttempts).toBe(0)
      expect((lockService as any).lockoutUntil).toBe(null)
    })

    it('should throw error when disable fails', async () => {
      mockSendMessage.mockResolvedValue({
        success: false,
        error: 'Password is incorrect',
      })

      await expect(lockService.disablePasswordProtection('wrong')).rejects.toThrow(
        'Password is incorrect'
      )
    })

    it('should handle chrome runtime errors', async () => {
      mockSendMessage.mockRejectedValue(new Error('Operation failed'))

      await expect(lockService.disablePasswordProtection('password')).rejects.toThrow(
        'Failed to disable password protection: Operation failed'
      )
    })
  })

  describe('resetRateLimiting', () => {
    it('should reset failed attempts and lockout', () => {
      // Set up rate limiting state
      ;(lockService as any).failedAttempts = 5
      ;(lockService as any).lockoutUntil = Date.now() + 10000

      lockService.resetRateLimiting()

      expect((lockService as any).failedAttempts).toBe(0)
      expect((lockService as any).lockoutUntil).toBe(null)
    })
  })

  describe('getLockService singleton', () => {
    it('should return same instance on multiple calls', () => {
      const instance1 = getLockService()
      const instance2 = getLockService()

      expect(instance1).toBe(instance2)
    })
  })
})
