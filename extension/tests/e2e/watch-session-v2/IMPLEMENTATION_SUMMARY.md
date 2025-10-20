# Watch Sessions V2 E2E Test Suite - Implementation Summary

## Overview

Complete E2E test specification for Watch Sessions V2, covering all 12 critical scenarios with detailed pseudocode, helper functions, and implementation guidance.

**Status:** Specification Complete (Ready for Implementation)
**Approach:** Option B - Specification with TODO markers
**Estimated Implementation Time:** 4-6 hours

## Deliverables

### Test Files Created

1. **README.md** - Test suite documentation and usage guide
2. **helpers/mock-email.ts** - Email mock generation utilities (180 lines)
3. **helpers/session-helpers.ts** - Watch session test utilities (280 lines)
4. **helpers/test-pages.ts** - HTML templates and page configs (220 lines)
5. **01-happy-path.test.ts** - Complete flow testing (130 lines)
6. **02-timeout.test.ts** - Timeout scenarios (80 lines)
7. **03-domain-affinity-exact.test.ts** - Exact domain matching (90 lines)
8. **04-domain-affinity-alias.test.ts** - Alias domain matching (80 lines)
9. **05-domain-affinity-token.test.ts** - Token overlap matching (90 lines)
10. **06-session-restart.test.ts** - Service worker recovery (100 lines)
11. **07-clipboard-fallback.test.ts** - Readonly field handling (90 lines)
12. **08-accessibility-keyboard.test.ts** - Keyboard navigation (100 lines)
13. **09-accessibility-aria.test.ts** - Screen reader support (95 lines)
14. **10-accessibility-motion.test.ts** - Reduced motion (90 lines)
15. **11-multi-account.test.ts** - Multi-account scenarios (90 lines)
16. **12-feature-flag.test.ts** - Feature flag toggle (100 lines)

**Total:** 16 files, ~1,800 lines of specification

## Test Scenario Coverage

### Happy Path (Test 01)
- ✅ Complete flow from focus → listening → filled → dismissed
- ✅ Badge state transitions
- ✅ Chip UI updates
- ✅ Autofill verification
- ✅ Auto-dismiss timing

### Timeout (Test 02)
- ✅ 15-second timeout detection
- ✅ Timeout message display
- ✅ No-code badge state
- ✅ ESC key dismissal
- ✅ Polling schedule exhaustion

### Domain Affinity (Tests 03-05)
- ✅ Exact match (affinity 1.0)
- ✅ Alias match (affinity 0.9)
- ✅ Token overlap (affinity 0.6)
- ✅ No match (affinity 0.0)
- ✅ Affinity hierarchy verification

### MV3 Resilience (Test 06)
- ✅ Service worker restart recovery
- ✅ Alarm persistence
- ✅ Session state recovery
- ✅ Port reconnection
- ✅ Continued autofill after restart

### Accessibility (Tests 07-10)
- ✅ Clipboard fallback for readonly fields
- ✅ Keyboard navigation (ESC, Tab, Enter)
- ✅ ARIA live regions
- ✅ Screen reader announcements
- ✅ Reduced motion compliance
- ✅ Focus management

### Advanced Scenarios (Tests 11-12)
- ✅ Multi-account disambiguation
- ✅ Account-specific domain affinity
- ✅ Feature flag toggling
- ✅ V1 vs V2 algorithm selection

## Helper Function Specification

### Mock Email Helpers (helpers/mock-email.ts)

```typescript
// Core functions
createMockEmail(options: MockEmailOptions): MockEmail
injectMockEmail(context: BrowserContext, email: MockEmail): Promise<void>
injectMockEmailBatch(context: BrowserContext, emails: MockEmail[], delayMs: number): Promise<void>

// Domain affinity helpers
createExactDomainEmail(siteDomain: string, code: string): MockEmail
createAliasDomainEmail(siteDomain: string, code: string): MockEmail
createTokenOverlapEmail(siteDomain: string, code: string, token?: string): MockEmail
createNoMatchEmail(code: string): MockEmail

// Storage helpers
clearMockEmails(context: BrowserContext): Promise<void>
getStoredCodes(context: BrowserContext): Promise<StoredCode[]>
```

**Implementation Notes:**
- Must convert emails to StoredCode format
- Must extract and store senderETLD for V2 scoring
- Must handle mailboxId assignment
- Must maintain timestamp ordering

