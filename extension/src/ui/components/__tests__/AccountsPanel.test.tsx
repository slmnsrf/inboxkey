import React from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AccountsPanel } from '../AccountsPanel'
import { ToastProvider } from '../../contexts/ToastContext'

// Mocks must be hoisted before any imports that use them
vi.mock('@/lib/providers/gmail/chrome-auth', () => ({
  authenticateGmail: vi.fn(),
}))

vi.mock('@/lib/providers/outlook/chrome-auth', () => ({
  authenticateOutlook: vi.fn(),
}))

vi.mock('@/lib/providers/gmail/profile', () => ({
  fetchGmailProfile: vi.fn(),
}))

vi.mock('@/lib/providers/outlook/profile', () => ({
  fetchOutlookProfile: vi.fn(),
}))

vi.mock('@/lib/providers/gmail/config', () => ({
  isGmailConfigured: () => true,
}))

vi.mock('@/lib/providers/outlook/config', () => ({
  isOutlookConfigured: () => true,
}))

// Import the mocked functions after mocks are set up
const { authenticateGmail: mockAuthenticateGmail } = await import('@/lib/providers/gmail/chrome-auth')
const { authenticateOutlook: _mockAuthenticateOutlook } = await import('@/lib/providers/outlook/chrome-auth')
const { fetchGmailProfile: mockFetchGmailProfile } = await import('@/lib/providers/gmail/profile')
const { fetchOutlookProfile: _mockFetchOutlookProfile } = await import('@/lib/providers/outlook/profile')

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <ToastProvider>
      {ui}
    </ToastProvider>
  )
}

