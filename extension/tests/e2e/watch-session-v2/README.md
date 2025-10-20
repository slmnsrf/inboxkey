# Watch Sessions V2 - E2E Test Suite

## Overview

Comprehensive end-to-end test suite for Watch Sessions V2, covering all 12 critical scenarios defined in the execution strategy.

## Test Structure

```
watch-session-v2/
├── README.md                           # This file
├── 01-happy-path.test.ts              # Complete happy path flow
├── 02-timeout.test.ts                  # Timeout scenarios
├── 03-domain-affinity-exact.test.ts   # Exact domain matching
├── 04-domain-affinity-alias.test.ts   # Alias domain matching
├── 05-domain-affinity-token.test.ts   # Token overlap matching
├── 06-session-restart.test.ts         # Service worker restart recovery
├── 07-clipboard-fallback.test.ts      # Read-only field fallback
├── 08-accessibility-keyboard.test.ts  # Keyboard navigation (ESC)
├── 09-accessibility-aria.test.ts      # Screen reader support
├── 10-accessibility-motion.test.ts    # Reduced motion support
├── 11-multi-account.test.ts           # Multi-account disambiguation
├── 12-feature-flag.test.ts            # Feature flag toggle
└── helpers/
    ├── mock-email.ts                   # Email mock generation
    ├── session-helpers.ts              # Watch session utilities
    └── test-pages.ts                   # Test page configurations
```

## Running Tests

```bash
# Run all Watch Session V2 tests
npm run test:e2e tests/e2e/watch-session-v2

# Run specific test
npm run test:e2e tests/e2e/watch-session-v2/01-happy-path.test.ts

# Run with UI mode
npm run test:e2e:ui

# Run with debug mode
npm run test:e2e:debug
```

## Test Scenarios

### 1. Happy Path (01-happy-path.test.ts)
- Focus OTP field → chip appears "Listening for code"
- Badge animates (listening state)
- Mock email arrives with code
- Code is autofilled
- Chip shows "Filled ✓"
- Badge shows success
- Chip auto-dismisses after 5s

### 2. Timeout (02-timeout.test.ts)
- Start watch session
- Wait 15+ seconds with no email
- Chip shows timeout message
- Badge shows no-code indicator
- User can dismiss chip with ESC

### 3. Domain Affinity - Exact Match (03-domain-affinity-exact.test.ts)
- User on github.com
- Two emails arrive (generic vs exact match)
- Verify exact match wins (domain affinity 1.0)

### 4. Domain Affinity - Alias (04-domain-affinity-alias.test.ts)
- User on dropbox.com
- Email from no-reply@dropboxmail.com
- Verify alias recognized (affinity 0.9)

### 5. Domain Affinity - Token Overlap (05-domain-affinity-token.test.ts)
- User on battlestategames.com
- Email with "Tarkov verification code" subject
- Verify token overlap matching (affinity 0.6)

### 6. Session Restart Recovery (06-session-restart.test.ts)
- Start watch session
- Simulate service worker restart
- Verify alarms recover
- Verify polling continues
- Code still autofills

### 7. Clipboard Fallback (07-clipboard-fallback.test.ts)
- Focus readonly OTP field
- Code arrives
- Verify chip shows "Code copied to clipboard"
- Verify clipboard contains code
- Verify notification appears

### 8. Accessibility - Keyboard (08-accessibility-keyboard.test.ts)
- Start watch session
- Press ESC key
- Verify chip disappears
- Verify badge clears

### 9. Accessibility - ARIA (09-accessibility-aria.test.ts)
- Start watch session
- Verify ARIA live region exists
- Verify role="status"
- Verify aria-live="polite"
- State changes update live region

### 10. Accessibility - Reduced Motion (10-accessibility-motion.test.ts)
- Enable prefers-reduced-motion
- Start watch session
- Verify chip appears without animation
- Verify chip dismisses without animation
- Verify badge respects motion preference

### 11. Multi-Account (11-multi-account.test.ts)
- User has 2 Gmail accounts configured
- Email arrives in account A (newer, exact domain)
- Email arrives in account B (older, same domain)
- Verify newer code selected

### 12. Feature Flag (12-feature-flag.test.ts)
- Set watchSessionV2Enabled = false
- Verify simple matching used
- Set watchSessionV2Enabled = true
- Verify v2 scoring enabled

## Mock Data Requirements

### Email Mock Structure
```typescript
interface MockEmail {
  from: string
  subject: string
  body: string
  code?: string
  link?: string
  receivedAt: number
  provider: 'gmail' | 'outlook'
}
```

### Test Page Requirements
- OTP input fields with various attributes (maxLength, inputMode, etc.)
- Read-only fields for fallback testing
- Shadow DOM fields for advanced testing
- Dynamic field injection scenarios

## Performance Targets

All tests should complete within:
- Individual test: <30 seconds
- Full suite: <5 minutes

## Test Data Cleanup

Each test should:
1. Clear chrome.storage.local before running
2. Clear chrome.storage.session before running
3. Reset feature flags to defaults
4. Clean up active watch sessions

## Implementation Status

**Current Status:** Specification Complete
**Implementation:** TODO (Phase 5)

All test files are scaffolded with:
- Clear test descriptions
- Pseudocode for test steps
- Type-safe helper functions
- TODO markers for implementation

## Next Steps

1. Implement mock email helpers (`helpers/mock-email.ts`)
2. Implement session helpers (`helpers/session-helpers.ts`)
3. Create test page configurations (`helpers/test-pages.ts`)
4. Implement tests in priority order (1 → 12)
5. Run full suite and fix any flaky tests
6. Document any discovered edge cases

## Dependencies

- Playwright: E2E test runner
- Existing fixtures: `/tests/e2e/fixtures/extension-fixture.ts`
- Existing helpers: `/tests/e2e/utils/extension-helpers.ts`, `/tests/e2e/utils/storage-helpers.ts`

## Coverage Goals

- Line coverage: >90%
- Branch coverage: >85%
- All user-facing scenarios covered
- All error paths tested
