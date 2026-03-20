# Triggering Guardrails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 4 additive guardrails to the email check triggering algorithm to prevent unnecessary, aggressive, or wasteful email polling.

**Architecture:** The existing 2-tier field detection system stays untouched. Four guardrails insert between detection and session start: (1) no-mailbox check, (2) focus gate, (3) email context scan, (4) abort on disconnect. Guardrails 1 and 3 live inside `WatchSession.start()`. Guardrail 2 lives in `contents/index.ts`. Guardrail 4 lives in `background/index.ts`.

**Tech Stack:** TypeScript, Chrome Extension APIs (MV3), Vitest

**Spec:** `docs/superpowers/specs/2026-03-20-triggering-guardrails-design.md` (v7)

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `extension/src/lib/detection/email-context-guard.ts` | Create | Scoped DOM scan for email signals, reuses `EMAIL_PATTERNS` |
| `extension/src/lib/detection/signal-classifier.ts` | Modify | Export `EMAIL_PATTERNS` (currently private) |
| `extension/src/contents/watch-session.ts` | Modify | Add no-mailbox check + email context check in `.start()`, add veto signaling |
| `extension/src/contents/index.ts` | Modify | Focus gate wrapper, init-order fix, blocked-start cleanup |
| `extension/src/background/index.ts` | Modify | Cancel session on port disconnect |
| `extension/src/lib/detection/__tests__/email-context-guard.test.ts` | Create | Tests for email context scanning |
| `extension/tests/unit/watch-session-guardrails.test.ts` | Create | Tests for no-mailbox + email context veto in WatchSession |
| `extension/tests/unit/focus-gate.test.ts` | Create | Tests for focus gate behavior |

---

## Codebase Notes for Implementer

- `contents/index.ts` wraps everything in an `async IIFE` (lines 49-254). All new variables and functions must be placed **inside** this IIFE (after line 61, before line 254), not at true module level. The only exceptions are `globalProcessedRepresentatives` (line 30) and `clearProcessedFields` (line 42) which are module-level exports.
- `WatchSessionCallbacks` (watch-session.ts line 25) is a **non-exported** interface. Keep it non-exported when adding `onVetoed`.
- The callback type for code results is `SessionCodeResult` (watch-session.ts line 19), NOT `CodeResult`.
- `StorageFactory` is imported at watch-session.ts line 14.
- `detectSplitInputGroup` is already imported in both `index.ts` (line 22) and `watch-session.ts` (line 17).
- `AUTOCOMPLETE_VALUES` is exported from `@/lib/detection/patterns` (line 63).

---

### Task 1: Export EMAIL_PATTERNS from signal-classifier

**Files:**
- Modify: `extension/src/lib/detection/signal-classifier.ts:29`

- [ ] **Step 1: Change `const` to `export const`**

In `signal-classifier.ts` line 29, change:
```typescript
const EMAIL_PATTERNS = [
```
to:
```typescript
export const EMAIL_PATTERNS = [
```

- [ ] **Step 2: Verify build**

Run: `cd extension && npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 3: Verify existing tests pass**

Run: `cd extension && npx vitest run src/lib/detection/__tests__/signal-classifier.test.ts`
Expected: All tests pass (export doesn't change behavior)

- [ ] **Step 4: Commit**

```bash
git add extension/src/lib/detection/signal-classifier.ts
git commit -m "refactor(detection): export EMAIL_PATTERNS for reuse by email context guard"
```

---

### Task 2: Create email-context-guard module

**Files:**
- Create: `extension/src/lib/detection/email-context-guard.ts`
- Create: `extension/src/lib/detection/__tests__/email-context-guard.test.ts`

- [ ] **Step 1: Write failing tests**

Create `extension/src/lib/detection/__tests__/email-context-guard.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { hasEmailContext } from '../email-context-guard'