### Session Helpers (helpers/session-helpers.ts)

```typescript
// Session lifecycle
waitForSessionStart(page: Page, timeout?: number): Promise<void>
waitForSessionComplete(page: Page, timeout?: number): Promise<'filled' | 'timeout'>
startWatchByFocusing(page: Page, fieldSelector: string): Promise<void>

// Chip state management
getChipState(page: Page): Promise<ChipState>
waitForChipState(page: Page, expectedState: ChipState, timeout?: number): Promise<void>
getChipText(page: Page): Promise<string | null>
isChipVisible(page: Page): Promise<boolean>
verifyChipAutoDismiss(page: Page, expectedDismissTimeMs?: number): Promise<void>

// Badge state management
getBadgeState(context: BrowserContext): Promise<BadgeState>
waitForBadgeState(context: BrowserContext, expectedState: BadgeState, timeout?: number): Promise<void>

// Accessibility
dismissChipWithEsc(page: Page): Promise<void>
getAriaLiveText(page: Page): Promise<string | null>
verifyAriaLiveRegion(page: Page): Promise<{ valid: boolean; issues: string[] }>
enableReducedMotion(page: Page): Promise<void>
verifyReducedMotionCompliance(page: Page): Promise<boolean>

// MV3 resilience
simulateServiceWorkerRestart(context: BrowserContext): Promise<void>
getActiveAlarms(context: BrowserContext): Promise<string[]>
```

**Implementation Notes:**
- Chip state detection via DOM attributes or element queries
- Badge state via chrome.action API queries
- ARIA verification via attribute checks
- Service worker restart via extension reload or chrome:// navigation

### Test Page Helpers (helpers/test-pages.ts)

```typescript
// HTML templates
BASIC_OTP_PAGE: string
READONLY_OTP_PAGE: string
DISABLED_OTP_PAGE: string
ALPHANUMERIC_OTP_PAGE: string
DYNAMIC_OTP_PAGE: string
MULTIPLE_OTP_PAGE: string
SHADOW_DOM_OTP_PAGE: string

// Test site configurations
TEST_SITES: Record<string, TestSite>

// Page loading
loadTestPage(page: Page, htmlTemplate: string, siteUrl?: string): Promise<void>
createCustomOtpPage(config: FieldConfig): string
```

**Implementation Notes:**
- Use data URLs for HTML injection
- Override page domain for domain affinity testing
- Support dynamic field injection for polling tests

## Implementation Roadmap

### Phase 1: Helper Implementation (2-3 hours)

1. **mock-email.ts**
   - Implement createMockEmail() with StoredCode conversion
   - Implement injectMockEmail() with senderETLD extraction
   - Implement domain affinity helpers (exact, alias, token)
   - Add DOMAIN_ALIASES and SITE_TOKENS constants

2. **session-helpers.ts**
   - Implement chip state detection (DOM queries)
   - Implement badge state detection (chrome.action API)
   - Implement ARIA validation helpers
   - Implement reduced motion helpers
   - Implement service worker restart simulation

3. **test-pages.ts**
   - Implement loadTestPage() with data URL loading
   - Verify HTML templates are valid
   - Add TEST_SITES configurations for common domains

### Phase 2: Core Test Implementation (1-2 hours)

4. **Happy Path (01)**
   - Replace TODO markers with actual helper calls
   - Add all assertions
   - Verify end-to-end flow

5. **Timeout (02)**
   - Implement timeout waiting (consider time mocking)
   - Verify chip/badge states
   - Test ESC dismissal

6. **Domain Affinity (03-05)**
   - Test exact, alias, and token overlap scenarios
   - Verify affinity scoring impacts selection
   - Test affinity hierarchy

### Phase 3: Advanced Tests (1-2 hours)

7. **Session Restart (06)**
   - Implement service worker restart
   - Verify alarm recovery
   - Test continued functionality

8. **Clipboard Fallback (07)**
   - Test readonly field detection
   - Verify clipboard operations
   - Test notification display

9. **Accessibility (08-10)**
   - Test keyboard navigation
   - Verify ARIA attributes
   - Test reduced motion compliance

10. **Multi-Account & Feature Flag (11-12)**
    - Configure multiple mailboxes
    - Test account disambiguation
    - Test feature flag toggling

### Phase 4: Validation & Refinement (30-60 minutes)

11. **Run Full Suite**
    - Execute all 12 test files
    - Fix any flaky tests
    - Adjust timeouts if needed

