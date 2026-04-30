# Edge Cases Documentation

## Overview
This document catalogs all edge cases covered by the InboxKey test corpus. Each edge case represents a real-world scenario that could cause detection failures if not properly handled.

## Email Edge Cases

### 1. Multiple Codes in Single Email
**Fixture:** `emails/edge-cases/multiple-codes.json`

**Scenario:** Email contains multiple verification codes with different purposes.

**Challenge:** Parser must identify the primary code vs. secondary codes.

**Example:**
```
Your SMS code is 123456 and your email code is 789012.
Please use the SMS code: 123456 to verify.
```

**Expected Behavior:** Extract `123456` as primary code, recognize `789012` as alternative.

---

### 2. Code in URL Parameters
**Fixture:** `emails/edge-cases/code-in-url.json`

**Scenario:** Verification code appears both in URL query parameter and in plain text.

**Challenge:** Avoid extracting URL components as codes; prioritize plaintext code.

**Example:**
```
Click to verify: https://example.com/verify?code=485739
or enter code manually: 485739
```

**Expected Behavior:** Extract `485739` from text, not from URL parsing.

---

### 3. Formatted Codes (Dashes/Spaces)
**Fixture:** `emails/edge-cases/formatted-code.json`

**Scenario:** Code contains formatting characters (dashes, spaces) for readability.

**Challenge:** Normalize code by removing formatting while preserving digits.

**Examples:**
- `123-456` → `123456`
- `1 2 3 4 5 6` → `123456`
- `12 34 56` → `123456`

**Expected Behavior:** Strip formatting, extract normalized code.

---

### 4. HTML-Formatted Emails
**Fixture:** `emails/edge-cases/html-formatted.json`

**Scenario:** Code embedded in HTML tags with inline styles.

**Challenge:** Parse HTML, extract text content, ignore markup.

**Example:**
```html
<h1 style='font-size:32px; letter-spacing:10px;'>673849</h1>
```

**Expected Behavior:** Extract `673849`, ignore HTML tags and styles.

---

### 5. Lengthy Email Bodies
**Fixture:** `emails/edge-cases/very-long-body.json`

**Scenario:** Short code buried in verbose legal/marketing text (500+ words).

**Challenge:** Efficiently scan large text bodies without performance degradation.

**Expected Behavior:** Extract code regardless of surrounding text volume.

---

### 6. Image-Based Codes
**Fixture:** `emails/edge-cases/code-as-image.json`

**Scenario:** Primary code displayed as image with text fallback.

**Challenge:** Prioritize alt-text or fallback content when code is in image.

**Expected Behavior:** Extract fallback text code when image contains primary code.

---

### 7. Localized Content
**Fixture:** `emails/edge-cases/localized-content.json`

**Scenario:** Email in non-English language (Spanish, French, German, etc.).

**Challenge:** Language-agnostic pattern matching without keyword dependency.

**Example (Spanish):**
```
Su código de verificación es: 731859
```

**Expected Behavior:** Extract code regardless of language context.

---

### 8. Case-Sensitive Alphanumeric Codes
**Fixture:** `emails/edge-cases/mixed-case-code.json`

**Scenario:** Mixed-case alphanumeric code (e.g., `Hj83Kx92`).

**Challenge:** Preserve case sensitivity; don't lowercase.

**Expected Behavior:** Extract `Hj83Kx92` with exact casing.

---

### 9. Unicode and Emoji Content
**Fixture:** `emails/edge-cases/unicode-content.json`

**Scenario:** Email contains emojis around verification code.

**Challenge:** Handle Unicode characters without breaking regex patterns.

**Example:**
```
🔐 Your security code: 582917 🔐
```

**Expected Behavior:** Extract `582917`, ignore Unicode decorations.

---

### 10. Expired Code Warnings
**Scenario:** Email explicitly states code has expired or is invalid.

**Challenge:** Detect expiration warnings, mark code as potentially invalid.

**Expected Behavior:** Extract code but flag as potentially expired.

---

## HTML Site Detection Edge Cases

### 1. Dynamically Inserted OTP Fields
**Fixture:** `sites/detection/dynamic-inject.html`

**Scenario:** OTP input field injected via JavaScript after page load.

**Challenge:** MutationObserver must detect new inputs.

**Expected Behavior:** Detect field within 100ms of injection.

---

### 2. Shadow DOM Inputs
**Scenario:** OTP input inside Web Component shadow root.

**Challenge:** Traverse shadow DOM boundaries.

**Expected Behavior:** Detect inputs in both light and shadow DOM.

---

### 3. Multiple Input Groups
**Fixture:** `sites/detection/multiple-inputs.html`

**Scenario:** Page contains multiple separate OTP input groups.

**Challenge:** Distinguish between different verification flows.

**Expected Behavior:** Detect all groups, allow user to select target.

---

### 4. Split Input Fields (Digit-by-Digit)
**Scenario:** Six separate 1-character inputs for 6-digit code.

