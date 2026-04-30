# Email Fixtures - Golden & Holdout Datasets

**Purpose:** Manually verified email samples for regression testing and overfitting detection.

**Location:** `/extension/tests/fixtures/emails/`

**Accessed by:**
- Extension tests (E2E, unit)
- Extraction-core tests (via symlink at `packages/extraction-core/src/__tests__/fixtures`)

---

## Directory Structure

```
extension/tests/fixtures/emails/
├── otp/                      # Numeric OTP codes (primary dataset)
│   ├── gmail-*.json          # Gmail provider samples
│   ├── outlook-*.json        # Outlook/Hotmail/Live samples
│   └── imap-*.json           # Generic IMAP provider samples
│
├── alphanumeric/             # Alphanumeric codes (A-Z0-9 mixed)
│   ├── gmail-*.json
│   ├── outlook-*.json
│   └── imap-*.json
│
├── magic-links/              # Magic link / passwordless login emails
│   ├── gmail-*.json
│   └── outlook-*.json
│
├── password-resets/          # Password reset emails (negative cases for OTP)
│   ├── gmail-*.json
│   └── outlook-*.json
│
├── security-alerts/          # Security notifications (negative cases)
│   ├── gmail-*.json
│   └── outlook-*.json
│
└── edge-cases/               # HOLDOUT SET (never use for training/tuning)
    ├── forwarded-*.json      # Forwarded OTP emails
    ├── html-complex-*.json   # Complex HTML structure
    ├── multilang-*.json      # Mixed language emails
    ├── malformed-*.json      # Unusual formatting
    └── ambiguous-*.json      # Ambiguous codes (order IDs, invoices, etc.)
```

---

## Fixture Format

Each fixture is a JSON file with the following schema:

```json
{
  "id": "unique-identifier",
  "type": "otp|alphanumeric|magic-link|password-reset|security-alert|edge-case",
  "category": "otp|alphanumeric|magic-links|password-resets|security-alerts|edge-cases",
  "from": "sender@example.com",
  "subject": "Email subject line",
  "body": "Full email body (plain text or HTML)",
  "extracted": {
    "code": "123456",
    "pattern": "code-in-body|code-in-subject|contextual",
    "confidence": "high|medium|low"
  },
  "metadata": {
    "provider": "gmail|outlook|imap",
    "language": "en|tr|de|fr|es|...",
    "date": "2025-10-21",
    "notes": "Any relevant context or edge case description"
  }
}
```

### Field Descriptions

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier (e.g., `gmail-otp-001`, `outlook-alnum-005`) |
| `type` | Yes | Email type for categorization |
| `category` | Yes | Directory category (matches directory name) |
| `from` | Yes | Sender email address (real or anonymized) |
| `subject` | Yes | Email subject line |
| `body` | Yes | Full email body (preserve formatting, HTML tags if present) |
| `extracted.code` | Conditional | Expected code to extract (null for negative cases) |
| `extracted.pattern` | Conditional | How code appears (null for negative cases) |
| `extracted.confidence` | Conditional | Expected confidence level (null for negative cases) |
| `metadata.provider` | Yes | Email provider for multi-provider testing |
| `metadata.language` | Yes | Primary language (ISO 639-1 code) |
| `metadata.date` | No | When fixture was added (YYYY-MM-DD) |
| `metadata.notes` | No | Context, edge case description, or source info |

### Negative Cases

For emails that should NOT extract codes (password resets, security alerts), set `extracted` to `null`:

```json
{
  "id": "gmail-password-reset-001",
  "type": "password-reset",
  "category": "password-resets",
  "from": "noreply@example.com",
  "subject": "Reset your password",
  "body": "Click here to reset: https://example.com/reset?token=abc123",
  "extracted": null,
  "metadata": {
    "provider": "gmail",
    "language": "en",
    "notes": "Should not extract token as OTP"
  }
}
```

---

## Coverage Goals

### Provider Distribution
- **Gmail:** 40-50% of fixtures (most common provider)
- **Outlook/Hotmail/Live:** 30-40% of fixtures
- **IMAP/Other:** 10-20% of fixtures (generic, lesser-known providers)

### Language Distribution
- **English (en):** 50-60% (primary language)
- **Turkish (tr):** 10-15% (key non-English market)
- **German (de):** 5-10%
- **French (fr):** 5-10%
- **Spanish (es):** 5-10%
- **Other:** 5-10% (edge cases, multilingual)

### Pattern Diversity
- **Code in body only:** 50%
- **Code in subject only:** 10%
- **Code in both:** 20%
- **Contextual (complex):** 20%

### Edge Cases (Holdout Set)
- **Forwarded emails:** 10+ samples
- **Complex HTML:** 10+ samples
- **Mixed language:** 5+ samples
- **Malformed/unusual:** 10+ samples
- **Ambiguous codes:** 10+ samples

**Total target:** 150-200 fixtures across all categories

---

## Adding New Fixtures

### When to Add
1. **False negative** found in production (missed extraction)
2. **False positive** found (incorrect extraction)
3. **New provider** or **language** discovered
4. **Edge case** not covered by existing fixtures

### How to Add