describe('AccountsPanel (UI Rework)', () => {
  const mockSendMessage = vi.fn()
  const mockTabsCreate = vi.fn()
  const mockStorageGet = vi.fn()
  const mockStorageSet = vi.fn()
  const mockClipboardWrite = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    mockSendMessage.mockImplementation((msg: any) => {
      if (msg.type === 'GET_MAILBOXES') {
        return Promise.resolve({ success: true, mailboxes: [] })
      }
      if (msg.type === 'GET_POPUP_DATA') {
        return Promise.resolve({
          success: true,
          data: {
            codes: [],
            magicLinks: [],
            lastSync: Date.now(),
            mailboxCount: 0,
          },
        })
      }
      return Promise.resolve({ success: true })
    })

    mockStorageGet.mockResolvedValue({})
    mockStorageSet.mockResolvedValue(void 0)

    Object.defineProperty(global.navigator, 'clipboard', {
      value: { writeText: mockClipboardWrite },
      writable: true,
      configurable: true,
    })

    global.chrome = {
      runtime: {
        sendMessage: mockSendMessage,
      },
      tabs: {
        create: mockTabsCreate,
      },
      storage: {
        local: {
          get: mockStorageGet,
          set: mockStorageSet,
        },
      },
      i18n: {
        getMessage: (key: string, substitutions?: string | string[]) => {
          const translations: Record<string, string> = {
            accounts_provider_gmail: "Gmail",
            accounts_provider_outlook: "Outlook",
            accounts_microcopy_gmail: "One account supported via Chrome Identity API.",
            accounts_microcopy_outlook: "Add up to 10 Outlook accounts.",
            accounts_empty_gmail: "No Gmail account connected.",
            accounts_empty_outlook: "No Outlook accounts connected.",
            accounts_connect_gmail: "Connect Gmail",
            accounts_connect_outlook: "Connect Outlook",
            accounts_recent_title: "Recent Emails",
            accounts_recent_description: "Your latest verification codes and magic links",
            accounts_recent_empty: "No recent activity",
            accounts_recent_loading: "Loading...",
            accounts_status_not_connected: "Not connected",
            accounts_status_connected: "Connected",
            accounts_status_error: "Error",
            accounts_disconnect: "Disconnect",
            accounts_disconnecting: "Disconnecting...",
            accounts_connecting: "Connecting...",
            accounts_authenticating: "Authenticating...",
            accounts_loading_profile: "Loading profile...",
            accounts_saving: "Saving...",
            accounts_remove_confirm: "Are you sure?",
            accounts_gmail_limit_learn_why: "Learn why",
            accounts_gmail_limit_modal_title: "Gmail Limitation",
            accounts_gmail_limit_modal_body: "Chrome Identity API limits Gmail to one account.",
            accounts_imap_provider_name: "IMAP",
            accounts_imap_microcopy: "Connect via InboxBridge.",
            accounts_imap_empty: "No IMAP accounts connected.",
            accounts_imap_add: "Add IMAP Account",
            toast_connect_failed: "Connection failed",
            toast_connect_invalid_credentials: "Invalid credentials",
            toast_connect_profile_failed: "Failed to load profile",
            toast_connect_network_error: "Network error",
            toast_connect_duplicate: "Account already connected",
            toast_disconnect_failed: "Disconnect failed",
            toast_oauth_cancelled: "OAuth cancelled",
            toast_error_copy: "Failed to copy",
            toast_error_link: "Failed to open link",
            trust_indicator_title: "Privacy first",
            trust_indicator_readonly: "Read-only access to your emails",
            trust_indicator_local_storage: "Local storage only",
            trust_indicator_local: "All processing happens locally",
            label_from: "From",
            label_to: "To",
            label_subject: "Subject",
            label_code: "Code",
            button_copy: "Copy",
            button_open: "Open",
            time_just_now_short: "now",
            value_not_available: "N/A",
          }
          let message = translations[key] || key
          if (substitutions) {
            const subs = Array.isArray(substitutions) ? substitutions : [substitutions]
            subs.forEach((sub, index) => {
              message = message.replace(`$${index + 1}`, sub)
            })
          }
          return message
        },
        getUILanguage: () => "en",
      },
    } as unknown as typeof chrome
  })

  afterEach(() => {
    vi.restoreAllMocks()
    // @ts-expect-error cleanup
    delete global.chrome
  })

  it('renders provider cards and recent emails section', async () => {
    renderWithProviders(<AccountsPanel />)

    // Component renders per-provider sections (Gmail, Outlook) instead of a single heading
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /gmail/i })).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: /connect gmail/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add outlook account/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /recent emails/i })).toBeInTheDocument()
  })

  it('connects Gmail successfully', async () => {
    const gmailMailbox = {
      id: 'mailbox-1',
      providerId: 'gmail' as const,
      email: 'user@gmail.com',
      addedAt: Date.now(),
      lastSyncedAt: Date.now(),
      tokenExpiresAt: Date.now() + 3600000,
    }

    mockAuthenticateGmail.mockResolvedValue({
      accessToken: 'token',
      refreshToken: 'refresh',
      expiresIn: 3600,
    })
    mockFetchGmailProfile.mockResolvedValue('user@gmail.com')

    const sendMessageSequence = vi.fn((msg: any) => {
      switch (msg.type) {
        case 'GET_MAILBOXES':
          return Promise.resolve({ success: true, mailboxes: sendMessageSequence.mock.calls.filter((call: any) => call[0].type === 'STORE_MAILBOX').length > 0 ? [gmailMailbox] : [] })
        case 'GET_POPUP_DATA':
          return Promise.resolve({
            success: true,
            data: {
              codes: [],
              magicLinks: [],
              lastSync: Date.now(),
              mailboxCount: 0,
            },
          })
        case 'STORE_MAILBOX':
          return Promise.resolve({ success: true, mailbox: { id: gmailMailbox.id, email: gmailMailbox.email } })
        default:
          return Promise.resolve({ success: true })
      }
    })

    mockSendMessage.mockImplementation(sendMessageSequence)

    renderWithProviders(<AccountsPanel />)

    const connectButton = await screen.findByRole('button', { name: /connect gmail/i })
    fireEvent.click(connectButton)

    await waitFor(() => {
      expect(mockAuthenticateGmail).toHaveBeenCalled()
      expect(mockFetchGmailProfile).toHaveBeenCalled()
      expect(sendMessageSequence).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'STORE_MAILBOX',
          provider: 'gmail',
        })
      )
    })
  })

  it('renders recent emails from popup cache', async () => {
    const now = Date.now()
    mockSendMessage.mockImplementation((msg: any) => {
      if (msg.type === 'GET_MAILBOXES') {
        return Promise.resolve({ success: true, mailboxes: [] })
      }
      if (msg.type === 'GET_POPUP_DATA') {
        return Promise.resolve({
          success: true,
          data: {
            codes: [
              {
                code: '123456',
                source: 'Bank - Verification',
                receivedAt: now,
                providerId: 'gmail',
              },
            ],
            magicLinks: [
              {
                url: 'https://example.com/login',
                type: 'login',
                source: 'Example - Magic link',
                receivedAt: now - 60000,
                providerId: 'outlook',
              },
            ],
            lastSync: now,
            mailboxCount: 0,
          },
        })
      }
      return Promise.resolve({ success: true })
    })

    renderWithProviders(<AccountsPanel />)

    await waitFor(() => {
      expect(screen.getByText(/123456/)).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /open/i })).toBeInTheDocument()
  })
})
