/**
 * Unit Tests for EmailPollingService - mailboxId propagation
 */

import { describe, it, expect, vi } from 'vitest'

// Mock extraction-core before importing the service
vi.mock('@inboxkey/extraction-core', () => ({
  extractFromEmail: vi.fn((email: { subject?: string }, _ctx: unknown) => {
    // Extract a 6-digit code from subject if present (supports freshness-floor tests)
    const match = (email.subject || '').match(/\b(\d{6})\b/)
    const code = match ? match[1] : '123456'
    return {
      otps: [{ code, confidence: 0.95, charset: 'digits' }],
      links: [],
    }
  }),
  // Stub the extractor version constant the polling service stamps into
  // its seen-message keys. Real value lives in extraction-types.ts.
  EXTRACTOR_VERSION: '1',
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
    const { candidates } = await service.pollOnce()

    expect(candidates.length).toBeGreaterThan(0)
    for (const r of candidates) {
      expect(r.mailboxId).toBe('mbx-456')
    }
  })
})

describe('freshness floor', () => {
  it('should filter out messages older than the time window', async () => {
    const now = Date.now()
    const adapter: ProviderAdapter = {
      id: 'gmail',
      mailboxId: 'mbx-1',
      listRecent: vi.fn().mockResolvedValue([
        {
          id: 'fresh-msg',
          provider: 'gmail',
          mailboxId: 'mbx-1',
          subject: 'Your code is 111222',
          from: 'noreply@test.com',
          receivedEpochMs: now - 2 * 60 * 1000, // 2 min ago (within 10-min window)
          text: 'Your verification code is 111222',
        },
        {
          id: 'stale-msg',
          provider: 'gmail',
          mailboxId: 'mbx-1',
          subject: 'Your code is 333444',
          from: 'noreply@test.com',
          receivedEpochMs: now - 60 * 60 * 1000, // 60 min ago (outside window)
          text: 'Your verification code is 333444',
        },
      ]),
    }

    const service = new EmailPollingService([adapter])
    const { candidates } = await service.pollOnce({}, { timeWindowMin: 10 })

    const codes = candidates.map(r => r.code?.value).filter(Boolean)
    expect(codes).toContain('111222')
    expect(codes).not.toContain('333444')
  })
})

describe('per-adapter result tracking', () => {
  it('should return adapterResults with success/failure per mailbox', async () => {
    const goodAdapter: ProviderAdapter = {
      id: 'gmail',
      mailboxId: 'mbx-good',
      listRecent: vi.fn().mockResolvedValue([]),
    }
    const badAdapter: ProviderAdapter = {
      id: 'imap-bridge',
      mailboxId: 'mbx-bad',
      listRecent: vi.fn().mockRejectedValue(new Error('Network error')),
    }

    const service = new EmailPollingService([goodAdapter, badAdapter])
    const result = await service.pollOnce()

    expect(result.adapterResults).toBeDefined()
    expect(result.adapterResults).toHaveLength(2)

    const good = result.adapterResults.find(r => r.mailboxId === 'mbx-good')
    expect(good?.success).toBe(true)

    const bad = result.adapterResults.find(r => r.mailboxId === 'mbx-bad')
    expect(bad?.success).toBe(false)
    expect(bad?.error).toContain('Network error')
  })
})

describe('IMAP adapter error propagation (Finding #3)', () => {
  it('should mark adapter as failed when listRecent throws (not silent success)', async () => {
    const imapAdapter: ProviderAdapter = {
      id: 'imap-bridge',
      mailboxId: 'mbx-imap',
      listRecent: vi.fn().mockRejectedValue(new Error('IMAP auth failed')),
    }
    const gmailAdapter: ProviderAdapter = {
      id: 'gmail',
      mailboxId: 'mbx-gmail',
      listRecent: vi.fn().mockResolvedValue([]),
    }

    const service = new EmailPollingService([imapAdapter, gmailAdapter])
    const result = await service.pollOnce()

    const imapResult = result.adapterResults.find(r => r.mailboxId === 'mbx-imap')
    expect(imapResult?.success).toBe(false)
    expect(imapResult?.error).toContain('IMAP auth failed')

    const gmailResult = result.adapterResults.find(r => r.mailboxId === 'mbx-gmail')
    expect(gmailResult?.success).toBe(true)
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

    // First poll - message should be processed
    const service1 = new EmailPollingService([adapter], store)
    const { candidates: candidates1 } = await service1.pollOnce()
    expect(candidates1.length).toBeGreaterThan(0)

    // Second poll with a NEW EmailPollingService instance but the SAME store
    const service2 = new EmailPollingService([adapter], store)
    const { candidates: candidates2 } = await service2.pollOnce()
    // Message was already seen - must not appear again
    expect(candidates2.length).toBe(0)
  })
})
