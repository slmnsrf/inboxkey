/**
 * Unit tests for IMAPBridgeAdapter.convertToEmailLike (the bridge wire-shape
 * boundary).
 *
 * Body source resolution is the contract that matters for InboxBridge 1.1.4:
 *   - Bridge 1.1.4+ returns MIME-decoded `text` and `html` body parts.
 *   - Older bridges only return `snippet` (raw RFC822 envelope, ~200 chars).
 *
 * The adapter must prefer `text` when present, fall back to `snippet`, and
 * surface `html` whenever the bridge supplies it. These tests pin the
 * fallback ladder so a future refactor cannot silently regress users
 * paired with an old bridge OR break new-bridge extraction.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { IMAPBridgeAdapter } from '@/lib/providers/imap-bridge/imap-bridge-adapter'

// The adapter calls `NativeMessagingClient.getInstance()` which internally
// touches the chrome.* runtime. Stub the singleton so we can drive the
// fetchRecent response shape directly without booting native messaging.
const requestMock = vi.fn()
vi.mock('@/lib/native-messaging', async () => {
  const actual = await vi.importActual<typeof import('@/lib/native-messaging')>(
    '@/lib/native-messaging'
  )
  return {
    ...actual,
    NativeMessagingClient: {
      getInstance: () => ({
        request: requestMock,
      }),
    },
  }
})

describe('IMAPBridgeAdapter.listRecent body source resolution', () => {
  beforeEach(() => {
    requestMock.mockReset()
  })

  function makeAdapter() {
    return new IMAPBridgeAdapter('acc_123', 'user@example.com', 'mailbox-uuid')
  }

  it('uses text/html from new-bridge response when both are present', async () => {
    requestMock.mockResolvedValue({
      messages: [
        {
          uid: 1,
          mailbox: 'INBOX',
          date: '2026-05-04T00:00:00Z',
          from: 'sender@example.com',
          subject: 'Verify',
          snippet: 'Decoded preview text',
          text: 'Your code is 123456',
          html: '<p>Your code is <b>123456</b></p>',
        },
      ],
    })

    const adapter = makeAdapter()
    const result = await adapter.listRecent({ sinceEpochMs: Date.now() - 60_000, max: 15 })

    expect(result).toHaveLength(1)
    expect(result[0].text).toBe('Your code is 123456')
    expect(result[0].html).toBe('<p>Your code is <b>123456</b></p>')
    expect(result[0].subject).toBe('Verify')
    expect(result[0].from).toBe('sender@example.com')
    expect(result[0].provider).toBe('imap-bridge')
  })

  it('falls back to snippet when an old bridge omits text', async () => {
    // Old (pre-1.1.4) bridge wire shape: only snippet is populated.
    requestMock.mockResolvedValue({
      messages: [
        {
          uid: 2,
          mailbox: 'INBOX',
          date: '2026-05-04T00:00:00Z',
          from: 'sender@example.com',
          subject: 'Verify',
          snippet: 'Old bridge snippet content',
        },
      ],
    })

    const adapter = makeAdapter()
    const result = await adapter.listRecent({ sinceEpochMs: Date.now() - 60_000, max: 15 })

    expect(result[0].text).toBe('Old bridge snippet content')
    expect(result[0].html).toBeUndefined()
  })

  it('prefers text over snippet even when both are present', async () => {
    // New bridge sends BOTH for back-compat. Adapter must NOT use snippet.
    requestMock.mockResolvedValue({
      messages: [
        {
          uid: 3,
          mailbox: 'INBOX',
          date: '2026-05-04T00:00:00Z',
          from: 'sender@example.com',
          subject: 'Verify',
          snippet: 'preview',
          text: 'full decoded body',
        },
      ],
    })

    const adapter = makeAdapter()
    const result = await adapter.listRecent({ sinceEpochMs: Date.now() - 60_000, max: 15 })

    expect(result[0].text).toBe('full decoded body')
  })

  it('produces empty text when both text and snippet are missing', async () => {
    requestMock.mockResolvedValue({
      messages: [
        {
          uid: 4,
          mailbox: 'INBOX',
          date: '2026-05-04T00:00:00Z',
          from: 'sender@example.com',
          subject: 'Empty',
        },
      ],
    })

    const adapter = makeAdapter()
    const result = await adapter.listRecent({ sinceEpochMs: Date.now() - 60_000, max: 15 })

    expect(result[0].text).toBe('')
    expect(result[0].html).toBeUndefined()
  })

  it('passes html through verbatim when bridge omits the field', async () => {
    // The bridge's mail-parser usually synthesizes html from text, but it
    // CAN omit html if no body part can be derived at all (e.g. malformed
    // input). The adapter must pass `undefined` through, not invent a value.
    requestMock.mockResolvedValue({
      messages: [
        {
          uid: 5,
          mailbox: 'INBOX',
          date: '2026-05-04T00:00:00Z',
          from: 'sender@example.com',
          subject: 'Plain',
          snippet: 'snippet',
          text: 'plain body',
          // html: omitted
        },
      ],
    })

    const adapter = makeAdapter()
    const result = await adapter.listRecent({ sinceEpochMs: Date.now() - 60_000, max: 15 })

    expect(result[0].html).toBeUndefined()
    expect(result[0].text).toBe('plain body')
  })

  it('builds composite id from accountId, mailbox, and uid', async () => {
    requestMock.mockResolvedValue({
      messages: [
        {
          uid: 99,
          mailbox: 'INBOX',
          date: '2026-05-04T00:00:00Z',
          from: 'sender@example.com',
          subject: 'X',
          snippet: '',
          text: '',
        },
      ],
    })

    const adapter = makeAdapter()
    const result = await adapter.listRecent({ sinceEpochMs: Date.now() - 60_000, max: 15 })

    expect(result[0].id).toBe('acc_123:INBOX:99')
  })
})
