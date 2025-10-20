# Changelog

All notable changes to the InboxKey extension will be documented in this file.

## [Unreleased] - 2025-10-20

### Fixed - Critical Session Lifecycle and UX Issues

#### **Issue #1: Chip Not Disappearing After Autofill (Race Condition)**
- **Problem**: "Listening for code" chip remained visible even after code was successfully autofilled
- **Root Cause**: Async race condition - `cleanup()` was called immediately after starting `handleCodeFoundWithAutofill()`, nulling `chipHandle` before autofill completed
- **Fix**: Chained cleanup inside promise `.then()` to wait for autofill completion
- **Files Changed**: `src/contents/watch-session.ts:157-165`

#### **Issue #2: Unnecessary Session Re-Triggering on Filled Fields**
- **Problem**: Re-focusing an already-filled field started a new session, leading to confusing timeout errors
- **Root Cause**: No validation for existing field values or autofill markers before starting sessions
- **Fix**: Added two-layer re-entry protection:
  1. Check `data-inboxkey-filled` attribute
  2. Check if field has non-empty value
- **Files Changed**:
  - `src/contents/index.ts:19` (added import)
  - `src/contents/index.ts:122-131` (added defensive checks)

#### **Issue #3: Listening Chip Staying Indefinitely**
- **Problem**: "Listening for code" chip never auto-dismissed, staying visible forever
- **Root Cause**: Auto-dismiss logic only applied to 'filled', 'copied', and 'timeout' states; 'listening' state had no timeout
- **Fix**: Added 45-second safety net auto-dismiss for 'listening' state
- **Files Changed**:
  - `src/contents/session-chip.ts:17` (added constant)
  - `src/contents/session-chip.ts:84-106` (unified auto-dismiss logic for all states)

#### **Issue #4: Extension Context Invalidation Crashes**
- **Problem**: "Extension context invalidated" error crashed content script when extension was reloaded during development
- **Root Cause**: Old content scripts trying to connect to new extension context after reload
- **Fix**: Added try-catch error handling with user-friendly notification
- **Files Changed**: `src/contents/watch-session.ts:60-93`

### Improved - UX Polish

#### **Blank Blue Box on Chip Appearance**
- **Problem**: Chip appeared as blank blue box before first state update
- **Fix**: Initialize chip with 'listening' state immediately after creation
- **Files Changed**: `src/contents/session-chip.ts:62-63`

#### **Error Notifications Not Auto-Dismissing**
- **Problem**: Error state chips stayed visible indefinitely
- **Fix**: Added 7-second auto-dismiss for error states (longer than success for readability)
- **Files Changed**: `src/contents/session-chip.ts:16, 97-99`

#### **Missing Close Button on Chips**
- **Problem**: No manual way to dismiss chips
- **Fix**: Added accessible close button (×) with proper ARIA labels and keyboard support
- **Files Changed**:
  - `src/contents/session-chip.ts:127-132` (DOM structure)
  - `src/contents/session-chip.ts:74-78` (click handler)
  - `src/contents/session-chip.ts:301-331` (styling)

### Enhanced - Accessibility

- Increased close button size from 20px to 24px for better hit target accessibility
- Standardized chip padding to 12px (4px grid compliance)
- Differentiated auto-dismiss timing: 5s (success), 7s (errors), 45s (listening)
- Matched reduced-motion animation timing to standard (0.3s)
- Added keyboard support: Esc key dismisses chip

### Fixed - Field Detection

#### **False Positive Exclusion for `email_code` Fields**
- **Problem**: Fields like `email_code` on tarkov.com were incorrectly excluded from detection
- **Root Cause**: Exclusion pattern `/e[-\s]?mail/i` matched "email" substring in "email_code"
- **Fix**: Changed to exact match pattern `/^e[-\s]?mail$/i`
- **Files Changed**: `src/lib/detection/patterns.ts:99`

#### **Runtime Crash: `startTime is not defined`**
- **Problem**: Field detector crashed with `ReferenceError: startTime is not defined`
- **Root Cause**: Performance timing variables were commented out but still referenced
- **Fix**: Uncommented `const startTime = performance.now()` declarations
- **Files Changed**:
  - `src/lib/detection/field-detector.ts:27`
  - `src/lib/detection/field-detector.ts:194`

#### **Test Expectations Updated**
- Updated 2 unit tests to expect Tier 1 detection (faster) instead of Tier 2
- Added regression test for `email_code` pattern
- **Files Changed**: `tests/unit/field-detector.test.ts:78, 419-420`

---

## Development Notes

### Testing After Extension Reload
**Important**: When rebuilding during development:
1. Build: `npm run build`
2. Reload extension at `chrome://extensions/`
3. **Hard refresh the page**: `Ctrl+Shift+R` (or `Cmd+Shift+R` on Mac)

Skipping the hard refresh will cause "Extension context invalidated" errors because old content scripts remain active with stale runtime context.

### Auto-Dismiss Timing Strategy
| State | Duration | Rationale |
|-------|----------|-----------|
| `listening` | 45s | Safety net (most codes arrive in 5-15s) |
| `filled` | 5s | Quick confirmation |
| `copied` | 5s | Quick confirmation |
| `timeout` | 7s | Errors need more reading time (WCAG 2.1 SC 2.2.1) |

### Session Re-Entry Protection
Three-layer defense prevents unnecessary session restarts:
1. Check if field is currently being watched
2. Check `data-inboxkey-filled` attribute (set by autofill)
3. Check if field has non-empty value

---

## Technical Debt

- Unit tests for session-chip component need updates to match new design tokens
- E2E tests for chip auto-dismiss timing
- Session memory tracking (5-minute TTL for completed sessions) - deferred as optional enhancement