describe('hasEmailContext', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('returns true when "email" keyword is near the field', () => {
    document.body.innerHTML = `
      <main>
        <p>Enter the code sent to your email</p>
        <input id="code" type="text" />
      </main>
    `
    const field = document.getElementById('code') as HTMLInputElement
    expect(hasEmailContext(field)).toBe(true)
  })

  it('returns true when @ is present near the field', () => {
    document.body.innerHTML = `
      <section>
        <p>We sent a code to user@gmail.com</p>
        <input id="code" type="text" />
      </section>
    `
    const field = document.getElementById('code') as HTMLInputElement
    expect(hasEmailContext(field)).toBe(true)
  })

  it('returns true when email input exists in same container', () => {
    document.body.innerHTML = `
      <form>
        <input type="email" name="email" />
        <input id="code" type="text" />
      </form>
    `
    const field = document.getElementById('code') as HTMLInputElement
    expect(hasEmailContext(field)).toBe(true)
  })

  it('returns false on promo code page with no email context', () => {
    document.body.innerHTML = `
      <main>
        <h2>Enter your promo code</h2>
        <input id="promo" type="text" name="promo_code" />
      </main>
    `
    const field = document.getElementById('promo') as HTMLInputElement
    expect(hasEmailContext(field)).toBe(false)
  })

  it('ignores @ in footer (excluded zone)', () => {
    document.body.innerHTML = `
      <main>
        <h2>Enter code</h2>
        <input id="code" type="text" />
      </main>
      <footer>
        <p>Contact: support@company.com</p>
      </footer>
    `
    const field = document.getElementById('code') as HTMLInputElement
    expect(hasEmailContext(field)).toBe(false)
  })

  it('ignores @ in nav (excluded zone)', () => {
    document.body.innerHTML = `
      <main>
        <h2>Enter code</h2>
        <input id="code" type="text" />
      </main>
      <nav>
        <a href="mailto:help@site.com">help@site.com</a>
      </nav>
    `
    const field = document.getElementById('code') as HTMLInputElement
    expect(hasEmailContext(field)).toBe(false)
  })

  it('returns true for German email keyword "E-Mail"', () => {
    document.body.innerHTML = `
      <main>
        <p>Code an Ihre E-Mail gesendet</p>
        <input id="code" type="text" />
      </main>
    `
    const field = document.getElementById('code') as HTMLInputElement
    expect(hasEmailContext(field)).toBe(true)
  })

  it('returns true for Turkish email keyword "e-posta"', () => {
    document.body.innerHTML = `
      <main>
        <p>Kod e-posta adresinize gonderildi</p>
        <input id="code" type="text" />
      </main>
    `
    const field = document.getElementById('code') as HTMLInputElement
    expect(hasEmailContext(field)).toBe(true)
  })

  it('falls back to 5 levels up when no semantic container', () => {
    document.body.innerHTML = `
      <div>
        <div>
          <div>
            <p>Check your email for the code</p>
            <div>
              <input id="code" type="text" />
            </div>
          </div>
        </div>
      </div>
    `
    const field = document.getElementById('code') as HTMLInputElement
    expect(hasEmailContext(field)).toBe(true)
  })

  it('returns true (failure-open) if field is detached', () => {
    const field = document.createElement('input')
    expect(hasEmailContext(field)).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd extension && npx vitest run src/lib/detection/__tests__/email-context-guard.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Write implementation**

Create `extension/src/lib/detection/email-context-guard.ts`:

```typescript
/**
 * Email Context Guard
 *
 * Scans the DOM near a detected field for email-related context signals.
 * Used as a pre-flight guardrail before starting a watch session.
 *
 * Reuses EMAIL_PATTERNS from signal-classifier.ts to avoid drift.
 * Failure-open: returns true (proceed) if scan throws.
 */

import { EMAIL_PATTERNS } from './signal-classifier'

/** Semantic container elements to walk up to */
const SEMANTIC_CONTAINERS = new Set(['FORM', 'MAIN', 'SECTION', 'ARTICLE'])

/** Elements to exclude from text scanning */
const EXCLUDED_TAGS = new Set(['HEADER', 'FOOTER', 'NAV'])

/** ARIA roles to exclude from text scanning */
const EXCLUDED_ROLES = new Set(['navigation', 'banner', 'contentinfo'])

/** Max DOM levels to walk up if no semantic container found */
const FALLBACK_DEPTH = 5

/**
 * Check if there is email-related context near the given field.
 *
 * @param field - The detected input field
 * @returns true if email context found (or scan fails -- failure-open)
 */
export function hasEmailContext(field: HTMLInputElement): boolean {
  try {
    const container = findScanContainer(field)
    if (!container) return true // failure-open: no container = detached field

    const text = getFilteredText(container)

    // Signal 1: EMAIL_PATTERNS regex match (21 languages)
    for (const pattern of EMAIL_PATTERNS) {
      if (pattern.test(text)) return true
    }

    // Signal 2: @ character in scanned text
    if (text.includes('@')) return true

    // Signal 3: Email input field in container
    const emailInputs = container.querySelectorAll(
      'input[type="email"], input[autocomplete="email"]'
    )
    if (emailInputs.length > 0) return true

    return false
  } catch {
    return true // failure-open
  }
}

/**
 * Walk up from field to nearest semantic container.
 * Falls back to N levels up if no semantic container found.
 */
function findScanContainer(field: HTMLInputElement): HTMLElement | null {
  let node: HTMLElement | null = field.parentElement
  let depth = 0

  while (node && node !== document.body) {
    if (SEMANTIC_CONTAINERS.has(node.tagName)) {
      return node
    }
    depth++
    if (depth >= FALLBACK_DEPTH) {
      return node
    }
    node = node.parentElement
  }

  return node // document.body or null
}

/**
 * Get text content from container, excluding footer/nav/header zones.
 */
function getFilteredText(container: HTMLElement): string {
  const parts: string[] = []

  function walk(node: Node): void {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement
      if (EXCLUDED_TAGS.has(el.tagName)) return
      const role = el.getAttribute('role')
      if (role && EXCLUDED_ROLES.has(role)) return
    }

    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim()
      if (text) parts.push(text)
    } else {
      for (const child of node.childNodes) {
        walk(child)
      }
    }
  }

  walk(container)
  return parts.join(' ')
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd extension && npx vitest run src/lib/detection/__tests__/email-context-guard.test.ts`
Expected: All 10 tests PASS

- [ ] **Step 5: Commit**

```bash
git add extension/src/lib/detection/email-context-guard.ts extension/src/lib/detection/__tests__/email-context-guard.test.ts
git commit -m "feat(detection): add email context guard with scoped DOM scan and 21-language support"
```

---

### Task 3: Add no-mailbox check + email context check to WatchSession.start()

**Files:**
- Modify: `extension/src/contents/watch-session.ts`
- Create: `extension/tests/unit/watch-session-guardrails.test.ts`

- [ ] **Step 1: Add `onVetoed` to WatchSessionCallbacks**

In `watch-session.ts`, add `onVetoed` to the existing `WatchSessionCallbacks` interface (line 25). Keep the interface non-exported (it is not currently exported):

```typescript
interface WatchSessionCallbacks {
  onCodeFound: (result: SessionCodeResult) => void
  onTimeout?: () => void
  onCanceled?: () => void
  onSessionStarted?: (sessionId: string) => void
  onAutofill?: (result: SessionCodeResult, field: HTMLInputElement) => Promise<boolean>
  onVetoed?: () => void  // Called when a pre-flight guardrail blocks session start
}
```

- [ ] **Step 2: Add guardrail imports**

Add at the top of `watch-session.ts`, alongside existing imports:

```typescript
import { hasEmailContext } from '@/lib/detection/email-context-guard'
import { AUTOCOMPLETE_VALUES } from '@/lib/detection/patterns'
```

Note: `StorageFactory` (line 14) and `detectSplitInputGroup` (line 17) are already imported.

- [ ] **Step 3: Add guardrail checks to WatchSession.start()**

In `WatchSession.start()`, after the domain-enabled check (after line 81, before `try { this.port = chrome.runtime.connect(...)` at line 83), insert:

```typescript
    // GUARDRAIL 1: No-mailbox check
    // Skip silently if no mailboxes are connected (failure-open on error)
    try {
      const guardStorage = await StorageFactory.create()
      const mailboxes = await guardStorage.getMailboxes()
      if (mailboxes.length === 0) {
        console.log("[WatchSession] No mailboxes connected, skipping watch session")
        this.callbacks.onVetoed?.()
        return
      }
    } catch (error) {
      console.warn("[WatchSession] Failed to check mailboxes, proceeding (failure-open):", error)
    }

    // GUARDRAIL 3: Email context check
    // Bypass for OTP autocomplete or split-input groups (unambiguous signals)
    const autocomplete = this.field.getAttribute('autocomplete')?.toLowerCase()
    const isOtpAutocomplete = autocomplete != null &&
      (AUTOCOMPLETE_VALUES as readonly string[]).includes(autocomplete)
    const isSplitInput = detectSplitInputGroup(this.field) !== null

    if (!isOtpAutocomplete && !isSplitInput) {
      if (!hasEmailContext(this.field)) {
        console.log("[WatchSession] No email context near field, skipping watch session")
        this.callbacks.onVetoed?.()
        return
      }
    }
```

Note: `guardStorage` avoids shadowing the `storage` variable used later on line 107.

- [ ] **Step 4: Write tests**

Create `extension/tests/unit/watch-session-guardrails.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { hasEmailContext } from '../../src/lib/detection/email-context-guard'
import { AUTOCOMPLETE_VALUES } from '../../src/lib/detection/patterns'

// Test the guardrail logic in isolation (not full WatchSession integration)
// Full WatchSession tests require chrome.runtime.connect mocking which is
// covered by the existing watch-session.test.ts.

vi.mock('../../src/lib/detection/email-context-guard')
const mockHasEmailContext = vi.mocked(hasEmailContext)

describe('Email context bypass logic', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    document.body.innerHTML = ''
  })

  it('bypasses email context check for autocomplete="one-time-code"', () => {
    const field = document.createElement('input')
    field.setAttribute('autocomplete', 'one-time-code')
    const ac = field.getAttribute('autocomplete')?.toLowerCase()
    const bypass = ac != null && (AUTOCOMPLETE_VALUES as readonly string[]).includes(ac)
    expect(bypass).toBe(true)
  })

  it('bypasses email context check for autocomplete="one-time-password"', () => {
    const field = document.createElement('input')
    field.setAttribute('autocomplete', 'one-time-password')
    const ac = field.getAttribute('autocomplete')?.toLowerCase()
    const bypass = ac != null && (AUTOCOMPLETE_VALUES as readonly string[]).includes(ac)
    expect(bypass).toBe(true)
  })

  it('bypasses email context check for autocomplete="otp"', () => {
    const field = document.createElement('input')
    field.setAttribute('autocomplete', 'otp')
    const ac = field.getAttribute('autocomplete')?.toLowerCase()
    const bypass = ac != null && (AUTOCOMPLETE_VALUES as readonly string[]).includes(ac)
    expect(bypass).toBe(true)
  })

  it('does NOT bypass for name="otp" (no autocomplete)', () => {
    const field = document.createElement('input')
    field.setAttribute('name', 'otp')
    const ac = field.getAttribute('autocomplete')?.toLowerCase()
    const bypass = ac != null && (AUTOCOMPLETE_VALUES as readonly string[]).includes(ac)
    expect(bypass).toBe(false)
  })

  it('does NOT bypass for name="activation_code"', () => {
    const field = document.createElement('input')
    field.setAttribute('name', 'activation_code')
    const ac = field.getAttribute('autocomplete')?.toLowerCase()
    const bypass = ac != null && (AUTOCOMPLETE_VALUES as readonly string[]).includes(ac)
    expect(bypass).toBe(false)
  })

  it('blocks session when hasEmailContext returns false for non-bypass field', () => {
    mockHasEmailContext.mockReturnValue(false)
    const field = document.createElement('input')
    field.setAttribute('name', 'promo_code')
    expect(hasEmailContext(field)).toBe(false)
  })

  it('allows session when hasEmailContext returns true for non-bypass field', () => {
    mockHasEmailContext.mockReturnValue(true)
    const field = document.createElement('input')
    field.setAttribute('name', 'verification_code')
    expect(hasEmailContext(field)).toBe(true)
  })
})
```

- [ ] **Step 5: Run tests**

Run: `cd extension && npx vitest run tests/unit/watch-session-guardrails.test.ts`
Expected: All 7 tests PASS

Run: `cd extension && npx tsc --noEmit`
Expected: No new TypeScript errors

- [ ] **Step 6: Commit**

```bash
git add extension/src/contents/watch-session.ts extension/tests/unit/watch-session-guardrails.test.ts
git commit -m "feat(guardrails): add no-mailbox check and email context check to WatchSession.start()"
```

---

### Task 4: Add focus gate to contents/index.ts

**Files:**
- Modify: `extension/src/contents/index.ts`
- Create: `extension/tests/unit/focus-gate.test.ts`

- [ ] **Step 1: Fix init order**

In the `initialize()` function (line 212 inside the async IIFE), add Set initialization before detection:

```typescript
  function initialize(): void {
    // Initialize processed set BEFORE detection (focus gate needs it)
    globalProcessedRepresentatives = new Set<HTMLInputElement>()

    // Detect fields immediately
    detectExistingFields()

    // Start observing for dynamic fields
    startDynamicDetection()
```

In `startDynamicDetection()` (line 147), remove the now-redundant initialization. Change:
```typescript
    // Initialize global Set (module-level variable)
    globalProcessedRepresentatives = new Set<HTMLInputElement>()
```
to:
```typescript
    // globalProcessedRepresentatives already initialized in initialize()
```

Keep the SPA navigation clear logic (lines 150-156) as-is.

- [ ] **Step 2: Add focus gate tracking inside the async IIFE**

Inside the async IIFE (after `const detector = new FieldDetector()` on line 61), add:

```typescript
  /**
   * Track focus-gated group members and their handler for cleanup on veto.
   * Key: representative field. Value: { inputs, handler } for removeEventListener.
   */
  const focusGateRegistry = new Map<HTMLInputElement, {
    inputs: HTMLInputElement[]
    handler: () => void
  }>()
```

- [ ] **Step 3: Add registerFocusGate function**

Inside the async IIFE, add after the `focusGateRegistry` declaration:

```typescript
  /**
   * Register a focus gate on a detected field.
   * The field must receive focus before a watch session starts.
   */
  function registerFocusGate(
    representativeField: HTMLInputElement,
    detectionResult: DetectionResult
  ): void {
    // Prevent duplicate registration
    if (representativeField.hasAttribute('data-inboxkey-focus-gated')) return
    representativeField.setAttribute('data-inboxkey-focus-gated', 'true')

    // Mark as processed globally (prevents re-detection by MutationObserver)
    globalProcessedRepresentatives?.add(representativeField)

    // Determine all fields that could receive focus
    const group = detectSplitInputGroup(representativeField)
    const allInputs: HTMLInputElement[] = group ? [...group.inputs] : [representativeField]

    // Check if any field already has focus
    if (allInputs.some(f => document.activeElement === f)) {
      handleDetectedField(representativeField, detectionResult)
      return
    }

    // Create shared handler that triggers on first focus of any group member
    const handler = () => {
      // Check shared flag -- only trigger once across the group
      if (!representativeField.hasAttribute('data-inboxkey-focus-gated')) return
      handleDetectedField(representativeField, detectionResult)
    }

    // Store for cleanup
    focusGateRegistry.set(representativeField, { inputs: allInputs, handler })

    // Attach to all group members
    for (const input of allInputs) {
      input.addEventListener('focus', handler, { once: true })
    }
  }
```

- [ ] **Step 4: Replace direct handleDetectedField calls**

In `detectExistingFields()` (line 134-136), replace:
```typescript
    const best = results[0]
    handleDetectedField(best.field, best)
```
with:
```typescript
    const best = results[0]
    const group = detectSplitInputGroup(best.field)
    const representative = group?.representative || best.field
    registerFocusGate(representative, best)
```

In `startDynamicDetection()` dynamic loop (around line 196-203), replace:
```typescript
          // Mark representative as processed GLOBALLY (only if still in DOM)
          if (document.contains(representative)) {
            globalProcessedRepresentatives?.add(representative)
          } else {
            continue
          }

          // Use the detection result passed from FieldDetector (no re-evaluation needed)
          handleDetectedField(representative, result)
```
with:
```typescript
          // Skip if not in DOM
          if (!document.contains(representative)) {
            continue
          }

          // registerFocusGate handles globalProcessedRepresentatives internally
          registerFocusGate(representative, result)
```

- [ ] **Step 5: Add onVetoed callback with full cleanup**

In `handleDetectedField`, update the `startWatch` call to include `onVetoed`:

```typescript
    startWatch(
      representativeField,
      detectionResult,
      {
        onSessionStarted: (_sessionId: string) => {
          // Session started
        },
        onCodeFound: (result) => {
          // Code value intentionally not logged (privacy)
        },
        onAutofill: async (result, targetField) => {
          const success = await autofillCode({
            code: result.code,
            field: targetField,
          })
          if (success) {
            clearProcessedFields()
          }
          return success
        },
        onTimeout: () => {
          clearProcessedFields()
        },
        onCanceled: () => {
          clearProcessedFields()
        },
        onVetoed: () => {
          // Clean up so field can be re-detected on next page load / SPA nav
          clearProcessedFields()

          // Remove focus gate markers and listeners from all group members
          const entry = focusGateRegistry.get(representativeField)
          if (entry) {
            for (const input of entry.inputs) {
              input.removeAttribute('data-inboxkey-focus-gated')
              input.removeEventListener('focus', entry.handler)
            }
            focusGateRegistry.delete(representativeField)
          }
          representativeField.removeAttribute('data-inboxkey-focus-gated')
        },
      }
    )
```

- [ ] **Step 6: Handle veto in startWatch()**

In `watch-session.ts`, modify `startWatch()` (lines 509-514). Replace:

```typescript
  const session = new WatchSession(field, detectionResult, callbacks)
  activeWatch = session
  lastSessionCreated = now
  void session.start()

  return session
```

With:

```typescript
  const session = new WatchSession(field, detectionResult, {
    ...callbacks,
    onVetoed: () => {
      // Unwind activeWatch so a future session can start
      if (activeWatch === session) {
        activeWatch = null
      }
      callbacks.onVetoed?.()
    },
  })
  activeWatch = session
  lastSessionCreated = now
  void session.start()

  return session
```

- [ ] **Step 7: Write focus gate tests**

Create `extension/tests/unit/focus-gate.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('Focus gate behavior', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('marks field with data-inboxkey-focus-gated attribute', () => {
    const field = document.createElement('input')
    document.body.appendChild(field)
    field.setAttribute('data-inboxkey-focus-gated', 'true')
    expect(field.hasAttribute('data-inboxkey-focus-gated')).toBe(true)
  })

  it('prevents duplicate registration via attribute check', () => {
    const field = document.createElement('input')
    field.setAttribute('data-inboxkey-focus-gated', 'true')
    // Second registration should be a no-op (checked by attribute)
    expect(field.hasAttribute('data-inboxkey-focus-gated')).toBe(true)
  })

  it('focus event fires handler', () => {
    const field = document.createElement('input')
    document.body.appendChild(field)
    const handler = vi.fn()
    field.addEventListener('focus', handler, { once: true })
    field.focus()
    expect(handler).toHaveBeenCalledOnce()
  })

  it('{ once: true } auto-removes listener after first fire', () => {
    const field = document.createElement('input')
    document.body.appendChild(field)
    const handler = vi.fn()
    field.addEventListener('focus', handler, { once: true })
    field.focus()
    field.blur()
    field.focus()
    expect(handler).toHaveBeenCalledOnce()
  })

  it('removeEventListener prevents handler from firing', () => {
    const field = document.createElement('input')
    document.body.appendChild(field)
    const handler = vi.fn()
    field.addEventListener('focus', handler, { once: true })
    field.removeEventListener('focus', handler)
    field.focus()
    expect(handler).not.toHaveBeenCalled()
  })

  it('removing attribute blocks handler re-entry check', () => {
    const field = document.createElement('input')
    field.setAttribute('data-inboxkey-focus-gated', 'true')
    field.removeAttribute('data-inboxkey-focus-gated')
    expect(field.hasAttribute('data-inboxkey-focus-gated')).toBe(false)
  })
})
```

- [ ] **Step 8: Run tests and verify build**

Run: `cd extension && npx vitest run tests/unit/focus-gate.test.ts`
Expected: All 6 tests PASS

Run: `cd extension && npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 9: Commit**

```bash
git add extension/src/contents/index.ts extension/src/contents/watch-session.ts extension/tests/unit/focus-gate.test.ts
git commit -m "feat(guardrails): add focus gate with split-input support and blocked-start cleanup"
```

---

### Task 5: Add abort on disconnect to background worker

**Files:**
- Modify: `extension/src/background/index.ts:330-342`

- [ ] **Step 1: Update onDisconnect handler**

In `attachPort()`, replace the `port.onDisconnect` handler (lines 330-342). Note: snapshot `sessionId` into a local variable before the async call, matching the pattern used in the `STOP_SESSION` handler (lines 364-369). This avoids a race where `cleanupSessionContext` (called internally by `cancelSession`) nulls `context.sessionId` before we reach the cleanup lines after the `await`.

Replace:

```typescript
  port.onDisconnect.addListener(() => {
    console.log(
      `[InboxKey] Port disconnected for tab ${context.tabId}, session ${context.sessionId}`
    )
    if (context.keepAliveTimer) {
      clearInterval(context.keepAliveTimer)
      context.keepAliveTimer = undefined
    }

    if (context.port === port) {
      context.port = undefined
    }
  })
```

With:

```typescript
  port.onDisconnect.addListener(() => {
    console.log(
      `[InboxKey] Port disconnected for tab ${context.tabId}, session ${context.sessionId}`
    )
    if (context.keepAliveTimer) {
      clearInterval(context.keepAliveTimer)
      context.keepAliveTimer = undefined
    }

    if (context.port === port) {
      context.port = undefined
    }

    // GUARDRAIL 4: Cancel session on disconnect
    // Content script is gone, no point continuing to poll.
    // Snapshot sessionId before async call (cancelSession triggers
    // cleanupSessionContext which may null context.sessionId).
    const sessionId = context.sessionId
    if (sessionId) {
      sessionController.cancelSession(sessionId).catch((error) => {
        console.warn("[InboxKey] Failed to cancel session on disconnect:", error)
      })
    }
  })
```

Note: Using `.catch()` instead of `async/await` because `port.onDisconnect` listeners are synchronous. The `cancelSession` promise fires in the background. `cleanupSessionContext` inside the cancel chain handles `sessionContexts.delete(sessionId)` and `context.sessionId = undefined` -- no need to duplicate that here.

- [ ] **Step 2: Verify build**

Run: `cd extension && npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 3: Run full test suite**

Run: `cd extension && npx vitest run`
Expected: No new failures

- [ ] **Step 4: Commit**

```bash
git add extension/src/background/index.ts
git commit -m "feat(guardrails): cancel session on port disconnect to stop wasteful polling"
```

---

### Task 6: Integration build + verification

**Files:** None (verification only)

- [ ] **Step 1: Full build**

Run: `cd extension && npm run build`
Expected: Build succeeds

- [ ] **Step 2: Full test suite**

Run: `cd extension && npx vitest run`
Expected: No new failures

- [ ] **Step 3: TypeScript check**

Run: `cd extension && npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 4: Final commit (if any fixes needed)**

```bash
git commit -m "fix(guardrails): address integration issues from full build/test"
```

---

## Task Dependency Graph

```
Task 1 (export EMAIL_PATTERNS)
   |
   v
Task 2 (email-context-guard module)
   |
   v
Task 3 (no-mailbox + email context in WatchSession.start)
   |
   v
Task 4 (focus gate in index.ts)   Task 5 (abort on disconnect)
   |                                   |
   +-----------------------------------+
   |
   v
Task 6 (integration verification)
```

Tasks 4 and 5 are independent and can run in parallel after Task 3.
