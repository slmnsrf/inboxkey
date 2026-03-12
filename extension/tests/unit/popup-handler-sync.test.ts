import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('sync error state accounting', () => {
  let mockErrorManager: { recordSuccess: ReturnType<typeof vi.fn>; recordFailure: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    mockErrorManager = {
      recordSuccess: vi.fn(),
      recordFailure: vi.fn(),
    }
  })

  function applySyncErrorAccounting(
    adapterResults: Array<{ mailboxId: string; success: boolean; error?: string }>,
    errorManager: typeof mockErrorManager
  ) {
    const allSucceeded = adapterResults.every(r => r.success)
    const allFailed = adapterResults.every(r => !r.success)

    if (allSucceeded) {
      errorManager.recordSuccess()
    } else if (allFailed) {
      const firstError = adapterResults.find(r => r.error)?.error || 'All adapters failed'
      errorManager.recordFailure(new Error(firstError))
    } else {
      const failedAdapters = adapterResults.filter(r => !r.success)
      const failedIds = failedAdapters.map(r => r.mailboxId).join(', ')
      errorManager.recordFailure(
        new Error(`Partial sync failure: ${failedAdapters.length} adapter(s) failed (${failedIds})`)
      )
    }
  }

  it('should recordSuccess when all adapters succeed', () => {
    applySyncErrorAccounting([
      { mailboxId: 'mbx-1', success: true },
      { mailboxId: 'mbx-2', success: true },
    ], mockErrorManager)

    expect(mockErrorManager.recordSuccess).toHaveBeenCalledOnce()
    expect(mockErrorManager.recordFailure).not.toHaveBeenCalled()
  })

  it('should recordFailure when all adapters fail', () => {
    applySyncErrorAccounting([
      { mailboxId: 'mbx-1', success: false, error: 'Auth failed' },
      { mailboxId: 'mbx-2', success: false, error: 'Network error' },
    ], mockErrorManager)

    expect(mockErrorManager.recordFailure).toHaveBeenCalledOnce()
    expect(mockErrorManager.recordSuccess).not.toHaveBeenCalled()
    expect(mockErrorManager.recordFailure.mock.calls[0][0].message).toContain('Auth failed')
  })

  it('should recordFailure on partial failure (NOT recordSuccess)', () => {
    applySyncErrorAccounting([
      { mailboxId: 'mbx-good', success: true },
      { mailboxId: 'mbx-bad', success: false, error: 'Auth failed' },
    ], mockErrorManager)

    expect(mockErrorManager.recordSuccess).not.toHaveBeenCalled()
    expect(mockErrorManager.recordFailure).toHaveBeenCalledOnce()
    expect(mockErrorManager.recordFailure.mock.calls[0][0].message).toContain('Partial sync failure')
    expect(mockErrorManager.recordFailure.mock.calls[0][0].message).toContain('mbx-bad')
  })

  it('should handle single adapter success', () => {
    applySyncErrorAccounting([
      { mailboxId: 'mbx-1', success: true },
    ], mockErrorManager)

    expect(mockErrorManager.recordSuccess).toHaveBeenCalledOnce()
  })
})

describe('sync response contract (Finding #1)', () => {
  /**
   * Mirrors the response logic in popup-handler.ts TRIGGER_SYNC.
   * allFailed must return { success: false }, not { success: true }.
   */
  function decideSyncResponse(
    adapterResults: Array<{ mailboxId: string; success: boolean; error?: string }>,
    cache: object
  ): { success: boolean; data?: object; error?: string } {
    const allFailed = adapterResults.every(r => !r.success)

    if (allFailed) {
      const firstError = adapterResults.find(r => r.error)?.error || 'All adapters failed'
      return { success: false, error: firstError }
    }

    return { success: true, data: cache }
  }

  it('should return success:false when ALL adapters fail', () => {
    const result = decideSyncResponse([
      { mailboxId: 'mbx-1', success: false, error: 'Auth failed' },
      { mailboxId: 'mbx-2', success: false, error: 'Network error' },
    ], { items: [] })

    expect(result.success).toBe(false)
    expect(result.error).toContain('Auth failed')
    expect(result.data).toBeUndefined()
  })

  it('should return success:true when all adapters succeed', () => {
    const result = decideSyncResponse([
      { mailboxId: 'mbx-1', success: true },
      { mailboxId: 'mbx-2', success: true },
    ], { items: ['code1'] })

    expect(result.success).toBe(true)
    expect(result.data).toEqual({ items: ['code1'] })
  })

  it('should return success:true for partial failure (some adapters succeeded)', () => {
    const result = decideSyncResponse([
      { mailboxId: 'mbx-good', success: true },
      { mailboxId: 'mbx-bad', success: false, error: 'Auth failed' },
    ], { items: ['code1'] })

    // Partial failure still returns success:true (data from working adapters)
    // but error state is tracked separately via ErrorStateManager
    expect(result.success).toBe(true)
    expect(result.data).toBeDefined()
  })
})
