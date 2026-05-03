import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PlaintextStorage } from '@/lib/storage/plaintext-storage'

// Stub chrome.storage.local; vitest globals are set by happy-dom in this repo.
//
// This test covers the in-memory legacy-record filter inside
// `PlaintextStorage.getMailboxes()`. The persistent removal (writing the
// cleaned list back + scrubbing sync_error_state) lives in
// `extension/src/background/index.ts` alongside the pre-existing legacy-
// Outlook cleanup, where both providers are handled in one serialized pass.
const storage: Record<string, unknown> = {}
beforeEach(() => {
  Object.keys(storage).forEach((k) => delete storage[k])
  global.chrome = {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: storage[key] })),
        set: vi.fn(async (entries: Record<string, unknown>) => {
          Object.assign(storage, entries)
        }),
      },
    },
  } as unknown as typeof chrome
})

describe('Gmail OAuth in-memory legacy filter', () => {
  it('hides legacy gmail-providerId records from getMailboxes() result', async () => {
    storage['mailboxes_plain'] = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        providerId: 'gmail',
        email: 'legacy-user@example.com',
        accessToken: 'legacy-access-token',
        refreshToken: 'legacy-refresh-token',
        tokenExpiresAt: Date.now() + 3600_000,
        addedAt: Date.now() - 86400_000,
        lastSyncedAt: Date.now() - 3600_000,
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        providerId: 'imap-bridge',
        email: 'imap-user@example.com',
        imapServer: 'imap.example.com',
        imapPort: 993,
        imapAccountId: 'acc_keep_me',
        addedAt: Date.now() - 86400_000,
        lastSyncedAt: Date.now() - 3600_000,
      },
    ]

    const ps = new PlaintextStorage()
    const result = await ps.getMailboxes()

    expect(result).toHaveLength(1)
    expect(result[0].providerId).toBe('imap-bridge')
    expect(result[0].email).toBe('imap-user@example.com')
  })

  it('does not write storage from getMailboxes() (persistence is handled in background/index.ts)', async () => {
    storage['mailboxes_plain'] = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        providerId: 'gmail',
        email: 'legacy-user@example.com',
        accessToken: 'legacy-access-token',
        refreshToken: 'legacy-refresh-token',
        tokenExpiresAt: Date.now() + 3600_000,
        addedAt: Date.now() - 86400_000,
        lastSyncedAt: Date.now() - 3600_000,
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        providerId: 'imap-bridge',
        email: 'imap-user@example.com',
        imapServer: 'imap.example.com',
        imapPort: 993,
        imapAccountId: 'acc_keep_me',
        addedAt: Date.now() - 86400_000,
        lastSyncedAt: Date.now() - 3600_000,
      },
    ]

    const setSpy = global.chrome.storage.local.set as ReturnType<typeof vi.fn>
    const ps = new PlaintextStorage()
    await ps.getMailboxes()

    expect(setSpy).not.toHaveBeenCalled()
  })

  it('is a no-op when no legacy gmail records exist', async () => {
    storage['mailboxes_plain'] = [
      {
        id: '22222222-2222-4222-8222-222222222222',
        providerId: 'imap-bridge',
        email: 'imap-user@example.com',
        imapServer: 'imap.example.com',
        imapPort: 993,
        imapAccountId: 'acc_only',
        addedAt: Date.now() - 86400_000,
        lastSyncedAt: Date.now() - 3600_000,
      },
    ]

    const setSpy = global.chrome.storage.local.set as ReturnType<typeof vi.fn>
    const ps = new PlaintextStorage()
    const result = await ps.getMailboxes()

    expect(result).toHaveLength(1)
    expect(setSpy).not.toHaveBeenCalled()
  })
})
