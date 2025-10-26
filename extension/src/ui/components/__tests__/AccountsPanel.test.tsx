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
            accounts_panel_heading: "Connected Accounts",
            accounts_panel_summary: "Manage your email accounts",
            accounts_recent_title: "Recent Emails",
            accounts_recent_description: "Your latest verification codes and magic links",
            accounts_recent_empty: "No recent activity",
            accounts_status_not_connected: "Not connected",
            accounts_status_connected: "Connected",
            accounts_status_error: "Error",
            provider_gmail_connect: "Connect Gmail",
            provider_outlook_connect: "Connect Outlook",
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

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /connected accounts/i })).toBeVisible()
    })

    expect(screen.getByRole('button', { name: /connect gmail/i })).toBeVisible()
    expect(screen.getByRole('button', { name: /connect outlook/i })).toBeVisible()
    expect(screen.getByRole('heading', { name: /recent emails/i })).toBeVisible()
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
      expect(screen.getByText(/123456/)).toBeVisible()
    })
    expect(screen.getByRole('button', { name: /open/i })).toBeVisible()
  })
})