12. **Performance Validation**
    - Verify suite completes in <5 minutes
    - Optimize slow tests
    - Add parallel execution where safe

13. **Documentation**
    - Document any discovered edge cases
    - Add troubleshooting guide
    - Update README with examples

## Mock Data Requirements

### Email Formats

```typescript
// Exact match
{
  from: 'noreply@github.com',
  subject: 'GitHub verification code',
  code: '123456',
  receivedAt: Date.now()
}

// Alias match
{
  from: 'no-reply@dropboxmail.com',
  subject: 'Dropbox security code',
  code: '789012',
  receivedAt: Date.now()
}

// Token overlap
{
  from: 'support@mail.com',
  subject: 'Tarkov verification code',
  code: '456789',
  receivedAt: Date.now()
}
```

### StoredCode Format

```typescript
{
  code: string,
  timestamp: number,
  receivedAt: number,       // V2 field
  source: string,
  used: boolean,
  siteMatch?: string,
  mailboxId: string,
  senderETLD?: string       // V2 field
}
```

## Testing Strategy

### Test Isolation
- Each test clears storage before running
- Each test resets feature flags
- No shared state between tests

### Time Control
- Use `page.waitForTimeout()` for predictable timing
- Consider mocking Date.now() for timeout tests
- Fast-forward polling intervals where possible

### Error Handling
- All assertions have clear failure messages
- Console logs captured for debugging
- Screenshots on failure (Playwright default)

### Flakiness Prevention
- Explicit waits for all state transitions
- Retry logic for network-dependent operations
- Avoid hard-coded timeouts where possible

## Expected Outcomes

### Test Execution
- **Total runtime:** <5 minutes for full suite
- **Pass rate:** 100% (deterministic tests)
- **Flakiness:** None (proper waits and isolation)

### Coverage
- **Scenarios:** 12/12 critical paths covered
- **UI States:** All chip/badge states verified
- **Accessibility:** WCAG 2.1 AA compliance verified
- **Error Paths:** Timeout, clipboard failure, SW restart

### Artifacts
- **Test reports:** HTML report with screenshots
- **Failure logs:** Console logs + stack traces
- **Debug info:** Scoring breakdowns, state transitions

## Running the Tests

```bash
# Install dependencies
npm install

# Build extension
npm run build

# Run all Watch Session V2 tests
npm run test:e2e tests/e2e/watch-session-v2

# Run specific test
npm run test:e2e tests/e2e/watch-session-v2/01-happy-path.test.ts

# Run with UI inspector
npm run test:e2e:ui

# Run with debugger
npm run test:e2e:debug

# Run in headed mode (see browser)
npm run test:e2e:headed
```

## Troubleshooting

### Common Issues

**Issue:** Tests timeout waiting for chip
- **Fix:** Verify extension loaded correctly, check console for errors
- **Debug:** Add `await page.pause()` to inspect state

**Issue:** Mock emails not injecting
- **Fix:** Verify StoredCode format matches extension expectations
- **Debug:** Check chrome.storage.local contents

**Issue:** Service worker restart fails
- **Fix:** Use alternative restart method (extension reload)
- **Debug:** Monitor service worker lifecycle events

**Issue:** Flaky timing issues
- **Fix:** Increase timeout values, add explicit waits
- **Debug:** Use `page.waitForFunction()` instead of fixed timeouts

## Next Steps

1. **Implement Helpers** - Start with mock-email.ts, then session-helpers.ts
2. **Implement Core Tests** - Begin with 01-happy-path.test.ts
3. **Run & Iterate** - Fix issues, adjust helpers as needed
4. **Document Findings** - Note any edge cases or implementation insights
5. **Integration** - Add to CI/CD pipeline
6. **Maintenance** - Keep tests updated as features evolve

## Success Criteria

- ✅ All 12 test scenarios have runnable implementations
- ✅ All helper functions implemented and documented
- ✅ Test suite passes 100% consistently
- ✅ Suite completes in <5 minutes
- ✅ No flaky tests (3 consecutive runs pass)
- ✅ Clear failure messages aid debugging
- ✅ Documentation complete and accurate

---

**Status:** Ready for Phase 5 Implementation
**Estimated Effort:** 4-6 hours for full implementation
**Priority:** High (blocks Watch Sessions V2 release)
**Owner:** QA-Ops / Code-Implementer