1. **Create fixture file:**
   ```bash
   cd extension/tests/fixtures/emails/otp
   touch gmail-otp-042.json
   ```

2. **Populate with real data (anonymized):**
   - Copy actual email content (remove PII: names, addresses, real codes)
   - Replace sensitive data: `user@example.com`, generic names
   - Preserve structure and formatting

3. **Add expected extraction:**
   ```json
   {
     "id": "gmail-otp-042",
     "type": "otp",
     "category": "otp",
     "from": "noreply@service.com",
     "subject": "Verification code",
     "body": "Your code is 847293. Valid for 10 minutes.",
     "extracted": {
       "code": "847293",
       "pattern": "code-in-body",
       "confidence": "high"
     },
     "metadata": {
       "provider": "gmail",
       "language": "en",
       "date": "2025-10-21",
       "notes": "Standard 6-digit OTP with expiry context"
     }
   }
   ```

4. **Run tests to validate:**
   ```bash
   cd packages/extraction-core
   npm run test:golden
   npm run test:holdout  # if added to edge-cases/
   npm run test:providers  # if new provider
   ```

5. **Check coverage:**
   - Did recall/precision improve?
   - Did provider-specific metrics change?
   - Any new failures?

### Edge Cases vs. Golden Set

| Criteria | Golden Set | Holdout Set (edge-cases/) |
|----------|-----------|---------------------------|
| **Purpose** | Training & tuning baseline | Overfitting detection |
| **Usage** | Every test run | Periodic validation |
| **Optimization** | Can optimize for these | **Never** optimize for these |
| **Characteristics** | Representative samples | Unusual, complex, ambiguous |
| **Recall target** | ≥90% | ≥85% (slightly lower OK) |

**Critical:** Never move fixtures from golden set to holdout or vice versa. Keep them separate.

---

## Maintenance Policy

### Quarterly Review
- **Check coverage:** Are we maintaining provider/language distribution?
- **Remove duplicates:** Consolidate similar fixtures
- **Update edge cases:** Add new patterns discovered in production

### When Extraction-Core Changes
- **Run full test suite:** `npm run test:full`
- **Check for regressions:** Any recall/precision drops?
- **Update expectations:** If algorithm improves, update `extracted.confidence`

### Fixture Retirement
- **Criteria:** Fixture is redundant (covered by 3+ similar fixtures)
- **Process:** Move to `archived/` subdirectory (don't delete)
- **Validation:** Ensure removal doesn't drop coverage below thresholds

---

## Current Stats

<!-- Update this section when adding/removing fixtures -->

**Last updated:** 2025-10-21

Based on parent README (version 1.0.0):

| Category | Count | Coverage |
|----------|-------|----------|
| OTP | 20 | Numeric codes, multiple providers |
| Alphanumeric | 20 | Mixed case codes |
| Magic Links | 19 | Passwordless login |
| Password Resets | 20 | Negative cases (should not extract) |
| Security Alerts | 20 | Negative cases (notifications) |
| Edge Cases (Holdout) | 10 | Complex, unusual patterns |
| **Total** | **109** | **7 languages, 50+ services** |

**Provider breakdown:**
- Gmail: ~45% (primary provider)
- Outlook: ~35% (Microsoft ecosystem)
- IMAP: ~20% (generic providers)

**Language breakdown:**
- English: ~60%
- Turkish: ~12%
- German, French, Spanish: ~18%
- Other: ~10%

---

## Usage Examples

### Extraction-Core Tests

```typescript
import { readFileSync } from 'fs'
import { join } from 'path'

// Load fixture
const fixturePath = join(__dirname, 'fixtures', 'otp', 'gmail-otp-001.json')
const fixture = JSON.parse(readFileSync(fixturePath, 'utf-8'))

// Extract and validate
const result = extractOTPs(fixture.body, { subject: fixture.subject })
expect(result[0].code).toBe(fixture.extracted.code)
```

### Extension E2E Tests

```typescript
import gmailOtp001 from '../fixtures/emails/otp/gmail-otp-001.json'

// Simulate email arrival
await simulateEmailArrival(gmailOtp001)

// Verify extraction and display
await expect(page.locator('[data-testid="otp-code"]')).toHaveText('123456')
```

---

## Contributing Guidelines

1. **Anonymize PII:** Remove personal information, real codes, addresses
2. **Preserve structure:** Keep HTML tags, formatting, whitespace
3. **Use real patterns:** Don't invent fake email formats; use real provider templates
4. **Document edge cases:** Add notes explaining why fixture is unusual
5. **Test before commit:** Run `npm run test:full` to ensure no regressions

---

## Related Documentation

- **Golden Dataset Test:** `packages/extraction-core/src/__tests__/golden-dataset.test.ts`
- **Holdout Dataset Test:** `packages/extraction-core/src/__tests__/holdout-dataset.test.ts`
- **Provider Compatibility Test:** `packages/extraction-core/src/__tests__/provider-compatibility.test.ts`
- **Fine-Tuner Agent:** `.claude/agents/fine-tuner.md`
- **Escalation Matrix:** `.claude/agents/fine-tuner-escalation-matrix.md`

---

**Fixture integrity is critical:** These fixtures are the source of truth for extraction quality. Handle with care.