**Challenge:** Recognize grouped inputs as single OTP field.

**Expected Behavior:** Detect and auto-fill all digits sequentially.

---

### 5. Hidden/Invisible Inputs
**Scenario:** Input with `display: none` or `visibility: hidden`.

**Challenge:** Ignore truly hidden fields, detect temporarily hidden ones.

**Expected Behavior:** Only detect visible or about-to-be-visible inputs.

---

### 6. Readonly/Disabled Inputs
**Scenario:** Input initially disabled, enabled after interaction.

**Challenge:** Monitor attribute changes, detect when field becomes editable.

**Expected Behavior:** Detect when input transitions to enabled state.

---

### 7. Custom Input Components
**Scenario:** React/Vue/Angular custom components mimicking input behavior.

**Challenge:** Detect non-standard input implementations.

**Expected Behavior:** Recognize contenteditable, custom attributes, ARIA roles.

---

### 8. IFrame-Embedded Forms
**Scenario:** OTP input inside cross-origin iframe.

**Challenge:** Cross-origin restrictions prevent direct access.

**Expected Behavior:** Detect parent-level indicators, respect security boundaries.

---

### 9. Keyboard-Only Navigation
**Scenario:** Auto-focus and auto-advance between digit inputs.

**Challenge:** Handle rapid programmatic focus changes.

**Expected Behavior:** Fill without disrupting keyboard navigation flow.

---

### 10. Form Submission Race Conditions
**Scenario:** Code auto-submitted before user confirmation.

**Challenge:** Intercept submission, allow user review.

**Expected Behavior:** Inject code but pause before auto-submit.

---

## Pattern Matching Edge Cases

### Numeric OTP Codes
- **6-digit:** `123456` (most common)
- **4-digit:** `1234` (banking, older systems)
- **8-digit:** `12345678` (high-security systems)
- **With dashes:** `123-456`
- **With spaces:** `12 34 56`

### Alphanumeric Codes
- **8-char mixed:** `AB12CD34`
- **10-char mixed:** `XY34ZW78QR`
- **Case-sensitive:** `Hj83Kx92`
- **All uppercase:** `ABCD1234`

### Magic Link Tokens
- **Short tokens:** 16-32 hex characters
- **Long tokens:** 64+ characters
- **Base64 tokens:** URL-safe base64
- **JWT tokens:** Three-part dot-separated

---

## Browser-Specific Edge Cases

### Chrome/Edge
- **Autofill conflicts:** Native OTP autofill vs. extension
- **Solution:** Detect native autofill, defer if present

### Firefox
- **Clipboard permissions:** Different permission model
- **Solution:** Fallback to manual notification

### Safari
- **Extension context:** Limited background capabilities
- **Solution:** Content-script-heavy architecture

---

## Performance Edge Cases

### Large DOM Trees
- **Scenario:** 10,000+ DOM nodes
- **Challenge:** Efficient querying without lag
- **Solution:** Debounced MutationObserver, scoped queries

### Rapid Mutations
- **Scenario:** SPA with constant DOM updates
- **Challenge:** Avoid redundant scans
- **Solution:** Throttle observer, track processed nodes

### Memory Leaks
- **Scenario:** Long-running page with many verifications
- **Challenge:** Cleanup listeners and observers
- **Solution:** WeakMap for node tracking, explicit cleanup

---

## Security Edge Cases

### XSS Prevention
- **Scenario:** Malicious site attempting to steal codes
- **Challenge:** Only inject on verified OTP contexts
- **Solution:** Strict pattern validation, origin allowlist

### Phishing Sites
- **Scenario:** Fake login page mimicking real site
- **Challenge:** Distinguish legitimate vs. phishing
- **Solution:** Domain validation, user warnings

### Code Interception
- **Scenario:** Other extensions reading clipboard
- **Challenge:** Minimize exposure window
- **Solution:** Clear clipboard after paste, time-limited storage

---

## Accessibility Edge Cases

### Screen Readers
- **Scenario:** Visually impaired user with screen reader
- **Challenge:** Announce code availability
- **Solution:** ARIA live regions, accessible notifications

### Keyboard Navigation
- **Scenario:** User relies solely on keyboard
- **Challenge:** All features keyboard-accessible
- **Solution:** Focus management, keyboard shortcuts

### High Contrast Mode
- **Scenario:** Windows high contrast mode
- **Challenge:** UI elements remain visible
- **Solution:** System color variables, adequate contrast

---

## Summary Statistics

**Total Edge Cases Documented:** 35+

**Coverage by Category:**
- Email Parsing: 10 cases
- HTML Detection: 10 cases
- Pattern Matching: 5 categories
- Browser-Specific: 3 browsers
- Performance: 3 scenarios
- Security: 3 scenarios
- Accessibility: 3 scenarios

**Test Coverage:** All edge cases have corresponding fixtures and/or test scenarios.
