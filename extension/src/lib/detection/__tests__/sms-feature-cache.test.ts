/**
 * Tests for SMS Feature Cache
 *
 * Validates that the synchronous cache boolean reflects whether a
 * google-messages mailbox exists in storage. Fail-closed on errors.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Track the mock storage instance so tests can configure getMailboxes()
const mockGetMailboxes = vi.fn()

vi.mock('@/lib/storage/storage-factory', () => ({
  StorageFactory: {
    create: vi.fn(async () => ({
      getMailboxes: mockGetMailboxes,
    })),
  },
}))

import {
  hydrateSmsCache,
  _resetSmsCacheForTest,
} from '../sms-feature-cache'

// Capture the onChanged listener that was registered at module load time.
// We must grab it AFTER the import (which triggers module-level code).
const addListenerSpy = vi.mocked(chrome.storage.onChanged.addListener)
const registeredOnChangedListener = addListenerSpy.mock.calls[0]?.[0] as
  | ((changes: Record<string, unknown>, areaName: string) => void)
  | undefined

describe('sms-feature-cache', () => {
  beforeEach(() => {
    // Only clear the storage factory mocks, NOT chrome.storage.onChanged
    // (the listener was registered once at module load time)
    mockGetMailboxes.mockReset()
    _resetSmsCacheForTest()
  })

  describe('hydrateSmsCache()', () => {
    it('sets cache to true when a google-messages mailbox exists', async () => {
      mockGetMailboxes.mockResolvedValue([
        {
          id: '11111111-1111-4111-a111-111111111111',
          providerId: 'google-messages',
          email: 'sms@placeholder.local',
          gmPhoneNumber: '+905551234455',
          addedAt: Date.now(),
          lastSyncedAt: 0,
        },
      ])

      await hydrateSmsCache()

      const mod = await import('../sms-feature-cache')
      expect(mod.smsFeatureEnabledCache).toBe(true)
    })

    it('sets cache to true when google-messages exists alongside other providers', async () => {
      mockGetMailboxes.mockResolvedValue([
        {
          id: '22222222-2222-4222-a222-222222222222',
          providerId: 'imap-bridge',
          email: 'user@example.com',
          imapServer: 'imap.example.com',
          imapPort: 993,
          imapAccountId: 'acc_test',
          addedAt: Date.now(),
          lastSyncedAt: 0,
        },
        {
          id: '33333333-3333-4333-a333-333333333333',
          providerId: 'google-messages',
          email: 'sms@placeholder.local',
          gmPhoneNumber: '+905551234455',
          addedAt: Date.now(),
          lastSyncedAt: 0,
        },
      ])

      await hydrateSmsCache()

      const mod = await import('../sms-feature-cache')
      expect(mod.smsFeatureEnabledCache).toBe(true)
    })

    it('sets cache to false when no google-messages mailbox exists', async () => {
      mockGetMailboxes.mockResolvedValue([
        {
          id: '44444444-4444-4444-a444-444444444444',
          providerId: 'imap-bridge',
          email: 'user@example.com',
          imapServer: 'imap.example.com',
          imapPort: 993,
          imapAccountId: 'acc_test',
          addedAt: Date.now(),
          lastSyncedAt: 0,
        },
      ])

      await hydrateSmsCache()

      const mod = await import('../sms-feature-cache')
      expect(mod.smsFeatureEnabledCache).toBe(false)
    })

    it('sets cache to false when mailboxes array is empty', async () => {
      mockGetMailboxes.mockResolvedValue([])

      await hydrateSmsCache()

      const mod = await import('../sms-feature-cache')
      expect(mod.smsFeatureEnabledCache).toBe(false)
    })

    it('sets cache to false on storage error (fail-closed)', async () => {
      // First hydrate with a google-messages mailbox to set cache to true
      mockGetMailboxes.mockResolvedValue([
        {
          id: '11111111-1111-4111-a111-111111111111',
          providerId: 'google-messages',
          email: 'sms@placeholder.local',
          gmPhoneNumber: '+905551234455',
          addedAt: Date.now(),
          lastSyncedAt: 0,
        },
      ])
      await hydrateSmsCache()

      const mod = await import('../sms-feature-cache')
      expect(mod.smsFeatureEnabledCache).toBe(true)

      // Now make storage throw
      mockGetMailboxes.mockRejectedValue(new Error('Storage error'))
      await hydrateSmsCache()

      expect(mod.smsFeatureEnabledCache).toBe(false)
    })

    it('sets cache to false when StorageFactory.create() throws', async () => {
      // First hydrate with a google-messages mailbox
      mockGetMailboxes.mockResolvedValue([
        {
          id: '11111111-1111-4111-a111-111111111111',
          providerId: 'google-messages',
          email: 'sms@placeholder.local',
          gmPhoneNumber: '+905551234455',
          addedAt: Date.now(),
          lastSyncedAt: 0,
        },
      ])
      await hydrateSmsCache()

      const mod = await import('../sms-feature-cache')
      expect(mod.smsFeatureEnabledCache).toBe(true)

      // Now make factory throw
      const { StorageFactory } = await import('@/lib/storage/storage-factory')
      vi.mocked(StorageFactory.create).mockRejectedValueOnce(
        new Error('Cannot create storage')
      )

      await hydrateSmsCache()

      expect(mod.smsFeatureEnabledCache).toBe(false)
    })
  })

  describe('storage.onChanged listener', () => {
    it('registers a listener on chrome.storage.onChanged at module load', () => {
      // The listener is registered at module load time (already happened).
      // We captured it above after importing the module.
      expect(registeredOnChangedListener).toBeDefined()
    })

    it('re-hydrates cache when mailboxes_plain changes', async () => {
      // Initial state: no google-messages
      mockGetMailboxes.mockResolvedValue([])
      await hydrateSmsCache()

      const mod = await import('../sms-feature-cache')
      expect(mod.smsFeatureEnabledCache).toBe(false)

      // Now simulate adding a google-messages mailbox
      mockGetMailboxes.mockResolvedValue([
        {
          id: '55555555-5555-4555-a555-555555555555',
          providerId: 'google-messages',
          email: 'sms@placeholder.local',
          gmPhoneNumber: '+905551234455',
          addedAt: Date.now(),
          lastSyncedAt: 0,
        },
      ])

      // Fire the onChanged listener with mailboxes_plain key
      registeredOnChangedListener!(
        { mailboxes_plain: { newValue: [] } },
        'local'
      )

      // Wait for the async hydration to complete
      await vi.waitFor(() => {
        expect(mod.smsFeatureEnabledCache).toBe(true)
      })
    })

    it('does not re-hydrate when unrelated storage key changes', async () => {
      mockGetMailboxes.mockResolvedValue([])
      await hydrateSmsCache()

      const callCountAfterHydrate = mockGetMailboxes.mock.calls.length

      // Fire with unrelated key
      registeredOnChangedListener!(
        { settings: { newValue: 'anything' } },
        'local'
      )

      // Give async a tick
      await new Promise(resolve => setTimeout(resolve, 10))

      // getMailboxes should not have been called again
      expect(mockGetMailboxes.mock.calls.length).toBe(callCountAfterHydrate)
    })
  })
})
