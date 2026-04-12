import React from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { ToastProvider } from '../../contexts/ToastContext'

// --- Module mocks (hoisted) ---

vi.mock('@/lib/providers/gmail/chrome-auth', () => ({
  authenticateGmail: vi.fn(),
}))

vi.mock('@/lib/providers/gmail/profile', () => ({
  fetchGmailProfile: vi.fn(),
}))

vi.mock('@/lib/providers/gmail/config', () => ({
  isGmailConfigured: () => true,
}))

vi.mock('@/lib/native-messaging', () => ({
  getNativeClient: () => ({
    ping: () => Promise.reject(new Error('not connected')),
  }),
}))

vi.mock('@/lib/native-messaging/version-check', () => ({
  checkCompatibility: () => ({ compatible: true, updateAvailable: false }),
  getUpdateUrl: () => 'https://example.com',
}))

// Mock ProviderLogo to avoid Plasmo-specific url: imports
vi.mock('../options/ProviderLogo', () => ({
  ProviderLogo: ({ provider }: { provider: string }) => (
    <span data-testid={`provider-logo-${provider}`} />
  ),
}))

// Mock AddAccountDropdown (it also imports ProviderLogo)
vi.mock('../options/AddAccountDropdown', () => ({
  AddAccountDropdown: () => <button>Add account</button>,
}))

// Lazy-import the component after mocks are established
const { AccountsPanel } = await import('../AccountsPanel')

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <ToastProvider>
      {ui}
    </ToastProvider>
  )
}

describe('AccountsPanel (v2)', () => {
  const mockSendMessage = vi.fn()
  const mockTabsCreate = vi.fn()
  const mockStorageGet = vi.fn()
  const mockStorageSet = vi.fn()

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
            firstrun_headline: 'Welcome to InboxKey',
            firstrun_sub: 'Connect your first email account to get started.',
            firstrun_gmail_title: 'Gmail',
            firstrun_gmail_detail: 'Connect with one click via Chrome Identity API.',
            firstrun_alt_heading: 'Other providers',
            firstrun_imap_title: 'IMAP',
            firstrun_imap_detail: 'Connect via InboxBridge.',
            firstrun_gm_title: 'Google Messages',
            firstrun_gm_detail: 'Receive SMS codes via Google Messages pairing.',
            health_all_ok: 'All $1 accounts healthy',
            health_attention_one: '1 account needs attention',
            health_attention_multi: '$1 of $2 accounts need attention',
            health_fetch_failed: 'Failed to load accounts',
            accounts_panel_heading: 'Your accounts',
            health_connecting: 'Connecting',
            button_retry: 'Retry',
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
        getUILanguage: () => 'en',
      },
    } as unknown as typeof chrome
  })

  afterEach(() => {
    vi.restoreAllMocks()
    // @ts-expect-error cleanup
    delete global.chrome
  })

  it('renders without crashing', async () => {
    renderWithProviders(<AccountsPanel />)

    // Component should render and finish loading
    await waitFor(() => {
      // Once mailboxes loads (empty), FirstRunWelcome appears
      expect(screen.getByText('Welcome to InboxKey')).toBeInTheDocument()
    })
  })

  it('shows loading skeleton while mailboxes is null', () => {
    // Block sendMessage so mailboxes stays null
    mockSendMessage.mockImplementation(() => new Promise(() => {}))

    renderWithProviders(<AccountsPanel />)

    // Skeleton rows should be visible (the accounts-list with skeleton-bar elements)
    const skeletonDots = document.querySelectorAll('.skeleton-bar--dot')
    expect(skeletonDots.length).toBe(3)
  })

  it('shows first-run welcome when mailboxes is empty', async () => {
    renderWithProviders(<AccountsPanel />)

    await waitFor(() => {
      expect(screen.getByText('Welcome to InboxKey')).toBeInTheDocument()
    })

    // Gmail provider card is visible
    expect(screen.getByRole('heading', { name: /gmail/i })).toBeInTheDocument()

    // IMAP and Google Messages secondary cards are visible
    expect(screen.getByRole('heading', { name: /imap/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /google messages/i })).toBeInTheDocument()
  })
})
