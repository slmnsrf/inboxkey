# Testing Strategy

**InboxKey Privacy-First Chrome Extension**
**Version:** 0.0.1
**Last Updated:** October 15, 2025

---

## Table of Contents

1. [Testing Philosophy](#testing-philosophy)
2. [Test Types](#test-types)
3. [Test Organization](#test-organization)
4. [Critical Test Scenarios](#critical-test-scenarios)
5. [Coverage Targets](#coverage-targets)
6. [Performance Benchmarks](#performance-benchmarks)
7. [CI/CD Pipeline](#cicd-pipeline)
8. [Manual Testing Checklist](#manual-testing-checklist)

---

## Testing Philosophy

InboxKey's testing strategy follows a **risk-based approach**, prioritizing test coverage for security-critical and high-complexity components. We embrace the **test pyramid** model while adapting coverage targets based on component criticality.

### Core Principles

#### 1. Test Pyramid (Adapted for Browser Extensions)
```
        /\
       /  \  E2E Tests (10%)
      /    \
     /------\  Integration Tests (30%)
    /        \
   /----------\  Unit Tests (60%)
  /______________\
```

**Rationale:**
- **Unit tests** provide fast feedback and high coverage
- **Integration tests** validate component interactions
- **E2E tests** verify critical user flows in real Chrome environment

**Deviation from Classic Pyramid:**
- Higher integration test ratio due to complex browser APIs (chrome.runtime, chrome.storage)
- E2E tests critical for service worker lifecycle validation
- Mock-heavy unit tests for isolated component logic

---

#### 2. Coverage Targets

**Not all code is created equal.** Coverage targets reflect component criticality:

| Component | Target | Rationale |
|-----------|--------|-----------|
| **Crypto/Encryption** | 100% | Security-critical, bugs expose user data |
| **OAuth/Auth** | 100% | Security-critical, token theft risk |
| **Storage Layer** | 90% | Data integrity, corruption risk |
| **Detection Engine** | 85% | High complexity, many edge cases |
| **Provider Adapters** | 85% | API integration, error handling |
| **Content Scripts** | 75% | Medium complexity, visual testing needed |
| **UI Components** | 70% | Visual testing supplements unit tests |
| **Background Service Worker** | 80% | Lifecycle management, critical messaging |
| **Utilities/Helpers** | 90% | Pure functions, easy to test |

**Overall Target:** 80% code coverage (line coverage)

---

#### 3. Test-Driven Development (TDD) for Critical Paths

**TDD Required For:**
- Cryptographic functions (encryption, key derivation)
- OAuth token flow (authorization, refresh, revocation)
- Field detection algorithms (tier 1, tier 2)
- Code extraction and parsing logic
- Service worker messaging patterns

**TDD Process:**
1. Write failing test describing expected behavior
2. Implement minimal code to pass test
3. Refactor for clarity and performance
4. Repeat for edge cases and error conditions

**Benefits:**
- **Design clarity:** Tests force clean API design
- **Edge case coverage:** Tests catch boundary conditions early
- **Regression prevention:** Tests prevent future breakage
- **Documentation:** Tests serve as usage examples

---

#### 4. Shift-Left Testing

**Test early, test often:**
- Unit tests run on every file save (Vitest watch mode)
- Integration tests run on every commit
- E2E tests run on every pull request
- Manual testing before every release

**Pre-commit Hooks:**
- Linting (ESLint)
- Type checking (TypeScript)
- Unit tests (fast subset)
- Formatting (Prettier)

---

## Test Types

### 1. Unit Tests (Vitest)

**Scope:** Individual functions and pure logic in isolation

**What to Test:**
- Pure functions (input → output, no side effects)
- Algorithm correctness (detection patterns, code parsers)
- Error handling (invalid inputs, edge cases)
- Data transformations (encryption, serialization)
- Utility functions (string manipulation, validation)

**What NOT to Test:**
- Chrome APIs (mock with `@types/chrome`)
- React components (use integration tests instead)
- Network calls (use integration tests with MSW)
- DOM manipulation (use E2E tests)

**Tools:**
- **Vitest:** Test runner (fast, Jest-compatible API)
- **happy-dom:** Lightweight DOM implementation for Node.js
- **@vitest/ui:** Interactive test UI for debugging

**Example Test:**
```typescript
// tests/unit/crypto/encryption.test.ts
import { describe, it, expect } from 'vitest'
import { deriveKey, encrypt, decrypt } from '@/lib/crypto/encryption'

describe('Encryption', () => {
  it('should encrypt and decrypt round-trip successfully', async () => {
    const plaintext = 'TEST123'
    const passphrase = 'strong-password'

    const { key, salt } = await deriveKey(passphrase)
    const encrypted = await encrypt(plaintext, key, salt)
    const decrypted = await decrypt(encrypted, key)

    expect(decrypted).toBe(plaintext)
  })

  it('should fail decryption with wrong passphrase', async () => {
    const plaintext = 'TEST123'
    const { key: key1, salt } = await deriveKey('password1')
    const encrypted = await encrypt(plaintext, key1, salt)

    const { key: key2 } = await deriveKey('password2', salt)

    await expect(decrypt(encrypted, key2)).rejects.toThrow('Decryption failed')
  })
})
```

**Performance Target:** <100ms per test (typically <10ms)

**Coverage Target:** 90% line coverage for unit-testable code

---

### 2. Integration Tests (Vitest + MSW)

**Scope:** Component interactions, API mocking, Chrome API simulation

**What to Test:**
- Storage layer interactions (`chrome.storage.local` mock)
- OAuth flow with mocked token endpoints (MSW)
- Provider adapters with mocked Gmail/Outlook APIs
- Service worker message passing (mocked `chrome.runtime`)
- Encryption/decryption integrated with storage
- Performance benchmarks (crypto, detection, storage)

**What NOT to Test:**
- Full browser environment (use E2E tests)
- Real network calls (use mocks)
- Visual rendering (use E2E tests)

**Tools:**
- **Vitest:** Test runner
- **MSW (Mock Service Worker):** HTTP request mocking
- **happy-dom:** DOM environment for testing
- **@types/chrome:** Chrome API type definitions (manual mocks)

**Example Test:**
```typescript
// tests/integration/storage-layer.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { StorageService } from '@/lib/storage/service'
import { mockChromeStorage } from '../mocks/chrome-storage'

describe('Storage Service', () => {
  beforeEach(() => {
    mockChromeStorage.clear()
  })

  it('should store and retrieve encrypted email', async () => {
    const storage = new StorageService('test-passphrase')
    await storage.unlock()

    const email = {
      id: 'msg123',
      from: 'sender@example.com',
      subject: 'Your code is 123456',
      code: '123456'
    }

    await storage.saveEmail(email)
    const retrieved = await storage.getEmail('msg123')

    expect(retrieved).toEqual(email)
  })

  it('should fail to retrieve email when locked', async () => {
    const storage = new StorageService('test-passphrase')
    await storage.unlock()
    await storage.saveEmail({ id: 'msg123', code: '123456' })

    await storage.lock()

    await expect(storage.getEmail('msg123')).rejects.toThrow('Storage is locked')
  })
})
```

**Performance Target:** <500ms per test

**Coverage Target:** 85% of integration points

---

### 3. End-to-End Tests (Playwright)

**Scope:** Full user flows in real Chrome browser with extension loaded

**What to Test:**
- Complete autofill flow (detect field → poll service worker → autofill code)
- Extension popup UI interactions
- OAuth flow (with mocked provider endpoints)
- Service worker lifecycle (startup, termination, wake)
- Content script injection and isolation
- Cross-origin messaging
- Performance under real browser conditions

**What NOT to Test:**
- Individual function logic (use unit tests)
- Low-level algorithm details (use unit tests)

**Tools:**
- **Playwright:** Browser automation framework
- **chromium.launchPersistentContext:** Load unpacked extension
- **MSW:** Mock OAuth and email API endpoints

**Example Test:**
```typescript
// tests/e2e/autofill-flow.test.ts
import { test, expect } from '@playwright/test'
import { loadExtension } from '../helpers/extension-loader'

test('should detect and autofill verification code', async ({ context }) => {
  const { extensionId } = await loadExtension(context)

  // Navigate to test page with verification field
  const page = await context.newPage()
  await page.goto('http://localhost:3000/test-page.html')

  // Trigger watch by focusing field
  await page.locator('input[name="verification-code"]').focus()

  // Wait for polling and autofill (should complete in ~10 seconds)
  await expect(page.locator('input[name="verification-code"]'))
    .toHaveValue('TEST123', { timeout: 15000 })

  // Verify field has green highlight (visual feedback)
  await expect(page.locator('input[name="verification-code"]'))
    .toHaveCSS('background-color', 'rgb(0, 255, 0)')
})

test('should survive service worker restart', async ({ context }) => {
  const { extensionId } = await loadExtension(context)
  const page = await context.newPage()
  await page.goto('http://localhost:3000/test-page.html')

  // Start watch
  await page.locator('input[name="code"]').focus()

  // Force service worker termination (simulate aggressive GC)
  await context.serviceWorkers()[0].evaluate(() => {
    // Trigger termination by closing all connections
    chrome.runtime.Port.disconnect()
  })

  // Field should still autofill after SW restart
  await expect(page.locator('input[name="code"]'))
    .toHaveValue('TEST123', { timeout: 15000 })
})
```

**Performance Target:** <10s per test (excluding browser startup)

**Coverage Target:** 100% of critical user flows

---

## Test Organization

### Directory Structure

```
tests/
├── unit/                      # Pure function tests
│   ├── crypto/
│   │   ├── encryption.test.ts      # AES-GCM encryption/decryption
│   │   └── key-derivation.test.ts  # PBKDF2 key derivation
│   ├── detection/
│   │   ├── patterns.test.ts        # Regex and attribute patterns
│   │   ├── field-detector.test.ts  # Tier 1/2 detection logic
│   │   └── matchers.test.ts        # Label/placeholder matching
│   ├── parsers/
│   │   ├── gmail-parser.test.ts    # Gmail email parsing
│   │   ├── outlook-parser.test.ts  # Outlook email parsing
│   │   └── code-extractor.test.ts  # Verification code extraction
│   └── utils/
│       ├── validation.test.ts      # Input validation
│       └── formatting.test.ts      # String formatting utilities
│
├── integration/               # Component interaction tests
│   ├── storage/
│   │   ├── storage-service.test.ts # Storage layer with encryption
│   │   └── storage-capacity.test.ts # Capacity and performance benchmarks
│   ├── auth/
│   │   ├── oauth-flow.test.ts      # OAuth PKCE flow (mocked)
│   │   └── token-refresh.test.ts   # Token refresh logic
│   ├── providers/
│   │   ├── gmail-adapter.test.ts   # Gmail API integration (mocked)
│   │   └── outlook-adapter.test.ts # Outlook API integration (mocked)
│   ├── messaging/
│   │   └── sw-messaging.test.ts    # Content script ↔ service worker messages
│   ├── performance/
│   │   ├── crypto-performance.test.ts # Encryption benchmarks
│   │   └── detection-feasibility.test.ts # Detection performance on real HTML
│   └── sw-lifecycle.test.ts        # Service worker lifecycle tests
│
├── e2e/                       # End-to-end browser tests
│   ├── autofill-flow.test.ts       # Complete autofill user flow
│   ├── popup-ui.test.ts            # Extension popup interactions
│   ├── oauth-flow.test.ts          # OAuth authorization (mocked providers)
│   ├── lock-unlock.test.ts         # Lock/unlock with master password
│   ├── service-worker-restart.test.ts # SW termination resilience
│   └── cross-site-detection.test.ts # Detection across multiple sites
│
├── fixtures/                  # Test data and HTML snapshots
│   ├── html/
│   │   ├── github-2fa.html         # GitHub 2FA page snapshot
│   │   ├── google-signin.html      # Google sign-in verification
│   │   ├── aws-mfa.html            # AWS MFA page
│   │   └── prototype-test.html     # Manual testing page
│   ├── emails/
│   │   ├── gmail-verification.json # Sample Gmail verification email
│   │   └── outlook-otp.json        # Sample Outlook OTP email
│   └── tokens/
│       └── oauth-responses.json    # Mocked OAuth token responses
│
├── mocks/                     # Reusable mocks and stubs
│   ├── chrome-storage.ts           # chrome.storage.local mock
│   ├── chrome-runtime.ts           # chrome.runtime mock
│   ├── oauth-providers.ts          # MSW handlers for OAuth
│   └── email-apis.ts               # MSW handlers for Gmail/Outlook
│
├── helpers/                   # Test utilities
│   ├── extension-loader.ts         # Load extension in Playwright
│   ├── performance-metrics.ts      # Calculate p50/p95/p99
│   └── crypto-helpers.ts           # Encryption test utilities
│
└── setup.ts                   # Global test configuration
```

---

### Naming Conventions

**Test Files:**
- Unit tests: `*.test.ts`
- Integration tests: `*.test.ts`
- E2E tests: `*.test.ts`
- All tests use `.test.ts` suffix (Vitest/Playwright auto-detect)

**Test Suites (describe blocks):**
- Top-level: Component or function name (e.g., `describe('deriveKey', ...)`)
- Nested: Feature or scenario (e.g., `describe('with invalid passphrase', ...)`)

**Test Cases (it blocks):**
- Use imperative mood: `it('should encrypt plaintext', ...)`
- Be specific: `it('should reject empty passphrase with error', ...)`
- Describe expected behavior, not implementation

**Examples:**
```typescript
// Good
it('should encrypt and decrypt round-trip successfully')
it('should throw error when passphrase is empty')
it('should detect verification field on GitHub 2FA page')

// Bad
it('tests encryption')  // Too vague
it('empty passphrase')  // Not a sentence
it('works')             // Meaningless
```

---

## Critical Test Scenarios

### 1. Service Worker Lifecycle

**Why Critical:** Chrome MV3 extensions rely on ephemeral service workers that can terminate at any time. Message delivery and state management must survive terminations.

**Scenarios:**

#### 1.1 Fresh Wake Detection
```typescript
it('should detect fresh wake after service worker restart', async () => {
  // Send message, force SW termination, send another message
  // Verify both messages processed correctly
})
```

#### 1.2 Message Delivery During Restart
```typescript
it('should deliver messages even if SW restarts mid-watch', async () => {
  // Start polling (3 polls over 10 seconds)
  // Force SW termination after poll 1
  // Verify polls 2 and 3 still succeed
})
```

#### 1.3 Aggressive GC Test (Manual)
```bash
chrome --aggressive-extension-gc --load-extension=./build/chrome-mv3-prod
# Run 50 iterations of autofill flow
# Document success rate and SW restart frequency
```

**Success Criteria:**
- 100% message delivery rate across 50 iterations
- Pattern works with `--aggressive-extension-gc` flag
- Measured latency <100ms p95 for individual messages

**Test Location:** `/home/dev/work/inboxkey/extension/tests/integration/sw-lifecycle.test.ts`

---

### 2. Encryption/Decryption Round-trips

**Why Critical:** Bugs in encryption expose user data. Decryption failures cause data loss.

**Scenarios:**

#### 2.1 Basic Round-trip
```typescript
it('should encrypt and decrypt without data corruption', async () => {
  const plaintext = 'Sensitive user data'
  const encrypted = await encrypt(plaintext, key, salt)
  const decrypted = await decrypt(encrypted, key)
  expect(decrypted).toBe(plaintext)
})
```

#### 2.2 Wrong Key Rejection
```typescript
it('should reject decryption with wrong passphrase', async () => {
  const encrypted = await encrypt('data', key1, salt)
  await expect(decrypt(encrypted, key2)).rejects.toThrow()
})
```

#### 2.3 Tampering Detection
```typescript
it('should detect ciphertext tampering', async () => {
  const encrypted = await encrypt('data', key, salt)
  encrypted.ciphertext = tamper(encrypted.ciphertext)
  await expect(decrypt(encrypted, key)).rejects.toThrow()
})
```

#### 2.4 Stability Over 1000 Operations
```typescript
it('should maintain performance over 1000 round-trips', async () => {
  const latencies = []
  for (let i = 0; i < 1000; i++) {
    const start = performance.now()
    const encrypted = await encrypt(`data-${i}`, key, salt)
    const decrypted = await decrypt(encrypted, key)
    latencies.push(performance.now() - start)
  }

  expect(calculateP95(latencies)).toBeLessThan(2) // <2ms p95
  expect(latencies[latencies.length - 1]).toBeLessThan(latencies[0] * 1.2) // <20% degradation
})
```

**Success Criteria:**
- 100% data integrity (no corruption)
- Wrong key always rejected (no false decryptions)
- Tampering always detected (GCM authentication)
- No performance degradation over 1000 operations

**Test Location:** `/home/dev/work/inboxkey/extension/tests/integration/crypto-performance.test.ts`

---

### 3. Field Detection Across 50+ Sites

**Why Critical:** Detection accuracy determines user experience. False positives annoy users; false negatives miss codes.

**Scenarios:**

#### 3.1 Tier 1 Detection (Fast Path)
```typescript
describe('Tier 1 Detection', () => {
  const sites = [
    'github-2fa.html',        // autocomplete="one-time-code"
    'google-signin.html',     // name="smsUserPin"
    'aws-mfa.html',           // id="mfa-code"
  ]

  sites.forEach(site => {
    it(`should detect field on ${site} in <1ms`, async () => {
      const html = await loadFixture(site)
      const start = performance.now()
      const result = detectVerificationField(html)
      const elapsed = performance.now() - start

      expect(result).toBeTruthy()
      expect(result.tier).toBe(1)
      expect(elapsed).toBeLessThan(1)
    })
  })
})
```

#### 3.2 Tier 2 Detection (Deep Scan)
```typescript
describe('Tier 2 Detection', () => {
  const sites = [
    'stripe-verify.html',     // Label: "Enter verification code"
    'paypal-sms.html',        // Placeholder: "6-digit code"
    'discord-phone.html',     // Pattern: \d{6}
  ]

  sites.forEach(site => {
    it(`should detect field on ${site} in <50ms`, async () => {
      const html = await loadFixture(site)
      const start = performance.now()
      const result = detectVerificationField(html)
      const elapsed = performance.now() - start

      expect(result).toBeTruthy()
      expect(result.tier).toBe(2)
      expect(elapsed).toBeLessThan(50)
    })
  })
})
```

#### 3.3 False Positive Avoidance
```typescript
it('should NOT detect phone number field', async () => {
  const html = `<input type="tel" name="phone" placeholder="(555) 123-4567">`
  expect(detectVerificationField(html)).toBeNull()
})

it('should NOT detect credit card CVV field', async () => {
  const html = `<input type="text" name="cvv-code" maxlength="3">`
  expect(detectVerificationField(html)).toBeNull()
})

it('should NOT detect zip code field', async () => {
  const html = `<input type="text" name="zipcode" maxlength="5">`
  expect(detectVerificationField(html)).toBeNull()
})
```

**Success Criteria:**
- 95% detection accuracy (true positive rate)
- <5% false positive rate
- Tier 1: <1ms execution time (70% coverage)
- Tier 2: <50ms execution time (90%+ coverage)

**Test Location:** `/home/dev/work/inboxkey/extension/tests/integration/detection-feasibility.test.ts`

---

### 4. OAuth Token Refresh Flows

**Why Critical:** Token refresh failures lock users out. Improper token handling exposes credentials.

**Scenarios:**

#### 4.1 Successful Refresh
```typescript
it('should refresh access token when expired', async () => {
  const provider = new GmailProvider()
  await provider.authorize()

  // Fast-forward time to token expiration
  vi.setSystemTime(Date.now() + 3600_000) // +1 hour

  // Next API call should trigger refresh
  const emails = await provider.fetchEmails()

  expect(emails).toBeTruthy()
  expect(mockTokenRefreshEndpoint).toHaveBeenCalled()
})
```

#### 4.2 Refresh Token Revoked
```typescript
it('should prompt re-authorization when refresh token invalid', async () => {
  mockTokenRefreshEndpoint.mockResponseOnce(401, {
    error: 'invalid_grant'
  })

  const provider = new GmailProvider()

  await expect(provider.fetchEmails()).rejects.toThrow('Re-authorization required')
  expect(notifyUser).toHaveBeenCalledWith('Please reconnect your Gmail account')
})
```

#### 4.3 Concurrent Refresh Deduplication
```typescript
it('should not trigger multiple concurrent refreshes', async () => {
  const provider = new GmailProvider()

  // Trigger 10 API calls simultaneously (all need refresh)
  const promises = Array(10).fill(null).map(() => provider.fetchEmails())
  await Promise.all(promises)

  // Should only refresh token once
  expect(mockTokenRefreshEndpoint).toHaveBeenCalledTimes(1)
})
```

**Success Criteria:**
- Token refresh success rate >99%
- Re-authorization prompt on refresh token revocation
- No race conditions in concurrent refresh scenarios
- Tokens always encrypted before storage

**Test Location:** `/home/dev/work/inboxkey/extension/tests/integration/auth/token-refresh.test.ts`

---

### 5. Storage Capacity and Performance

**Why Critical:** Storage overflow crashes extension. Slow storage degrades UX.

**Scenarios:**

#### 5.1 100 Emails Storage
```typescript
it('should store 100 emails within storage limits', async () => {
  const emails = generateMockEmails(100)

  for (const email of emails) {
    await storage.saveEmail(email)
  }

  const usage = await chrome.storage.local.getBytesInUse()
  expect(usage).toBeLessThan(500_000) // <500KB for 100 emails
  expect(usage / 10_000_000).toBeLessThan(0.05) // <5% of 10MB limit
})
```

#### 5.2 Batch Operation Performance
```typescript
it('should encrypt 100 emails in <100ms', async () => {
  const emails = generateMockEmails(100)

  const start = performance.now()
  await Promise.all(emails.map(e => storage.saveEmail(e)))
  const elapsed = performance.now() - start

  expect(elapsed).toBeLessThan(100)
})
```

#### 5.3 Storage Quota Handling
```typescript
it('should handle storage quota exceeded gracefully', async () => {
  // Fill storage to near capacity
  await fillStorageToCapacity(9.5) // 9.5MB of 10MB

  // Next write should fail gracefully
  await expect(storage.saveEmail(largeEmail)).rejects.toThrow('Storage quota exceeded')

  // User should be notified to clear old emails
  expect(notifyUser).toHaveBeenCalledWith('Storage full. Please delete old emails.')
})
```

**Success Criteria:**
- 100 emails use <5% of storage (500KB of 10MB)
- Batch operations complete in <100ms for 100 emails
- Graceful degradation on quota exceeded
- Clear user feedback on storage issues

**Test Location:** `/home/dev/work/inboxkey/extension/tests/integration/storage-capacity.test.ts`

---

### 6. Error Handling and Edge Cases

**Why Critical:** Unhandled errors crash extension. Poor error messages confuse users.

**Scenarios:**

#### 6.1 Network Failures
```typescript
it('should handle network timeout gracefully', async () => {
  mockEmailAPI.mockNetworkError('ETIMEDOUT')

  await expect(provider.fetchEmails()).rejects.toThrow('Network timeout')
  expect(notifyUser).toHaveBeenCalledWith('Connection failed. Please check your internet.')
})
```

#### 6.2 Malformed Email Data
```typescript
it('should skip emails with missing required fields', async () => {
  const malformedEmail = { id: '123', from: null, subject: undefined }

  const result = await parser.parse(malformedEmail)

  expect(result).toBeNull() // Skip invalid email
  expect(logger.warn).toHaveBeenCalledWith('Skipped malformed email: 123')
})
```

#### 6.3 Service Worker Crash Recovery
```typescript
it('should recover from service worker crash', async ({ page }) => {
  await page.locator('input[name="code"]').focus()

  // Kill service worker process (simulates crash)
  await killServiceWorker()

  // Next message should restart SW and still work
  await page.locator('button[id="trigger-poll"]').click()

  await expect(page.locator('input[name="code"]')).toHaveValue('TEST123', { timeout: 15000 })
})
```

**Success Criteria:**
- All errors logged with clear messages
- Users see actionable error notifications
- No crashes or unhandled promise rejections
- Graceful degradation on API failures

**Test Location:** Distributed across unit and integration tests

---

## Coverage Targets

### Component-Level Coverage

| Component | Files | Target | Priority | Rationale |
|-----------|-------|--------|----------|-----------|
| **Crypto/Encryption** | `src/lib/crypto/*.ts` | 100% | P0 | Security-critical. Bugs expose user data or cause data loss. |
| **OAuth/Auth** | `src/lib/auth/*.ts` | 100% | P0 | Security-critical. Token theft risk. |
| **Storage Layer** | `src/lib/storage/*.ts` | 90% | P0 | Data integrity. Corruption or loss is unacceptable. |
| **Detection Engine** | `src/lib/detection/*.ts` | 85% | P1 | High complexity, many edge cases. Core UX feature. |
| **Provider Adapters** | `src/lib/providers/*.ts` | 85% | P1 | API integration, error handling. Critical for functionality. |
| **Code Parsers** | `src/lib/parsers/*.ts` | 85% | P1 | Complex regex, many formats. Extraction accuracy critical. |
| **Background Worker** | `src/background/*.ts` | 80% | P1 | Lifecycle management, messaging. Hard to test in unit tests. |
| **Content Scripts** | `src/contents/*.ts` | 75% | P2 | Medium complexity. Visual testing supplements unit tests. |
| **UI Components** | `src/popup/*.tsx`, `src/options/*.tsx` | 70% | P2 | Visual testing more valuable than unit tests. |
| **Utilities/Helpers** | `src/lib/utils/*.ts` | 90% | P2 | Pure functions, easy to test. High ROI. |

**Overall Target:** 80% line coverage

---

### Coverage Metrics

We track multiple coverage dimensions:

| Metric | Definition | Target |
|--------|------------|--------|
| **Line Coverage** | % of lines executed | 80% overall |
| **Branch Coverage** | % of branches (if/else) executed | 75% overall |
| **Function Coverage** | % of functions called | 85% overall |
| **Statement Coverage** | % of statements executed | 80% overall |

**Tools:**
- Vitest built-in coverage (v8 provider)
- Reports: HTML, JSON, text
- CI integration: Fail if below threshold

**Generate Coverage Report:**
```bash
npm test -- --coverage
open coverage/index.html
```

---

### Exclusions from Coverage

The following code is excluded from coverage requirements:

1. **Configuration Files:** `*.config.ts`, `*.config.js`
2. **Type Definitions:** `*.d.ts`
3. **Test Files:** `tests/**/*.ts`
4. **Generated Code:** `build/**/*`, `.plasmo/**/*`
5. **Development Tools:** `scripts/**/*`
6. **Third-party Mocks:** `tests/mocks/**/*` (already tested by their usage)

**Configured in:** `/home/dev/work/inboxkey/extension/vitest.config.ts`

---

## Performance Benchmarks

### 1. Detection Performance

| Scenario | Target | Measurement |
|----------|--------|-------------|
| **Tier 1 Detection** (Fast Path) | <1ms | p95 latency across 100 sites |
| **Tier 2 Detection** (Deep Scan) | <50ms | p95 latency across 100 sites |
| **False Positive Rate** | <5% | % of non-verification fields detected |
| **False Negative Rate** | <5% | % of verification fields missed |

**Test Method:**
- Load real HTML fixtures from 100+ popular websites
- Run detection algorithm 100 times per site
- Calculate p50, p95, p99 latencies
- Manually verify detection accuracy

**Benchmark Location:** `/home/dev/work/inboxkey/extension/tests/integration/detection-feasibility.test.ts`

---

### 2. Encryption Performance

| Operation | Target | Measurement |
|-----------|--------|-------------|
| **Key Derivation (PBKDF2)** | <500ms | p95 latency over 100 iterations |
| **Encrypt 1KB** | <50ms | p95 latency over 100 iterations |
| **Encrypt 10KB** | <100ms | p95 latency over 100 iterations |
| **Decrypt 10KB** | <100ms | p95 latency over 100 iterations |
| **Round-trip 10KB** | <200ms | p95 encrypt + decrypt latency |
| **Concurrent 10 Emails** | <1000ms | p95 for 10 parallel operations |

**Actual Results (from Phase 0 benchmarks):**
- Key derivation: **17ms p95** (96% faster than target)
- Encrypt 10KB: **0.54ms p95** (99% faster than target)
- Decrypt 10KB: **0.55ms p95** (99% faster than target)
- Round-trip 10KB: **0.71ms p95** (99% faster than target)

**Benchmark Location:** `/home/dev/work/inboxkey/extension/tests/integration/crypto-performance.test.ts`

---

### 3. Storage Performance

| Operation | Target | Measurement |
|-----------|--------|-------------|
| **Write Single Email** | <100ms | p95 latency (encrypt + store) |
| **Read Single Email** | <100ms | p95 latency (retrieve + decrypt) |
| **Batch Write 100 Emails** | <1000ms | Total time to write 100 emails |
| **Batch Read 100 Emails** | <2000ms | Total time to read 100 emails |
| **Storage Capacity** | 10MB limit | Bytes used for 100 emails |

**Actual Results:**
- 100 emails: **306KB** (3% of 10MB limit)
- Encrypt 100 emails: **10ms total**
- Decrypt 100 emails: **164ms total**

**Benchmark Location:** `/home/dev/work/inboxkey/extension/tests/integration/storage-capacity.test.ts`

---

### 4. Memory Performance

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Content Script Memory** | <5MB per tab | Chrome DevTools Memory Profiler |
| **Service Worker Memory** | <10MB | Chrome DevTools Memory Profiler |
| **Memory Leak Test** | <10% growth | After 1000 operations |

**Test Method:**
- Run extension in Chrome DevTools
- Perform 1000 autofill operations
- Take heap snapshots before/after
- Calculate memory delta

**Manual Test:** See [Manual Testing Checklist](#manual-testing-checklist)

---

### 5. Service Worker Lifecycle

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Message Delivery Rate** | 100% | % of messages delivered across 50 iterations |
| **Wake Latency** | <100ms | p95 time from message send to SW wake |
| **Survival Under Aggressive GC** | 100% success | 50 iterations with `--aggressive-extension-gc` flag |

**Test Method:**
- Automated: Playwright test with 10 iterations
- Manual: 50 iterations with aggressive GC flag

**Test Location:** `/home/dev/work/inboxkey/extension/tests/integration/sw-lifecycle.test.ts`

---

## CI/CD Pipeline

### Pre-commit Hooks (Git Hooks)

**Runs:** On every `git commit` (before commit is created)

**Steps:**
1. **Lint:** ESLint checks code quality
2. **Type Check:** TypeScript checks for type errors
3. **Format:** Prettier checks code formatting
4. **Unit Tests (Fast Subset):** Run critical unit tests (<5s)

**Tools:** Husky + lint-staged

**Configuration:**
```json
// package.json
{
  "lint-staged": {
    "*.{ts,tsx}": [
      "eslint --fix",
      "prettier --write",
      "vitest related --run"
    ]
  }
}
```

**Failure Behavior:** Commit is blocked if any step fails. Fix issues and retry.

---

### Pull Request (PR) Checks

**Runs:** On every pull request to `main` branch

**Steps:**
1. **Lint:** ESLint (full codebase)
2. **Type Check:** TypeScript (full codebase)
3. **Unit Tests:** All unit tests
4. **Integration Tests:** All integration tests
5. **Coverage Report:** Generate and upload coverage report
6. **Build:** Ensure extension builds successfully

**CI Platform:** GitHub Actions

**Configuration:**
```yaml
# .github/workflows/pr-checks.yml
name: PR Checks
on: [pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 20
      - run: npm ci
      - run: npm run lint
      - run: npm run type-check
      - run: npm test -- --coverage
      - run: npm run build
      - uses: codecov/codecov-action@v3
        with:
          file: ./coverage/coverage-final.json
```

**Failure Behavior:** PR cannot be merged if checks fail.

---

### Pre-release Checks

**Runs:** Before tagging a release version

**Steps:**
1. **All PR Checks** (lint, type-check, unit tests, integration tests)
2. **E2E Tests (Full Suite):** Run all Playwright E2E tests
3. **Performance Benchmarks:** Run crypto and detection benchmarks
4. **Manual Testing Checklist:** (See below)
5. **Security Audit:** `npm audit --production`
6. **Build Production:** `npm run package` (creates .zip for Chrome Web Store)

**Manual Steps:**
- Load extension in Chrome
- Test critical flows (autofill, OAuth, lock/unlock)
- Verify no console errors
- Test on multiple websites

**Release Workflow:**
```bash
# 1. Run automated checks
npm run lint
npm run type-check
npm test -- --run
npm run test:e2e

# 2. Run performance benchmarks
npm test -- tests/integration/crypto-performance.test.ts --run
npm test -- tests/integration/detection-feasibility.test.ts --run

# 3. Security audit
npm audit --production

# 4. Build production package
npm run package

# 5. Manual testing (see checklist below)
# ...

# 6. Tag release
git tag v0.1.0
git push --tags
```

---

### Post-release Smoke Tests

**Runs:** After publishing to Chrome Web Store (manual trigger)

**Steps:**
1. **Install from Store:** Install published version from Chrome Web Store
2. **Basic Autofill Test:** Verify autofill works on 5 common sites
3. **OAuth Test:** Connect Gmail and Outlook accounts
4. **Lock/Unlock Test:** Lock and unlock with master password
5. **Performance Check:** Verify no regression in detection/encryption speed

**Failure Behavior:** If smoke tests fail, pull release from store and investigate.

---

## Manual Testing Checklist

Automated tests cannot cover all scenarios. The following manual tests should be performed before each release.

### 1. New Provider Addition

**When:** Adding support for a new email provider (e.g., Yahoo, ProtonMail)

**Checklist:**
- [ ] OAuth flow completes successfully
- [ ] Tokens stored encrypted in chrome.storage.local
- [ ] Email fetching works (test with 10+ emails)
- [ ] Code extraction accurate (test with 10+ verification emails)
- [ ] Token refresh works after expiration
- [ ] Disconnect/reconnect works
- [ ] Error messages clear and actionable
- [ ] No console errors or warnings

**Test Data:**
- Create test account with provider
- Generate 10+ verification emails (sign up for various services)
- Document any issues or API quirks

---

### 2. Browser Version Compatibility

**When:** Before each major release, test on latest Chrome stable and beta

**Checklist:**
- [ ] Extension installs successfully
- [ ] All features work (autofill, OAuth, lock/unlock)
- [ ] No manifest errors
- [ ] Service worker lifecycle stable
- [ ] Performance acceptable (no regressions)
- [ ] No console errors

**Test Matrix:**

| Chrome Version | OS | Status | Notes |
|----------------|----|----|-------|
| Chrome 120 (Stable) | Windows 11 | ✅ | Baseline |
| Chrome 120 (Stable) | macOS 14 | ✅ | Baseline |
| Chrome 120 (Stable) | Ubuntu 22.04 | ✅ | Baseline |
| Chrome 121 (Beta) | Windows 11 | ⏳ | Pre-release testing |

---

### 3. Performance Profiling

**When:** Quarterly, or when performance concerns arise

**Checklist:**
- [ ] Detection latency <1ms (Tier 1), <50ms (Tier 2)
- [ ] Encryption/decryption <100ms per email
- [ ] Storage operations <200ms for 100 emails
- [ ] Content script memory <5MB per tab
- [ ] Service worker memory <10MB
- [ ] No memory leaks after 1000 operations

**Tools:**
- Chrome DevTools > Performance tab
- Chrome DevTools > Memory tab (heap snapshots)
- `performance.now()` for micro-benchmarks

**Procedure:**
1. Open Chrome DevTools
2. Navigate to Performance tab
3. Click Record
4. Perform 100 autofill operations
5. Stop recording
6. Analyze flame graph for bottlenecks
7. Take heap snapshots before/after to detect leaks

---

### 4. Security Audit

**When:** Before major releases (v0.1.0, v1.0.0, etc.)

**Checklist:**
- [ ] All sensitive data encrypted in storage
- [ ] No tokens logged to console
- [ ] CSP headers prevent inline scripts
- [ ] OAuth PKCE flow implemented correctly
- [ ] Token scopes minimized (read-only)
- [ ] No hardcoded secrets in code
- [ ] Dependencies up-to-date (no critical vulnerabilities)
- [ ] Error messages don't leak sensitive data

**Tools:**
- `npm audit --production`
- Chrome DevTools > Application > Storage (inspect chrome.storage.local)
- Chrome DevTools > Console (look for token leaks)

**Procedure:**
1. Run `npm audit --production` and fix all critical/high vulnerabilities
2. Load extension in Chrome
3. Open DevTools > Application > Storage > Extension Storage
4. Verify all tokens/emails are encrypted (base64 ciphertext)
5. Review console logs for any sensitive data leaks
6. Test OAuth flow and verify PKCE parameters present
7. Review code for hardcoded secrets (API keys, passwords)

---

## Running Tests

### Unit Tests

```bash
# Run all unit tests
npm test

# Run specific test file
npm test tests/unit/crypto/encryption.test.ts

# Watch mode (re-run on file changes)
npm test -- --watch

# UI mode (interactive test explorer)
npm run test:ui

# Coverage report
npm test -- --coverage
```

---

### Integration Tests

```bash
# Run all integration tests
npm test tests/integration/

# Run specific integration test
npm test tests/integration/crypto-performance.test.ts

# Run with verbose output
npm test tests/integration/ -- --reporter=verbose
```

---

### E2E Tests

```bash
# Install Playwright browsers (first time only)
npx playwright install

# Run all E2E tests
npm run test:e2e

# Run specific E2E test
npm run test:e2e tests/e2e/autofill-flow.test.ts

# Debug mode (headed browser, slowMo)
npm run test:e2e -- --headed --debug

# Generate HTML report
npm run test:e2e -- --reporter=html
```

---

### All Tests (CI Mode)

```bash
# Run all tests in CI mode (no watch, fail fast)
npm run lint && \
npm run type-check && \
npm test -- --run && \
npm run test:e2e
```

---

## Test Writing Guidelines

### 1. Follow AAA Pattern (Arrange-Act-Assert)

```typescript
it('should encrypt plaintext', async () => {
  // Arrange: Set up test data
  const plaintext = 'test data'
  const { key, salt } = await deriveKey('password')

  // Act: Perform the operation
  const encrypted = await encrypt(plaintext, key, salt)

  // Assert: Verify the result
  expect(encrypted.ciphertext).toBeTruthy()
  expect(encrypted.iv).toBeTruthy()
  expect(encrypted.salt).toBeTruthy()
})
```

---

### 2. Use Descriptive Test Names

```typescript
// Good
it('should reject empty passphrase with clear error message')

// Bad
it('tests passphrase validation')
```

---

### 3. Test One Thing Per Test

```typescript
// Good: Separate tests for different behaviors
it('should encrypt plaintext successfully')
it('should decrypt ciphertext successfully')
it('should reject decryption with wrong key')

// Bad: Too many assertions in one test
it('should encrypt and decrypt and handle errors', ...)
```

---

### 4. Use Factories for Test Data

```typescript
// tests/helpers/factories.ts
export function createMockEmail(overrides = {}) {
  return {
    id: 'msg123',
    from: 'sender@example.com',
    subject: 'Your verification code',
    body: 'Your code is 123456',
    code: '123456',
    ...overrides
  }
}

// tests/unit/parser.test.ts
it('should extract code from email', () => {
  const email = createMockEmail({ code: '789012' })
  expect(parseCode(email)).toBe('789012')
})
```

---

### 5. Mock External Dependencies

```typescript
import { vi } from 'vitest'

it('should handle network timeout', async () => {
  // Mock fetch to simulate timeout
  global.fetch = vi.fn().mockRejectedValue(new Error('ETIMEDOUT'))

  await expect(fetchEmails()).rejects.toThrow('Network timeout')
})
```

---

### 6. Clean Up After Tests

```typescript
import { afterEach } from 'vitest'

afterEach(() => {
  // Clear mocked chrome.storage
  mockChromeStorage.clear()

  // Reset all mocks
  vi.clearAllMocks()

  // Restore system time (if using vi.setSystemTime)
  vi.useRealTimers()
})
```

---

## Conclusion

InboxKey's testing strategy ensures **high quality, security, and reliability** through:

1. **Comprehensive coverage** targeting 80% overall (100% for crypto/auth)
2. **Multiple test layers** (unit, integration, E2E) for different validation needs
3. **Performance benchmarks** to catch regressions early
4. **CI/CD automation** for fast feedback loops
5. **Manual testing** for scenarios that require human judgment

**Key Takeaway:** Tests are not just for finding bugs—they're living documentation, design feedback, and confidence builders for refactoring.

---

**Document Version:** 1.0.0
**Last Updated:** October 15, 2025
**Next Review:** January 15, 2026
