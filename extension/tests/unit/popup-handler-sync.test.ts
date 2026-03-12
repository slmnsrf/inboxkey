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
