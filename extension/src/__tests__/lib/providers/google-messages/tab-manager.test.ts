/**
 * Unit tests for MessagesTabManager
 *
 * Covers tab lifecycle (create, reuse, close), mutex serialization,
 * pairing detection, per-session poll tracking, and SW restart recovery.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { MessagesTabManager } from '@/lib/providers/google-messages/tab-manager'

// ---------------------------------------------------------------------------
// Chrome API mocks
// ---------------------------------------------------------------------------

const sessionStore = new Map<string, unknown>()

function buildChromeMock() {
  return {
    tabs: {
      query: vi.fn(async (_q?: unknown) => [] as chrome.tabs.Tab[]),
      create: vi.fn(
        async (_props?: unknown) => ({ id: 100 }) as chrome.tabs.Tab
      ),
      get: vi.fn(
        async (id: number) => ({ id }) as chrome.tabs.Tab
      ),
      update: vi.fn(async () => {}),
      remove: vi.fn(async () => {}),
    },
    scripting: {
      executeScript: vi.fn(async () => [{ result: undefined }]),
    },
    storage: {
      session: {
        get: vi.fn(async (key: string) => {
          const val = sessionStore.get(key)
          return val !== undefined ? { [key]: val } : {}
        }),
        set: vi.fn(async (items: Record<string, unknown>) => {
          for (const [k, v] of Object.entries(items)) {
            sessionStore.set(k, v)
          }
        }),
        remove: vi.fn(async (key: string) => {
          sessionStore.delete(key)
        }),
      },
    },
  }
}

let chromeMock: ReturnType<typeof buildChromeMock>

beforeEach(() => {
  sessionStore.clear()
  chromeMock = buildChromeMock()
  ;(globalThis as any).chrome = chromeMock
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MessagesTabManager', () => {
  // ------ Tab Lifecycle -------------------------------------------------

  describe('ensureTab()', () => {
    it('creates a new pinned tab when none exists and marks it as extension-owned', async () => {
      // No existing Messages tabs
      chromeMock.tabs.query.mockResolvedValue([])
      chromeMock.tabs.create.mockResolvedValue({ id: 42 } as chrome.tabs.Tab)

      const mgr = new MessagesTabManager()
      const state = await mgr.ensureTab()

      expect(chromeMock.tabs.query).toHaveBeenCalledWith({
        url: 'https://messages.google.com/*',
      })
      expect(chromeMock.tabs.create).toHaveBeenCalledWith({
        url: 'https://messages.google.com/web/conversations',
        pinned: true,
        active: false,
      })
      expect(state).toEqual({ tabId: 42, owned: true })

      // Tab state persisted to session storage
      expect(sessionStore.get('gm_tab_state')).toEqual({
        tabId: 42,
        owned: true,
      })
    })

    it('finds and reuses existing messages.google.com tab, marks as user-owned', async () => {
      chromeMock.tabs.query.mockResolvedValue([
        { id: 77, url: 'https://messages.google.com/web/conversations' } as chrome.tabs.Tab,
      ])

      const mgr = new MessagesTabManager()
      const state = await mgr.ensureTab()

      expect(chromeMock.tabs.create).not.toHaveBeenCalled()
      expect(state).toEqual({ tabId: 77, owned: false })
    })

    it('serializes concurrent calls via mutex -- second call returns same result', async () => {
      chromeMock.tabs.query.mockResolvedValue([])

      let callCount = 0
      chromeMock.tabs.create.mockImplementation(async () => {
        callCount++
        // Simulate slow tab creation
        await new Promise((r) => setTimeout(r, 50))
        return { id: 200 } as chrome.tabs.Tab
      })

      const mgr = new MessagesTabManager()

      // Fire two concurrent calls
      const [a, b] = await Promise.all([mgr.ensureTab(), mgr.ensureTab()])

      // Only one tab.create call should have happened
      expect(callCount).toBe(1)
      expect(a).toEqual(b)
      expect(a.tabId).toBe(200)
    })

    it('creates an active tab with welcome URL when forPairing is true', async () => {
      chromeMock.tabs.query.mockResolvedValue([])
      chromeMock.tabs.create.mockResolvedValue({ id: 55 } as chrome.tabs.Tab)

      const mgr = new MessagesTabManager()
      const state = await mgr.ensureTab({ forPairing: true })

      expect(chromeMock.tabs.create).toHaveBeenCalledWith({
        url: 'https://messages.google.com/web/welcome',
        pinned: false,
        active: true,
      })
      expect(state).toEqual({ tabId: 55, owned: true })
    })

    it('activates and navigates existing tab when forPairing reuses a user tab', async () => {
      chromeMock.tabs.query.mockResolvedValue([
        { id: 77, url: 'https://messages.google.com/web/conversations' } as chrome.tabs.Tab,
      ])

      const mgr = new MessagesTabManager()
      const state = await mgr.ensureTab({ forPairing: true })

      // Should reuse the existing tab
      expect(chromeMock.tabs.create).not.toHaveBeenCalled()
      expect(state).toEqual({ tabId: 77, owned: false })

      // Should activate and navigate to welcome URL
      expect(chromeMock.tabs.update).toHaveBeenCalledWith(77, {
        active: true,
        url: 'https://messages.google.com/web/welcome',
      })
    })

    it('re-validates cached tabId and falls back if tab was closed externally', async () => {
      chromeMock.tabs.query.mockResolvedValue([])
      chromeMock.tabs.create.mockResolvedValue({ id: 10 } as chrome.tabs.Tab)

      const mgr = new MessagesTabManager()
      await mgr.ensureTab()

      // Simulate the tab being closed externally
      chromeMock.tabs.get.mockRejectedValueOnce(new Error('No tab'))
      chromeMock.tabs.create.mockResolvedValue({ id: 20 } as chrome.tabs.Tab)

      const state = await mgr.ensureTab()
      expect(state.tabId).toBe(20)
    })
  })

  // ------ closeIfOwned --------------------------------------------------

  describe('closeIfOwned()', () => {
    it('closes extension-owned tabs when no active sessions remain', async () => {
      chromeMock.tabs.query.mockResolvedValue([])
      chromeMock.tabs.create.mockResolvedValue({ id: 50 } as chrome.tabs.Tab)

      const mgr = new MessagesTabManager()
      await mgr.ensureTab()

      await mgr.closeIfOwned()

      expect(chromeMock.tabs.remove).toHaveBeenCalledWith(50)
    })

    it('does NOT close user-owned tabs', async () => {
      chromeMock.tabs.query.mockResolvedValue([
        { id: 88 } as chrome.tabs.Tab,
      ])

      const mgr = new MessagesTabManager()
      await mgr.ensureTab()

      await mgr.closeIfOwned()

      expect(chromeMock.tabs.remove).not.toHaveBeenCalled()
    })

    it('does not close when active sessions still have remaining polls', async () => {
      chromeMock.tabs.query.mockResolvedValue([])
      chromeMock.tabs.create.mockResolvedValue({ id: 60 } as chrome.tabs.Tab)

      const mgr = new MessagesTabManager()
      await mgr.ensureTab()

      // Session with only 1 poll used (< MAX_POLLS_PER_SESSION = 5)
      mgr.incrementPollCount('sess-active')

      await mgr.closeIfOwned()
      expect(chromeMock.tabs.remove).not.toHaveBeenCalled()
    })

    it('closes only when ALL active sessions have exhausted their 5-poll budget', async () => {
      chromeMock.tabs.query.mockResolvedValue([])
      chromeMock.tabs.create.mockResolvedValue({ id: 70 } as chrome.tabs.Tab)

      const mgr = new MessagesTabManager()
      await mgr.ensureTab()

      // Exhaust session-1
      for (let i = 0; i < 5; i++) mgr.incrementPollCount('session-1')
      // session-2 has 3 polls left
      mgr.incrementPollCount('session-2')
      mgr.incrementPollCount('session-2')

      await mgr.closeIfOwned()
      expect(chromeMock.tabs.remove).not.toHaveBeenCalled()

      // Exhaust session-2
      for (let i = 0; i < 3; i++) mgr.incrementPollCount('session-2')

      await mgr.closeIfOwned()
      expect(chromeMock.tabs.remove).toHaveBeenCalledWith(70)
    })
  })

  // ------ Pairing Detection ---------------------------------------------

  describe('checkPairingStatus()', () => {
    it('returns "paired" when mws-conversations-list is found', async () => {
      chromeMock.scripting.executeScript.mockResolvedValue([
        { result: 'paired' },
      ] as any)

      const mgr = new MessagesTabManager()
      const status = await mgr.checkPairingStatus(99)

      expect(chromeMock.scripting.executeScript).toHaveBeenCalledWith(
        expect.objectContaining({ target: { tabId: 99 } })
      )
      expect(status).toBe('paired')
    })

    it('returns "unpaired" when mw-qr-code is found', async () => {
      chromeMock.scripting.executeScript.mockResolvedValue([
        { result: 'unpaired' },
      ] as any)

      const mgr = new MessagesTabManager()
      const status = await mgr.checkPairingStatus(99)
      expect(status).toBe('unpaired')
    })

    it('defaults to "unpaired" when executeScript returns no result', async () => {
      chromeMock.scripting.executeScript.mockResolvedValue([
        { result: undefined },
      ] as any)

      const mgr = new MessagesTabManager()
      const status = await mgr.checkPairingStatus(99)
      expect(status).toBe('unpaired')
    })
  })

  // ------ Per-Session Poll Tracking -------------------------------------

  describe('poll count tracking', () => {
    it('incrementPollCount tracks independent counters per session', () => {
      const mgr = new MessagesTabManager()

      mgr.incrementPollCount('session-1')
      mgr.incrementPollCount('session-1')
      mgr.incrementPollCount('session-2')

      expect(mgr.getPollCount('session-1')).toBe(2)
      expect(mgr.getPollCount('session-2')).toBe(1)
    })

    it('resetPollCount only resets the targeted session', () => {
      const mgr = new MessagesTabManager()

      mgr.incrementPollCount('session-1')
      mgr.incrementPollCount('session-1')
      mgr.incrementPollCount('session-2')
      mgr.incrementPollCount('session-2')
      mgr.incrementPollCount('session-2')

      mgr.resetPollCount('session-1')

      expect(mgr.getPollCount('session-1')).toBe(0)
      expect(mgr.getPollCount('session-2')).toBe(3)
    })

    it('getPollCount returns 0 for unknown sessions', () => {
      const mgr = new MessagesTabManager()
      expect(mgr.getPollCount('nonexistent')).toBe(0)
    })

    it('incrementPollCount returns the new count', () => {
      const mgr = new MessagesTabManager()
      expect(mgr.incrementPollCount('s1')).toBe(1)
      expect(mgr.incrementPollCount('s1')).toBe(2)
      expect(mgr.incrementPollCount('s1')).toBe(3)
    })
  })

  // ------ SW Restart Recovery -------------------------------------------

  describe('recoverFromRestart()', () => {
    it('recovers valid tabId from session storage', async () => {
      sessionStore.set('gm_tab_state', { tabId: 300, owned: true })
      chromeMock.tabs.get.mockResolvedValue({ id: 300 } as chrome.tabs.Tab)

      const mgr = new MessagesTabManager()
      await mgr.recoverFromRestart()

      // After recovery, ensureTab should reuse the recovered tab
      const state = await mgr.ensureTab()
      expect(state.tabId).toBe(300)
      expect(state.owned).toBe(true)
      // Should NOT have created a new tab
      expect(chromeMock.tabs.create).not.toHaveBeenCalled()
    })

    it('cleans up stale tabId when tab no longer exists', async () => {
      sessionStore.set('gm_tab_state', { tabId: 999, owned: true })
      chromeMock.tabs.get.mockRejectedValue(new Error('No tab with id 999'))

      const mgr = new MessagesTabManager()
      await mgr.recoverFromRestart()

      // Session storage should be cleared
      expect(chromeMock.storage.session.remove).toHaveBeenCalledWith(
        'gm_tab_state'
      )

      // ensureTab should create a fresh tab
      chromeMock.tabs.query.mockResolvedValue([])
      chromeMock.tabs.create.mockResolvedValue({ id: 400 } as chrome.tabs.Tab)

      const state = await mgr.ensureTab()
      expect(state.tabId).toBe(400)
    })

    it('handles empty session storage gracefully', async () => {
      const mgr = new MessagesTabManager()
      // Should not throw
      await expect(mgr.recoverFromRestart()).resolves.toBeUndefined()
    })
  })

  // ------ Pending Setup Persistence -------------------------------------

  describe('pending setup persistence', () => {
    it('saves and retrieves pending setup', async () => {
      const mgr = new MessagesTabManager()
      const setup = {
        phoneNumber: '+1234567890',
        tabId: 42,
        owned: true,
        startedAt: Date.now(),
      }

      await mgr.savePendingSetup(setup)
      const retrieved = await mgr.getPendingSetup()

      expect(retrieved).toEqual(setup)
    })

    it('returns null when no pending setup exists', async () => {
      const mgr = new MessagesTabManager()
      const result = await mgr.getPendingSetup()
      expect(result).toBeNull()
    })

    it('clearPendingSetup removes the stored setup', async () => {
      const mgr = new MessagesTabManager()
      await mgr.savePendingSetup({
        phoneNumber: '+1',
        owned: false,
        startedAt: 0,
      })
      await mgr.clearPendingSetup()

      const result = await mgr.getPendingSetup()
      expect(result).toBeNull()
    })
  })
})
