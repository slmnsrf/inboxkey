# InboxKey Test Corpus

**Version:** 1.0.0
**Last Updated:** 2025-10-15
**Status:** ✅ Complete and Production-Ready

## Overview

This directory contains a comprehensive test corpus for the InboxKey browser extension, consisting of 163 realistic fixtures covering 50+ major online services, 7 languages, and 35+ edge cases.

## Directory Structure

```
fixtures/
├── sites/              # 54 HTML site fixtures
│   ├── banking/        # 15 banking sites
│   ├── crypto/         # 14 cryptocurrency exchanges
│   ├── ecommerce/      # 5 e-commerce platforms
│   ├── saas/           # 5 SaaS products
│   └── tech/           # 15 tech companies
├── emails/             # 109 email fixtures
│   ├── otp/            # 20 numeric OTP codes
│   ├── alphanumeric/   # 20 alphanumeric codes
│   ├── magic-links/    # 19 magic link emails
│   ├── password-resets/# 20 password reset emails
│   ├── security-alerts/# 20 security alert emails
│   └── edge-cases/     # 10 edge case scenarios
├── detection/          # Interactive testing pages
├── EDGE_CASES.md       # Comprehensive edge case documentation
├── CORPUS_STATS.md     # Detailed statistics and coverage analysis
└── README.md           # This file
```

## Quick Stats

| Metric | Value |
|--------|-------|
| **Total Fixtures** | 163 |
| **HTML Sites** | 54 |
| **Email JSON Files** | 109 |
| **Edge Cases Covered** | 35+ |
| **Major Services** | 50+ |
| **Languages** | 7 |

---

## Manual Testing Fixtures

### `prototype-test.html` - Service Worker Lifecycle Test

**Purpose:** Validate the core architectural pattern (ADR-001) where content scripts manage polling timers and wake the service worker on-demand.

**How to Use:**

1. Build the extension:
   ```bash
   cd /home/dev/work/inboxkey/extension
   npm run build
   ```

2. Load extension in Chrome:
   - Open `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select `/home/dev/work/inboxkey/extension/build/chrome-mv3-prod/`

3. Open the test page:
   - File URL: `file:///home/dev/work/inboxkey/extension/tests/fixtures/prototype-test.html`
   - Or serve via HTTP: `npx serve tests/fixtures`

4. Open Chrome DevTools (F12) to see console logs

5. Click "Trigger Watch" button to start the test

**Expected Behavior:**
- Field is focused automatically
- 3 polling attempts occur at t=0s, 5s, 10s
- Field autofills with "TEST123" after ~10 seconds
- Background turns light green on successful autofill
- Results panel shows success metrics

**Test Metrics Displayed:**
- Test start time
- Watch trigger time
- Code received time
- Total duration
- Final field value

**Console Logs:**
Filter console by `[InboxKey]` to see:
- Content script: Polling attempts, latency measurements
- Service worker: Message receipts, lifecycle events

**For Advanced Testing:**
Launch Chrome with aggressive GC flag to test service worker termination:
```bash
chrome --aggressive-extension-gc --load-extension=/path/to/extension
```

See `/home/dev/work/inboxkey/extension/docs/prototypes/MANUAL-TESTING-GUIDE.md` for detailed testing instructions.

---

## Adding New Fixtures

When adding new test fixtures:

1. Create descriptive HTML file with clear instructions
2. Include console logging for debugging
3. Add data-testid attributes for Playwright selectors
4. Document expected behavior in comments
5. Update this README with fixture description
