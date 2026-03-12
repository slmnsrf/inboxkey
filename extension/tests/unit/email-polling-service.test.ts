/**
 * Unit Tests for EmailPollingService — mailboxId propagation
 */

import { describe, it, expect, vi } from 'vitest'

// Mock extraction-core before importing the service
vi.mock('@inboxkey/extraction-core', () => ({
  extractFromEmail: vi.fn((_email, _ctx) => ({
    otps: [{ code: '123456', confidence: 0.95, charset: 'digits' }],
    links: [],
  })),
}))

// Mock popup-config
vi.mock('@/lib/popup/popup-config', () => ({
  SCORE_POPUP: 0.6,
}))

import { EmailPollingService } from '../../src/lib/services/email-polling-service'
import type { ProviderAdapter } from '../../src/lib/services/email-polling-service'
import { SeenMessageStore } from '../../src/lib/services/seen-message-store'

describe('mailboxId propagation', () => {
  it('should skip adapters without mailboxId and log warning', async () => {
    const adapterWithoutMailboxId = {
      id: 'gmail' as const,
      // mailboxId intentionally omitted
      listRecent: vi.fn().mockResolvedValue([]),
    }
    const adapterWithMailboxId: ProviderAdapter = {
      id: 'gmail',
      mailboxId: 'mbx-123',
      listRecent: vi.fn().mockResolvedValue([]),
    }

    const service = new EmailPollingService([adapterWithoutMailboxId as any, adapterWithMailboxId])
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await service.pollOnce()

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('skipping adapter without mailboxId')
    )
    expect(adapterWithoutMailboxId.listRecent).not.toHaveBeenCalled()
    expect(adapterWithMailboxId.listRecent).toHaveBeenCalled()

    warnSpy.mockRestore()
  })

  it('should set mailboxId on all CandidateRecords', async () => {
    const adapter: ProviderAdapter = {
      id: 'gmail',
      mailboxId: 'mbx-456',
      listRecent: vi.fn().mockResolvedValue([{
        id: 'msg-1',
        provider: 'gmail',
        mailboxId: 'mbx-456',
        subject: 'Your code is 123456',
        from: 'noreply@example.com',
        receivedEpochMs: Date.now(),
        text: 'Your verification code is 123456',
      }]),
    }

    const service = new EmailPollingService([adapter])
    const results = await service.pollOnce()

    expect(results.length).toBeGreaterThan(0)
    for (const r of results) {
      expect(r.mailboxId).toBe('mbx-456')
    }
  })
})

describe('duplicate suppression persistence', () => {
  it('should not re-process messages seen by a previous EmailPollingService instance', async () => {
    // Use real in-memory storage (not overridden mock) so the store actually persists
    const store = new SeenMessageStore()
    const email = {
      id: 'msg-dup-1',
      provider: 'gmail' as const,
      mailboxId: 'mbx-1',
      subject: 'Your code is 999888',
      from: 'noreply@test.com',
      receivedEpochMs: Date.now(),
      text: 'Your verification code is 999888',
    }
    const adapter: ProviderAdapter = {
      id: 'gmail',
      mailboxId: 'mbx-1',
      listRecent: vi.fn().mockResolvedValue([email]),
    }

    // First poll — message should be processed
    const service1 = new EmailPollingService([adapter], store)
    const results1 = await service1.pollOnce()
    expect(results1.length).toBeGreaterThan(0)

    // Second poll with a NEW EmailPollingService instance but the SAME store
    const service2 = new EmailPollingService([adapter], store)
    const results2 = await service2.pollOnce()
    // Message was already seen — must not appear again
    expect(results2.length).toBe(0)
  })
})
