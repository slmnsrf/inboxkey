import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  PlaintextStorage,
  __resetGmailMigrationForTests,
  __setBackgroundSWOverrideForTests,
} from '@/lib/storage/plaintext-storage'

// Stub chrome.storage.local; vitest globals are set by happy-dom in this repo
const storage: Record<string, unknown> = {}
beforeEach(() => {
  __resetGmailMigrationForTests()
  // Simulate the background service worker context: in production the
  // migration shim only persists from the SW (single-writer invariant),
  // but happy-dom defines `window` so the runtime detection would
  // classify the test as a non-SW context. Force it on here to exercise
  // the persistence path.
  __setBackgroundSWOverrideForTests(true)
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

afterEach(() => {
  __setBackgroundSWOverrideForTests(null)
})

describe('Gmail OAuth migration shim', () => {
  it('silently removes legacy gmail-providerId records on getMailboxes()', async () => {
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

    const persisted = storage['mailboxes_plain'] as { providerId: string }[]
    expect(persisted).toHaveLength(1)
    expect(persisted.every((m) => m.providerId !== 'gmail')).toBe(true)
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

    const setSpy = (global.chrome.storage.local.set as ReturnType<typeof vi.fn>)
    const ps = new PlaintextStorage()
    await ps.getMailboxes()

    expect(setSpy).not.toHaveBeenCalled()
  })
})
