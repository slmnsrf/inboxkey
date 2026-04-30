# E2E Test Suite - Quick Start Guide

## Quick Start

### 1. Install Dependencies
```bash
npm install
npx playwright install chromium --with-deps
```

### 2. Build Extension
```bash
npm run build
```

### 3. Run Tests
```bash
# Run all tests
npm run test:e2e

# Run specific test file
npx playwright test smoke.test.ts
npx playwright test autofill-flow.test.ts
npx playwright test detection-accuracy.test.ts
npx playwright test performance.test.ts
npx playwright test sw-lifecycle.test.ts
npx playwright test lock-unlock.test.ts

# Run in headed mode (see browser)
npx playwright test --headed

# Run in debug mode
npx playwright test --debug

# Run specific test by name
npx playwright test -g "should detect fields within 2 seconds"
```

### 4. View Results
```bash
# Open HTML report
npx playwright show-report

# View specific trace
npx playwright show-trace test-results/[trace-file].zip
```

## Test Suites

| File | Tests | Description |
|------|-------|-------------|
| `smoke.test.ts` | 3 | Basic extension loading and functionality |
| `autofill-flow.test.ts` | 6 | Core autofill scenarios |
| `detection-accuracy.test.ts` | 33+ | Detection across 40+ site fixtures |
| `performance.test.ts` | 13 | Speed and memory benchmarks |
| `sw-lifecycle.test.ts` | 13 | Service worker resilience |
| `lock-unlock.test.ts` | 13 | Security and lock/unlock flows |

## Common Issues

### Tests Not Running
**Issue:** "Host system is missing dependencies"
**Fix:**
```bash
sudo npx playwright install-deps
# OR on Ubuntu/Debian:
sudo apt-get install libatk-bridge2.0-0 libxkbcommon0 libatspi2.0-0 libgbm1
```

### Extension Not Loading
**Issue:** Extension fails to load in tests
**Fix:** Ensure you've built the extension first:
```bash
npm run build
ls build/chrome-mv3-prod/manifest.json  # Should exist
```

### Tests Timing Out
**Issue:** Tests timeout waiting for detection
**Fix:**
- Check if content scripts are loaded
- Increase timeout in specific test
- Verify extension permissions in manifest

### Headless Mode Errors
**Issue:** "Extensions don't work in headless mode"
**Fix:** This is expected. Tests run in headed mode by default. To run in CI:
```bash
# Use Xvfb in CI
xvfb-run npx playwright test
```

## Writing New Tests

### Basic Test Structure
```typescript
import { test, expect } from './fixtures/extension-fixture'
import { injectCode, clearStorage } from './utils/storage-helpers'
import { waitForFieldDetection } from './utils/extension-helpers'
import * as path from 'path'

test.describe('My Test Suite', () => {
  test.beforeEach(async ({ context }) => {
    await clearStorage(context)
  })

  test('should do something', async ({ page, context }) => {
    // Load a fixture
    const fixturePath = path.join(__dirname, '../fixtures/detection/github-2fa.html')
    await page.goto(`file://${fixturePath}`)

    // Wait for detection
    await waitForFieldDetection(page, 5000)

    // Inject a code
    await injectCode(context, '123456', 'github.com')
    await page.waitForTimeout(1000)

    // Verify autofill
    const value = await page.inputValue('#otp')
    expect(value).toBe('123456')
  })
})
```

### Available Fixtures
```typescript
// From extension-fixture.ts
test('example', async ({ context, extensionId, backgroundPage, popupPage }) => {
  // context: BrowserContext with extension loaded
  // extensionId: String ID of the extension
  // backgroundPage: Page handle for service worker
  // popupPage: Page handle for extension popup
})
```

### Helper Utilities

#### Extension Helpers
```typescript
import { waitForFieldDetection, isFieldWatched, isFieldFilled } from './utils/extension-helpers'

await waitForFieldDetection(page, 5000)
const watched = await isFieldWatched(page, '#otp')
const filled = await isFieldFilled(page, '#otp')
```

#### Storage Helpers
```typescript
import { injectCode, clearStorage, lockExtension, unlockExtension } from './utils/storage-helpers'

await injectCode(context, '123456', 'github.com')
await clearStorage(context)
await lockExtension(context)
await unlockExtension(context, 'password')
```

#### Memory Helpers
```typescript
import { getMemoryUsage, measureMemoryIncrease, formatBytes } from './utils/memory-helpers'

const memory = await getMemoryUsage(page)
console.log('Memory:', formatBytes(memory))

const result = await measureMemoryIncrease(page, async () => {
  // Do something that might leak memory
})
console.log('Increase:', formatBytes(result.increase))
```

## Debugging Tips

### 1. Use Console Logs
```typescript
test('debug example', async ({ page }) => {
  // Listen to console
  page.on('console', msg => console.log('PAGE:', msg.text()))

  await page.goto('...')
})
```

### 2. Take Screenshots
```typescript
test('screenshot example', async ({ page }) => {
  await page.goto('...')
  await page.screenshot({ path: 'debug.png' })
})
```

### 3. Use Debug Mode
```bash
npx playwright test --debug
# Opens browser with Playwright Inspector
```

### 4. Slow Down Execution
```typescript
test.use({ launchOptions: { slowMo: 500 } })  // 500ms delay between actions
```

### 5. Check Extension Console
```typescript
test('check extension console', async ({ backgroundPage }) => {
  backgroundPage.on('console', msg => console.log('BACKGROUND:', msg.text()))
})
```

## CI/CD

Tests run automatically on:
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop`
- Manual workflow dispatch

### View Results
1. Go to GitHub Actions tab
2. Click on latest workflow run
3. View job logs and download artifacts

### Artifacts Available
- Playwright HTML report
- Test screenshots (on failure)
- Test videos (on failure)
- Performance metrics
- Security test results

## Performance Targets

| Metric | Target | Critical |
|--------|--------|----------|
| Detection Time | <1s | <2s |
| Memory Usage | <30MB | <50MB |
| Memory Leak | <2MB | <5MB |
| Page Load Impact | <500ms | <1s |

## Further Reading

- [Playwright Documentation](https://playwright.dev)
- [Chrome Extension Testing Guide](https://playwright.dev/docs/chrome-extensions)
- [E2E Test Summary](./E2E_TEST_SUMMARY.md) - Comprehensive documentation

---

**Need Help?** Check the full documentation in `E2E_TEST_SUMMARY.md` or open an issue.
