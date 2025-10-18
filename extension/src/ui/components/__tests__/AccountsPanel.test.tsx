import React from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AccountsPanel } from '../AccountsPanel'
import { LockProvider } from '../../contexts/LockContext'
import { ToastProvider } from '../../contexts/ToastContext'

const mockAuthenticateGmail = vi.fn()
const mockAuthenticateOutlook = vi.fn()
const mockFetchGmailProfile = vi.fn()
const mockFetchOutlookProfile = vi.fn()

vi.mock('@/lib/providers/gmail/chrome-auth', () => ({
  authenticateGmail: mockAuthenticateGmail,
}))

vi.mock('@/lib/providers/outlook/chrome-auth', () => ({
  authenticateOutlook: mockAuthenticateOutlook,
}))

vi.mock('@/lib/providers/gmail/profile', () => ({
  fetchGmailProfile: mockFetchGmailProfile,
}))

vi.mock('@/lib/providers/outlook/profile', () => ({
  fetchOutlookProfile: mockFetchOutlookProfile,
}))

vi.mock('@/lib/providers/gmail/config', () => ({
  isGmailConfigured: () => true,
}))

vi.mock('@/lib/providers/outlook/config', () => ({
  isOutlookConfigured: () => true,
}))

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <ToastProvider>
      <LockProvider>{ui}</LockProvider>
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

    ;(global.navigator as any).clipboard = { writeText: mockClipboardWrite }

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
