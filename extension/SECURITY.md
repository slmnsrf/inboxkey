# Security Documentation

**InboxKey Privacy-First Chrome Extension**
**Version:** 0.0.1
**Last Updated:** October 15, 2025

---

## Table of Contents

1. [Security Model Overview](#security-model-overview)
2. [Threat Model](#threat-model)
3. [Security Mechanisms](#security-mechanisms)
4. [Security Best Practices for Users](#security-best-practices-for-users)
5. [Vulnerability Reporting](#vulnerability-reporting)
6. [Security Audit Log](#security-audit-log)

---

## Security Model Overview

InboxKey is designed with **privacy and security as the primary architectural constraints**. All sensitive data processing happens locally on the user's device, with no data transmitted to external servers.

### Core Security Principles

#### 1. Local-Only Processing
- **All email parsing and code extraction happens on-device**
- No data leaves the user's browser or device
- No cloud storage, remote servers, or external APIs for data processing
- OAuth tokens never leave the user's machine
- Email content is never transmitted to InboxKey servers (we don't have any!)

#### 2. Encryption at Rest
- **AES-GCM 256-bit encryption** for all sensitive data stored locally
- OAuth tokens encrypted before storage in `chrome.storage.local`
- Email metadata encrypted before local caching
- Verification codes encrypted in transit between extension components
- Uses browser's native WebCrypto API for cryptographic operations

**Performance Characteristics:**
- Key derivation: ~15ms (PBKDF2, 100,000 iterations)
- Encryption/Decryption: <1ms for typical payloads
- Zero perceived latency for users

#### 3. Password-Protected Lock Mode
- Users can lock the extension with a master password
- When locked, all cached sensitive data is inaccessible
- Lock mode clears encryption keys from memory
- Automatic lock after configurable inactivity period
- No password recovery mechanism (passwords never leave device)

#### 4. Zero Telemetry
- **No analytics or tracking of any kind**
- No error reporting to external servers
- No usage statistics collection
- No fingerprinting or user profiling
- Extension operates entirely offline (except for OAuth and email API calls)

#### 5. Minimal Permissions
- Extension only requests permissions necessary for core functionality
- Content scripts run only on pages where verification fields are detected
- No access to browsing history, bookmarks, or other tabs
- OAuth scopes limited to read-only email access (no send/delete permissions)

---

## Threat Model

### Assets Under Protection

InboxKey protects the following sensitive user assets:

| Asset | Sensitivity | Storage Location | Protection Method |
|-------|-------------|------------------|-------------------|
| **OAuth Access Tokens** | Critical | `chrome.storage.local` | AES-GCM encryption |
| **OAuth Refresh Tokens** | Critical | `chrome.storage.local` | AES-GCM encryption |
| **Email Metadata** | High | `chrome.storage.local` | AES-GCM encryption |
| **Verification Codes** | High | In-memory (ephemeral) | Encrypted in transit, cleared after use |
| **Master Password** | Critical | Never stored | PBKDF2 key derivation only |
| **Encryption Keys** | Critical | In-memory (session) | Cleared on lock/logout |
| **User Settings** | Low | `chrome.storage.local` | No encryption (non-sensitive) |

### Threat Actors

#### 1. Malicious Websites
- **Motivation:** Steal OAuth tokens, intercept verification codes, exfiltrate email data
- **Capabilities:** JavaScript injection, DOM manipulation, network sniffing
- **Likelihood:** Medium-High (common attack vector for browser extensions)

#### 2. XSS Attacks (Cross-Site Scripting)
- **Motivation:** Execute malicious code in extension context
- **Capabilities:** Access chrome.storage, intercept messages, steal tokens
- **Likelihood:** Medium (requires vulnerability in extension code)

#### 3. Phishing Attacks
- **Motivation:** Trick users into granting OAuth permissions to fake apps
- **Capabilities:** Social engineering, fake OAuth consent screens
- **Likelihood:** Medium (requires user interaction)

#### 4. Local Malware
- **Motivation:** Access chrome.storage.local, keylog master password
- **Capabilities:** File system access, memory inspection, keylogging
- **Likelihood:** Low-Medium (requires device compromise)

#### 5. Network Attackers (Man-in-the-Middle)
- **Motivation:** Intercept OAuth tokens or email data in transit
- **Capabilities:** TLS downgrade, certificate spoofing
- **Likelihood:** Low (mitigated by HTTPS)

#### 6. Browser Extension Vulnerabilities
- **Motivation:** Exploit Chrome's extension security model
- **Capabilities:** Bypass content script isolation, access storage
- **Likelihood:** Low (Chrome has strong extension sandbox)

### Attack Vectors and Mitigations

#### Attack Vector 1: Content Script Injection
**Description:** Malicious website injects code into page to intercept content script communication.

**Threat:** Attacker could observe verification codes as they're autofilled or intercept messages between content script and service worker.

**Mitigations:**
- Content scripts run in **isolated world** (separate JavaScript context)
- No shared global variables with page scripts
- Messages between content script and service worker are encrypted
- Content script validates message sources (checks sender tab/frame)
- No `eval()` or dynamic code execution in content scripts
- CSP (Content Security Policy) prevents inline script execution

**Residual Risk:** Low. Chrome's isolated world architecture provides strong protection.

---

#### Attack Vector 2: Chrome Storage Access
**Description:** Malicious extension or malware accesses `chrome.storage.local` to steal tokens.

**Threat:** OAuth tokens and email data exposed if storage is compromised.

**Mitigations:**
- All sensitive data encrypted with **AES-GCM 256-bit** before storage
- Encryption keys derived from user's master password (never stored)
- Keys cleared from memory when extension is locked
- Chrome's extension sandbox prevents cross-extension storage access
- Storage quota limits (10MB) reduce data exposure

**Residual Risk:** Medium. If attacker has both storage access and master password (via keylogger), data is exposed. **Lock extension when not in use.**

---

#### Attack Vector 3: OAuth Token Theft
**Description:** Attacker intercepts OAuth tokens during authorization flow or from storage.

**Threat:** Attacker gains access to user's email account.

**Mitigations:**
- OAuth uses **chrome.identity.getAuthToken()** with Chrome-managed security
- Chrome automatically handles PKCE, token caching, and secure token refresh
- No client secrets stored in extension (Chrome manages authentication)
- Tokens transmitted only over **HTTPS**
- Tokens encrypted before storage
- Token scopes minimized (read-only, no send/delete)
- User must be signed in to Chrome with Google account

**Residual Risk:** Low-Medium. If device is compromised (malware + keylogger), tokens can be stolen. **Use lock mode on shared computers.**

---

#### Attack Vector 4: Phishing Attacks
**Description:** Attacker creates fake OAuth consent screen to steal credentials.

**Threat:** User grants OAuth permissions to malicious application.

**Mitigations:**
- OAuth flow uses Google/Microsoft's official consent screens (not ours)
- Clear branding and domain verification in consent screen
- User education: verify consent screen URL matches `accounts.google.com` or `login.microsoftonline.com`
- Extension warns users before initiating OAuth flow
- Scopes displayed clearly during consent

**Residual Risk:** Medium. User education is critical. **Verify OAuth consent screen domain before granting access.**

---

#### Attack Vector 5: Network Interception
**Description:** Man-in-the-middle attacker intercepts OAuth tokens or email data in transit.

**Threat:** Tokens or email content exposed during network transmission.

**Mitigations:**
- **All network requests use HTTPS** (TLS 1.2+)
- Chrome enforces certificate validation
- OAuth tokens transmitted only via secure channels
- No fallback to HTTP
- Certificate pinning considered for future releases

**Residual Risk:** Very Low. HTTPS provides strong protection against network attacks.

---

#### Attack Vector 6: XSS in Extension UI
**Description:** Attacker injects malicious script into extension popup or options page.

**Threat:** Malicious code executes in extension context with full permissions.

**Mitigations:**
- **Strict CSP (Content Security Policy)** prevents inline scripts
- React's XSS protection (automatic escaping)
- No `dangerouslySetInnerHTML` usage
- Input validation and sanitization for all user inputs
- TypeScript type checking reduces injection vulnerabilities
- Regular dependency audits (`npm audit`)

**Residual Risk:** Low. Modern framework protections and CSP provide strong defense.

---

#### Attack Vector 7: Service Worker Termination
**Description:** Chrome terminates service worker, potentially losing in-memory encryption keys.

**Threat:** Temporary data loss or unavailability during service worker restart.

**Mitigations:**
- **Content scripts manage polling timers** (not service worker)
- Service worker awakens on-demand for each message
- No critical state stored in service worker memory
- Encryption keys cached in content script context during active watch
- Graceful handling of service worker restarts

**Residual Risk:** Very Low. Architectural pattern (ADR-001) designed for this scenario.

---

## Security Mechanisms

### 1. WebCrypto API Usage

#### Encryption Algorithm: AES-GCM
```typescript
{
  name: "AES-GCM",
  length: 256,           // 256-bit keys
  iv: 96,                // 96-bit initialization vector
  tagLength: 128         // 128-bit authentication tag
}
```

**Why AES-GCM?**
- **Authenticated encryption:** Provides both confidentiality and integrity
- **AEAD (Authenticated Encryption with Associated Data):** Prevents tampering
- **Fast:** Native browser implementation, <1ms for typical payloads
- **Standard:** NIST-recommended, widely vetted

#### Key Derivation: PBKDF2
```typescript
{
  name: "PBKDF2",
  iterations: 100_000,   // OWASP 2024 recommendation
  hash: "SHA-256",       // Secure hash function
  salt: 256              // 256-bit random salt
}
```

**Why PBKDF2?**
- **Slow hashing:** Resists brute-force attacks on master password
- **Salted:** Prevents rainbow table attacks
- **Widely supported:** Native WebCrypto implementation
- **100,000 iterations:** Balances security and performance (~15ms)

**Performance:** Key derivation takes ~15ms, acceptable for unlock operation.

#### Random Number Generation
```typescript
crypto.getRandomValues(new Uint8Array(length))
```

**Why crypto.getRandomValues?**
- **Cryptographically secure:** Uses OS-level CSPRNG
- **Unpredictable:** Cannot be guessed or reproduced
- **Standard:** W3C Web Cryptography API

**Used for:**
- AES-GCM initialization vectors (IVs)
- PBKDF2 salts
- OAuth PKCE code verifier

---

### 2. Chrome Storage Encryption

#### Storage Architecture
```typescript
// Example encrypted storage entry
{
  "oauth_token_gmail": {
    ciphertext: "base64_encrypted_data...",
    iv: "base64_iv...",
    salt: "base64_salt..."
  }
}
```

#### Storage Security Properties
- **Isolated:** Each extension has separate storage namespace
- **Persistent:** Survives browser restarts
- **Quota-limited:** 10MB max (reduces data exposure)
- **Local-only:** Never synced to cloud (we use `chrome.storage.local`, not `sync`)

#### Storage Best Practices
- All sensitive data encrypted before storage
- Keys never stored (derived from master password on-demand)
- Storage cleared on uninstall
- Regular cleanup of old email metadata (retention policy)

---

### 3. Content Security Policy (CSP)

#### Extension Manifest CSP
```json
{
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'none';"
  }
}
```

**Restrictions:**
- No inline scripts (`<script>...</script>`)
- No `eval()` or `new Function()`
- No external script loading
- No `unsafe-inline` or `unsafe-eval`

**Impact:**
- Prevents XSS attacks in extension UI
- Blocks malicious script injection
- Enforces secure coding practices

---

### 4. Chrome Identity OAuth Flow

#### chrome.identity.getAuthToken()
InboxKey uses Chrome's built-in OAuth implementation for simplified and secure authentication.

**Flow:**
1. **User initiates connection** to Gmail in extension popup
2. **Extension calls chrome.identity.getAuthToken()** with interactive mode
3. **Chrome displays OAuth consent screen** (managed by Google)
4. **Chrome handles token exchange** and caching automatically
5. **Extension receives access token** ready to use

**Security Benefits:**
- Chrome automatically implements PKCE (Proof Key for Code Exchange)
- No client secrets needed or stored in extension
- Token refresh handled automatically by Chrome
- Reduces attack surface - no manual token management
- Leverages Chrome's secure token storage

**Implementation:**
```typescript
// Authenticate with Gmail
const token = await new Promise((resolve, reject) => {
  chrome.identity.getAuthToken(
    { interactive: true },
    (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }
      resolve(token)
    }
  )
})

// Chrome automatically:
// - Implements PKCE flow
// - Caches token securely
// - Refreshes when expired
// - Validates user is signed in to Chrome
```

**Requirements:**
- **Chrome Sign-In Required:** Users must be signed in to Chrome with their Google account
- **Chrome Browser Only:** This implementation currently only works in Google Chrome (not other Chromium browsers)
- **No Manual Refresh:** Chrome handles token refresh automatically

---

### 5. Token Scope Minimization

#### Gmail API Scopes
```
https://www.googleapis.com/auth/gmail.readonly
```

**Note:** When using chrome.identity.getAuthToken(), the scope is configured in the extension's manifest.json and Chrome Web Store Developer Dashboard.

**Permissions:**
- Read email messages and metadata
- Search and filter messages

**Explicitly NOT Granted:**
- Send emails
- Delete emails
- Modify emails
- Access contacts
- Access calendar

#### Microsoft Graph API Scopes
```
https://graph.microsoft.com/Mail.Read
```

**Permissions:**
- Read email messages in user's mailbox

**Explicitly NOT Granted:**
- Send emails
- Delete emails
- Access contacts
- Access calendar

#### Why Minimize Scopes?
- **Principle of least privilege:** Request only necessary permissions
- **Reduce attack surface:** Limited damage if token is stolen
- **User trust:** Transparent about data access
- **Compliance:** GDPR, CCPA require minimal data access

---

## Security Best Practices for Users

### 1. Lock Extension When Not in Use
**Why:** Protects encryption keys and cached data from unauthorized access.

**How to Lock:**
- Click extension icon > "Lock Now"
- Or wait for automatic lock after 15 minutes of inactivity (configurable)

**What Happens When Locked:**
- Encryption keys cleared from memory
- Cached verification codes cleared
- Must re-enter master password to unlock
- OAuth tokens remain encrypted in storage (safe)

**Recommendation:** Always lock on shared computers or when leaving device unattended.

---

### 2. Use Strong Lock Password
**Why:** Master password is the only defense against attackers with storage access.

**Strong Password Criteria:**
- Minimum 12 characters
- Mix of uppercase, lowercase, numbers, symbols
- Not used anywhere else
- Not easily guessable (no common words, patterns)

**Example Strong Passwords:**
- `Tr0ub4dor&3-InboxKey-2025`
- `correct-horse-battery-staple-97!`
- `MyD0g@t3MyH0mew0rk#2025`

**Password Managers:** Consider using a password manager (1Password, Bitwarden, etc.) to generate and store a unique strong password for InboxKey.

**Warning:** There is NO password recovery mechanism. If you forget your master password, all cached data will be permanently inaccessible. OAuth tokens can be re-authorized, but cached email metadata will be lost.

---

### 3. Review Connected Accounts Regularly
**Why:** Ensures only authorized mailboxes have access granted.

**How to Review:**
- Extension settings > "Connected Accounts"
- Check list of connected Gmail/Outlook accounts
- Revoke access for unused accounts

**When to Review:**
- Monthly security audit
- After device compromise or suspicious activity
- When no longer using a mailbox
- Before selling or disposing of device

**How to Revoke Access:**
- In InboxKey: Settings > Connected Accounts > "Disconnect"
- In Google: [myaccount.google.com/permissions](https://myaccount.google.com/permissions)
- In Microsoft: [account.microsoft.com/privacy](https://account.microsoft.com/privacy)

---

### 4. Don't Install on Shared Computers
**Why:** Shared computers increase risk of OAuth token theft, keylogging, and storage access.

**Risks of Shared Computers:**
- Other users may have admin access (can read chrome storage)
- Keyloggers may capture master password
- Screen recording malware may capture verification codes
- Browser extensions may conflict or intercept data

**Safe Alternatives:**
- Only install on personal, trusted devices
- Use mobile app or web access for shared/public computers
- If must use shared computer: Always lock extension after use, clear all data on logout

---

### 5. Keep Extension Updated
**Why:** Security patches and vulnerability fixes released regularly.

**How to Update:**
- Chrome automatically updates extensions
- Check manually: `chrome://extensions` > "Update" button

**When to Update:**
- Immediately when security update is released
- Check monthly for new versions

---

### 6. Verify OAuth Consent Screens
**Why:** Prevents phishing attacks that mimic OAuth consent.

**How to Verify:**
- Check URL bar during OAuth consent
- Gmail: URL should be `accounts.google.com`
- Outlook: URL should be `login.microsoftonline.com` or `login.live.com`
- Look for HTTPS padlock icon (green/gray)
- Verify app name is "InboxKey"

**Red Flags (DO NOT PROCEED):**
- URL is not Google/Microsoft domain
- HTTP instead of HTTPS
- Misspelled domain (e.g., `accountts.google.com`)
- Suspicious permissions requested (send email, delete, etc.)
- Generic app name or no app name

---

## Vulnerability Reporting

We take security seriously. If you discover a security vulnerability in InboxKey, please report it responsibly.

### How to Report Security Issues

#### Email (Preferred)
**Email:** security@inboxkey.app
**PGP Key:** [Download Public Key](https://inboxkey.app/.well-known/pgp-key.asc)
**Fingerprint:** `XXXX XXXX XXXX XXXX XXXX  XXXX XXXX XXXX XXXX XXXX`

#### What to Include in Your Report
1. **Description:** Clear explanation of the vulnerability
2. **Impact:** What data/functionality is at risk?
3. **Reproduction Steps:** How to reproduce the issue (step-by-step)
4. **Proof of Concept:** Code or screenshots demonstrating the vulnerability
5. **Suggested Fix:** (Optional) Your recommendations for fixing the issue
6. **Disclosure Timeline:** When you plan to publicly disclose (we request 90 days)

#### Example Report Format
```
Subject: [SECURITY] XSS vulnerability in popup.tsx

Description:
Unsanitized user input in account name field allows XSS injection.

Impact:
Attacker can execute arbitrary JavaScript in extension context,
potentially stealing OAuth tokens from chrome.storage.

Reproduction:
1. Open extension settings
2. Add new account with name: <img src=x onerror=alert(1)>
3. Observe alert() executes when viewing connected accounts page

Proof of Concept:
[Attached screenshot showing XSS payload execution]

Suggested Fix:
Sanitize account name input using DOMPurify before rendering.
Enforce CSP to block inline event handlers.

Disclosure Timeline:
I plan to wait 90 days (until January 15, 2026) before public disclosure.

Contact:
researcher@example.com
```

---

### Expected Response Time

| Stage | Timeline |
|-------|----------|
| **Initial Acknowledgment** | Within 48 hours |
| **Triage & Severity Assessment** | Within 7 days |
| **Fix Development** | Within 30 days (for High/Critical) |
| **Patch Release** | Within 60 days |
| **Public Disclosure** | 90 days after report (coordinated) |

**Severity Levels:**
- **Critical:** Remote code execution, OAuth token theft, encryption bypass
- **High:** XSS, CSRF, privilege escalation, data exposure
- **Medium:** Information disclosure, denial of service
- **Low:** UI spoofing, minor information leaks

---

### Responsible Disclosure Policy

We follow **coordinated disclosure** principles:

1. **Private Reporting:** Report vulnerabilities privately (not on public issue trackers)
2. **Grace Period:** Allow 90 days for fix development before public disclosure
3. **Coordination:** Work with our security team to verify fix effectiveness
4. **Credit:** Security researchers credited in release notes and Hall of Fame (if desired)
5. **No Legal Action:** We will not pursue legal action against good-faith security researchers

**What We Ask:**
- Do not exploit vulnerabilities beyond proof-of-concept
- Do not access user data or OAuth tokens
- Do not publicly disclose before coordinated timeline
- Do not perform denial-of-service attacks

**What We Promise:**
- Acknowledge your report within 48 hours
- Keep you updated on fix progress
- Credit you in release notes (if desired)
- Work with you to understand and verify the issue

---

### Hall of Fame

We recognize security researchers who help improve InboxKey's security.

#### 2025

*No vulnerabilities reported yet. Be the first!*

---

#### How to Be Listed
If you report a valid security vulnerability:
1. We will ask your permission to list you
2. You can choose: Full name, pseudonym, or anonymous
3. You'll be listed after the vulnerability is patched and disclosed

**Note:** We do not currently offer bug bounties, but we deeply appreciate responsible disclosure and will recognize your contribution.

---

## Security Audit Log

This section documents security audits, penetration tests, and significant security events.

### Template for Audit Entries

```markdown
### [Date] - [Audit Type]

**Auditor:** [Company/Individual]
**Scope:** [What was tested]
**Methodology:** [Tools and techniques used]
**Findings:** [Summary of issues found]
**Severity Breakdown:**
- Critical: X
- High: X
- Medium: X
- Low: X

**Action Items:**
- [Issue 1] - Status: Fixed in v0.x.x
- [Issue 2] - Status: Mitigated with [workaround]
- [Issue 3] - Status: Accepted risk (justification)

**Full Report:** [Link to detailed report]
```

---

### 2025-10-15 - Pre-Launch Security Review

**Auditor:** InboxKey Development Team (Self-Assessment)
**Scope:** Architecture review, cryptographic implementation, threat modeling
**Methodology:** Manual code review, threat modeling workshop, OWASP guidelines

**Findings:**
- Architecture follows security-first principles (local-only processing)
- Encryption implementation uses industry-standard WebCrypto API
- Content script isolation prevents most injection attacks
- OAuth PKCE flow properly implemented

**Recommendations Implemented:**
- Added CSP headers to manifest
- Implemented token scope minimization
- Added automatic lock on inactivity
- Documented threat model and mitigations

**Status:** Initial security baseline established. External audit planned for Q1 2026.

---

### Future Audits

**Planned Audits:**
- **Q1 2026:** External security audit by [TBD security firm]
- **Q3 2026:** Penetration testing by independent researcher
- **Annual:** OWASP Top 10 review and mitigation verification

**Continuous Security:**
- Weekly dependency audits (`npm audit`)
- Quarterly code reviews of new features
- Continuous monitoring of security advisories (GitHub, npm, Chrome)

---

## Additional Resources

### Security-Related Documentation
- [Architecture Decision Record: Content Script Orchestration (ADR-001)](./docs/architecture/ADR-001-content-script-orchestration.md)
- [Encryption Performance Benchmarks](./docs/prototypes/TASK-2-ENCRYPTION-RESULTS.md)
- [Service Worker Lifecycle Testing](./docs/prototypes/TASK-1-SW-LIFECYCLE-RESULTS.md)
- [Testing Strategy](./TESTING_STRATEGY.md)

### External Security Standards
- [OWASP Browser Extension Security](https://cheatsheetseries.owasp.org/cheatsheets/Browser_Extension_Security_Cheat_Sheet.html)
- [Chrome Extension Security Best Practices](https://developer.chrome.com/docs/extensions/mv3/security/)
- [Web Cryptography API Specification](https://www.w3.org/TR/WebCryptoAPI/)
- [OAuth 2.0 PKCE RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636)

### Security Tools
- [Chrome Extension Security Analyzer](https://github.com/google/chrome-extensions-security-analyzer)
- [npm audit](https://docs.npmjs.com/cli/v8/commands/npm-audit)
- [ESLint Security Plugin](https://github.com/nodesecurity/eslint-plugin-security)

---

## Contact

**Security Email:** security@inboxkey.app
**General Support:** support@inboxkey.app
**Website:** https://inboxkey.app
**GitHub:** https://github.com/inboxkey/extension (issues for non-security bugs)

---

**Document Version:** 1.0.0
**Last Updated:** October 15, 2025
**Next Review:** January 15, 2026
