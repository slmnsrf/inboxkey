/**
 * Profile Fetching Error Handling Tests
 *
 * Tests for improved error handling in profile fetch functions
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { fetchGmailProfile } from '@/lib/providers/gmail/profile'

describe('Profile Fetching Error Handling', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  describe('fetchGmailProfile', () => {
    it('should throw PROFILE_AUTH_FAILED on 401 status', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      })

      await expect(fetchGmailProfile('fake-token')).rejects.toThrow('PROFILE_AUTH_FAILED')
    })

    it('should throw PROFILE_AUTH_FAILED on 403 status', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
      })

      await expect(fetchGmailProfile('fake-token')).rejects.toThrow('PROFILE_AUTH_FAILED')
    })

    it('should throw PROFILE_RATE_LIMITED on 429 status', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
      })

      await expect(fetchGmailProfile('fake-token')).rejects.toThrow('PROFILE_RATE_LIMITED')
    })

    it('should throw PROFILE_SERVER_ERROR on 500 status', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      })

      await expect(fetchGmailProfile('fake-token')).rejects.toThrow('PROFILE_SERVER_ERROR')
    })

    it('should throw PROFILE_NO_EMAIL when emailAddress is missing', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ someOtherField: 'value' }),
      })

      await expect(fetchGmailProfile('fake-token')).rejects.toThrow('PROFILE_NO_EMAIL')
    })

    it('should throw PROFILE_NETWORK_ERROR on network failure', async () => {
      global.fetch = vi.fn().mockRejectedValue(new TypeError('Network request failed'))

      await expect(fetchGmailProfile('fake-token')).rejects.toThrow('PROFILE_NETWORK_ERROR')
    })

    it('should return email address on success', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ emailAddress: 'user@gmail.com' }),
      })

      const email = await fetchGmailProfile('valid-token')
      expect(email).toBe('user@gmail.com')
    })
  })
})
